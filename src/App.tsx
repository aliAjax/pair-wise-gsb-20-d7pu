import { useMemo, useState } from "react";
import "./styles.css";
import { useBenchStore } from "./store";
import { SPECIMEN_TYPES } from "./types";
import type { SpecimenType } from "./types";
import { SamplePanel } from "./components/SamplePanel";

export type BenchActions = ReturnType<typeof useBenchStore>["actions"];

function App() {
  const { state, notice, dismissNotice, actions } = useBenchStore();
  const [typeFilter, setTypeFilter] = useState<SpecimenType | "全部">("全部");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [specimenType, setSpecimenType] = useState<SpecimenType>("植物组织");

  const currentUser = state.observers.find((o) => o.id === state.currentUserId);

  const samples = useMemo(
    () =>
      state.samples.filter((s) => typeFilter === "全部" || s.specimenType === typeFilter),
    [state.samples, typeFilter]
  );

  const metrics = useMemo(() => {
    const confirmedFields = state.fields.filter((f) =>
      f.versions.some((v) => v.status === "confirmed")
    ).length;
    const inReview = state.fields.filter((f) =>
      f.versions.some((v) => v.status === "in_review" || v.status === "disputed")
    ).length;
    return [
      { label: "样本数", value: String(state.samples.length) },
      { label: "倍率视野", value: `${state.fields.length}/${state.samples.length * 3}` },
      { label: "有效结论视野", value: String(confirmedFields) },
      { label: "会签 / 复现中", value: String(inReview) },
    ];
  }, [state]);

  return (
    <main className="app-shell">
      {notice && (
        <div className={`notice ${notice.kind}`} onClick={dismissNotice}>
          <span>{notice.kind === "err" ? "⚠ " : "✓ "}{notice.text}</span>
          <b>×</b>
        </div>
      )}

      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-06 · 多倍率视野复现台</p>
          <h1>显微镜玻片多倍率视野复现台</h1>
          <p className="subtitle">
            每个样本建立低 / 中 / 高倍率视野，登记染色批次、载物台坐标、重点结构与观察者；
            同一视野仅一条有效结论，两名独立观察者会签、原观察者不得自签，
            结构或染色不一致转第三人复现；确认后冻结，更正写原因、建版本、留旧值。
          </p>
        </div>
        <div className="stack-card identity-card">
          <span>当前观察者（会签身份）</span>
          <strong>{currentUser?.name}</strong>
          <em>{currentUser?.role}</em>
          <select
            value={state.currentUserId}
            onChange={(e) => actions.switchUser(e.target.value)}
          >
            {state.observers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} · {o.role}
              </option>
            ))}
          </select>
          <button className="text-btn" onClick={actions.reset}>恢复演示数据</button>
        </div>
      </section>

      <section className="metrics-grid">
        {metrics.map((m) => (
          <article key={m.label} className="metric-card">
            <span>{m.label}</span>
            <strong>{m.value}</strong>
          </article>
        ))}
      </section>

      <section className="workspace">
        <aside className="panel narrow">
          <h2>新建样本</h2>
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              actions.addSample({ code, name, specimenType });
              setCode("");
              setName("");
            }}
          >
            <label className="labeled">
              <span>玻片编号</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="如 BP-2026-010" />
            </label>
            <label className="labeled">
              <span>样本名称</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如 蚕豆叶下表皮" />
            </label>
            <label className="labeled">
              <span>样本类型</span>
              <select value={specimenType} onChange={(e) => setSpecimenType(e.target.value as SpecimenType)}>
                {SPECIMEN_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="primary-action small">建立样本</button>
          </form>

          <h2>按类型筛选</h2>
          <div className="chips muted">
            {(["全部", ...SPECIMEN_TYPES] as const).map((t) => (
              <button
                key={t}
                className={typeFilter === t ? "chip-active" : ""}
                onClick={() => setTypeFilter(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </aside>

        <section className="samples-stack">
          {samples.length === 0 && (
            <div className="panel empty-hint">该类型下暂无样本，先在左侧建立。</div>
          )}
          {samples.map((sample) => (
            <SamplePanel key={sample.id} sample={sample} state={state} actions={actions} />
          ))}
        </section>
      </section>
    </main>
  );
}

export default App;
