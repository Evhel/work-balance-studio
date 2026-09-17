/** Единая гармоничная палитра проектов по цветовому кругу. */
export const CHART_COLORS = [
  "#7665A3",
  "#866A96",
  "#A06F87",
  "#A5796D",
  "#9A8564",
  "#709078",
  "#60908E",
  "#63879A",
  "#657BA4",
];

/** Контрастный текст для цветной полосы проекта. */
export function contrastText(hex: string) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const value = match?.[1];
  if (!value) return "#ffffff";
  const color = parseInt(value, 16);
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.52 ? "#241f2b" : "#ffffff";
}

/** Осветление цвета для полос занятости (цвет остаётся ярким и узнаваемым). */
export function soft(hex: string, mix = 0.18) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const value = m[1];
  if (!value) return hex;
  const int = parseInt(value, 16);
  let r = (int >> 16) & 255;
  let g = (int >> 8) & 255;
  let b = int & 255;
  r = Math.round(r + (255 - r) * mix);
  g = Math.round(g + (255 - g) * mix);
  b = Math.round(b + (255 - b) * mix);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Совместимость: раньше палитра была приглушённой */
export const SOFT_CHART_COLORS = CHART_COLORS;
