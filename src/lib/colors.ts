/** Приглушение цвета: подмешиваем белый и слегка снижаем насыщенность. */
export function soft(hex: string, mix = 0.45) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const int = parseInt(m[1]!, 16);
  let r = (int >> 16) & 255;
  let g = (int >> 8) & 255;
  let b = int & 255;
  // лёгкая десатурация
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const d = 0.25;
  r = r + (lum - r) * d;
  g = g + (lum - g) * d;
  b = b + (lum - b) * d;
  // подмешиваем белый
  r = Math.round(r + (255 - r) * mix);
  g = Math.round(g + (255 - g) * mix);
  b = Math.round(b + (255 - b) * mix);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Спокойная палитра для графиков на белом фоне */
export const SOFT_CHART_COLORS = [
  "#8b7aa8",
  "#6f9aa8",
  "#c0a271",
  "#c08a8a",
  "#7fa88c",
  "#9a92c4",
  "#7d9bbd",
  "#b7a06e",
  "#c08fa6",
  "#84a888",
  "#8fa2cc",
  "#c39a80",
];
