import type { StationMetrics } from "../domain/rules";

const statusColors = ["status-ok", "status-watch", "status-danger"];

interface MetricsBarProps {
  metrics: StationMetrics;
}

export function MetricsBar({ metrics }: MetricsBarProps) {
  const cards: Array<{ label: string; value: number; hint: string }> = [
    { label: "样本数", value: metrics.sampleCount, hint: `已冻结 ${metrics.frozenSamples}` },
    { label: "有效视野", value: metrics.fieldCount, hint: "低/中/高倍率" },
    { label: "待会签视野", value: metrics.pendingCosign, hint: "需两名独立会签" },
    { label: "复现争议", value: metrics.disputed, hint: "第三人复现中" },
  ];
  return (
    <section className="metrics-grid">
      {cards.map((card, index) => (
        <article key={card.label} className="metric-card">
          <span>
            {card.label} · {card.hint}
          </span>
          <strong>{card.value}</strong>
          <i className={statusColors[index % statusColors.length]} />
        </article>
      ))}
    </section>
  );
}
