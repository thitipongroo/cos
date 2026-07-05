import { Minus, Plus } from "lucide-react";
import { useState } from "react";

interface NumberPickerProps {
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  onChange?: (value: number) => void;
  unit?: string;
}

export function NumberPicker({
  label,
  min = 0,
  max = 100,
  step = 1,
  value: controlledValue,
  onChange,
  unit = "",
}: NumberPickerProps) {
  const [internalValue, setInternalValue] = useState(controlledValue ?? min);
  const value = controlledValue ?? internalValue;

  const handleChange = (newValue: number) => {
    const clamped = Math.max(min, Math.min(max, newValue));
    if (controlledValue === undefined) {
      setInternalValue(clamped);
    }
    onChange?.(clamped);
  };

  const decrement = () => handleChange(value - step);
  const increment = () => handleChange(value + step);

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-[var(--text-base)] font-medium text-[var(--mobile-text-primary)]">
          {label}
        </label>
      )}

      <div className="flex items-center gap-4 bg-white rounded-xl border border-gray-200 p-2">
        <button
          type="button"
          onClick={decrement}
          disabled={value <= min}
          className="w-12 h-12 rounded-lg bg-[var(--mobile-surface)] flex items-center justify-center active:bg-gray-200 disabled:opacity-30 disabled:active:bg-[var(--mobile-surface)] transition-colors"
          aria-label="Decrease"
        >
          <Minus className="w-5 h-5 text-[var(--mobile-text-primary)]" />
        </button>

        <div className="flex-1 text-center">
          <input
            type="number"
            value={value}
            onChange={(e) => handleChange(parseFloat(e.target.value) || min)}
            min={min}
            max={max}
            step={step}
            className="w-full text-center text-2xl font-semibold text-[var(--mobile-text-primary)] bg-transparent border-none focus:outline-none"
          />
          {unit && <div className="text-sm text-[var(--mobile-text-secondary)] mt-1">{unit}</div>}
        </div>

        <button
          type="button"
          onClick={increment}
          disabled={value >= max}
          className="w-12 h-12 rounded-lg bg-[var(--mobile-primary)] flex items-center justify-center active:bg-blue-700 disabled:opacity-30 disabled:active:bg-[var(--mobile-primary)] transition-colors"
          aria-label="Increase"
        >
          <Plus className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
}
