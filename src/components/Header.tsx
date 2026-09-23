import type { Observer } from "../types";

interface HeaderProps {
  observers: Observer[];
  currentObserverId: string;
  onObserverChange: (id: string) => void;
  onReset: () => void;
}

export function Header({ observers, currentObserverId, onObserverChange, onReset }: HeaderProps) {
  const current = observers.find((o) => o.id === currentObserverId);
  return (
    <section className="hero">
      <div>
        <p className="eyebrow">hxwl-06 · port 5106 · 多倍率视野复现台</p>
        <h1>显微镜玻片观察</h1>
        <p className="subtitle">
          每个样本建立低 / 中 / 高倍率视野，登记染色批次、坐标、重点结构与观察者；
          两名观察者独立会签，原观察者不得自签；判断不一致转第三人复现并指出差异字段；
          确认后冻结，更正须写原因、新建版本并保留旧值。
        </p>
      </div>
      <div className="stack-card observer-card">
        <span>当前操作身份（切换以模拟不同观察者）</span>
        <select
          value={currentObserverId}
          onChange={(e) => onObserverChange(e.target.value)}
          aria-label="当前观察者"
        >
          {observers.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} · {o.title}
            </option>
          ))}
        </select>
        <strong>{current ? `${current.name}（${current.title}）` : "未选择"}</strong>
        <button className="ghost-action" onClick={onReset}>
          重置为演示数据
        </button>
      </div>
    </section>
  );
}
