/**
 * 数据层：多倍率视野复现台的领域模型。
 * 只描述“数据长什么样”，不包含判断逻辑、保存方式与界面代码。
 */

/** 低 / 中 / 高 三档固定倍率 */
export type Magnification = "100x" | "400x" | "1000x";

export const MAGNIFICATIONS: Magnification[] = ["100x", "400x", "1000x"];

export const MAGNIFICATION_LABEL: Record<Magnification, string> = {
  "100x": "低倍 100×",
  "400x": "中倍 400×",
  "1000x": "高倍 1000×（油镜）",
};

export const MAGNIFICATION_LEVEL: Record<Magnification, string> = {
  "100x": "低倍",
  "400x": "中倍",
  "1000x": "高倍",
};

export type SpecimenType = "植物组织" | "动物组织" | "微生物" | "血液涂片";

export const SPECIMEN_TYPES: SpecimenType[] = [
  "植物组织",
  "动物组织",
  "微生物",
  "血液涂片",
];

/** 观察者（会签身份） */
export interface Observer {
  id: string;
  name: string;
  role: string;
}

/** 载物台坐标，单位 μm */
export interface Coordinate {
  x: number;
  y: number;
  z: number;
}

/**
 * 结论版本状态：
 * draft      草稿（原观察者编辑中）
 * in_review  会签中（两名独立观察者会签）
 * disputed   判断不一致，转第三人复现
 * confirmed  已确认（该版本为有效结论）
 * superseded 已被更正版本取代（旧值留档，不再有效）
 */
export type VersionStatus =
  | "draft"
  | "in_review"
  | "disputed"
  | "confirmed"
  | "superseded";

/** 一次独立会签：会签人录入自己的结构 / 染色判断，一致性由系统计算 */
export interface CosignAttempt {
  id: string;
  reviewerId: string;
  at: string;
  /** 会签人观察到的重点结构（原文照录） */
  structuresObserved: string;
  /** 会签人观察到的染色批次 */
  stainBatchObserved: string;
  structuresMatch: boolean;
  stainMatch: boolean;
  note?: string;
}

/** 第三人复现记录：系统指出差异字段，复现人给出裁决 */
export interface ReproductionRecord {
  reviewerId: string;
  at: string;
  structuresReproduced: string;
  stainBatchReproduced: string;
  /** 与原结论相比存在差异的字段，由系统判定 */
  differingFields: Array<"keyStructures" | "stainBatch">;
  /** upheld=维持原结论；revised=按复现结果更正本版本 */
  resolution: "upheld" | "revised";
  note?: string;
}

/**
 * 同一视野的一条结论及其版本。
 * 更正时新建版本，旧版本整体保留（旧值留档）。
 */
export interface ConclusionVersion {
  id: string;
  /** 版本号，从 1 开始 */
  no: number;
  /** 该版本的原观察者 */
  observerId: string;
  /** 染色批次（登记字段，会签比对项） */
  stainBatch: string;
  /** 重点结构（登记字段，会签比对项） */
  keyStructures: string;
  /** 结论文本 */
  text: string;
  status: VersionStatus;
  /** v2+ 必填：更正原因 */
  reason?: string;
  /** v2+ 必填：基于哪个旧版本更正 */
  basedOnVersionId?: string;
  createdAt: string;
  submittedAt?: string;
  confirmedAt?: string;
  cosigns: CosignAttempt[];
  reproduction?: ReproductionRecord;
}

/**
 * 一个倍率视野。
 * 倍率与坐标是视野的物理属性，冻结后不随结论更改变更。
 */
export interface Field {
  id: string;
  sampleId: string;
  magnification: Magnification;
  coordinate: Coordinate | null;
  registeredAt?: string;
  /** 同一视野的全部结论版本，按时间先后排列；至多一条 confirmed */
  versions: ConclusionVersion[];
}

export interface Sample {
  id: string;
  /** 玻片 / 样本编号 */
  code: string;
  name: string;
  specimenType: SpecimenType;
  createdAt: string;
  /** 确认冻结后，样本、倍率集合与有效结论均锁定，更正须走新版本 */
  frozen: boolean;
}

export interface AppState {
  samples: Sample[];
  fields: Field[];
  observers: Observer[];
  currentUserId: string;
}
