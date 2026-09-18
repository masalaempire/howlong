import type { Question } from '../types';

export type ScoreResult = {
  points: number;
  ratio: number;
  errorLog: number;
  direction: 'too short' | 'too long' | 'exactly right';
  tier: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function scoreGuess(guessMs: number, question: Pick<Question, 'answerMs' | 'acceptedMinMs' | 'acceptedMaxMs'>): ScoreResult {
  if (!Number.isFinite(guessMs) || guessMs <= 0 || !Number.isSafeInteger(Math.round(guessMs))) {
    throw new Error('Enter a duration greater than zero.');
  }
  const min = Math.max(1, question.acceptedMinMs);
  const max = Math.max(min, question.acceptedMaxMs);
  const target = clamp(guessMs, min, max);
  const withinRange = guessMs >= min && guessMs <= max;
  const ratio = withinRange ? 1 : Math.max(guessMs, target) / Math.min(guessMs, target);
  const errorLog = Math.abs(Math.log(ratio));
  const points = Math.max(0, Math.min(1000, Math.round(1000 * Math.exp(-0.7 * errorLog))));
  const direction = guessMs < min ? 'too short' : guessMs > max ? 'too long' : 'exactly right';
  const tier = points >= 975 ? 'Time wizard.' : points >= 850 ? 'Remarkably close.' : points >= 650 ? 'Excellent instinct.' : points >= 400 ? 'Good scale, keep tuning.' : points >= 200 ? 'A brave estimate.' : 'A wonderfully wild guess.';
  return { points, ratio: withinRange ? 1 : Math.max(guessMs, target) / Math.min(guessMs, target), errorLog, direction, tier };
}

export function ratioLabel(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 1.005) return 'exactly right';
  return `${ratio.toFixed(ratio < 10 ? 1 : 0)}×`;
}

export function patternForPoints(points: number): string {
  if (points >= 900) return '🟧';
  if (points >= 650) return '🟨';
  if (points >= 350) return '⬜';
  return '⬛';
}
