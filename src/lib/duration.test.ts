import { describe, expect, it } from 'vitest';
import { durationToMs, emptyDuration, formatDuration, msToDuration } from './duration';

describe('duration helpers', () => {
  it('supports overflow values without losing precision', () => {
    expect(durationToMs({ ...emptyDuration(), days: 546 })).toBe(546 * 86400000);
  });

  it('normalizes a duration for display', () => {
    expect(msToDuration(90061001)).toMatchObject({ days: 1, hours: 1, minutes: 1, seconds: 1, milliseconds: 1 });
    expect(formatDuration(90061001)).toBe('1 day, 1 hour');
  });
});
