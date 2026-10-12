import { useMemo, useState } from "react";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Visual month calendar for spot entry. Users click days, shift-click for a
 * range, or use the quick pickers, then apply a spot count to everything
 * selected — no typing 31 separate fields.
 */
export function SpotCalendar({
  year,
  month,
  daily,
  onChange,
}: {
  year: number;
  month: number;
  daily: Record<number, number>;
  onChange: (daily: Record<number, number>) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [spots, setSpots] = useState(1);

  const days = useMemo(
    () => Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => i + 1),
    [year, month],
  );
  // Monday-first offset for the first cell.
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const weekdayOf = (day: number) => (new Date(year, month, day).getDay() + 6) % 7;

  const toggle = (day: number, shift: boolean) => {
    if (shift && anchor !== null) {
      const [from, to] = anchor < day ? [anchor, day] : [day, anchor];
      const range = days.filter((d) => d >= from && d <= to);
      setSelected((prev) => Array.from(new Set([...prev, ...range])));
      return;
    }
    setAnchor(day);
    setSelected((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const pick = (predicate: (day: number) => boolean) =>
    setSelected(days.filter((day) => predicate(day)));

  const apply = (value: number) => {
    const next = { ...daily };
    selected.forEach((day) => {
      if (value > 0) next[day] = value;
      else delete next[day];
    });
    onChange(next);
  };

  const total = days.reduce((sum, day) => sum + (daily[day] ?? 0), 0);

  return (
    <div className="spot-calendar">
      <div className="spot-cal-tools">
        <button type="button" onClick={() => pick(() => true)}>
          Whole month
        </button>
        <button type="button" onClick={() => pick((day) => weekdayOf(day) < 5)}>
          Weekdays
        </button>
        <button type="button" onClick={() => pick((day) => weekdayOf(day) >= 5)}>
          Weekends
        </button>
        {WEEKDAYS.map((label, index) => (
          <button key={label} type="button" onClick={() => pick((day) => weekdayOf(day) === index)}>
            {label}
          </button>
        ))}
        <button type="button" onClick={() => setSelected([])}>
          Clear selection
        </button>
      </div>

      <div className="spot-cal-grid">
        {WEEKDAYS.map((label) => (
          <span key={label} className="spot-cal-head">
            {label}
          </span>
        ))}
        {Array.from({ length: offset }, (_, index) => (
          <span key={`pad-${index}`} />
        ))}
        {days.map((day) => {
          const isSelected = selected.includes(day);
          const value = daily[day] ?? 0;
          return (
            <button
              type="button"
              key={day}
              className={`spot-cal-day ${isSelected ? "selected" : ""} ${value ? "filled" : ""}`}
              onClick={(event) => toggle(day, event.shiftKey)}
            >
              <small>{new Date(year, month, day).toLocaleString("en-GB", { weekday: "short" })}</small>
              <strong>{day}</strong>
              <em>{value ? `${value} spots` : "—"}</em>
            </button>
          );
        })}
      </div>

      <div className="spot-cal-apply">
        <label>
          <span>Spots per selected date</span>
          <input
            type="number"
            min={0}
            value={spots}
            onChange={(event) => setSpots(Number(event.target.value))}
          />
        </label>
        <button
          type="button"
          className="app-button primary"
          onClick={() => apply(spots)}
          disabled={!selected.length}
        >
          Apply to {selected.length || 0} dates
        </button>
        <button type="button" className="app-button secondary" onClick={() => apply(0)}>
          Remove spots
        </button>
        <button type="button" className="app-button secondary" onClick={() => onChange({})}>
          Clear month
        </button>
        <span className="spot-cal-total">Total spots: {total}</span>
      </div>
      <p className="spot-cal-hint">
        Tip: click a date to select it, shift-click another to take the whole range.
      </p>
    </div>
  );
}
