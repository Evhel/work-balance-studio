/** Единая гармоничная палитра проектов по цветовому кругу. */
export const CHART_COLORS = [
  "#A78BFA",
  "#5DADE2",
  "#F472B6",
  "#34D399",
  "#8B5CF6",
  "#F4A261",
  "#2A9D8F",
  "#E76F51",
  "#93C5FD",
  "#8BC34A",
  "#D16BA5",
  "#6366F1",
  "#66C2A5",
  "#F6D365",
  "#C084FC",
  "#EBCB8B",
  "#7AA2F7",
  "#C94F7C",
  "#A3D9A5",
  "#4C78A8",
];

/** Контрастный текст для цветной полосы проекта. */
export function contrastText(hex: string) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const value = match?.[1];
  if (!value) return "#ffffff";
  const color = parseInt(value, 16);
  const channels = [(color >> 16) & 255, (color >> 8) & 255, color & 255].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    0.2126 * (channels[0] ?? 0) +
    0.7152 * (channels[1] ?? 0) +
    0.0722 * (channels[2] ?? 0);
  const whiteContrast = 1.05 / (luminance + 0.05);
  const darkContrast = (luminance + 0.05) / 0.057;
  return darkContrast > whiteContrast ? "#17131c" : "#ffffff";
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
