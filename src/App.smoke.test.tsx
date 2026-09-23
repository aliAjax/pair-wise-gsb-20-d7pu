import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import App from "./App";

describe("页面层接线冒烟（SSR 渲染整棵应用）", () => {
  it("无 localStorage 时回退种子数据并完整渲染", () => {
    const html = renderToString(<App />);
    // 三个种子样本
    expect(html).toContain("洋葱表皮");
    expect(html).toContain("人血涂片");
    expect(html).toContain("草履虫");
    // 三档倍率
    expect(html).toContain("低倍 100×");
    expect(html).toContain("中倍 400×");
    expect(html).toContain("高倍 1000×");
    // 会签 / 冻结 / 版本留档等关键界面元素
    expect(html).toContain("会签中");
    expect(html).toContain("已冻结");
    expect(html).toContain("版本 / 会签留档");
  });
});
