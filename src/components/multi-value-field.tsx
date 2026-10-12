import { Minus, Plus } from "lucide-react";

/** One input per value with a + button; stored as "a, b". */
export function MultiValueField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  const items = (value ?? "").split(/\s*[,;]\s*/);
  const update = (next: string[]) => onChange(next.join(", "));
  return (
    <div className="ro-field email-list-field">
      <span>{label}</span>
      {items.map((item, index) => (
        <div key={index} className="email-list-row">
          <input
            type={type}
            value={item}
            onChange={(event) => update(items.map((v, i) => (i === index ? event.target.value : v)))}
          />
          {index === items.length - 1 ? (
            <button type="button" className="mv-btn mv-add" aria-label={`Add another ${label}`} title={`Add another ${label}`} onClick={() => update([...items, ""])}>
              <Plus size={16} strokeWidth={2.6} />
            </button>
          ) : (
            <button type="button" className="mv-btn mv-remove" aria-label="Remove" title="Remove" onClick={() => update(items.filter((_, i) => i !== index))}>
              <Minus size={15} strokeWidth={2.6} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
