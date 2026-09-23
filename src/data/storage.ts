// 保存层：仅负责持久化与读取，不含任何业务判断。
// 当前实现为 localStorage（带版本号），后续可整体替换为 IndexedDB 或后端 API。

import type { StationState } from "../types";
import { buildSeedState } from "./seed";

const STORAGE_KEY = "hxwl-06.station.v1";

export interface StationStore {
  load(): StationState;
  save(state: StationState): void;
  reset(): StationState;
}

function isStationState(value: unknown): value is StationState {
  if (typeof value !== "object" || value == null) return false;
  const v = value as Partial<StationState>;
  return Array.isArray(v.observers) && Array.isArray(v.samples);
}

export const stationStore: StationStore = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isStationState(parsed)) return parsed;
      }
    } catch {
      // 数据损坏时回落到演示数据
    }
    const seed = buildSeedState();
    this.save(seed);
    return seed;
  },
  save(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  },
  reset() {
    const seed = buildSeedState();
    this.save(seed);
    return seed;
  },
};
