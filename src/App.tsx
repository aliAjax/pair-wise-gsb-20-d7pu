import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import { Header } from "./components/Header";
import { MetricsBar } from "./components/MetricsBar";
import { SampleList } from "./components/SampleList";
import { SampleDetail } from "./components/SampleDetail";
import { useStation } from "./state/useStation";
import { stationStore } from "./data/storage";

export default function App() {
  // 数据来自保存层（首次进入写入演示数据；之后刷新保持一致）
  const [initial] = useState(() => stationStore.load());
  const { state, metrics, error, actions } = useStation(initial);
  const [currentObserverId, setCurrentObserverId] = useState(state.observers[0]?.id ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(state.samples[0]?.id ?? null);
  const [toast, setToast] = useState<string | null>(null);

  // 规则层报错在页面顶部短暂提示
  useEffect(() => {
    if (!error) return;
    setToast(error);
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [error]);

  const selected = useMemo(
    () => state.samples.find((s) => s.id === selectedId) ?? null,
    [state.samples, selectedId]
  );

  const handleCreate = (input: {
    name: string;
    type: Parameters<typeof actions.createSample>[0]["type"];
  }) => {
    const result = actions.createSample(input);
    if (result.ok && result.sampleId) {
      setSelectedId(result.sampleId); // createSample 把新样本置于列表首位
      setToast("样本已建立，含低 / 中 / 高三个倍率视野");
    }
  };

  const handleReset = () => {
    const reset = actions.resetDemo();
    if (reset.ok) {
      setSelectedId(stationStore.load().samples[0]?.id ?? null);
      setToast("已重置为演示数据");
    }
  };

  return (
    <main className="app-shell">
      <Header
        observers={state.observers}
        currentObserverId={currentObserverId}
        onObserverChange={setCurrentObserverId}
        onReset={handleReset}
      />

      {toast && (
        <div className={`toast${error ? " toast-error" : ""}`} role="alert">
          {toast}
        </div>
      )}

      <MetricsBar metrics={metrics} />

      <section className="workspace">
        <SampleList
          samples={state.samples}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCreate={handleCreate}
        />

        {selected ? (
          <SampleDetail
            state={state}
            sample={selected}
            currentObserverId={currentObserverId}
            actions={actions}
          />
        ) : (
          <section className="panel detail empty-detail">
            <h2>请选择左侧样本</h2>
            <p>或建立新样本，开始低 / 中 / 高倍率视野复现流程。</p>
          </section>
        )}
      </section>

      <footer className="page-footer">
        数据（localStorage）、判断（domain/rules 纯函数）、保存（storage）与页面（components）分层；
        刷新后样本、视野、会签与版本保持一致。
      </footer>
    </main>
  );
}
