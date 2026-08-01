import React from 'react';

interface DurationSelectorProps {
  options: number[];
  current: number;
  onChange: (value: number) => void;
  formatLabel: (value: number) => string;
}

export const DurationSelector: React.FC<DurationSelectorProps> = ({
  options,
  current,
  onChange,
  formatLabel,
}) => (
  <div className="flex w-full gap-1 rounded-xl bg-text/5 p-1">
    {options.map((value) => (
      <button
        key={value}
        onClick={() => onChange(value)}
        className={`flex-1 rounded-lg py-1.5 text-[10px] font-bold transition-all ${
          current === value
            ? 'bg-text text-bg shadow-lg'
            : 'text-text/40 hover:bg-text/5 hover:text-text/60'
        }`}
      >
        {formatLabel(value)}
      </button>
    ))}
  </div>
);
