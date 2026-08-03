import { useCallback, useRef, useState } from "react";

/** Выделение диапазона ячеек в одной строке зажатой левой кнопкой мыши. */
export function useRowSelection() {
  const [sel, setSel] = useState<{ rowId: string; days: number[] } | null>(null);
  const anchor = useRef<{ rowId: string; day: number } | null>(null);
  const dragging = useRef(false);

  const range = (a: number, b: number) => {
    const [s, e] = a <= b ? [a, b] : [b, a];
    return Array.from({ length: e - s + 1 }, (_, i) => s + i);
  };

  const onMouseDown = useCallback((rowId: string, day: number) => {
    anchor.current = { rowId, day };
    dragging.current = true;
    setSel({ rowId, days: [day] });
  }, []);

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
      setSel({ rowId, days: [day] });
      return [day];
    },
    [sel],
  );

  const isSelected = (rowId: string, day: number) =>
    !!sel && sel.rowId === rowId && sel.days.includes(day);

  const clear = () => setSel(null);

  return { sel, onMouseDown, onMouseEnter, onMouseUp, ensureSelected, isSelected, clear };
}
