import { ArrowDownToLine, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ColumnSelectButton({ label, selected, onSelect }: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return <Button type="button" variant="ghost" size="icon" className="column-select-button" aria-label={`Select whole ${label} column`} title={selected ? `Unselect ${label} column` : `Select whole ${label} column`} aria-pressed={selected} onClick={(event) => { event.stopPropagation(); onSelect(); }}>{selected ? <Check size={14} /> : <ArrowDownToLine size={14} />}</Button>;
}