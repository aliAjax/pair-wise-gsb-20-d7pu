import type { Sample, StationState } from "../types";
import { FieldCard } from "./FieldCard";
import type { ActionResult } from "../state/useStation";
import type { CorrectInput, CosignInput, RegisterFieldInput, ReproduceInput } from "../domain/rules";
import type { Magnification } from "../types";

interface SampleDetailProps {
  state: StationState;
  sample: Sample;
  currentObserverId: string;
  actions: {
    registerField: (sampleId: string, magnification: Magnification, input: RegisterFieldInput) => ActionResult;
    addCosign: (sampleId: string, magnification: Magnification, input: CosignInput) => ActionResult;
    resolveDispute: (sampleId: string, magnification: Magnification, input: ReproduceInput) => ActionResult;
    correctConclusion: (sampleId: string, magnification: Magnification, input: CorrectInput) => ActionResult;
  };
}

export function SampleDetail({ state, sample, currentObserverId, actions }: SampleDetailProps) {
  const confirmed = sample.fields.filter((f) => f.status === "confirmed").length;
  return (
    <section className="panel detail">
      <div className="section-heading">
        <div>
          <p>{sample.type} · 建立于 {sample.createdAt.slice(0, 10)}</p>
          <h2>
            {sample.name}
            {sample.frozen && <em className="tag tag-frozen title-tag">样本已冻结</em>}
          </h2>
        </div>
        <span className="freeze-progress">{confirmed} / 3 倍率已确认冻结</span>
      </div>

      <p className="sample-rule">
        规则：每个倍率仅保留一条有效结论；需两名与原观察者不同的观察者独立会签；
        结构或染色判断不一致时转第三人复现并标注差异字段；三倍率全部确认后样本冻结。
      </p>

      <div className="field-stack">
        {sample.fields.map((field) => (
          <FieldCard
            key={field.id}
            state={state}
            field={field}
            sampleFrozen={sample.frozen}
            currentObserverId={currentObserverId}
            onRegister={(magnification, input) =>
              actions.registerField(sample.id, magnification, input)
            }
            onCosign={(magnification, input) => actions.addCosign(sample.id, magnification, input)}
            onResolve={(magnification, input) =>
              actions.resolveDispute(sample.id, magnification, input)
            }
            onCorrect={(magnification, input) =>
              actions.correctConclusion(sample.id, magnification, input)
            }
          />
        ))}
      </div>
    </section>
  );
}
