import { useState } from "react";
import type { Sample, SampleType } from "../types";
import { SAMPLE_TYPES } from "../domain/rules";

interface SampleListProps {
  samples: Sample[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (input: { name: string; type: SampleType }) => void;
}

const STATUS_LABEL: Record<string, string> = {
  unregistered: "未登记",
  draft: "待会签",
  countersigning: "会签中",
  disputed: "争议复现",
  confirmed: "已冻结",
};

export function SampleList({ samples, selectedId, onSelect, onCreate }: SampleListProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<SampleType>(SAMPLE_TYPES[0]);

  const submit = () => {
    onCreate({ name, type });
    setName("");
  };

  return (
    <aside className="panel narrow">
      <h2>样本</h2>
      <div className="new-sample">
        <input
          placeholder="样本名称，如 蚕豆叶下表皮"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select value={type} onChange={(e) => setType(e.target.value as SampleType)}>
          {SAMPLE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button className="primary-action" onClick={submit}>
          建立样本（含低中高视野）
        </button>
        <p className="form-hint">新建样本自动建立 100× / 400× / 1000× 三个视野槽位。</p>
      </div>

      <div className="sample-list">
        {samples.map((sample) => {
          const confirmed = sample.fields.filter((f) => f.status === "confirmed").length;
          const disputed = sample.fields.some((f) => f.status === "disputed");
          return (
            <button
              key={sample.id}
              className={`sample-item${sample.id === selectedId ? " selected" : ""}`}
              onClick={() => onSelect(sample.id)}
            >
              <span className="sample-item-name">{sample.name}</span>
              <span className="sample-item-meta">
                {sample.type} · {confirmed}/3 已冻结
              </span>
              <span className="sample-tags">
                {sample.frozen && <em className="tag tag-frozen">样本冻结</em>}
                {disputed && <em className="tag tag-disputed">复现</em>}
              </span>
            </button>
          );
        })}
        {samples.length === 0 && <p className="form-hint">暂无样本，请先建立。</p>}
      </div>

      <details className="legend">
        <summary>状态说明</summary>
        <ul>
          {Object.entries(STATUS_LABEL).map(([key, label]) => (
            <li key={key}>
              <em className={`status-dot status-${key}`} /> {label}
            </li>
          ))}
        </ul>
      </details>
    </aside>
  );
}
