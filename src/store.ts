/**
 * 状态编排层：把“数据 / 判断 / 保存”组装成页面可用的操作。
 * 页面只调用这里暴露的动作，不直接改状态、不直接碰 localStorage。
 *
 * 所有动作先基于最新状态（stateRef）在 setState 之外完成校验与计算，
 * 再整体替换状态，避免在 updater 内抛错或产生副作用。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppState,
  ConclusionVersion,
  Coordinate,
  Field,
  Magnification,
  SpecimenType,
} from "./types";
import {
  applyCosign,
  applyReproduction,
  canConfirmSample,
  createCorrectionVersion,
  findField,
  latestVersion,
} from "./rules";
import type { CosignInput, CorrectionInput, ReproduceInput } from "./rules";
import { loadState, resetState, saveState } from "./storage";

let seq = 0;
function uid(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

export interface DraftConclusionInput {
  stainBatch: string;
  keyStructures: string;
  text: string;
  coordinate: Coordinate | null;
}

export function useBenchStore() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  // 任何状态变化都落盘；刷新后样本、视野、会签与版本保持一致
  useEffect(() => {
    saveState(state);
  }, [state]);

  /** 执行一个状态变换：成功则替换状态并提示，失败则保留状态并报错 */
  const commit = useCallback(
    (
      okText: string,
      transform: (prev: AppState) => AppState,
      noticeOf?: (next: AppState) => { kind: "ok" | "err"; text: string }
    ) => {
      try {
        const next = transform(stateRef.current);
        if (next !== stateRef.current) setState(next);
        setNotice(noticeOf ? noticeOf(next) : { kind: "ok", text: okText });
      } catch (e) {
        setNotice({ kind: "err", text: e instanceof Error ? e.message : String(e) });
      }
    },
    []
  );

  /** 静默保存（如草稿随改随存），不弹通知 */
  const commitQuiet = useCallback((transform: (prev: AppState) => AppState) => {
    try {
      const next = transform(stateRef.current);
      if (next !== stateRef.current) setState(next);
    } catch {
      // 草稿单项保存失败无需打断输入；正式提交时仍有完整校验
    }
  }, []);

  const switchUser = useCallback(
    (userId: string) =>
      commit("已切换当前观察者", (prev) => ({ ...prev, currentUserId: userId })),
    [commit]
  );

  const addSample = useCallback(
    (input: { code: string; name: string; specimenType: SpecimenType }) => {
      commit("样本已建立，请登记三档倍率视野", (prev) => {
        const code = input.code.trim();
        const name = input.name.trim();
        if (!code || !name) throw new Error("样本编号与名称必填");
        if (prev.samples.some((s) => s.code === code)) {
          throw new Error("样本编号已存在");
        }
        return {
          ...prev,
          samples: [
            ...prev.samples,
            {
              id: uid("s"),
              code,
              name,
              specimenType: input.specimenType,
              createdAt: new Date().toISOString(),
              frozen: false,
            },
          ],
        };
      });
    },
    [commit]
  );

  const registerField = useCallback(
    (
      sampleId: string,
      magnification: Magnification,
      observerId: string,
      input: DraftConclusionInput
    ) => {
      commit("视野已登记（草稿），可提交会签", (prev) => {
        const sample = prev.samples.find((s) => s.id === sampleId);
        if (!sample) throw new Error("样本不存在");
        if (sample.frozen) throw new Error("样本已冻结，倍率集合不可增减；如需更正请走新版本");
        if (findField(prev.fields, sampleId, magnification)) {
          throw new Error("该倍率视野已登记，每档倍率只能建一个视野");
        }
        validateConclusionInput(input);
        const field: Field = {
          id: uid("f"),
          sampleId,
          magnification,
          coordinate: input.coordinate,
          registeredAt: new Date().toISOString(),
          versions: [
            {
              id: uid("v"),
              no: 1,
              observerId,
              stainBatch: input.stainBatch.trim(),
              keyStructures: input.keyStructures.trim(),
              text: input.text.trim(),
              status: "draft",
              createdAt: new Date().toISOString(),
              cosigns: [],
            },
          ],
        };
        return { ...prev, fields: [...prev.fields, field] };
      });
    },
    [commit]
  );

  const updateDraft = useCallback(
    (fieldId: string, patch: Partial<DraftConclusionInput>) => {
      commitQuiet((prev) => {
        const field = mustFindField(prev, fieldId);
        const sample = prev.samples.find((s) => s.id === field.sampleId)!;
        if (sample.frozen) throw new Error("样本已冻结，草稿不可改（请走更正新版本）");
        const version = latestVersion(field)!;
        if (version.status !== "draft") throw new Error("仅草稿可编辑");
        return updateVersion(
          prev,
          fieldId,
          version.id,
          (v) => ({
            ...v,
            stainBatch: patch.stainBatch?.trim() ?? v.stainBatch,
            keyStructures: patch.keyStructures?.trim() ?? v.keyStructures,
            text: patch.text?.trim() ?? v.text,
          }),
          patch.coordinate !== undefined ? { coordinate: patch.coordinate } : undefined
        );
      });
    },
    [commitQuiet]
  );

  const submitForReview = useCallback(
    (fieldId: string) => {
      commit("已提交，等待两名独立观察者会签", (prev) => {
        const field = mustFindField(prev, fieldId);
        const version = latestVersion(field)!;
        if (version.status !== "draft") throw new Error("仅草稿可提交会签");
        return updateVersion(prev, fieldId, version.id, (v) => ({
          ...v,
          status: "in_review",
          submittedAt: new Date().toISOString(),
        }));
      });
    },
    [commit]
  );

  const cosign = useCallback(
    (fieldId: string, input: CosignInput) => {
      let quorum: { confirmed: boolean } | null = null;
      commit(
        "会签已记录",
        (prev) => {
          const field = mustFindField(prev, fieldId);
          const version = latestVersion(field)!;
          const result = applyCosign(version, input);
          if (result.quorumComplete) {
            quorum = { confirmed: result.version.status === "confirmed" };
          }
          return replaceVersion(prev, fieldId, result.version);
        },
        () =>
          quorum
            ? {
                kind: quorum.confirmed ? "ok" : "err",
                text: quorum.confirmed
                  ? "两名观察者会签一致，结论已确认"
                  : "结构或染色判断不一致，已转第三人复现",
              }
            : { kind: "ok", text: "会签已记录，等待另一名独立观察者" }
      );
    },
    [commit]
  );

  const reproduce = useCallback(
    (fieldId: string, input: ReproduceInput) => {
      commit("第三人复现完成，结论已确认", (prev) => {
        const field = mustFindField(prev, fieldId);
        const version = latestVersion(field)!;
        const next = applyReproduction(version, input);
        return replaceVersion(prev, fieldId, next);
      });
    },
    [commit]
  );

  const confirmSample = useCallback(
    (sampleId: string) => {
      commit("样本已确认冻结：样本、倍率与结论锁定，更正须新建版本", (prev) => {
        if (!canConfirmSample(prev, sampleId)) {
          throw new Error("低 / 中 / 高三档视野都具备已确认结论后才能冻结样本");
        }
        return {
          ...prev,
          samples: prev.samples.map((s) =>
            s.id === sampleId ? { ...s, frozen: true } : s
          ),
        };
      });
    },
    [commit]
  );

  const correct = useCallback(
    (fieldId: string, input: CorrectionInput) => {
      commit("已按原因新建更正版本（旧值留档），新版本从草稿重新会签", (prev) => {
        const field = mustFindField(prev, fieldId);
        const nextField = createCorrectionVersion(field, input);
        return {
          ...prev,
          fields: prev.fields.map((f) => (f.id === fieldId ? nextField : f)),
        };
      });
    },
    [commit]
  );

  const reset = useCallback(() => {
    const seed = resetState();
    setState(seed);
    setNotice({ kind: "ok", text: "已恢复演示数据" });
  }, []);

  const dismissNotice = useCallback(() => setNotice(null), []);

  return useMemo(
    () => ({
      state,
      notice,
      dismissNotice,
      actions: {
        switchUser,
        addSample,
        registerField,
        updateDraft,
        submitForReview,
        cosign,
        reproduce,
        confirmSample,
        correct,
        reset,
      },
    }),
    [
      state,
      notice,
      dismissNotice,
      switchUser,
      addSample,
      registerField,
      updateDraft,
      submitForReview,
      cosign,
      reproduce,
      confirmSample,
      correct,
      reset,
    ]
  );
}

function validateConclusionInput(input: DraftConclusionInput): void {
  if (!input.stainBatch.trim()) throw new Error("染色批次必填");
  if (!input.keyStructures.trim()) throw new Error("重点结构必填");
  if (!input.text.trim()) throw new Error("结论文本必填");
}

function mustFindField(state: AppState, fieldId: string): Field {
  const field = state.fields.find((f) => f.id === fieldId);
  if (!field) throw new Error("视野不存在");
  return field;
}

function replaceVersion(
  state: AppState,
  fieldId: string,
  version: ConclusionVersion
): AppState {
  return {
    ...state,
    fields: state.fields.map((f) =>
      f.id === fieldId
        ? {
            ...f,
            versions: f.versions.map((v) => (v.id === version.id ? version : v)),
          }
        : f
    ),
  };
}

/** 更新指定版本；fieldPatch 可同步改视野物理属性（仅草稿坐标允许） */
function updateVersion(
  state: AppState,
  fieldId: string,
  versionId: string,
  map: (v: ConclusionVersion) => ConclusionVersion,
  fieldPatch?: Partial<Field>
): AppState {
  return {
    ...state,
    fields: state.fields.map((f) =>
      f.id === fieldId
        ? {
            ...f,
            ...fieldPatch,
            versions: f.versions.map((v) => (v.id === versionId ? map(v) : v)),
          }
        : f
    ),
  };
}
