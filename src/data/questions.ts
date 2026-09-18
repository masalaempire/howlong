import rawQuestions from './questions.json';
import type { Question, PublicQuestion } from '../types';

type RawQuestion = (typeof rawQuestions)[number];

const DEFAULT_SOURCE_DATE = '2026-09-18';
const secondsToMs = (seconds: number) => Math.round(seconds * 1000);

function sourceLabel(url: string): string {
  try {
    const page = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '').replaceAll('_', ' ');
    return page ? `Wikipedia — ${page}` : 'Wikipedia reference';
  } catch {
    return 'Reference source';
  }
}

export const QUESTIONS: Question[] = (rawQuestions as RawQuestion[]).map((item) => {
  const answerMs = secondsToMs(item.answerSeconds);
  return {
    id: item.id,
    category: item.category,
    prompt: item.prompt,
    hint: item.hint,
    answerMs,
    acceptedMinMs: secondsToMs(item.acceptedMinSeconds ?? item.answerSeconds),
    acceptedMaxMs: secondsToMs(item.acceptedMaxSeconds ?? item.answerSeconds),
    displayAnswer: item.displayAnswer,
    fact: item.fact,
    sourceLabel: sourceLabel(item.sourceUrl),
    sourceUrl: item.sourceUrl,
    sourceAccessedAt: DEFAULT_SOURCE_DATE,
    difficulty: item.difficulty as 1 | 2 | 3,
  };
});

export const toPublicQuestion = (question: Question): PublicQuestion => {
  const { answerMs: _answer, acceptedMinMs: _min, acceptedMaxMs: _max, ...publicQuestion } = question;
  return publicQuestion;
};

export const publicQuestions = QUESTIONS.map(toPublicQuestion);

export const categories = [...new Set(QUESTIONS.map((question) => question.category))].sort();

export function getQuestion(id: string): Question | undefined {
  return QUESTIONS.find((question) => question.id === id);
}
