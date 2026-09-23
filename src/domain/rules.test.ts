import {
  addCosign,
  correctConclusion,
  createSample,
  DomainError,
  getMetrics,
  registerField,
  resolveDispute,
  activeVersion,
  type RuleContext,
} from "./rules";
import type { StationState } from "../types";

let passed = 0;
function check(name: string, cond: boolean) {
  if (!cond) throw new Error("FAIL: " + name);
  passed++;
  console.log("  ✓ " + name);
}
function expectThrow(name: string, fn: () => void, fragment: string) {
  try {
    fn();
  } catch (e) {
    if (e instanceof DomainError && e.message.includes(fragment)) {
      passed++;
      console.log("  ✓ " + name + `（拦截：${e.message}）`);
      return;
    }
    throw new Error("FAIL: " + name + "，错误信息不符：" + String(e));
  }
  throw new Error("FAIL: " + name + "，应当抛错但没有");
}

const ctx: RuleContext = {
  id: (() => {
    let n = 0;
    return () => `id-${++n}`;
  })(),
  now: () => "2026-09-23T10:00:00.000Z",
};

function freshState(): StationState {
  const state: StationState = {
    observers: [
      { id: "a", name: "甲", title: "教师" },
      { id: "b", name: "乙", title: "学生" },
      { id: "c", name: "丙", title: "学生" },
      { id: "d", name: "丁", title: "管理员" },
    ],
    samples: [],
  };
  return state;
}

console.log("1) 登记 + 会签 + 冻结");
{
  const s = freshState();
  const sample = createSample(s, { name: "测试样本", type: "微生物" }, ctx);
  check("自动建立三个倍率视野", sample.fields.length === 3);
  const f400 = sample.fields.find((f) => f.magnification === "400x")!;
  registerField(
    s, sample.id, "400x",
    {
      stainingBatch: "批次1", coordinate: "X1/Y1", keyStructure: "结构A",
      stainingJudgment: "染色均匀", description: "d", observerId: "a",
    },
    ctx
  );
  check("登记后为待会签", f400.status === "draft");
  expectThrow("原观察者不得自签", () =>
    addCosign(s, sample.id, "400x", { observerId: "a", agrees: true, independent: true, note: "" }, ctx), "不得对自己");
  expectThrow("未独立观察不能会签", () =>
    addCosign(s, sample.id, "400x", { observerId: "b", agrees: true, independent: false, note: "" }, ctx), "独立观察");
  addCosign(s, sample.id, "400x", { observerId: "b", agrees: true, independent: true, note: "" }, ctx);
  check("一名会签后为会签中", f400.status === "countersigning");
  expectThrow("同一人不能重复会签", () =>
    addCosign(s, sample.id, "400x", { observerId: "b", agrees: true, independent: true, note: "" }, ctx), "重复签署");
  addCosign(s, sample.id, "400x", { observerId: "c", agrees: true, independent: true, note: "" }, ctx);
  check("两名独立同意后视野确认冻结", f400.status === "confirmed" && f400.frozenAt !== null);
  check("样本仍未冻结（其余倍率未确认）", sample.frozen === false);
  // 其余两个倍率也走通
  for (const mag of ["100x", "1000x"] as const) {
    registerField(s, sample.id, mag, {
      stainingBatch: "批次1", coordinate: "X1/Y1", keyStructure: "结构A",
      stainingJudgment: "染色均匀", description: "d", observerId: "a",
    }, ctx);
    addCosign(s, sample.id, mag, { observerId: "b", agrees: true, independent: true, note: "" }, ctx);
    addCosign(s, sample.id, mag, { observerId: "c", agrees: true, independent: true, note: "" }, ctx);
  }
  check("三倍率全部确认后样本冻结", sample.frozen === true && sample.frozenAt !== null);
  expectThrow("冻结样本不能补登记/修改", () =>
    registerField(s, sample.id, "100x", {
      stainingBatch: "x", coordinate: "x", keyStructure: "x", stainingJudgment: "x",
      description: "x", observerId: "a",
    }, ctx), "样本已冻结");
}

console.log("2) 不一致 → 第三人复现，指出差异字段并新建版本留旧值");
{
  const s = freshState();
  const sample = createSample(s, { name: "争议样本", type: "植物组织" }, ctx);
  registerField(s, sample.id, "400x", {
    stainingBatch: "批次2", coordinate: "X2/Y2", keyStructure: "结构A",
    stainingJudgment: "染色均匀", description: "d", observerId: "a",
  }, ctx);
  const field = sample.fields.find((f) => f.magnification === "400x")!;
  addCosign(s, sample.id, "400x", { observerId: "b", agrees: true, independent: true, note: "" }, ctx);
  addCosign(s, sample.id, "400x", { observerId: "c", agrees: false, independent: true, note: "染色偏浅" }, ctx);
  check("出现不同意立即转争议", field.status === "disputed");
  expectThrow("争议中不再接受新会签", () =>
    addCosign(s, sample.id, "400x", { observerId: "d", agrees: true, independent: true, note: "" }, ctx), "第三人复现");
  expectThrow("原观察者/会签者不能复现", () =>
    resolveDispute(s, sample.id, "400x", {
      reproducerId: "b", reproducedStructure: "结构A", reproducedStaining: "染色偏浅", note: "",
    }, ctx), "第三人");
  const result = resolveDispute(s, sample.id, "400x", {
    reproducerId: "d", reproducedStructure: "结构A", reproducedStaining: "染色偏浅且有沉淀", note: "复现",
  }, ctx);
  check("复现产生了新版本", result.revised === true);
  check("有效版本切换到 v2", field.activeVersionNo === 2 && field.versions.length === 2);
  const v1 = field.versions[0];
  const v2 = activeVersion(field)!;
  check("旧版本保留且标记被取代", v1.superseded === true && v1.stainingJudgment === "染色均匀");
  check("新版本记录差异后的染色判断", v2.stainingJudgment === "染色偏浅且有沉淀");
  check("差异字段被指出：染色判断", v2.reproductions[0].differingFields.includes("stainingJudgment"));
  check("结构一致，不在差异字段中", !v2.reproductions[0].differingFields.includes("keyStructure"));
  check("新版本重新进入会签", field.status === "countersigning");
  // 新版本原观察者为复现人 d，d 不能自签；b、c 可重新会签
  expectThrow("新版本原观察者（复现人）不得自签", () =>
    addCosign(s, sample.id, "400x", { observerId: "d", agrees: true, independent: true, note: "" }, ctx), "不得对自己");
}

console.log("3) 复现支持原结论 → 不开新版本，重开新会签轮");
{
  const s = freshState();
  const sample = createSample(s, { name: "复现一致", type: "动物组织" }, ctx);
  registerField(s, sample.id, "100x", {
    stainingBatch: "批次3", coordinate: "X3/Y3", keyStructure: "结构K",
    stainingJudgment: "染色佳", description: "d", observerId: "a",
  }, ctx);
  const field = sample.fields.find((f) => f.magnification === "100x")!;
  addCosign(s, sample.id, "100x", { observerId: "b", agrees: true, independent: true, note: "" }, ctx);
  addCosign(s, sample.id, "100x", { observerId: "c", agrees: false, independent: true, note: "异议" }, ctx);
  const result = resolveDispute(s, sample.id, "100x", {
    reproducerId: "d", reproducedStructure: "结构K", reproducedStaining: "染色佳", note: "",
  }, ctx);
  check("复现一致不产生新版本", result.revised === false && field.versions.length === 1);
  check("差异字段为空", field.versions[0].reproductions[0].differingFields.length === 0);
  check("开启第 2 轮会签", field.versions[0].rounds.length === 2);
  check("回到会签中", field.status === "countersigning");
  // 新一轮 b、c 均可重新签署
  addCosign(s, sample.id, "100x", { observerId: "b", agrees: true, independent: true, note: "" }, ctx);
  addCosign(s, sample.id, "100x", { observerId: "c", agrees: true, independent: true, note: "" }, ctx);
  check("二轮两人同意后确认", field.status === "confirmed");
}

console.log("4) 确认后更正：写原因、新建版本、留旧值、解冻重签");
{
  const s = freshState();
  const sample = createSample(s, { name: "更正样本", type: "血液涂片" }, ctx);
  registerField(s, sample.id, "1000x", {
    stainingBatch: "批次4", coordinate: "旧坐标", keyStructure: "旧结构",
    stainingJudgment: "旧判断", description: "d", observerId: "a",
  }, ctx);
  const field = sample.fields.find((f) => f.magnification === "1000x")!;
  addCosign(s, sample.id, "1000x", { observerId: "b", agrees: true, independent: true, note: "" }, ctx);
  addCosign(s, sample.id, "1000x", { observerId: "c", agrees: true, independent: true, note: "" }, ctx);
  check("已确认", field.status === "confirmed");
  expectThrow("更正不写原因被拒", () =>
    correctConclusion(s, sample.id, "1000x", {
      stainingBatch: "批次4", coordinate: "新坐标", keyStructure: "新结构",
      stainingJudgment: "新判断", description: "d", observerId: "d", reason: "  ",
    }, ctx), "原因");
  correctConclusion(s, sample.id, "1000x", {
    stainingBatch: "批次4", coordinate: "新坐标", keyStructure: "新结构",
    stainingJudgment: "新判断", description: "d2", observerId: "d", reason: "坐标记录偏移",
  }, ctx);
  check("更正后出现 v2 且 v1 保留旧值", field.versions.length === 2 && field.versions[0].coordinate === "旧坐标" && field.versions[0].superseded);
  const v2 = activeVersion(field)!;
  check("v2 带更正原因", v2.reason.includes("坐标记录偏移") && v2.coordinate === "新坐标");
  check("更正后回到会签中并解冻", field.status === "countersigning" && sample.frozen === false);
}

console.log("5) 指标统计");
{
  const s = freshState();
  const sample = createSample(s, { name: "统计样本", type: "微生物" }, ctx);
  registerField(s, sample.id, "100x", {
    stainingBatch: "b", coordinate: "c", keyStructure: "k", stainingJudgment: "j",
    description: "d", observerId: "a",
  }, ctx);
  const m = getMetrics(s);
  check("样本数 1、有效视野 1、待会签 1", m.sampleCount === 1 && m.fieldCount === 1 && m.pendingCosign === 1);
}

console.log(`\n全部 ${passed} 项断言通过 ✅`);
