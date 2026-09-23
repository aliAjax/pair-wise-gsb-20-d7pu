/** 单个倍率视野卡片：登记、草稿、会签、复现、更正与版本留档 */
import { useState } from "react";
import type {
  ConclusionVersion,
  Coordinate,
  Field,
  Magnification,
  Observer,
  Sample,
} from "../types";
import { MAGNIFICATION_LABEL } from "../types";
import {
  canCosign,
  canReproduce,
  differingFieldsOf,
  latestVersion,
} from "../rules";
import type { CosignInput, CorrectionInput, ReproduceInput } from "../rules";
import type { DraftConclusionInput } from "../store";
import { STATUS_META, formatTime, observerName, observerRole } from "../format";

interface Props {
  field: Field | undefined;
  sample: Sample;
  magnification: Magnification;
  observers: Observer[];
  currentUserId: string;
  onRegister: (input: DraftConclusionInput) => void;
  onUpdateDraft: (patch: Partial<DraftConclusionInput>) => void;
  onSubmit: () => void;
  onCosign: (input: CosignInput) => void;
  onReproduce: (input: ReproduceInput) => void;
  onCorrect: (input: CorrectionInput) => void;
}

export function FieldCard(props: Props) {
  const { field, sample, magnification, observers } = props;
  const version = field ? latestVersion(field) : undefined;

  return (
    <article className={"field-card" + (sample.frozen ? " is-frozen" : "")}>
      <header className="field-head">
        <div>
          <h4>{MAGNIFICATION_LABEL[magnification]}</h4>
          {field?.coordinate ? (
            <p className="coord">
              载物台坐标 x {field.coordinate.x} / y {field.coordinate.y} / z{" "}
              {field.coordinate.z} μm · 登记于 {formatTime(field.registeredAt)}
            </p>
          ) : (
            <p className="coord muted">视野未登记</p>
          )}
        </div>
        {version && (
          <span className={`badge ${STATUS_META[version.status].cls}`}>
            v{version.no} · {STATUS_META[version.status].label}
          </span>
        )}
      </header>

      {!field && (
        <RegisterSlot sample={sample} onRegister={props.onRegister} />
      )}

      {field && version?.status === "draft" && (
        <DraftEditor
          field={field}
          version={version}
          sample={sample}
          observers={observers}
          currentUserId={props.currentUserId}
          onUpdateDraft={props.onUpdateDraft}
          onSubmit={props.onSubmit}
        />
      )}

      {field && version && (version.status === "in_review" || version.status === "disputed") && (
        <ReviewPanel
          version={version}
          observers={observers}
          currentUserId={props.currentUserId}
          onCosign={props.onCosign}
          onReproduce={props.onReproduce}
        />
      )}

      {field && version && (version.status === "confirmed" || version.status === "superseded") && (
        <ConfirmedPanel
          field={field}
          version={version}
          observers={observers}
          currentUserId={props.currentUserId}
          onCorrect={props.onCorrect}
        />
      )}

      {field && <VersionTimeline field={field} observers={observers} />}
    </article>
  );
}

/* ---------------- 空槽位：登记视野 + 首条结论 ---------------- */

function RegisterSlot({
  sample,
  onRegister,
}: {
  sample: Sample;
  onRegister: (input: DraftConclusionInput) => void;
}) {
  const [stainBatch, setStainBatch] = useState("");
  const [keyStructures, setKeyStructures] = useState("");
  const [text, setText] = useState("");
  const [coord, setCoord] = useState<Coordinate>({ x: 0, y: 0, z: 0 });

  if (sample.frozen) {
    return <p className="hint">样本已冻结，倍率视野集合锁定。</p>;
  }

  return (
    <form
      className="stack-form"
      onSubmit={(e) => {
        e.preventDefault();
        onRegister({ stainBatch, keyStructures, text, coordinate: coord });
      }}
    >
      <p className="hint">尚未建立该倍率视野。登记染色批次、坐标、重点结构与观察者（取当前身份）。</p>
      <Labeled label="染色批次">
        <input value={stainBatch} onChange={(e) => setStainBatch(e.target.value)} placeholder="如 碘液-20260918-A / 活体观察" />
      </Labeled>
      <CoordinateInputs value={coord} onChange={setCoord} />
      <Labeled label="重点结构">
        <input value={keyStructures} onChange={(e) => setKeyStructures(e.target.value)} placeholder="如 细胞壁清晰，细胞核可见" />
      </Labeled>
      <Labeled label="视野描述 / 结论">
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="描述该倍率下的观察结论" />
      </Labeled>
      <button type="submit" className="primary-action small">登记视野（草稿）</button>
    </form>
  );
}

/* ---------------- 草稿编辑 ---------------- */

function DraftEditor({
  field,
  version,
  sample,
  observers,
  currentUserId,
  onUpdateDraft,
  onSubmit,
}: {
  field: Field;
  version: ConclusionVersion;
  sample: Sample;
  observers: Observer[];
  currentUserId: string;
  onUpdateDraft: (patch: Partial<DraftConclusionInput>) => void;
  onSubmit: () => void;
}) {
  const [stainBatch, setStainBatch] = useState(version.stainBatch);
  const [keyStructures, setKeyStructures] = useState(version.keyStructures);
  const [text, setText] = useState(version.text);
  const [coord, setCoord] = useState<Coordinate>(
    field.coordinate ?? { x: 0, y: 0, z: 0 }
  );
  const isOwner = version.observerId === currentUserId;

  return (
    <div className="stack-form">
      {version.no > 1 && (
        <p className="correction-note">
          更正版本 v{version.no}，原因：{version.reason}。基于 v{version.no - 1}{" "}
          新建，旧值已留档；需重新走两人会签。
        </p>
      )}
      <div className="kv-row">
        <span>原观察者</span>
        <strong>
          {observerName(observers, version.observerId)}
          <em>（{observerRole(observers, version.observerId)}）</em>
        </strong>
      </div>
      {sample.frozen && (
        <p className="hint warn">样本已冻结：仅可在会签完成前完善本草稿，确认字段随后锁定。</p>
      )}
      <Labeled label="染色批次">
        <input
          value={stainBatch}
          disabled={!isOwner}
          onChange={(e) => {
            setStainBatch(e.target.value);
            onUpdateDraft({ stainBatch: e.target.value });
          }}
        />
      </Labeled>
      <CoordinateInputs
        value={coord}
        disabled={!isOwner}
        onChange={(c) => {
          setCoord(c);
          onUpdateDraft({ coordinate: c });
        }}
      />
      <Labeled label="重点结构">
        <input
          value={keyStructures}
          disabled={!isOwner}
          onChange={(e) => {
            setKeyStructures(e.target.value);
            onUpdateDraft({ keyStructures: e.target.value });
          }}
        />
      </Labeled>
      <Labeled label="视野描述 / 结论">
        <textarea
          rows={3}
          value={text}
          disabled={!isOwner}
          onChange={(e) => {
            setText(e.target.value);
            onUpdateDraft({ text: e.target.value });
          }}
        />
      </Labeled>
      {isOwner ? (
        <button type="button" className="primary-action small" onClick={onSubmit}>
          提交两人独立会签
        </button>
      ) : (
        <p className="hint">等待原观察者 {observerName(observers, version.observerId)} 提交会签。</p>
      )}
    </div>
  );
}

/* ---------------- 会签 / 争议复现 ---------------- */

function ReviewPanel({
  version,
  observers,
  currentUserId,
  onCosign,
  onReproduce,
}: {
  version: ConclusionVersion;
  observers: Observer[];
  currentUserId: string;
  onCosign: (input: CosignInput) => void;
  onReproduce: (input: ReproduceInput) => void;
}) {
  return (
    <div className="stack-form">
      <ConclusionRead version={version} observers={observers} />

      {version.status === "disputed" && <DisputeNotice version={version} observers={observers} />}

      {version.status === "in_review" && (
        <CosignSection
          version={version}
          observers={observers}
          currentUserId={currentUserId}
          onCosign={onCosign}
        />
      )}
      {version.status === "disputed" && (
        <ReproduceSection
          version={version}
          observers={observers}
          currentUserId={currentUserId}
          onReproduce={onReproduce}
        />
      )}
    </div>
  );
}

function CosignSection({
  version,
  observers,
  currentUserId,
  onCosign,
}: {
  version: ConclusionVersion;
  observers: Observer[];
  currentUserId: string;
  onCosign: (input: CosignInput) => void;
}) {
  const [structuresObserved, setStructures] = useState("");
  const [stainBatchObserved, setStain] = useState("");
  const [note, setNote] = useState("");

  if (version.observerId === currentUserId) {
    return <p className="hint warn">你是原观察者，不得自签；请等待其他两名观察者独立会签。</p>;
  }
  const mine = version.cosigns.find((c) => c.reviewerId === currentUserId);
  if (mine) {
    return <p className="hint">你已完成会签，等待另一名独立观察者。</p>;
  }
  if (!canCosign(version, currentUserId)) return null;

  return (
    <form
      className="subform"
      onSubmit={(e) => {
        e.preventDefault();
        onCosign({ reviewerId: currentUserId, structuresObserved, stainBatchObserved, note });
      }}
    >
      <p className="hint">
        独立会签（{version.cosigns.length}/2）：请先在显微镜下独立观察并填写你自己的判断，提交后系统才逐项比对，
        勿照抄原结论。
      </p>
      <Labeled label="我观察到的重点结构">
        <input value={structuresObserved} onChange={(e) => setStructures(e.target.value)} />
      </Labeled>
      <Labeled label="我核对的染色批次">
        <input value={stainBatchObserved} onChange={(e) => setStain(e.target.value)} />
      </Labeled>
      <Labeled label="备注（可选）">
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </Labeled>
      <button type="submit" className="small">提交我的独立会签</button>
    </form>
  );
}

function DisputeNotice({
  version,
  observers,
}: {
  version: ConclusionVersion;
  observers: Observer[];
}) {
  return (
    <div className="dispute-box">
      <strong>两名会签人判断不一致，转第三人复现。差异字段：</strong>
      <ul>
        {version.cosigns.map((c) => {
          const diffs = [
            !c.structuresMatch ? "重点结构" : null,
            !c.stainMatch ? "染色批次" : null,
          ].filter(Boolean) as string[];
          return (
            <li key={c.id}>
              {observerName(observers, c.reviewerId)}：
              {diffs.length === 0 ? "两项一致" : diffs.map((d) => `「${d}」不一致`).join("、")}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ReproduceSection({
  version,
  observers,
  currentUserId,
  onReproduce,
}: {
  version: ConclusionVersion;
  observers: Observer[];
  currentUserId: string;
  onReproduce: (input: ReproduceInput) => void;
}) {
  const [structuresReproduced, setStructures] = useState(version.keyStructures);
  const [stainBatchReproduced, setStain] = useState(version.stainBatch);
  const [resolution, setResolution] = useState<"upheld" | "revised">("upheld");
  const [note, setNote] = useState("");

  const diffs = differingFieldsOf(version, structuresReproduced, stainBatchReproduced);

  if (!canReproduce(version, currentUserId)) {
    return (
      <p className="hint warn">
        复现人须为独立第三人（非原观察者、非前两名会签人）。请以相应身份登录后复现。
      </p>
    );
  }

  return (
    <form
      className="subform dispute-form"
      onSubmit={(e) => {
        e.preventDefault();
        onReproduce({
          reviewerId: currentUserId,
          structuresReproduced,
          stainBatchReproduced,
          resolution,
          note,
        });
      }}
    >
      <Labeled label="第三人复现：重点结构">
        <input value={structuresReproduced} onChange={(e) => setStructures(e.target.value)} />
      </Labeled>
      <Labeled label="第三人复现：染色批次">
        <input value={stainBatchReproduced} onChange={(e) => setStain(e.target.value)} />
      </Labeled>
      <p className="hint">
        系统判定差异字段：
        {diffs.length === 0 ? " 无（与原结论一致）" : diffs.map(fieldLabel).join("、")}
      </p>
      <Labeled label="复现裁决">
        <select value={resolution} onChange={(e) => setResolution(e.target.value as "upheld" | "revised")}>
          <option value="upheld">维持原结论（差异系会签人观察偏差）</option>
          <option value="revised">按复现结果更正本版本字段后确认</option>
        </select>
      </Labeled>
      <Labeled label="复现说明（可选）">
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </Labeled>
      <button type="submit" className="small danger-outline">提交第三人复现并确认</button>
    </form>
  );
}

/* ---------------- 已确认结论 + 更正新版本 ---------------- */

function ConfirmedPanel({
  field,
  version,
  observers,
  currentUserId,
  onCorrect,
}: {
  field: Field;
  version: ConclusionVersion;
  observers: Observer[];
  currentUserId: string;
  onCorrect: (input: CorrectionInput) => void;
}) {
  const [open, setOpen] = useState(false);
  const [stainBatch, setStainBatch] = useState(version.stainBatch);
  const [keyStructures, setKeyStructures] = useState(version.keyStructures);
  const [text, setText] = useState(version.text);
  const [reason, setReason] = useState("");

  return (
    <div className="stack-form">
      <ConclusionRead version={version} observers={observers} />
      <p className="hint">
        确认于 {formatTime(version.confirmedAt)}。结论已锁定；如需更正，须填写原因新建版本，旧值整体保留。
      </p>
      {!open ? (
        <button type="button" className="small" onClick={() => setOpen(true)}>
          更正（新建版本，留旧值）
        </button>
      ) : (
        <form
          className="subform"
          onSubmit={(e) => {
            e.preventDefault();
            onCorrect({
              observerId: currentUserId,
              stainBatch,
              keyStructures,
              text,
              reason,
            });
          }}
        >
          <p className="hint warn">更正会令 v{version.no} 废止并生成 v{version.no + 1} 草稿，需重新两人会签。</p>
          <Labeled label="染色批次（新值）">
            <input value={stainBatch} onChange={(e) => setStainBatch(e.target.value)} />
          </Labeled>
          <Labeled label="重点结构（新值）">
            <input value={keyStructures} onChange={(e) => setKeyStructures(e.target.value)} />
          </Labeled>
          <Labeled label="结论（新值）">
            <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          </Labeled>
          <Labeled label="更正原因（必填）">
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="如 油镜微调后结构无法重现 / 染色批次登记错误"
            />
          </Labeled>
          <div className="btn-row">
            <button type="submit" className="small danger-outline">提交更正版本</button>
            <button type="button" className="small" onClick={() => setOpen(false)}>取消</button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ---------------- 结论只读 + 版本时间线 ---------------- */

function ConclusionRead({
  version,
  observers,
}: {
  version: ConclusionVersion;
  observers: Observer[];
}) {
  return (
    <div className="conclusion-read">
      <div className="kv-row">
        <span>染色批次</span>
        <strong>{version.stainBatch}</strong>
      </div>
      <div className="kv-row">
        <span>重点结构</span>
        <strong>{version.keyStructures}</strong>
      </div>
      <div className="kv-row align-top">
        <span>结论</span>
        <strong>{version.text}</strong>
      </div>
      <div className="kv-row">
        <span>原观察者</span>
        <strong>
          {observerName(observers, version.observerId)}
          <em>（{observerRole(observers, version.observerId)}）</em>
        </strong>
      </div>
    </div>
  );
}

function VersionTimeline({
  field,
  observers,
}: {
  field: Field;
  observers: Observer[];
}) {
  const versions = [...field.versions].reverse();
  return (
    <details className="timeline">
      <summary>版本 / 会签留档（{field.versions.length}）</summary>
      <ol className="version-list">
        {versions.map((v) => (
          <li key={v.id} className="version-item">
            <div className="version-line">
              <strong>v{v.no}</strong>
              <span className={`badge ${STATUS_META[v.status].cls}`}>{STATUS_META[v.status].label}</span>
              <span className="muted">{observerName(observers, v.observerId)} · {formatTime(v.createdAt)}</span>
            </div>
            <p className="version-text">
              染色批次：{v.stainBatch} ｜ 重点结构：{v.keyStructures}
            </p>
            <p className="version-text muted">{v.text}</p>
            {v.reason && <p className="version-text correction-note">更正原因：{v.reason}</p>}
            {v.cosigns.length > 0 && (
              <ul className="cosign-list">
                {v.cosigns.map((c) => (
                  <li key={c.id}>
                    会签 {observerName(observers, c.reviewerId)} · {formatTime(c.at)}：
                    <span className={c.structuresMatch ? "match" : "mismatch"}>
                      结构{c.structuresMatch ? "一致" : "不一致"}
                    </span>
                    ／
                    <span className={c.stainMatch ? "match" : "mismatch"}>
                      染色{c.stainMatch ? "一致" : "不一致"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {v.reproduction && (
              <div className="reproduction-record">
                第三人 {observerName(observers, v.reproduction.reviewerId)} 复现（
                {formatTime(v.reproduction.at)}）：差异字段
                {v.reproduction.differingFields.length === 0
                  ? "无"
                  : v.reproduction.differingFields.map(fieldLabel).join("、")}
                ；裁决
                {v.reproduction.resolution === "upheld" ? "维持原结论" : "按复现结果更正"}。
              </div>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}

/* ---------------- 通用输入件 ---------------- */

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="labeled">
      <span>{label}</span>
      {children}
    </label>
  );
}

function CoordinateInputs({
  value,
  onChange,
  disabled,
}: {
  value: Coordinate;
  onChange: (c: Coordinate) => void;
  disabled?: boolean;
}) {
  const set = (axis: keyof Coordinate, raw: string) => {
    const n = Number(raw);
    onChange({ ...value, [axis]: Number.isFinite(n) ? n : 0 });
  };
  return (
    <div className="coord-inputs">
      <span className="coord-label">载物台坐标 (μm)</span>
      <div>
        <label>x <input type="number" disabled={disabled} value={value.x} onChange={(e) => set("x", e.target.value)} /></label>
        <label>y <input type="number" disabled={disabled} value={value.y} onChange={(e) => set("y", e.target.value)} /></label>
        <label>z <input type="number" disabled={disabled} value={value.z} onChange={(e) => set("z", e.target.value)} /></label>
      </div>
    </div>
  );
}

function fieldLabel(field: "keyStructures" | "stainBatch"): string {
  return field === "keyStructures" ? "重点结构" : "染色批次";
}
