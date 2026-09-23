// 领域类型：样本、多倍率视野、结论版本、会签与第三人复现
// 本文件只描述数据结构，不含任何判断逻辑、存取逻辑或页面逻辑。

export type Magnification = "100x" | "400x" | "1000x";

export type SampleType = "植物组织" | "动物组织" | "微生物" | "血液涂片";

export type FieldStatus =
  | "unregistered" // 尚未登记
  | "draft" // 已登记，待会签
  | "countersigning" // 会签进行中
  | "disputed" // 结构或染色判断不一致，待第三人复现
  | "confirmed"; // 两人独立会签一致，已冻结

export interface Observer {
  id: string;
  name: string;
  title: string;
}

export interface Cosign {
  observerId: string;
  agrees: boolean;
  independent: boolean; // 已独立在同倍率下观察
  note: string;
  at: string;
}

export interface CosignRound {
  roundNo: number;
  startedAt: string;
  cosigns: Cosign[];
}

export interface Reproduction {
  reproducerId: string;
  at: string;
  reproducedStructure: string;
  reproducedStaining: string;
  // 与被复现版本实际不一致的字段
  differingFields: DiffField[];
  note: string;
}

export type DiffField = "keyStructure" | "stainingJudgment";

/** 结论是版本化的：更正时旧版本整体保留，新版本接续。 */
export interface ConclusionVersion {
  versionNo: number;
  stainingBatch: string;
  coordinate: string;
  keyStructure: string;
  stainingJudgment: string;
  description: string;
  observerId: string;
  createdAt: string;
  reason: string; // 新建版本的原因；首版为登记
  rounds: CosignRound[];
  reproductions: Reproduction[];
  superseded: boolean;
}

export interface FieldOfView {
  id: string;
  magnification: Magnification;
  status: FieldStatus;
  activeVersionNo: number | null;
  versions: ConclusionVersion[];
  frozenAt: string | null;
}

export interface Sample {
  id: string;
  name: string;
  type: SampleType;
  createdAt: string;
  fields: FieldOfView[];
  frozen: boolean;
  frozenAt: string | null;
}

export interface StationState {
  observers: Observer[];
  samples: Sample[];
}
