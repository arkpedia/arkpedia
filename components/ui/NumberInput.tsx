import { useEffect, useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue'> & { value: number | '' };

/** Keep the text being edited separate from the calculator's last accepted number.
 * Clearing a field must not turn it into 0 (or its minimum) before the next digit. */
export default function NumberInput({ value, onChange, onFocus, onBlur, ...props }: Props) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setDraft(String(value)); }, [value, editing]);
  return <input {...props} type="number" value={editing ? draft : value}
    onFocus={event => { setEditing(true); setDraft(String(value)); onFocus?.(event); }}
    onChange={event => {
      setDraft(event.target.value);
      if (event.target.value !== '' && Number.isFinite(event.target.valueAsNumber)) onChange?.(event);
    }}
    onBlur={event => { setEditing(false); setDraft(String(value)); onBlur?.(event); }} />;
}
