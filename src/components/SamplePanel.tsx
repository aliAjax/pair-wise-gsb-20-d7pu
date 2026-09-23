/** 样本面板：样本头信息 + 低 / 中 / 高三档倍率视野 */
import type { AppState, Field, Sample } from "../types";
import { MAGNIFICATIONS } from "../types";
import { canConfirmSample, findField, hasActiveConclusion } from "../rules";
import type { BenchActions } from "../App";
import { FieldCard } from "./FieldCard";

interface Props {
  sample: Sample;
  state: AppState;
  actions: BenchActions;
}

export function SamplePanel({ sample, state, actions }: Props) {
  const fields = state.fields.filter((f) => f.sampleId === sample.id);
  const confirmedCount = fields.filter(hasActiveConclusion).length;
  const ready = canConfirmSample(state, sample.id);

  return (
    <section className={"sample-panel panel" + (sample.frozen ? " frozen" : "")}>
      <header className="sample-head">
        <div className="sample-id">
          <div className="sample-title-row">
            <h3>
              {sample.name} <code>{sample.code}</code>
            </h3>
            {sample.frozen ? (
              <span className="badge badge-confirmed">已冻结</span>
            ) : (
              <span className="badge badge-draft">进行中</span>
            )}
          </div>
          <p className="sample-meta">
            {sample.specimenType} · 建档 {new Date(sample.createdAt).toLocaleDateString("zh-CN")} ·
            视野 {fields.length}/3 · 有效结论 {confirmedCount}/3
          </p>
        </div>
        {!sample.frozen && (
          <button
            className="primary-action small"
            disabled={!ready}
            title={ready ? "三档视野结论齐备" : "三档视野均需已有确认结论"}
            onClick={() => actions.confirmSample(sample.id)}
          >
            确认并冻结样本
          </button>
        )}
      </header>

      {sample.frozen && confirmedCount < fields.length && (
        <p className="hint warn">
          样本物理信息与倍率集合仍冻结；有视野正在走更正新版本（旧值已留档），新版本重新会签确认后恢复为有效结论。
        </p>
      )}
      {!sample.frozen && !ready && (
        <p className="hint">
          建立完整低 / 中 / 高三档倍率视野，且每个视野经两名独立观察者会签确认后，方可冻结样本。
        </p>
      )}

      <div className="magnification-grid">
        {MAGNIFICATIONS.map((m) => (
          <FieldCard
            key={m}
            field={findField(state.fields, sample.id, m)}
            sample={sample}
            magnification={m}
            observers={state.observers}
            currentUserId={state.currentUserId}
            onRegister={(input) =>
              actions.registerField(sample.id, m, state.currentUserId, input)
            }
            onUpdateDraft={(patch) => {
              const field: Field | undefined = findField(state.fields, sample.id, m);
              if (field) actions.updateDraft(field.id, patch);
            }}
            onSubmit={() => {
              const field = findField(state.fields, sample.id, m);
              if (field) actions.submitForReview(field.id);
            }}
            onCosign={(input) => {
              const field = findField(state.fields, sample.id, m);
              if (field) actions.cosign(field.id, input);
            }}
            onReproduce={(input) => {
              const field = findField(state.fields, sample.id, m);
              if (field) actions.reproduce(field.id, input);
            }}
            onCorrect={(input) => {
              const field = findField(state.fields, sample.id, m);
              if (field) actions.correct(field.id, input);
            }}
          />
        ))}
      </div>
    </section>
  );
}
