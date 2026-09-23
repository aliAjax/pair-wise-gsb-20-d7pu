import { useMemo, useState } from "react";
import type { ConclusionVersion, FieldOfView, StationState } from "../types";
import {
  activeVersion,
  DIFF_FIELD_LABEL,
  eligibleCosigners,
  eligibleReproducers,
  MAGNIFICATION_LABEL,
  observerName,
} from "../domain/rules";

interface FieldCardProps {
  state: StationState;
  field: FieldOfView;
  sampleFrozen: boolean;
  currentObserverId: string;
  onRegister: (magnification: FieldOfView["magnification"], input: {
    stainingBatch: string;
    coordinate: string;
    keyStructure: string;
    stainingJudgment: string;
    description: string;
    observerId: string;
  }) => void;
  onCosign: (magnification: FieldOfView["magnification"], input: {
    observerId: string;
    agrees: boolean;
    independent: boolean;
    note: string;
  }) => void;
  onResolve: (magnification: FieldOfView["magnification"], input: {
    reproducerId: string;
    reproducedStructure: string;
    reproducedStaining: string;
    note: string;
  }) => void;
  onCorrect: (magnification: FieldOfView["magnification"], input: {
    stainingBatch: string;
    coordinate: string;
    keyStructure: string;
    stainingJudgment: string;
    description: string;
    observerId: string;
    reason: string;
  }) => void;
}

const STATUS_TEXT: Record<FieldOfView["status"], string> = {
  unregistered: "未登记",
  draft: "待会签",
  countersigning: "会签进行中",
  disputed: "判断不一致 · 待第三人复现",
  confirmed: "已确认冻结",
};

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  area,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  area?: boolean;
}) {
  return (
    <label>
      <span>{label}</span>
      {area ? (
        <textarea rows={2} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

function VersionTimeline({ state, field }: { state: StationState; field: FieldOfView }) {
  return (
    <div className="version-timeline">
      <h4>版本与会签留痕（同一视野仅一条有效结论）</h4>
      {field.versions.map((version) => (
        <VersionBlock key={version.versionNo} state={state} version={version} active={field.activeVersionNo === version.versionNo} />
      ))}
    </div>
  );
}

function VersionBlock({
  state,
  version,
  active,
}: {
  state: StationState;
  version: ConclusionVersion;
  active: boolean;
}) {
  return (
    <article className={`version-block${active ? " active" : " superseded"}`}>
      <header>
        <strong>
          v{version.versionNo}
          {active ? " · 有效" : " · 旧值（已被取代）"}
        </strong>
        <span>{version.reason}</span>
        <time>{version.createdAt.slice(0, 16).replace("T", " ")}</time>
      </header>
      <dl>
        <div>
          <dt>染色批次</dt>
          <dd>{version.stainingBatch}</dd>
        </div>
        <div>
          <dt>坐标</dt>
          <dd>{version.coordinate}</dd>
        </div>
        <div>
          <dt>重点结构</dt>
          <dd>{version.keyStructure}</dd>
        </div>
        <div>
          <dt>染色判断</dt>
          <dd>{version.stainingJudgment}</dd>
        </div>
      </dl>
      <p className="version-desc">{version.description}</p>
      <p className="version-observer">原观察者：{observerName(state, version.observerId)}</p>

      {version.rounds.map((round) => (
        <div key={round.roundNo} className="round-block">
          <p>
            会签轮次 {round.roundNo}
            {round.cosigns.length === 0 && " · 尚无人签署"}
          </p>
          {round.cosigns.map((c) => (
            <div key={`${c.observerId}-${c.at}`} className={`cosign-row ${c.agrees ? "agree" : "disagree"}`}>
              <em className={`cosign-mark ${c.agrees ? "agree" : "disagree"}`}>
                {c.agrees ? "同意" : "不同意"}
              </em>
              <span>{observerName(state, c.observerId)}</span>
              <span className="cosign-independent">已独立观察同倍率</span>
              {c.note && <span className="cosign-note">“{c.note}”</span>}
              <time>{c.at.slice(0, 16).replace("T", " ")}</time>
            </div>
          ))}
        </div>
      ))}

      {version.reproductions.map((r) => (
        <div key={`${r.reproducerId}-${r.at}`} className="reproduction-block">
          <header>
            <strong>第三人复现 · {observerName(state, r.reproducerId)}</strong>
            <time>{r.at.slice(0, 16).replace("T", " ")}</time>
          </header>
          {r.differingFields.length > 0 ? (
            <p className="diff-fields">
              差异字段：
              {r.differingFields.map((f) => (
                <em key={f} className="tag tag-disputed">
                  {DIFF_FIELD_LABEL[f]}
                </em>
              ))}
            </p>
          ) : (
            <p className="diff-fields ok">复现支持原结论，无差异字段。</p>
          )}
          <p>复现重点结构：{r.reproducedStructure}</p>
          <p>复现染色判断：{r.reproducedStaining}</p>
          {r.note && <p className="cosign-note">“{r.note}”</p>}
        </div>
      ))}
    </article>
  );
}

export function FieldCard({
  state,
  field,
  sampleFrozen,
  currentObserverId,
  onRegister,
  onCosign,
  onResolve,
  onCorrect,
}: FieldCardProps) {
  const version = activeVersion(field);
  const [reg, setReg] = useState({ stainingBatch: "", coordinate: "", keyStructure: "", stainingJudgment: "", description: "" });
  const [independent, setIndependent] = useState(false);
  const [agree, setAgree] = useState(true);
  const [cosignNote, setCosignNote] = useState("");
  const [repro, setRepro] = useState({ reproducedStructure: "", reproducedStaining: "", note: "" });
  const [showCorrect, setShowCorrect] = useState(false);
  const [correction, setCorrection] = useState({
    stainingBatch: "",
    coordinate: "",
    keyStructure: "",
    stainingJudgment: "",
    description: "",
    reason: "",
  });

  const cosigners = useMemo(() => eligibleCosigners(state, field), [state, field]);
  const reproducers = useMemo(() => eligibleReproducers(state, field), [state, field]);
  const isOriginal = version != null && version.observerId === currentObserverId;
  const canCosign = cosigners.includes(currentObserverId);
  const canReproduce = reproducers.includes(currentObserverId);

  const openCorrect = () => {
    if (!version) return;
    setCorrection({
      stainingBatch: version.stainingBatch,
      coordinate: version.coordinate,
      keyStructure: version.keyStructure,
      stainingJudgment: version.stainingJudgment,
      description: version.description,
      reason: "",
    });
    setShowCorrect(true);
  };

  return (
    <article className={`field-card status-border-${field.status}`}>
      <header className="field-head">
        <div>
          <h3>{MAGNIFICATION_LABEL[field.magnification]}</h3>
          <p className="field-id">视野 ID：{field.id.slice(0, 8)}</p>
        </div>
        <em className={`field-status status-badge-${field.status}`}>{STATUS_TEXT[field.status]}</em>
      </header>

      {field.status === "unregistered" && (
        <div className="field-form">
          {sampleFrozen && <p className="block-note">样本已冻结，不能补登记视野。</p>}
          <div className="field-grid">
            <TextInput label="染色批次" value={reg.stainingBatch} onChange={(v) => setReg({ ...reg, stainingBatch: v })} placeholder="如 碘液 I2-20260918" />
            <TextInput label="坐标" value={reg.coordinate} onChange={(v) => setReg({ ...reg, coordinate: v })} placeholder="如 X +12 / Y −4" />
            <TextInput label="重点结构" value={reg.keyStructure} onChange={(v) => setReg({ ...reg, keyStructure: v })} />
            <TextInput label="染色判断" value={reg.stainingJudgment} onChange={(v) => setReg({ ...reg, stainingJudgment: v })} />
            <div className="field-grid-full">
              <TextInput label="视野描述" area value={reg.description} onChange={(v) => setReg({ ...reg, description: v })} />
            </div>
          </div>
          <button
            className="primary-action"
            disabled={sampleFrozen}
            onClick={() =>
              onRegister(field.magnification, { ...reg, observerId: currentObserverId })
            }
          >
            以「{observerName(state, currentObserverId)}」身份登记视野
          </button>
        </div>
      )}

      {version && field.status !== "unregistered" && (
        <>
          <section className="conclusion-view">
            <dl>
              <div>
                <dt>染色批次</dt>
                <dd>{version.stainingBatch}</dd>
              </div>
              <div>
                <dt>坐标</dt>
                <dd>{version.coordinate}</dd>
              </div>
              <div>
                <dt>重点结构</dt>
                <dd>{version.keyStructure}</dd>
              </div>
              <div>
                <dt>染色判断</dt>
                <dd>{version.stainingJudgment}</dd>
              </div>
            </dl>
            <p>{version.description}</p>
            <p className="version-observer">
              原观察者：{observerName(state, version.observerId)} · 登记于{" "}
              {version.createdAt.slice(0, 16).replace("T", " ")}
            </p>
          </section>

          {(field.status === "draft" || field.status === "countersigning") && (
            <section className="action-panel">
              <h4>独立会签（需两名非原观察者）</h4>
              {isOriginal && <p className="block-note">你是原观察者，不能对自己的结论会签。</p>}
              {!isOriginal && !canCosign && <p className="block-note">你已在本轮签署过。</p>}
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={independent}
                  onChange={(e) => setIndependent(e.target.checked)}
                />
                我已在 {MAGNIFICATION_LABEL[field.magnification]} 下独立观察，再给出判断
              </label>
              <div className="radio-line">
                <label>
                  <input type="radio" name={`agree-${field.id}`} checked={agree} onChange={() => setAgree(true)} />
                  结构与染色判断一致（同意）
                </label>
                <label>
                  <input type="radio" name={`agree-${field.id}`} checked={!agree} onChange={() => setAgree(false)} />
                  结构或染色判断不一致（转第三人复现）
                </label>
              </div>
              <input
                placeholder="会签意见（不一致时请说明差异）"
                value={cosignNote}
                onChange={(e) => setCosignNote(e.target.value)}
              />
              <button
                className={agree ? "primary-action" : "danger-action"}
                disabled={isOriginal || !canCosign}
                onClick={() => {
                  onCosign(field.magnification, {
                    observerId: currentObserverId,
                    agrees: agree,
                    independent,
                    note: cosignNote,
                  });
                  setIndependent(false);
                  setCosignNote("");
                }}
              >
                {agree ? "提交同意会签" : "提交不一致，转第三人复现"}
              </button>
            </section>
          )}

          {field.status === "disputed" && (
            <section className="action-panel disputed-panel">
              <h4>第三人复现</h4>
              <p className="block-note">
                原观察者与两名会签者均不能担任复现人；复现须指出与原结论不一致的字段。
              </p>
              {!canReproduce && <p className="block-note">当前身份参与过该视野观察或会签，不能复现。</p>}
              <TextInput
                label="复现：重点结构"
                value={repro.reproducedStructure}
                onChange={(v) => setRepro({ ...repro, reproducedStructure: v })}
              />
              <TextInput
                label="复现：染色判断"
                value={repro.reproducedStaining}
                onChange={(v) => setRepro({ ...repro, reproducedStaining: v })}
              />
              <TextInput label="复现说明" area value={repro.note} onChange={(v) => setRepro({ ...repro, note: v })} />
              <button
                className="danger-action"
                disabled={!canReproduce}
                onClick={() =>
                  onResolve(field.magnification, { reproducerId: currentObserverId, ...repro })
                }
              >
                以「{observerName(state, currentObserverId)}」身份提交复现
              </button>
            </section>
          )}

          {field.status === "confirmed" && (
            <section className="action-panel frozen-panel">
              <h4>视野已确认冻结</h4>
              <p className="block-note">
                样本、倍率与结论已冻结。如需更正，必须填写原因，系统保留旧值并新建版本，
                新版本须重新经两名独立观察者会签。
              </p>
              {!showCorrect && (
                <button onClick={openCorrect}>更正并新建版本</button>
              )}
              {showCorrect && (
                <div className="field-form">
                  <div className="field-grid">
                    <TextInput label="染色批次" value={correction.stainingBatch} onChange={(v) => setCorrection({ ...correction, stainingBatch: v })} />
                    <TextInput label="坐标" value={correction.coordinate} onChange={(v) => setCorrection({ ...correction, coordinate: v })} />
                    <TextInput label="重点结构" value={correction.keyStructure} onChange={(v) => setCorrection({ ...correction, keyStructure: v })} />
                    <TextInput label="染色判断" value={correction.stainingJudgment} onChange={(v) => setCorrection({ ...correction, stainingJudgment: v })} />
                    <div className="field-grid-full">
                      <TextInput label="视野描述" area value={correction.description} onChange={(v) => setCorrection({ ...correction, description: v })} />
                    </div>
                    <div className="field-grid-full">
                      <TextInput label="更正原因（必填）" value={correction.reason} onChange={(v) => setCorrection({ ...correction, reason: v })} placeholder="如 复阅发现坐标记录偏移" />
                    </div>
                  </div>
                  <div className="button-row">
                    <button
                      className="danger-action"
                      onClick={() =>
                        onCorrect(field.magnification, {
                          ...correction,
                          observerId: currentObserverId,
                        })
                      }
                    >
                      提交更正（保留 v{version.versionNo} 旧值）
                    </button>
                    <button onClick={() => setShowCorrect(false)}>取消</button>
                  </div>
                </div>
              )}
            </section>
          )}

          <VersionTimeline state={state} field={field} />
        </>
      )}
    </article>
  );
}
