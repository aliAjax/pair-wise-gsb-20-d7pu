// 控制器：衔接「判断层」与「保存层」，向页面暴露动作。
// 每次动作：深拷贝当前状态 → 调用纯业务规则 → 保存 → 提交。页面本身不写规则。

import { useCallback, useMemo, useState } from "react";
import type { Magnification, SampleType, StationState } from "../types";
import {
  addCosign,
  correctConclusion,
  createSample,
  DomainError,
  getMetrics,
  registerField,
  resolveDispute,
  type CorrectInput,
  type CosignInput,
  type RegisterFieldInput,
  type ReproduceInput,
} from "../domain/rules";
import { stationStore } from "../data/storage";

const runtimeContext = {
  id: () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`),
  now: () => new Date().toISOString(),
};

function clone(state: StationState): StationState {
  return JSON.parse(JSON.stringify(state)) as StationState;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  revised?: boolean;
  sampleId?: string;
}

export function useStation(initial: StationState) {
  const [state, setState] = useState<StationState>(initial);
  const [error, setError] = useState<string | null>(null);

  const commit = useCallback((next: StationState) => {
    stationStore.save(next); // 先保存
    setState(next); // 再更新页面
    setError(null);
  }, []);

  /** 在状态副本上执行一条规则，返回是否产生新版本（复现场景） */
  const run = useCallback(
    <T>(fn: (draft: StationState) => T): { ok: true; value: T } | { ok: false; error: string } => {
      const draft = clone(state);
      try {
        const value = fn(draft);
        commit(draft);
        return { ok: true, value };
      } catch (e) {
        const message = e instanceof DomainError ? e.message : "操作失败，请重试";
        setError(message);
        return { ok: false, error: message };
      }
    },
    [state, commit]
  );

  const actions = useMemo(
    () => ({
      createSample(input: { name: string; type: SampleType }): ActionResult {
        const result = run((draft) => ({
          sampleId: createSample(draft, input, runtimeContext).id,
        }));
        return result.ok ? { ok: true, sampleId: result.value.sampleId } : result;
      },
      registerField(sampleId: string, magnification: Magnification, input: RegisterFieldInput): ActionResult {
        return run((draft) => {
          registerField(draft, sampleId, magnification, input, runtimeContext);
        });
      },
      addCosign(sampleId: string, magnification: Magnification, input: CosignInput): ActionResult {
        return run((draft) => {
          addCosign(draft, sampleId, magnification, input, runtimeContext);
        });
      },
      resolveDispute(
        sampleId: string,
        magnification: Magnification,
        input: ReproduceInput
      ): ActionResult {
        const result = run((draft) =>
          resolveDispute(draft, sampleId, magnification, input, runtimeContext)
        );
        return result.ok ? { ok: true, revised: result.value.revised } : result;
      },
      correctConclusion(
        sampleId: string,
        magnification: Magnification,
        input: CorrectInput
      ): ActionResult {
        return run((draft) => {
          correctConclusion(draft, sampleId, magnification, input, runtimeContext);
        });
      },
      resetDemo(): ActionResult {
        commit(stationStore.reset());
        return { ok: true };
      },
      clearError() {
        setError(null);
      },
    }),
    [run, commit]
  );

  const metrics = useMemo(() => getMetrics(state), [state]);

  return { state, metrics, error, actions };
}
