import { describe, expect, it } from "vitest";
import type { AppState, ConclusionVersion, Field, Sample } from "./types";
import {
  applyCosign,
  applyReproduction,
  canConfirmSample,
  canCosign,
  canReproduce,
  createCorrectionVersion,
  differingFieldsOf,
  hasActiveConclusion,
  latestVersion,
  sameStainBatch,
  sameStructures,
} from "./rules";

const OBSERVER = "u-teacher";
const R1 = "u-student-a";
const R2 = "u-student-b";
const R3 = "u-admin";

function makeVersion(over: Partial<ConclusionVersion> = {}): ConclusionVersion {
  return {
    id: over.id ?? "v1",
    no: over.no ?? 1,
    observerId: over.observerId ?? OBSERVER,
    stainBatch: over.stainBatch ?? "碘液-A",
    keyStructures: over.keyStructures ?? "细胞核可见",
    text: over.text ?? "结论",
    status: over.status ?? "in_review",
    createdAt: over.createdAt ?? "2026-09-23T00:00:00.000Z",
    cosigns: over.cosigns ?? [],
    ...over,
  };
}

function makeField(over: Partial<Field> = {}): Field {
  const version = over.versions ? undefined : makeVersion();
  return {
    id: "f1",
    sampleId: "s1",
    magnification: over.magnification ?? "100x",
    coordinate: { x: 1, y: 2, z: 3 },
    versions: over.versions ?? [version as ConclusionVersion],
    ...over,
  };
}

describe("判断文本比对", () => {
  it("忽略标点空白与大小写", () => {
    expect(sameStructures("细胞壁清晰，细胞核可见。", "细胞壁清晰 细胞核可见")).toBe(true);
    expect(sameStainBatch("Wright-B ", "wright-b")).toBe(true);
  });

  it("空值不视为一致", () => {
    expect(sameStructures("", "")).toBe(false);
    expect(sameStainBatch("  ", "")).toBe(false);
  });
});

describe("会签资格（原观察者不得自签）", () => {
  it("非会签中状态不可签", () => {
    expect(canCosign(makeVersion({ status: "draft" }), R1)).toBe(false);
    expect(canCosign(makeVersion({ status: "confirmed" }), R1)).toBe(false);
  });

  it("原观察者不能自签", () => {
    expect(canCosign(makeVersion(), OBSERVER)).toBe(false);
  });

  it("同一人不能重复签", () => {
    const v = makeVersion({
      cosigns: [
        {
          id: "c1",
          reviewerId: R1,
          at: "t",
          structuresObserved: "细胞核可见",
          stainBatchObserved: "碘液-A",
          structuresMatch: true,
          stainMatch: true,
        },
      ],
    });
    expect(canCosign(v, R1)).toBe(false);
    expect(canCosign(v, R2)).toBe(true);
  });
});

describe("两名独立观察者会签", () => {
  it("两人均与原结论一致 → confirmed", () => {
    let v = makeVersion();
    const first = applyCosign(v, {
      reviewerId: R1,
      structuresObserved: "细胞核可见",
      stainBatchObserved: "碘液-A",
    });
    expect(first.quorumComplete).toBe(false);
    expect(first.version.status).toBe("in_review");

    const second = applyCosign(first.version, {
      reviewerId: R2,
      structuresObserved: "细胞核可见。",
      stainBatchObserved: "碘液-A",
    });
    expect(second.quorumComplete).toBe(true);
    expect(second.version.status).toBe("confirmed");
    expect(second.version.confirmedAt).toBeTruthy();
  });

  it("结构判断不一致 → disputed，转第三人", () => {
    let v = makeVersion();
    v = applyCosign(v, {
      reviewerId: R1,
      structuresObserved: "细胞核可见",
      stainBatchObserved: "碘液-A",
    }).version;
    const second = applyCosign(v, {
      reviewerId: R2,
      structuresObserved: "未见细胞核",
      stainBatchObserved: "碘液-A",
    });
    expect(second.version.status).toBe("disputed");
    const mismatch = second.version.cosigns.find((c) => c.reviewerId === R2);
    expect(mismatch?.structuresMatch).toBe(false);
    expect(mismatch?.stainMatch).toBe(true);
  });

  it("染色批次判断不一致 → disputed", () => {
    let v = makeVersion();
    v = applyCosign(v, {
      reviewerId: R1,
      structuresObserved: "细胞核可见",
      stainBatchObserved: "碘液-A",
    }).version;
    const second = applyCosign(v, {
      reviewerId: R2,
      structuresObserved: "细胞核可见",
      stainBatchObserved: "碘液-B",
    });
    expect(second.version.status).toBe("disputed");
  });

  it("原观察者自签抛错", () => {
    expect(() =>
      applyCosign(makeVersion(), {
        reviewerId: OBSERVER,
        structuresObserved: "细胞核可见",
        stainBatchObserved: "碘液-A",
      })
    ).toThrow();
  });
});

describe("第三人复现", () => {
  function disputed(): ConclusionVersion {
    let v = makeVersion();
    v = applyCosign(v, {
      reviewerId: R1,
      structuresObserved: "细胞核可见",
      stainBatchObserved: "碘液-A",
    }).version;
    return applyCosign(v, {
      reviewerId: R2,
      structuresObserved: "未见细胞核",
      stainBatchObserved: "碘液-A",
    }).version;
  }

  it("系统指出差异字段（重点结构）", () => {
    const v = disputed();
    expect(differingFieldsOf(v, "未见细胞核", "碘液-A")).toEqual(["keyStructures"]);
    expect(differingFieldsOf(v, "未见细胞核", "碘液-B").sort()).toEqual(
      ["keyStructures", "stainBatch"].sort()
    );
  });

  it("原观察者和前两名会签人均不得复现", () => {
    const v = disputed();
    expect(canReproduce(v, OBSERVER)).toBe(false);
    expect(canReproduce(v, R1)).toBe(false);
    expect(canReproduce(v, R2)).toBe(false);
    expect(canReproduce(v, R3)).toBe(true);
  });

  it("维持原结论：字段不变，确认", () => {
    const v = disputed();
    const next = applyReproduction(v, {
      reviewerId: R3,
      structuresReproduced: "细胞核可见",
      stainBatchReproduced: "碘液-A",
      resolution: "upheld",
    });
    expect(next.status).toBe("confirmed");
    expect(next.keyStructures).toBe("细胞核可见");
    expect(next.reproduction?.differingFields).toEqual([]);
    expect(next.reproduction?.resolution).toBe("upheld");
  });

  it("按复现结果更正：差异字段更新并确认，留痕", () => {
    const v = disputed();
    const next = applyReproduction(v, {
      reviewerId: R3,
      structuresReproduced: "染色质颗粒",
      stainBatchReproduced: "碘液-A",
      resolution: "revised",
    });
    expect(next.status).toBe("confirmed");
    expect(next.keyStructures).toBe("染色质颗粒");
    expect(next.reproduction?.differingFields).toEqual(["keyStructures"]);
    expect(next.reproduction?.resolution).toBe("revised");
  });
});

describe("同一视野一条有效结论", () => {
  it("已确认视野可更正：旧版 superseded、新版 draft 且 v 号递增", () => {
    const confirmed = makeVersion({
      id: "v1",
      status: "confirmed",
      confirmedAt: "2026-09-23T01:00:00.000Z",
    });
    const field = makeField({ versions: [confirmed] });

    const next = createCorrectionVersion(field, {
      observerId: R3,
      stainBatch: "碘液-C",
      keyStructures: "新结构",
      text: "新结论",
      reason: "染色批次登记错误",
    });

    const old = next.versions.find((x) => x.id === "v1")!;
    expect(old.status).toBe("superseded");
    expect(old.stainBatch).toBe("碘液-A"); // 旧值保留
    const fresh = latestVersion(next)!;
    expect(fresh.no).toBe(2);
    expect(fresh.status).toBe("draft");
    expect(fresh.reason).toBe("染色批次登记错误");
    expect(fresh.basedOnVersionId).toBe("v1");
    expect(fresh.cosigns).toEqual([]);

    // 更正前后有效结论始终至多一条
    expect(field.versions.filter((x) => x.status === "confirmed")).toHaveLength(1);
    expect(next.versions.filter((x) => x.status === "confirmed")).toHaveLength(0);
  });

  it("无原因不得更正；非 confirmed 不得更正", () => {
    const field = makeField({
      versions: [makeVersion({ id: "v1", status: "confirmed" })],
    });
    expect(() =>
      createCorrectionVersion(field, {
        observerId: R3,
        stainBatch: "x",
        keyStructures: "y",
        text: "z",
        reason: "  ",
      })
    ).toThrow("原因");

    const draftField = makeField({
      versions: [makeVersion({ id: "v1", status: "draft" })],
    });
    expect(() =>
      createCorrectionVersion(draftField, {
        observerId: R3,
        stainBatch: "x",
        keyStructures: "y",
        text: "z",
        reason: "r",
      })
    ).toThrow();
  });

  it("hasActiveConclusion 只认 confirmed", () => {
    expect(hasActiveConclusion(makeField({ versions: [makeVersion({ status: "draft" })] }))).toBe(false);
    expect(
      hasActiveConclusion(makeField({ versions: [makeVersion({ status: "confirmed" })] }))
    ).toBe(true);
  });
});

describe("样本确认冻结", () => {
  function sample(over: Partial<Sample> = {}): Sample {
    return {
      id: "s1",
      code: "BP-1",
      name: "样本",
      specimenType: "植物组织",
      createdAt: "t",
      frozen: false,
      ...over,
    };
  }

  function confirmedField(magnification: Field["magnification"]): Field {
    return makeField({
      id: `f-${magnification}`,
      magnification,
      versions: [makeVersion({ id: `v-${magnification}`, status: "confirmed" })],
    });
  }

  it("低中高三档视野均已确认才允许冻结", () => {
    const two: AppState = {
      samples: [sample()],
      observers: [],
      currentUserId: "x",
      fields: [confirmedField("100x"), confirmedField("400x")],
    };
    expect(canConfirmSample(two, "s1")).toBe(false);

    const three: AppState = {
      ...two,
      fields: [...two.fields, confirmedField("1000x")],
    };
    expect(canConfirmSample(three, "s1")).toBe(true);
  });

  it("已冻结样本不可再次冻结；其中一档仅会签中也不行", () => {
    const frozen: AppState = {
      samples: [sample({ frozen: true })],
      observers: [],
      currentUserId: "x",
      fields: [confirmedField("100x"), confirmedField("400x"), confirmedField("1000x")],
    };
    expect(canConfirmSample(frozen, "s1")).toBe(false);

    const reviewing: AppState = {
      samples: [sample()],
      observers: [],
      currentUserId: "x",
      fields: [
        confirmedField("100x"),
        confirmedField("400x"),
        makeField({ id: "f-1000", magnification: "1000x", versions: [makeVersion({ status: "in_review" })] }),
      ],
    };
    expect(canConfirmSample(reviewing, "s1")).toBe(false);
  });
});
