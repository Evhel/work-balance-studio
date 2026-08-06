import { ChevronLeft, ChevronRight } from "lucide-react";
import { MONTHS, availableMonths, monthKey, shiftMonth } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function MonthPicker({
  year,
  month,
  onChange,
}: {
  year: number;
  month: number;
  onChange: (y: number, m: number) => void;
}) {
  const list = availableMonths();
  const years = Array.from(new Set(list.map((x) => x.year)));
  const monthsForYear = list.filter((x) => x.year === year).map((x) => x.month);

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        aria-label="Предыдущий месяц"
        onClick={() => {
          const n = shiftMonth(year, month, -1);
          onChange(n.year, n.month);
        }}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <Select
        value={String(month)}
        onValueChange={(v) => onChange(year, Number(v))}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {monthsForYear.map((m) => (
            <SelectItem key={m} value={String(m)}>
              {MONTHS[m]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={String(year)}
        onValueChange={(v) => {
          const y = Number(v);
          const ok = list.some((x) => x.year === y && x.month === month);
          onChange(y, ok ? month : list.filter((x) => x.year === y)[0]!.month);
        }}
      >
        <SelectTrigger className="w-[100px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="icon"
        aria-label="Следующий месяц"
        disabled={
          monthKey(year, month) ===
          monthKey(list[list.length - 1]!.year, list[list.length - 1]!.month)
        }
        onClick={() => {
          const n = shiftMonth(year, month, 1);
          onChange(n.year, n.month);
        }}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

export function Legend({ items }: { items: { code: string; label: string }[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-card px-3 py-2 text-xs">
      <span className="font-medium">Обозначения:</span>
      {items.map((i) => (
        <span key={i.code} className="text-muted-foreground">
          <b className="text-foreground">{i.code}</b> — {i.label}
        </span>
      ))}
    </div>
  );
}
