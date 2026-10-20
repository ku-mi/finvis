"use client";

import * as echarts from "echarts";
import { useEffect, useRef } from "react";

type Handlers = Record<string, (p: any) => void>;

export function EChart({ option, height = 320, onEvents }: { option: echarts.EChartsOption; height?: number; onEvents?: Handlers }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, undefined, { renderer: "canvas" });
    chart.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current);
    return () => { ro.disconnect(); c.dispose(); chart.current = null; };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  useEffect(() => {
    const c = chart.current;
    if (!c || !onEvents) return;
    for (const [ev, fn] of Object.entries(onEvents)) c.on(ev, fn);
    return () => { for (const ev of Object.keys(onEvents)) c.off(ev); };
  }, [onEvents]);

  return <div ref={el} style={{ width: "100%", height }} />;
}
