// Validated reference palette (dataviz skill). Categorical slots are assigned in
// fixed order by each category's all-time rank, so a colour always follows its
// category regardless of filters. Beyond 7 slots everything folds into neutral "Other".

export type Mode = "light" | "dark";

export const SERIES: Record<Mode, string[]> = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
};

export const INK: Record<Mode, { surface: string; plane: string; primary: string; secondary: string; muted: string; grid: string; axis: string; other: string; good: string; bad: string; mid: string }> = {
  light: { surface: "#fcfcfb", plane: "#f9f9f7", primary: "#0b0b0b", secondary: "#52514e", muted: "#898781", grid: "#e1e0d9", axis: "#c3c2b7", other: "#a8a79f", good: "#006300", bad: "#d03b3b", mid: "#f0efec" },
  dark: { surface: "#1a1a19", plane: "#0d0d0d", primary: "#f0efec", secondary: "#c3c2b7", muted: "#898781", grid: "#2c2c2a", axis: "#383835", other: "#6b6a65", good: "#0ca30c", bad: "#e66767", mid: "#383835" },
};

/** Sequential blue ramp, light → dark. */
export const SEQ = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];
/** Diverging arms (blue = less/better, red = more/worse) around a neutral midpoint. */
export const DIV_BLUE = ["#1c5cab", "#3987e5", "#86b6ef"];
export const DIV_RED = ["#f3a9a8", "#e34948", "#b02a2a"];

export const SLOTS = 7;
export const OTHER = "Other";

export function colorIndex(order: string[], key: string): number {
  if (key === "Uncategorised") return -1;
  const i = order.filter((k) => k !== "Uncategorised").indexOf(key);
  return i >= 0 && i < SLOTS ? i : -1;
}

export function colorOf(mode: Mode, order: string[], key: string): string {
  const i = colorIndex(order, key);
  return i < 0 ? INK[mode].other : SERIES[mode][i];
}

/** Fold anything outside the colour slots into "Other" (keeps stacks readable). */
export function foldKey(order: string[], key: string): string {
  return colorIndex(order, key) < 0 ? OTHER : key;
}

export const GROUP_COLOR = (mode: Mode) => ({
  fixed: SERIES[mode][0],
  essentials: SERIES[mode][2],
  lifestyle: SERIES[mode][1],
  business: INK[mode].other,
  income: SERIES[mode][5],
});
