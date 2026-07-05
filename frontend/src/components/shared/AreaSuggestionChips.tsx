import { useEffect, useMemo, useState } from 'react';
import {
  type AdministrativeUnits,
  getAreaSuggestions,
  loadAdministrativeUnits,
  normalizeLocationText,
} from '../../utils/vietnamAdministrativeUnits';

function splitAreas(value: string) {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function hasArea(value: string, suggestion: string) {
  const normalizedSuggestion = normalizeLocationText(suggestion);
  const normalizedValue = normalizeLocationText(value);
  if (!normalizedSuggestion || !normalizedValue) return false;
  return normalizedValue.includes(normalizedSuggestion)
    || splitAreas(value).some((part) => normalizeLocationText(part) === normalizedSuggestion);
}

function appendArea(value: string, suggestion: string) {
  if (hasArea(value, suggestion)) return value;
  const parts = splitAreas(value);
  return [...parts, suggestion].join(', ');
}

interface AreaSuggestionChipsProps {
  value: string;
  onChange: (nextValue: string) => void;
  label?: string;
  disabled?: boolean;
  referenceAddress?: string | null;
  maxSuggestions?: number;
  selectionMode?: 'replace' | 'append';
}

export default function AreaSuggestionChips({
  value,
  onChange,
  label = 'Khu vực nhanh',
  disabled = false,
  referenceAddress,
  maxSuggestions = 8,
  selectionMode = 'append',
}: AreaSuggestionChipsProps) {
  const [data, setData] = useState<AdministrativeUnits | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadAdministrativeUnits()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const suggestions = useMemo(
    () => (data ? getAreaSuggestions(data, referenceAddress, value, maxSuggestions) : []),
    [data, maxSuggestions, referenceAddress, value],
  );

  const helperText = loadError
    ? 'Không tải được danh mục khu vực nhanh.'
    : data && suggestions.length === 0
      ? 'Nhập khu vực hoặc cập nhật địa chỉ hồ sơ để có gợi ý nhanh.'
      : null;

  if (helperText && suggestions.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-text-tertiary">{label}</p>
        <p className="text-xs text-text-tertiary">{helperText}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-text-tertiary">{label}</p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((area) => {
          const active = hasArea(value, area);
          return (
            <button
              key={area}
              type="button"
              disabled={disabled}
              onClick={() => onChange(selectionMode === 'append' ? appendArea(value, area) : area)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? 'border-primary-300 bg-primary-600 text-white'
                  : 'border-border-light bg-white text-text-secondary hover:border-primary-200 hover:bg-primary-50 hover:text-primary-750'
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {area}
            </button>
          );
        })}
      </div>
    </div>
  );
}
