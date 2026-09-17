/** Единая приглушённая палитра проектов и графиков */
export const CHART_COLORS = [
  "#7f63b8",
  "#3f8ca3",
  "#c9764a",
  "#c26073",
  "#5b9c6d",
  "#5b7fc4",
  "#bb914f",
  "#c27099",
  "#4f9b88",
  "#8f6fb5",
  "#5c8fb8",
  "#86a25a",
  "#cc7a86",
  "#7b76c4",
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
