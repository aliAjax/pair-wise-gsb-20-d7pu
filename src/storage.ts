/**
 * 保存层：localStorage 读写与初始种子数据。
 * 与判断逻辑、页面分离；页面只通过 store 间接访问本模块。
 */
import type { AppState } from "./types";

const STORAGE_KEY = "hxwl06.reproduction-bench.v1";

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && Array.isArray(parsed.samples) && Array.isArray(parsed.fields)) {
        return parsed;
      }
    }
  } catch {
    // 损坏数据回退到种子，不阻断使用
  }
  return seedState();
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 配额 / 隐私模式失败时静默，界面仍可操作当前会话
  }
}

export function resetState(): AppState {
  const seed = seedState();
  saveState(seed);
  return seed;
}

function now(plusMinutes = 0): string {
  return new Date(Date.now() + plusMinutes * 60000).toISOString();
}

/**
 * 种子数据：三个样本覆盖三种典型流程
 *  - 洋葱表皮：三档视野齐备、全部确认、样本已冻结（含一次 v2 更正留旧值）
 *  - 人血涂片：低 / 中倍已确认，高倍会签中（已 1 人会签）
 *  - 草履虫：仅登记低倍草稿，中 / 高倍视野待登记
 */
export function seedState(): AppState {
  const observers = [
    { id: "u-teacher", name: "林岚", role: "实验课教师" },
    { id: "u-student-a", name: "陈舟", role: "学生" },
    { id: "u-student-b", name: "赵衡", role: "学生" },
    { id: "u-admin", name: "孙邈", role: "实验管理员" },
  ];

  const samples = [
    {
      id: "s-onion",
      code: "BP-2026-001",
      name: "洋葱表皮",
      specimenType: "植物组织" as const,
      createdAt: now(-2880),
      frozen: true,
    },
    {
      id: "s-blood",
      code: "BP-2026-002",
      name: "人血涂片",
      specimenType: "血液涂片" as const,
      createdAt: now(-1440),
      frozen: false,
    },
    {
      id: "s-paramecium",
      code: "BP-2026-003",
      name: "草履虫",
      specimenType: "微生物" as const,
      createdAt: now(-360),
      frozen: false,
    },
  ];

  return {
    observers,
    currentUserId: "u-teacher",
    samples,
    fields: seedFields(),
  };
}

function seedFields(): AppState["fields"] {
  // —— 洋葱表皮：冻结样本，高倍经历过一次更正（v1 留档 superseded） ——
  const onionLow = {
    id: "f-onion-100",
    sampleId: "s-onion",
    magnification: "100x" as const,
    coordinate: { x: 120, y: 80, z: 0 },
    registeredAt: now(-2820),
    versions: [
      {
        id: "v-onion-100-1",
        no: 1,
        observerId: "u-teacher",
        stainBatch: "碘液-20260918-A",
        keyStructures: "表皮细胞排列规则，细胞壁清晰",
        text: "低倍下表皮细胞呈规则蜂窝状排列，碘液染色后细胞壁边界清楚。",
        status: "confirmed" as const,
        createdAt: now(-2800),
        submittedAt: now(-2780),
        confirmedAt: now(-2700),
        cosigns: [
          {
            id: "c-onion-100-1",
            reviewerId: "u-student-a",
            at: now(-2750),
            structuresObserved: "表皮细胞排列规则，细胞壁清晰",
            stainBatchObserved: "碘液-20260918-A",
            structuresMatch: true,
            stainMatch: true,
          },
          {
            id: "c-onion-100-2",
            reviewerId: "u-student-b",
            at: now(-2710),
            structuresObserved: "表皮细胞排列规则，细胞壁清晰",
            stainBatchObserved: "碘液-20260918-A",
            structuresMatch: true,
            stainMatch: true,
          },
        ],
      },
    ],
  };

  const onionMid = {
    id: "f-onion-400",
    sampleId: "s-onion",
    magnification: "400x" as const,
    coordinate: { x: 120, y: 80, z: 12 },
    registeredAt: now(-2680),
    versions: [
      {
        id: "v-onion-400-1",
        no: 1,
        observerId: "u-student-a",
        stainBatch: "碘液-20260918-A",
        keyStructures: "细胞核可见，细胞质均匀",
        text: "中倍下细胞核被碘液染成黄褐色，散布于细胞内。",
        status: "confirmed" as const,
        createdAt: now(-2660),
        submittedAt: now(-2640),
        confirmedAt: now(-2580),
        cosigns: [
          {
            id: "c-onion-400-1",
            reviewerId: "u-teacher",
            at: now(-2620),
            structuresObserved: "细胞核可见，细胞质均匀",
            stainBatchObserved: "碘液-20260918-A",
            structuresMatch: true,
            stainMatch: true,
          },
          {
            id: "c-onion-400-2",
            reviewerId: "u-admin",
            at: now(-2590),
            structuresObserved: "细胞核可见，细胞质均匀",
            stainBatchObserved: "碘液-20260918-A",
            structuresMatch: true,
            stainMatch: true,
          },
        ],
      },
    ],
  };

  const onionHigh = {
    id: "f-onion-1000",
    sampleId: "s-onion",
    magnification: "1000x" as const,
    coordinate: { x: 120, y: 80, z: 18 },
    registeredAt: now(-2500),
    versions: [
      {
        id: "v-onion-1000-1",
        no: 1,
        observerId: "u-teacher",
        stainBatch: "碘液-20260918-A",
        keyStructures: "核仁隐约可见",
        text: "油镜下核仁隐约可见（初判，后经复核实为核内染色颗粒）。",
        status: "superseded" as const,
        createdAt: now(-2480),
        submittedAt: now(-2460),
        confirmedAt: now(-2400),
        reason: "油镜微调后核仁形态无法稳定重现，按管理员复现结果更正",
        cosigns: [
          {
            id: "c-onion-1000-1a",
            reviewerId: "u-student-a",
            at: now(-2440),
            structuresObserved: "核仁隐约可见",
            stainBatchObserved: "碘液-20260918-A",
            structuresMatch: true,
            stainMatch: true,
          },
          {
            id: "c-onion-1000-1b",
            reviewerId: "u-student-b",
            at: now(-2410),
            structuresObserved: "核仁隐约可见",
            stainBatchObserved: "碘液-20260918-A",
            structuresMatch: true,
            stainMatch: true,
          },
        ],
      },
      {
        id: "v-onion-1000-2",
        no: 2,
        observerId: "u-admin",
        stainBatch: "碘液-20260918-A",
        keyStructures: "核内染色质颗粒，未见明确核仁",
        text: "油镜下所见为核内染色质颗粒，未见形态稳定的核仁。",
        status: "confirmed" as const,
        reason: "油镜微调后核仁形态无法稳定重现，按管理员复现结果更正",
        basedOnVersionId: "v-onion-1000-1",
        createdAt: now(-2300),
        submittedAt: now(-2280),
        confirmedAt: now(-2200),
        cosigns: [
          {
            id: "c-onion-1000-2a",
            reviewerId: "u-student-a",
            at: now(-2260),
            structuresObserved: "核内染色质颗粒，未见明确核仁",
            stainBatchObserved: "碘液-20260918-A",
            structuresMatch: true,
            stainMatch: true,
          },
          {
            id: "c-onion-1000-2b",
            reviewerId: "u-student-b",
            at: now(-2220),
            structuresObserved: "核内染色质颗粒，未见明确核仁",
            stainBatchObserved: "碘液-20260918-A",
            structuresMatch: true,
            stainMatch: true,
          },
        ],
      },
    ],
  };

  // —— 人血涂片：高倍会签中，已 1 人会签，等待第 2 名独立观察者 ——
  const bloodLow = {
    id: "f-blood-100",
    sampleId: "s-blood",
    magnification: "100x" as const,
    coordinate: { x: 45, y: 200, z: 0 },
    registeredAt: now(-1380),
    versions: [
      {
        id: "v-blood-100-1",
        no: 1,
        observerId: "u-teacher",
        stainBatch: "瑞氏-20260920-B",
        keyStructures: "红细胞分布均匀，无聚集",
        text: "低倍下红细胞涂片均匀，未见凝块。",
        status: "confirmed" as const,
        createdAt: now(-1360),
        submittedAt: now(-1340),
        confirmedAt: now(-1280),
        cosigns: [
          {
            id: "c-blood-100-1",
            reviewerId: "u-student-a",
            at: now(-1320),
            structuresObserved: "红细胞分布均匀，无聚集",
            stainBatchObserved: "瑞氏-20260920-B",
            structuresMatch: true,
            stainMatch: true,
          },
          {
            id: "c-blood-100-2",
            reviewerId: "u-admin",
            at: now(-1290),
            structuresObserved: "红细胞分布均匀，无聚集",
            stainBatchObserved: "瑞氏-20260920-B",
            structuresMatch: true,
            stainMatch: true,
          },
        ],
      },
    ],
  };

  const bloodMid = {
    id: "f-blood-400",
    sampleId: "s-blood",
    magnification: "400x" as const,
    coordinate: { x: 45, y: 200, z: 8 },
    registeredAt: now(-1200),
    versions: [
      {
        id: "v-blood-400-1",
        no: 1,
        observerId: "u-student-b",
        stainBatch: "瑞氏-20260920-B",
        keyStructures: "红细胞淡红色双凹圆盘，偶见中性粒细胞",
        text: "中倍下红细胞形态正常，可见少量中性粒细胞，核分叶。",
        status: "confirmed" as const,
        createdAt: now(-1180),
        submittedAt: now(-1160),
        confirmedAt: now(-1100),
        cosigns: [
          {
            id: "c-blood-400-1",
            reviewerId: "u-teacher",
            at: now(-1140),
            structuresObserved: "红细胞淡红色双凹圆盘，偶见中性粒细胞",
            stainBatchObserved: "瑞氏-20260920-B",
            structuresMatch: true,
            stainMatch: true,
          },
          {
            id: "c-blood-400-2",
            reviewerId: "u-student-a",
            at: now(-1110),
            structuresObserved: "红细胞淡红色双凹圆盘，偶见中性粒细胞",
            stainBatchObserved: "瑞氏-20260920-B",
            structuresMatch: true,
            stainMatch: true,
          },
        ],
      },
    ],
  };

  const bloodHigh = {
    id: "f-blood-1000",
    sampleId: "s-blood",
    magnification: "1000x" as const,
    coordinate: { x: 45, y: 200, z: 14 },
    registeredAt: now(-900),
    versions: [
      {
        id: "v-blood-1000-1",
        no: 1,
        observerId: "u-teacher",
        stainBatch: "瑞氏-20260920-B",
        keyStructures: "血小板成簇，中性粒分叶清晰",
        text: "油镜下血小板散在并可见 3～5 个成簇，中性粒核分叶清晰，未见异常细胞。",
        status: "in_review" as const,
        createdAt: now(-880),
        submittedAt: now(-860),
        cosigns: [
          {
            id: "c-blood-1000-1",
            reviewerId: "u-student-a",
            at: now(-820),
            structuresObserved: "血小板成簇，中性粒分叶清晰",
            stainBatchObserved: "瑞氏-20260920-B",
            structuresMatch: true,
            stainMatch: true,
          },
        ],
      },
    ],
  };

  // —— 草履虫：仅低倍草稿 ——
  const paraLow = {
    id: "f-para-100",
    sampleId: "s-paramecium",
    magnification: "100x" as const,
    coordinate: { x: 300, y: 300, z: 0 },
    registeredAt: now(-300),
    versions: [
      {
        id: "v-para-100-1",
        no: 1,
        observerId: "u-student-a",
        stainBatch: "活体观察（无染色）",
        keyStructures: "纤毛摆动，虫体旋转前进",
        text: "低倍暗视野下草履虫纤毛摆动明显，运动迅速。",
        status: "draft" as const,
        createdAt: now(-290),
        cosigns: [],
      },
    ],
  };

  return [onionLow, onionMid, onionHigh, bloodLow, bloodMid, bloodHigh, paraLow];
}
