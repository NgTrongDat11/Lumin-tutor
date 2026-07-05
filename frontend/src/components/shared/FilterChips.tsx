interface FilterChipOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface FilterChipsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: FilterChipOption<T>[];
  className?: string;
}

export function FilterChips<T extends string>({
  value,
  onChange,
  options,
  className = '',
}: FilterChipsProps<T>) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 overflow-x-auto ${className}`}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3  py-1 text-xs font-semibold transition-all duration-150 cursor-pointer ${
              active
                ? 'bg-primary-700 text-white shadow-sm hover:bg-primary-800'
                : 'bg-surface-secondary text-text-secondary border border-border-light hover:bg-surface-tertiary hover:text-text-primary'
            }`}
          >
            <span>{option.label}</span>
            {typeof option.count === 'number' && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  active ? 'bg-primary-800 text-white' : 'bg-surface-tertiary text-text-tertiary border border-border-light'
                }`}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default FilterChips;
