/** 展示层小工具：观察者姓名、时间格式化（页面专用） */
import type { Observer, VersionStatus } from "./types";

export function observerName(observers: Observer[], id: string): string {
  return observers.find((o) => o.id === id)?.name ?? id;
}

export function observerRole(observers: Observer[], id: string): string {
  return observers.find((o) => o.id === id)?.role ?? "";
}

export function formatTime(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export const STATUS_META: Record<VersionStatus, { label: string; cls: string }> = {
  draft: { label: "草稿", cls: "badge-draft" },
  in_review: { label: "会签中", cls: "badge-review" },
  disputed: { label: "争议 · 待第三人复现", cls: "badge-disputed" },
  confirmed: { label: "已确认", cls: "badge-confirmed" },
  superseded: { label: "已废止（旧值留档）", cls: "badge-superseded" },
};
