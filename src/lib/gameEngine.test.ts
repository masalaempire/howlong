import { describe, expect, it } from 'vitest';
import { answerLocal, makeLocalSession } from './gameEngine';

describe('local game engine', () => {
  it('creates the same Daily set for every player on a date', () => {
    const first = makeLocalSession('daily', undefined, '2026-09-18');
    const second = makeLocalSession('daily', undefined, '2026-09-18');
    expect(first.questions.map((question) => question.id)).toEqual(second.questions.map((question) => question.id));
    expect(first.questions).toHaveLength(5);
  });

  it('reveals a local answer and advances the run', () => {
    const session = makeLocalSession('practice', undefined, '2026-09-18');
    const answer = answerLocal(session, 1000);
    expect(answer.points).toBeGreaterThanOrEqual(0);
    expect(session.currentIndex).toBe(1);
    expect(answer.resultPattern).toHaveLength(1);
  });
});
