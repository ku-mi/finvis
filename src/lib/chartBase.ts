import type { EChartsOption } from "echarts";
import { compact } from "./format";
import { INK, type Mode } from "./palette";

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export function base(mode: Mode): EChartsOption {
  const k = INK[mode];
  return {
    backgroundColor: "transparent",
    textStyle: { fontFamily: FONT, color: k.secondary },
    animationDuration: 400,
    tooltip: {
      backgroundColor: k.surface,
      borderColor: k.axis,
      borderWidth: 1,
      textStyle: { color: k.primary, fontFamily: FONT, fontSize: 12 },
      extraCssText: "border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);",
      confine: true,
    },
    legend: {
      top: 0,
      left: 0,
      icon: "roundRect",
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: k.secondary, fontSize: 12 },
      inactiveColor: k.axis,
    },
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
  };
}

export function catAxis(mode: Mode, data: string[], extra: Record<string, unknown> = {}) {
  const k = INK[mode];
  return {
    type: "category" as const,
    data,
    axisLine: { lineStyle: { color: k.axis } },
    axisTick: { show: false },
    axisLabel: { color: k.muted, fontSize: 11 },
    ...extra,
  };
}

export function valAxis(mode: Mode, extra: Record<string, unknown> = {}) {
  const k = INK[mode];
  return {
    type: "value" as const,
    splitLine: { lineStyle: { color: k.grid } },
    axisLabel: { color: k.muted, fontSize: 11, formatter: (v: number) => compact(v) },
    ...extra,
  };
}

/** Rounded data-end on bars, 4px. Positive bars round the top, negative the bottom. */
export const ROUND_UP = [4, 4, 0, 0];
export const ROUND_DOWN = [0, 0, 4, 4];

export function dot(color: string) {
  return `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};margin-right:6px"></span>`;
}
