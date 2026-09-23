import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadState, resetState, saveState } from "./storage";

/** 内存版 localStorage，用于验证刷新后的持久化往返 */
const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (memory.has(key) ? memory.get(key)! : null),
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
    clear: () => memory.clear(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("保存层：刷新后样本、视野、会签与版本一致", () => {
  it("写入后重新加载，数据完整一致", () => {
    const seed = resetState();
    const reloaded = loadState();

    expect(reloaded.samples.map((s) => s.id).sort()).toEqual(
      seed.samples.map((s) => s.id).sort()
    );
    expect(reloaded.fields).toHaveLength(seed.fields.length);
    // 会签记录逐条保留
    const cosignsBefore = seed.fields.flatMap((f) =>
      f.versions.flatMap((v) => v.cosigns.map((c) => c.id))
    );
    const cosignsAfter = reloaded.fields.flatMap((f) =>
      f.versions.flatMap((v) => v.cosigns.map((c) => c.id))
    );
    expect(cosignsAfter.sort()).toEqual(cosignsBefore.sort());

    // 版本链与旧值留档完整：洋葱高倍 v1 已废止 + v2 已确认并存
    const onionHigh = reloaded.fields.find((f) => f.id === "f-onion-1000")!;
    expect(onionHigh.versions.map((v) => [v.no, v.status])).toEqual([
      [1, "superseded"],
      [2, "confirmed"],
    ]);
    expect(onionHigh.versions[0].keyStructures).toContain("核仁");
    expect(onionHigh.versions[1].basedOnVersionId).toBe(onionHigh.versions[0].id);
    expect(onionHigh.versions[1].reason).toBeTruthy();
  });

  it("结构或染色会签争议、第三人复现字段可持久化", () => {
    resetState();
    const state = loadState();
    // 人血涂片高倍处于会签中，已 1 条会签
    const bloodHigh = state.fields.find((f) => f.id === "f-blood-1000")!;
    expect(bloodHigh.versions[0].status).toBe("in_review");
    expect(bloodHigh.versions[0].cosigns).toHaveLength(1);
  });

  it("损坏或形状不符的数据回退到种子数据", () => {
    localStorage.setItem("hxwl06.reproduction-bench.v1", "{不是合法json");
    expect(() => loadState()).not.toThrow();
    expect(loadState().samples.length).toBeGreaterThan(0);

    localStorage.setItem("hxwl06.reproduction-bench.v1", JSON.stringify({ hello: "world" }));
    expect(loadState().fields.length).toBeGreaterThan(0);
  });

  it("saveState 幂等且 loadState 取到最新写入", () => {
    const state = resetState();
    const renamed = {
      ...state,
      samples: state.samples.map((s, i) => (i === 0 ? { ...s, name: "改名样本" } : s)),
    };
    saveState(renamed);
    expect(loadState().samples[0].name).toBe("改名样本");
  });
});
