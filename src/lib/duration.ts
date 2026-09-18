import type { DurationParts } from '../types';

export const DURATION_UNITS: Array<{ key: keyof DurationParts; label: string; short: string; factor: number }> = [
  { key: 'years', label: 'years', short: 'yr', factor: 365.25 * 24 * 60 * 60 * 1000 },
  { key: 'days', label: 'days', short: 'day', factor: 24 * 60 * 60 * 1000 },
  { key: 'hours', label: 'hours', short: 'hr', factor: 60 * 60 * 1000 },
  { key: 'minutes', label: 'minutes', short: 'min', factor: 60 * 1000 },
  { key: 'seconds', label: 'seconds', short: 'sec', factor: 1000 },
  { key: 'milliseconds', label: 'milliseconds', short: 'ms', factor: 1 },
];

// Keep client and server submissions inside a predictable, safe integer range.
// This is just under 9,999 calendar years expressed with the game's 365.25-day year.
export const MAX_DURATION_MS = Math.round(9999 * 365.25 * 24 * 60 * 60 * 1000);

export const emptyDuration = (): DurationParts => ({
  years: 0,
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
  milliseconds: 0,
});

export function durationToMs(parts: DurationParts): number {
  return DURATION_UNITS.reduce((total, unit) => total + Math.max(0, Number(parts[unit.key]) || 0) * unit.factor, 0);
}

export function msToDuration(ms: number): DurationParts {
  let remaining = Math.max(0, Math.round(ms));
  const result = emptyDuration();
  for (const unit of DURATION_UNITS) {
    result[unit.key] = Math.floor(remaining / unit.factor);
    remaining %= unit.factor;
  }
  return result;
}

export function normalizeDuration(parts: DurationParts): DurationParts {
  return msToDuration(durationToMs(parts));
}

export function formatDuration(ms: number, maxParts = 2): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0 seconds';
  if (ms < 1000) return `${Math.round(ms)} milliseconds`;
  const normalized = msToDuration(ms);
  const parts: string[] = [];
  for (const unit of DURATION_UNITS) {
    const value = normalized[unit.key];
    if (value > 0 && parts.length < maxParts) parts.push(`${value} ${unit.label.slice(0, -1)}${value === 1 ? '' : 's'}`);
  }
  return parts.join(', ') || '0 seconds';
}

export function formatCompactDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const normalized = msToDuration(ms);
  const parts: string[] = [];
  for (const unit of DURATION_UNITS) {
    const value = normalized[unit.key];
    if (value > 0 && parts.length < 3) parts.push(`${value}${unit.short}`);
  }
  return parts.join(' ') || '0s';
}

export function isValidDuration(parts: DurationParts): boolean {
  const total = durationToMs(parts);
  return Number.isFinite(total) && total > 0 && total <= MAX_DURATION_MS && Number.isSafeInteger(Math.round(total));
}
