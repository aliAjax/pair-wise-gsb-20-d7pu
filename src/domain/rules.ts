// 判断层（domain rules）：所有业务规则集中于此。
// 纯函数，不读写 localStorage，不依赖 React，便于测试与复用。
// 约定：入参 state 由调用方深拷贝；规则不满足时抛 DomainError（中文信息）。

import type {
  ConclusionVersion,
  Cosign,
  DiffField,
  FieldOfView,
  FieldStatus,
  Magnification,
  Reproduction,
  Sample,
  SampleType,
  StationState,
} from "../types";

export class DomainError extends Error {}

export interface RuleContext {
  id: () => string;
  now: () => string;
}

export const MAGNIFICATIONS: Magnification[] = ["100x", "400x", "1000x"];
export const MAGNIFICATION_LABEL: Record<Magnification, string> = {
  "100x": "低倍 100×",
  "400x": "中倍 400×",
  "1000x": "高倍 1000×（油镜）",
};
export const SAMPLE_TYPES: SampleType[] = ["植物组织", "动物组织", "微生物", "血液涂片"];
export const DIFF_FIELD_LABEL: Record<DiffField, string> = {
  keyStructure: "重点结构",
  stainingJudgment: "染色判断",
};

const REQUIRED_COSIGNS = 2;

// ---------- 基础定位 ----------

export function getSample(state: StationState, sampleId: string): Sample {
  const sample = state.samples.find((s) => s.id === sampleId);
  if (!sample) throw new DomainError("样本不存在");
  return sample;
}

export function getField(sample: Sample, magnification: Magnification): FieldOfView {
  const field = sample.fields.find((f) => f.magnification === magnification);
  if (!field) throw new DomainError("该倍率视野不存在");
  return field;
}

export function observerName(state: StationState, id: string): string {
  return state.observers.find((o) => o.id === id)?.name ?? id;
}

export function activeVersion(field: FieldOfView): ConclusionVersion | null {
  if (field.activeVersionNo == null) return null;
  return field.versions.find((v) => v.versionNo === field.activeVersionNo) ?? null;
}

// ---------- 变更：创建样本 ----------

export interface CreateSampleInput {
  name: string;
  type: SampleType;
}

export function createSample(state: StationState, input: CreateSampleInput, ctx: RuleContext): Sample {
  const name = input.name.trim();
  if (!name) throw new DomainError("请填写样本名称");
  if (state.samples.some((s) => s.name === name)) throw new DomainError("已存在同名样本");

  const sample: Sample = {
    id: ctx.id(),
    name,
    type: input.type,
    createdAt: ctx.now(),
    frozen: false,
    frozenAt: null,
    fields: MAGNIFICATIONS.map((m) => ({
      id: ctx.id(),
      magnification: m,
      status: "unregistered" as FieldStatus,
      activeVersionNo: null,
      versions: [],
      frozenAt: null,
    })),
  };
  state.samples.unshift(sample);
  return sample;
}

// ---------- 变更：登记视野（首版结论） ----------

export interface RegisterFieldInput {
  stainingBatch: string;
  coordinate: string;
  keyStructure: string;
  stainingJudgment: string;
  description: string;
  observerId: string;
}

export function registerField(
  state: StationState,
  sampleId: string,
  magnification: Magnification,
  input: RegisterFieldInput,
  ctx: RuleContext
): void {
  const sample = getSample(state, sampleId);
  if (sample.frozen) throw new DomainError("样本已冻结，不能新增或修改视野");
  const field = getField(sample, magnification);
  if (field.status !== "unregistered") throw new DomainError("该倍率视野已登记，请走会签或更正流程");

  const missing = missingConclusionFields(input);
  if (missing.length) throw new DomainError(`请完整填写：${missing.join("、")}`);
  if (!input.observerId) throw new DomainError("请选择登记观察者");

  const version: ConclusionVersion = {
    versionNo: 1,
    stainingBatch: input.stainingBatch.trim(),
    coordinate: input.coordinate.trim(),
    keyStructure: input.keyStructure.trim(),
    stainingJudgment: input.stainingJudgment.trim(),
    description: input.description.trim(),
    observerId: input.observerId,
    createdAt: ctx.now(),
    reason: "首次登记",
    rounds: [
      {
        roundNo: 1,
        startedAt: ctx.now(),
        cosigns: [],
      },
    ],
    reproductions: [],
    superseded: false,
  };
  field.versions.push(version);
  field.activeVersionNo = 1;
  field.status = "draft";
}

function missingConclusionFields(input: Partial<RegisterFieldInput>): string[] {
  const missing: string[] = [];
  if (!input.stainingBatch?.trim()) missing.push("染色批次");
  if (!input.coordinate?.trim()) missing.push("坐标");
  if (!input.keyStructure?.trim()) missing.push("重点结构");
  if (!input.stainingJudgment?.trim()) missing.push("染色判断");
  return missing;
}

// ---------- 变更：独立会签 ----------

export interface CosignInput {
  observerId: string;
  agrees: boolean;
  independent: boolean;
  note: string;
}

export function addCosign(
  state: StationState,
  sampleId: string,
  magnification: Magnification,
  input: CosignInput,
  ctx: RuleContext
): void {
  const sample = getSample(state, sampleId);
  const field = getField(sample, magnification);
  if (field.status === "unregistered") throw new DomainError("视野尚未登记");
  if (field.status === "confirmed") throw new DomainError("视野已确认冻结，请使用「更正并新建版本」");
  if (field.status === "disputed")
    throw new DomainError("判断不一致已转第三人复现，请先完成复现，不再接受新会签");

  const version = activeVersion(field);
  if (!version) throw new DomainError("缺少有效结论版本");
  const round = version.rounds[version.rounds.length - 1];

  if (!input.observerId) throw new DomainError("请选择会签观察者");
  // 原观察者不得自签
  if (input.observerId === version.observerId)
    throw new DomainError("原观察者不得对自己的结论会签");
  // 两名观察者独立会签
  if (!input.independent) throw new DomainError("会签前须确认已在同倍率下独立观察");
  // 同一人同一轮不能重复会签
  if (round.cosigns.some((c) => c.observerId === input.observerId))
    throw new DomainError("该观察者已在本轮会签，不能重复签署");

  const cosign: Cosign = {
    observerId: input.observerId,
    agrees: input.agrees,
    independent: true,
    note: input.note.trim(),
    at: ctx.now(),
  };
  round.cosigns.push(cosign);

  const agrees = round.cosigns.filter((c) => c.agrees);
  const disagrees = round.cosigns.filter((c) => !c.agrees);

  if (disagrees.length > 0) {
    // 结构或染色判断不一致 → 转第三人复现
    field.status = "disputed";
    return;
  }
  if (agrees.length >= REQUIRED_COSIGNS) {
    confirmField(field, ctx);
    refreshSampleFrozen(sample, ctx);
  } else {
    field.status = "countersigning";
  }
}

function confirmField(field: FieldOfView, ctx: RuleContext): void {
  field.status = "confirmed";
  field.frozenAt = ctx.now();
}

function refreshSampleFrozen(sample: Sample, ctx: RuleContext): void {
  const allConfirmed = sample.fields.every((f) => f.status === "confirmed");
  if (allConfirmed && !sample.frozen) {
    sample.frozen = true;
    sample.frozenAt = ctx.now();
  }
}

// ---------- 变更：第三人复现 ----------

export interface ReproduceInput {
  reproducerId: string;
  reproducedStructure: string;
  reproducedStaining: string;
  note: string;
}

export function resolveDispute(
  state: StationState,
  sampleId: string,
  magnification: Magnification,
  input: ReproduceInput,
  ctx: RuleContext
): { revised: boolean } {
  const sample = getSample(state, sampleId);
  const field = getField(sample, magnification);
  if (field.status !== "disputed") throw new DomainError("仅判断不一致的视野需要第三人复现");
  const version = activeVersion(field);
  if (!version) throw new DomainError("缺少有效结论版本");
  const round = version.rounds[version.rounds.length - 1];

  if (!input.reproducerId) throw new DomainError("请选择复现人");
  // 第三人须独立于原观察者及两名会签者
  const involved = new Set<string>([
    version.observerId,
    ...round.cosigns.map((c) => c.observerId),
  ]);
  version.reproductions.forEach((r) => involved.add(r.reproducerId));
  if (involved.has(input.reproducerId))
    throw new DomainError("复现人须为未参与原观察与会签的第三人");

  const reproducedStructure = input.reproducedStructure.trim();
  const reproducedStaining = input.reproducedStaining.trim();
  if (!reproducedStructure || !reproducedStaining)
    throw new DomainError("请填写复现得到的重点结构与染色判断");

  // 指出差异字段
  const differingFields: DiffField[] = [];
  if (reproducedStructure !== version.keyStructure) differingFields.push("keyStructure");
  if (reproducedStaining !== version.stainingJudgment) differingFields.push("stainingJudgment");

  const reproduction: Reproduction = {
    reproducerId: input.reproducerId,
    at: ctx.now(),
    reproducedStructure,
    reproducedStaining,
    differingFields,
    note: input.note.trim(),
  };

  let revised = false;
  if (differingFields.length > 0) {
    // 复现与原结论不一致：以复现值更正，旧版本保留并标注被取代
    version.superseded = true;
    const next: ConclusionVersion = {
      ...structuredCloneSafe(version),
      versionNo: version.versionNo + 1,
      keyStructure: reproducedStructure,
      stainingJudgment: reproducedStaining,
      observerId: input.reproducerId,
      createdAt: ctx.now(),
      reason:
        "第三人复现更正：差异字段 " +
        differingFields.map((f) => DIFF_FIELD_LABEL[f]).join("、"),
      rounds: [{ roundNo: version.rounds.length + 1, startedAt: ctx.now(), cosigns: [] }],
      reproductions: [reproduction],
      superseded: false,
    };
    // 复现记录同时挂在新版本，旧版本也留痕
    version.reproductions.push(reproduction);
    field.versions.push(next);
    field.activeVersionNo = next.versionNo;
    revised = true;
  } else {
    // 复现支持原结论：原结论保留，争议轮作废，重新征集两名独立会签
    version.reproductions.push(reproduction);
    version.rounds.push({
      roundNo: version.rounds.length + 1,
      startedAt: ctx.now(),
      cosigns: [],
    });
  }
  field.status = "countersigning";
  field.frozenAt = null;
  return { revised };
}

// ---------- 变更：确认后更正（新建版本，留旧值） ----------

export interface CorrectInput {
  stainingBatch: string;
  coordinate: string;
  keyStructure: string;
  stainingJudgment: string;
  description: string;
  observerId: string;
  reason: string;
}

export function correctConclusion(
  state: StationState,
  sampleId: string,
  magnification: Magnification,
  input: CorrectInput,
  ctx: RuleContext
): void {
  const sample = getSample(state, sampleId);
  const field = getField(sample, magnification);
  if (field.status !== "confirmed") throw new DomainError("仅已确认冻结的视野使用更正流程");
  const current = activeVersion(field);
  if (!current) throw new DomainError("缺少有效结论版本");

  const missing = missingConclusionFields(input);
  if (missing.length) throw new DomainError(`请完整填写：${missing.join("、")}`);
  if (!input.reason.trim()) throw new DomainError("更正必须填写原因");

  const next: ConclusionVersion = {
    versionNo: current.versionNo + 1,
    stainingBatch: input.stainingBatch.trim(),
    coordinate: input.coordinate.trim(),
    keyStructure: input.keyStructure.trim(),
    stainingJudgment: input.stainingJudgment.trim(),
    description: input.description.trim(),
    observerId: input.observerId,
    createdAt: ctx.now(),
    reason: "更正：" + input.reason.trim(),
    rounds: [{ roundNo: 1, startedAt: ctx.now(), cosigns: [] }],
    reproductions: [],
    superseded: false,
  };
  current.superseded = true;
  field.versions.push(next);
  field.activeVersionNo = next.versionNo;
  field.status = "countersigning";
  field.frozenAt = null;
  sample.frozen = false;
  sample.frozenAt = null;
}

// ---------- 只读统计 ----------

export interface StationMetrics {
  sampleCount: number;
  fieldCount: number;
  pendingCosign: number;
  disputed: number;
  confirmed: number;
  frozenSamples: number;
}

export function getMetrics(state: StationState): StationMetrics {
  let fieldCount = 0;
  let pendingCosign = 0;
  let disputed = 0;
  let confirmed = 0;
  for (const sample of state.samples) {
    for (const field of sample.fields) {
      if (field.status === "unregistered") continue;
      fieldCount += 1;
      if (field.status === "draft" || field.status === "countersigning") pendingCosign += 1;
      if (field.status === "disputed") disputed += 1;
      if (field.status === "confirmed") confirmed += 1;
    }
  }
  return {
    sampleCount: state.samples.length,
    fieldCount,
    pendingCosign,
    disputed,
    confirmed,
    frozenSamples: state.samples.filter((s) => s.frozen).length,
  };
}

/** 可担任某视野下一环节会签/复现的观察者 */
export function eligibleCosigners(state: StationState, field: FieldOfView): string[] {
  const version = activeVersion(field);
  if (!version) return state.observers.map((o) => o.id);
  const round = version.rounds[version.rounds.length - 1];
  const blocked = new Set<string>([
    version.observerId,
    ...round.cosigns.map((c) => c.observerId),
  ]);
  return state.observers.map((o) => o.id).filter((id) => !blocked.has(id));
}

export function eligibleReproducers(state: StationState, field: FieldOfView): string[] {
  const version = activeVersion(field);
  if (!version) return [];
  const round = version.rounds[version.rounds.length - 1];
  const blocked = new Set<string>([
    version.observerId,
    ...round.cosigns.map((c) => c.observerId),
    ...version.reproductions.map((r) => r.reproducerId),
  ]);
  return state.observers.map((o) => o.id).filter((id) => !blocked.has(id));
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
