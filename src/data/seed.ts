// 数据层：初始演示数据。通过判断层的规则函数构造，保证种子数据始终满足业务不变量。

import {
  addCosign,
  createSample,
  registerField,
  type RuleContext,
} from "../domain/rules";
import type { StationState } from "../types";

const observers = [
  { id: "obs-zhao", name: "赵慧中", title: "实验课教师" },
  { id: "obs-qian", name: "钱力行", title: "学生" },
  { id: "obs-sun", name: "孙明薇", title: "学生" },
  { id: "obs-li", name: "李文澜", title: "实验管理员" },
  { id: "obs-zheng", name: "郑思远", title: "实验课教师" },
];

function seedContext(): RuleContext {
  let n = 0;
  return {
    id: () => `seed-${String(++n).padStart(3, "0")}`,
    now: () => "2026-09-23T09:00:00+08:00",
  };
}

export function buildSeedState(): StationState {
  const state: StationState = {
    observers: observers.map((o) => ({ ...o })),
    samples: [],
  };
  const ctx = seedContext();

  // 样本一：低倍已确认，中倍因染色判断不一致转第三人复现，高倍未登记
  const onion = createSample(state, { name: "洋葱表皮", type: "植物组织" }, ctx);
  registerField(
    state,
    onion.id,
    "100x",
    {
      stainingBatch: "碘液 I2-20260918",
      coordinate: "X +12 / Y −4",
      keyStructure: "表皮细胞砖状排列，细胞壁完整",
      stainingJudgment: "碘液染色均匀，细胞核棕黄，对比清晰",
      description: "低倍下取表皮平整区域，无气泡与重叠。",
      observerId: "obs-zhao",
    },
    ctx
  );
  addCosign(
    state,
    onion.id,
    "100x",
    { observerId: "obs-qian", agrees: true, independent: true, note: "复看低倍，排列与着色一致" },
    ctx
  );
  addCosign(
    state,
    onion.id,
    "100x",
    { observerId: "obs-sun", agrees: true, independent: true, note: "一致" },
    ctx
  );
  registerField(
    state,
    onion.id,
    "400x",
    {
      stainingBatch: "碘液 I2-20260918",
      coordinate: "X +12 / Y −4",
      keyStructure: "细胞核与细胞壁边界清楚",
      stainingJudgment: "碘液着色充分，未见染色沉淀",
      description: "中倍聚焦核区，观察核膜与胞质颗粒。",
      observerId: "obs-zhao",
    },
    ctx
  );
  addCosign(
    state,
    onion.id,
    "400x",
    { observerId: "obs-qian", agrees: true, independent: true, note: "核区边界可辨" },
    ctx
  );
  addCosign(
    state,
    onion.id,
    "400x",
    {
      observerId: "obs-sun",
      agrees: false,
      independent: true,
      note: "核区染色偏浅，疑似染色时间不足，与登记判断不一致",
    },
    ctx
  );

  // 样本二：三个倍率均已两人独立会签，样本冻结
  const blood = createSample(state, { name: "人血涂片", type: "血液涂片" }, ctx);
  const bloodFields = [
    {
      mag: "100x" as const,
      coordinate: "X 0 / Y 0",
      keyStructure: "红细胞均匀铺满，白细胞散在分布",
      stainingJudgment: "瑞氏染色，红细胞粉红、核质紫蓝",
      description: "先低倍浏览涂片体尾交界。",
    },
    {
      mag: "400x" as const,
      coordinate: "X +3 / Y −2",
      keyStructure: "白细胞形态可辨，血小板小簇分布",
      stainingJudgment: "瑞氏染色分化良好，颗粒清晰",
      description: "中倍分类计数。",
    },
    {
      mag: "1000x" as const,
      coordinate: "X +5 / Y −1",
      keyStructure: "红细胞中央淡染区明显，中性粒分叶核清楚",
      stainingJudgment: "油镜下瑞氏染色稳定，无沉渣",
      description: "油镜确认形态细节。",
    },
  ];
  for (const f of bloodFields) {
    registerField(
      state,
      blood.id,
      f.mag,
      {
        stainingBatch: "瑞氏 W1-20260920",
        coordinate: f.coordinate,
        keyStructure: f.keyStructure,
        stainingJudgment: f.stainingJudgment,
        description: f.description,
        observerId: "obs-zhao",
      },
      ctx
    );
    addCosign(
      state,
      blood.id,
      f.mag,
      { observerId: "obs-qian", agrees: true, independent: true, note: "独立复看一致" },
      ctx
    );
    addCosign(
      state,
      blood.id,
      f.mag,
      { observerId: "obs-sun", agrees: true, independent: true, note: "一致" },
      ctx
    );
  }

  // 样本三：低倍待会签、中倍已有一名会签、高倍未登记
  const para = createSample(state, { name: "草履虫", type: "微生物" }, ctx);
  registerField(
    state,
    para.id,
    "100x",
    {
      stainingBatch: "活体观察（未染色）",
      coordinate: "视野中央水滴边缘",
      keyStructure: "虫体草鞋形，纤毛摆动，运动迅速",
      stainingJudgment: "活体未染色，透光观察",
      description: "低倍追踪活体运动。",
      observerId: "obs-sun",
    },
    ctx
  );
  registerField(
    state,
    para.id,
    "400x",
    {
      stainingBatch: "活体观察（未染色）",
      coordinate: "盖玻片边缘减速区",
      keyStructure: "口沟与伸缩泡节律可见",
      stainingJudgment: "活体未染色，靠相差观察",
      description: "加棉纤维限速后中倍观察。",
      observerId: "obs-zhao",
    },
    ctx
  );
  addCosign(
    state,
    para.id,
    "400x",
    { observerId: "obs-sun", agrees: true, independent: true, note: "伸缩泡节律清晰" },
    ctx
  );

  return state;
}
