/** Единая яркая палитра проектов и графиков */
export const CHART_COLORS = [
  "#7c3aed",
  "#0891b2",
  "#ea580c",
  "#e11d48",
  "#16a34a",
  "#2563eb",
  "#d97706",
  "#db2777",
  "#059669",
  "#9333ea",
  "#0284c7",
  "#65a30d",
  "#f43f5e",
  "#4f46e5",
];

/** Осветление цвета для полос занятости (цвет остаётся ярким и узнаваемым). */
export function soft(hex: string, mix = 0.18) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const int = parseInt(m[1]!, 16);
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
