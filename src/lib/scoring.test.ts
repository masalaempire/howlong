import { describe, expect, it } from 'vitest';
import { patternForPoints, scoreGuess } from './scoring';

const question = { answerMs: 1000, acceptedMinMs: 1000, acceptedMaxMs: 1000 };

describe('ratio scoring', () => {
  it('gives an exact guess the maximum score', () => {
    expect(scoreGuess(1000, question).points).toBe(1000);
    expect(scoreGuess(1000, question).direction).toBe('exactly right');
  });

  it('treats an accepted range as correct', () => {
    expect(scoreGuess(1100, { answerMs: 1000, acceptedMinMs: 900, acceptedMaxMs: 1200 }).points).toBe(1000);
  });

  it('rewards proportional closeness rather than raw seconds', () => {
    expect(scoreGuess(2000, question).points).toBeGreaterThan(scoreGuess(10000, question).points);
    expect(patternForPoints(scoreGuess(1000, question).points)).toBe('🟧');
  });
});
