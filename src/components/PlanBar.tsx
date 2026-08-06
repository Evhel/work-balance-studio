import type { Store } from "@/lib/types";
import { soft } from "@/lib/colors";


/** Занят ли человек на проекте в этот день */
export const isPlanned = (store: Store, projectId: string, personId: string, date: string) =>
  store.plan[projectId]?.[personId]?.[date] === "Р";

/**
 * Полоса занятости на проекте.
 * Если занятость идёт подряд несколько дней, полоса «сшивается» с соседними
 * ячейками и выглядит одной длинной линией (как в диаграмме проектов).
 */
export function PlanBar({
  color,
  name,
  first,
  last,
  height = 6,
  opacity = 1,
  extendPx = 1,
  children,
}: {
  color: string;
  name?: string;
  first: boolean;
  last: boolean;
  height?: number;
  opacity?: number;
  extendPx?: number;
  children?: React.ReactNode;
}) {
  const l = first ? 0 : extendPx;
  const r = last ? 0 : extendPx;
  return (
    <span
      title={name}
      className="block overflow-hidden"
      style={{
        background: soft(color),
        minHeight: height,

        width: `calc(100% + ${l + r}px)`,
        marginLeft: -l,
        borderTopLeftRadius: first ? 999 : 0,
        borderBottomLeftRadius: first ? 999 : 0,
        borderTopRightRadius: last ? 999 : 0,
        borderBottomRightRadius: last ? 999 : 0,
      }}
    >
      {children}
    </span>
  );
}
