import { QUESTIONS, getQuestion, toPublicQuestion } from '../data/questions';
import { scoreGuess, patternForPoints } from './scoring';
import type { AnswerResult, GameSession, Mode, PublicQuestion, Question } from '../types';

function dailySeed(date = utcDate()) {
  return date.split('-').reduce((hash, part) => ((hash * 31) + Number(part)) >>> 0, 17);
}

function seededRandom(seed: number) {
  let value = seed || 1;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function selectQuestions(count: number, seed: number, excluded: Set<string> = new Set(), category?: string): Question[] {
  const random = seededRandom(seed);
  const pool = QUESTIONS.filter((question) => !excluded.has(question.id) && (!category || question.category === category));
  const shuffled = [...pool].sort(() => random() - 0.5);
  const chosen: Question[] = [];
  const categories = new Set<string>();
  for (const question of shuffled) {
    if (chosen.length < count && (!categories.has(question.category) || chosen.length >= Math.max(3, count - 2))) {
      chosen.push(question);
      categories.add(question.category);
    }
  }
  for (const question of shuffled) if (chosen.length < count && !chosen.includes(question)) chosen.push(question);
  return chosen.slice(0, count);
}

export function utcDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function makeLocalSession(mode: Mode, category?: string, date = utcDate()): GameSession {
  const selected = mode === 'daily'
    ? selectQuestions(5, dailySeed(date))
    : selectQuestions(10, Date.now() ^ Math.floor(Math.random() * 0xffffffff), new Set(), category);
  return {
    mode,
    attemptId: `local-${mode}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: mode === 'daily' ? date : undefined,
    questions: selected.map(toPublicQuestion),
    currentIndex: 0,
    totalScore: 0,
    resultPattern: [],
  };
}

export function answerLocal(session: GameSession, guessMs: number): AnswerResult {
  const publicQuestion = session.questions[session.currentIndex];
  if (!publicQuestion) throw new Error('This game is already complete.');
  const question = getQuestion(publicQuestion.id);
  if (!question) throw new Error('Question data is unavailable.');
  const score = scoreGuess(guessMs, question);
  const resultPattern = [...session.resultPattern, patternForPoints(score.points)];
  session.totalScore += score.points;
  session.resultPattern = resultPattern;
  session.currentIndex += 1;
  const complete = session.currentIndex >= session.questions.length;
  return {
    questionId: question.id,
    guessMs,
    actualMs: question.answerMs,
    actualDisplay: question.displayAnswer,
    points: score.points,
    ratio: score.ratio,
    errorLog: score.errorLog,
    direction: score.direction,
    tier: score.tier,
    fact: question.fact,
    sourceLabel: question.sourceLabel,
    sourceUrl: question.sourceUrl,
    nextQuestion: complete ? undefined : session.questions[session.currentIndex],
    complete,
    totalScore: session.totalScore,
    resultPattern,
  };
}

export function questionForSession(session: GameSession): PublicQuestion | undefined {
  return session.questions[session.currentIndex];
}
