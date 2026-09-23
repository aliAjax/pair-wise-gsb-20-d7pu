/**
 * 判断层：多倍率视野复现台的全部业务规则。
 * 纯函数，不触碰 React、localStorage 或 DOM，可独立单测。
 *
 * 核心约束：
 *  - 每个样本建立低 / 中 / 高三档倍率视野；
 *  - 同一视野只能有一条有效（confirmed）结论；
 *  - 两名观察者独立会签，原观察者不得自签；
 *  - 结构或染色判断不一致 → 转第三人复现，并指出差异字段；
 *  - 确认后冻结样本、倍率与结论；更正须写原因、新建版本并留旧值。
 */
import type {
  AppState,
  ConclusionVersion,
  CosignAttempt,
  Field,
  Magnification,
  ReproductionRecord,
  Sample,
} from "./types";
import { MAGNIFICATIONS } from "./types";

/** 归一化判断文本，用于“独立判断是否一致”的比对 */
function normalize(value: string): string {
  return value.trim().replace(/[，。、；;,.\s]+/g, "").toLocaleLowerCase();
}

/** 比较两名观察者对重点结构的判断是否一致 */
export function sameStructures(a: string, b: string): boolean {
  return normalize(a) !== "" && normalize(a) === normalize(b);
}

/** 比较染色批次判断是否一致 */
export function sameStainBatch(a: string, b: string): boolean {
  return normalize(a) !== "" && normalize(a) === normalize(b);
}

/** 取视野当前（最新）结论版本 */
export function latestVersion(field: Field): ConclusionVersion | undefined {
  return field.versions[field.versions.length - 1];
}

/** 视野内是否已有有效结论（同一视野只能一条） */
export function hasActiveConclusion(field: Field): boolean {
  return field.versions.some((v) => v.status === "confirmed");
}

/** 样本是否已建立全部低 / 中 / 高倍率视野 */
export function hasAllMagnifications(fields: Field[], sampleId: string): boolean {
  const owned = fields.filter((f) => f.sampleId === sampleId);
  return MAGNIFICATIONS.every((m) => owned.some((f) => f.magnification === m));
}

/** 该倍率视野在样本下是否已登记（每档倍率唯一） */
export function findField(
  fields: Field[],
  sampleId: string,
  magnification: Magnification
): Field | undefined {
  return fields.find(
    (f) => f.sampleId === sampleId && f.magnification === magnification
  );
}

/** 样本是否可整体确认：三档视野齐备且各有一条已确认结论 */
export function canConfirmSample(state: AppState, sampleId: string): boolean {
  const sample = state.samples.find((s) => s.id === sampleId);
  if (!sample || sample.frozen) return false;
  const owned = state.fields.filter((f) => f.sampleId === sampleId);
  return (
    hasAllMagnifications(state.fields, sampleId) &&
    MAGNIFICATIONS.every((m) => {
      const field = owned.find((f) => f.magnification === m);
      return field !== undefined && hasActiveConclusion(field);
    })
  );
}

/** 会签资格：必须是两名观察者之一，且不得是该版本原观察者 */
export function canCosign(version: ConclusionVersion, reviewerId: string): boolean {
  if (version.status !== "in_review") return false;
  if (version.observerId === reviewerId) return false;
  if (version.cosigns.some((c) => c.reviewerId === reviewerId)) return false;
  // 已有两名独立会签人后流程必然结束
  return version.cosigns.length < 2;
}

export interface CosignInput {
  reviewerId: string;
  structuresObserved: string;
  stainBatchObserved: string;
  note?: string;
}

export interface CosignResult {
  version: ConclusionVersion;
  /** 本次会签是否与原结论一致（结构、染色两项） */
  structuresMatch: boolean;
  stainMatch: boolean;
  /** 结构或染色任一不一致 */
  disputed: boolean;
  /** 是否已集齐两名会签人 */
  quorumComplete: boolean;
}

let idCounter = 0;
function localId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

/** 注入 id 生成器，仅供测试重置序号，避免时间戳碰撞 */
export function resetIdCounterForTest(): void {
  idCounter = 0;
}

/**
 * 一名独立观察者会签：原观察者不得自签（canCosign 已拦）。
 * 会签人录入自己的结构 / 染色判断，系统逐项比对原结论。
 */
export function applyCosign(version: ConclusionVersion, input: CosignInput): CosignResult {
  if (!canCosign(version, input.reviewerId)) {
    throw new Error("当前状态或身份不允许会签（原观察者不得自签，且每人限签一次）");
  }

  const structuresMatch = sameStructures(input.structuresObserved, version.keyStructures);
  const stainMatch = sameStainBatch(input.stainBatchObserved, version.stainBatch);

  const attempt: CosignAttempt = {
    id: localId("cs"),
    reviewerId: input.reviewerId,
    at: new Date().toISOString(),
    structuresObserved: input.structuresObserved,
    stainBatchObserved: input.stainBatchObserved,
    structuresMatch,
    stainMatch,
    note: input.note,
  };

  const cosigns = [...version.cosigns, attempt];
  let status = version.status;

  const anyMismatch = (list: CosignAttempt[]): boolean =>
    list.some((c) => !c.structuresMatch || !c.stainMatch);

  // 两名会签到齐：都一致才确认；任一不一致即转第三人复现
  const quorumComplete = cosigns.length >= 2;
  if (quorumComplete) {
    status = anyMismatch(cosigns) ? "disputed" : "confirmed";
  }

  const next: ConclusionVersion = {
    ...version,
    cosigns,
    status,
    confirmedAt: status === "confirmed" ? new Date().toISOString() : version.confirmedAt,
  };

  return {
    version: next,
    structuresMatch,
    stainMatch,
    disputed: !structuresMatch || !stainMatch,
    quorumComplete,
  };
}

/** 第三人复现：系统指出与原结论不一致的字段 */
export function differingFieldsOf(
  version: ConclusionVersion,
  structuresReproduced: string,
  stainBatchReproduced: string
): Array<"keyStructures" | "stainBatch"> {
  const fields: Array<"keyStructures" | "stainBatch"> = [];
  if (!sameStructures(structuresReproduced, version.keyStructures)) {
    fields.push("keyStructures");
  }
  if (!sameStainBatch(stainBatchReproduced, version.stainBatch)) {
    fields.push("stainBatch");
  }
  return fields;
}

export interface ReproduceInput {
  reviewerId: string;
  structuresReproduced: string;
  stainBatchReproduced: string;
  resolution: "upheld" | "revised";
  note?: string;
}

/** 第三人须独立于原观察者和前两名会签人 */
export function canReproduce(version: ConclusionVersion, reviewerId: string): boolean {
  if (version.status !== "disputed") return false;
  if (version.observerId === reviewerId) return false;
  if (version.cosigns.some((c) => c.reviewerId === reviewerId)) return false;
  return true;
}

/**
 * 第三人复现裁决：
 *  upheld  → 维持原结论，版本转为 confirmed；
 *  revised → 按复现结果更新本版本的结构 / 染色字段后确认，
 *            差异字段在复现记录中留痕。
 */
export function applyReproduction(
  version: ConclusionVersion,
  input: ReproduceInput
): ConclusionVersion {
  if (!canReproduce(version, input.reviewerId)) {
    throw new Error("复现人必须是独立第三人，且仅在争议状态下复现");
  }

  const differingFields = differingFieldsOf(
    version,
    input.structuresReproduced,
    input.stainBatchReproduced
  );

  const record: ReproductionRecord = {
    reviewerId: input.reviewerId,
    at: new Date().toISOString(),
    structuresReproduced: input.structuresReproduced,
    stainBatchReproduced: input.stainBatchReproduced,
    differingFields,
    resolution: input.resolution,
    note: input.note,
  };

  const revised =
    input.resolution === "revised"
      ? {
          keyStructures: input.structuresReproduced,
          stainBatch: input.stainBatchReproduced,
        }
      : {};

  return {
    ...version,
    ...revised,
    status: "confirmed",
    confirmedAt: new Date().toISOString(),
    reproduction: record,
  };
}

/**
 * 更正已冻结视野：写原因、新建版本并保留旧值。
 * 旧版本置为 superseded（不再是有效结论），新版本从 draft 重新走会签。
 */
export interface CorrectionInput {
  observerId: string;
  stainBatch: string;
  keyStructures: string;
  text: string;
  reason: string;
}

export function createCorrectionVersion(
  field: Field,
  input: CorrectionInput
): Field {
  const current = latestVersion(field);
  if (!current || current.status !== "confirmed") {
    throw new Error("只有已确认的视野结论可以更正");
  }
  if (!input.reason.trim()) {
    throw new Error("更正必须填写原因");
  }

  const superseded: ConclusionVersion = { ...current, status: "superseded" };
  const next: ConclusionVersion = {
    id: localId("ver"),
    no: current.no + 1,
    observerId: input.observerId,
    stainBatch: input.stainBatch,
    keyStructures: input.keyStructures,
    text: input.text,
    status: "draft",
    reason: input.reason,
    basedOnVersionId: current.id,
    createdAt: new Date().toISOString(),
    cosigns: [],
  };

  return { ...field, versions: [...field.versions.slice(0, -1), superseded, next] };
}

/** 有效结论统计：每视野至多一条 confirmed */
export function activeVersionOf(field: Field): ConclusionVersion | undefined {
  return field.versions.find((v) => v.status === "confirmed");
}

/** 样本冻结后仍允许的操作：查看与“更正（新版本）”；禁止改既有数据 */
export function isSampleFrozen(sample: Sample): boolean {
  return sample.frozen;
}
