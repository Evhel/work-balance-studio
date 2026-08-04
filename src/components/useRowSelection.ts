import { useCallback, useRef, useState } from "react";

const range = (a: number, b: number) => {
  const [s, e] = a <= b ? [a, b] : [b, a];
  return Array.from({ length: e - s + 1 }, (_, i) => s + i);
};

/**
 * Выделение ячеек в одной строке:
 *  - зажатая левая кнопка мыши — протяжкой,
 *  - Shift — диапазон от предыдущей ячейки,
 *  - Ctrl/Cmd — добавление отдельных ячеек.
 * Правая кнопка мыши не сбрасывает выделение.
 */
export function useRowSelection() {
  const [sel, setSel] = useState<{ rowId: string; days: number[] } | null>(null);
  const anchor = useRef<{ rowId: string; day: number } | null>(null);
  const dragging = useRef(false);

  const onMouseDown = useCallback(
    (rowId: string, day: number, e?: { button?: number; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => {
      if (e && e.button !== undefined && e.button !== 0) return; // ПКМ не трогает выделение
      if (e?.shiftKey && anchor.current && anchor.current.rowId === rowId) {
        setSel({ rowId, days: range(anchor.current.day, day) });
        dragging.current = false;
        return;
      }
      if (e?.ctrlKey || e?.metaKey) {
        setSel((prev) => {
          if (!prev || prev.rowId !== rowId) return { rowId, days: [day] };
          const days = prev.days.includes(day)
            ? prev.days.filter((d) => d !== day)
            : [...prev.days, day].sort((a, b) => a - b);
          return days.length ? { rowId, days } : null;
        });
        anchor.current = { rowId, day };
        dragging.current = false;
        return;
      }
      anchor.current = { rowId, day };
      dragging.current = true;
      setSel({ rowId, days: [day] });
    },
    [],
  );

  const onMouseEnter = useCallback((rowId: string, day: number) => {
    if (!dragging.current || !anchor.current) return;
    if (anchor.current.rowId !== rowId) return;
    setSel({ rowId, days: range(anchor.current.day, day) });
  }, []);

  const onMouseUp = useCallback(() => {
    dragging.current = false;
  }, []);

  /** ПКМ по ячейке: если она не в выделении — выделяем только её */
  const ensureSelected = useCallback(
    (rowId: string, day: number) => {
      if (sel && sel.rowId === rowId && sel.days.includes(day)) return sel.days;
      anchor.current = { rowId, day };
      setSel({ rowId, days: [day] });
      return [day];
    },
    [sel],
  );

  /** Дни, к которым применить действие для ячейки (day) */
  const targetDays = useCallback(
    (rowId: string, day: number) =>
      sel && sel.rowId === rowId && sel.days.includes(day) ? sel.days : [day],
    [sel],
  );

  const isSelected = (rowId: string, day: number) =>
    !!sel && sel.rowId === rowId && sel.days.includes(day);

  const clear = () => setSel(null);

  return {
    sel,
    onMouseDown,
    onMouseEnter,
    onMouseUp,
    ensureSelected,
    targetDays,
    isSelected,
    clear,
  };
}
