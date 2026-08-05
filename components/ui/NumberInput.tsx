"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  label?: string;
  value: number;
  min?: number;
  max?: number;
  step?: string | number;
  className?: string;
  onChange: (value: number) => void;
  /** Value applied on blur when the field is left empty */
  emptyValue?: number;
};

/**
 * Number input that allows clearing while typing.
 * Plain `value={n}` + `Number("") === 0` forces an unremovable zero.
 */
export default function NumberInput({
  label,
  value,
  min = 0,
  max,
  step = "1",
  className = "w-full rounded-xl bg-studio-surface px-4 py-3 text-sm ring-1 ring-studio-border focus:outline-none focus:ring-studio-accent",
  onChange,
  emptyValue = 0,
}: Props) {
  const [text, setText] = useState(() => String(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setText(String(value));
    }
  }, [value]);

  const clamp = (n: number) => {
    let next = n;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    return next;
  };

  const commitEmptyOrParse = (raw: string) => {
    if (raw.trim() === "") {
      const next = clamp(emptyValue);
      setText(String(next));
      onChange(next);
      return;
    }
    const parsed = Number(raw);
    const next = clamp(Number.isFinite(parsed) ? parsed : emptyValue);
    setText(String(next));
    onChange(next);
  };

  const input = (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={text}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
        commitEmptyOrParse(text);
      }}
      onChange={(event) => {
        const raw = event.target.value;
        setText(raw);
        if (raw.trim() === "") return;
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) return;
        onChange(clamp(parsed));
      }}
      className={className}
    />
  );

  if (!label) return input;

  return (
    <label>
      <span className="mb-1.5 block text-xs font-medium text-studio-muted">
        {label}
      </span>
      {input}
    </label>
  );
}
