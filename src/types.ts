export type Mode = 'daily' | 'practice';
export type GameStatus = 'idle' | 'loading' | 'playing' | 'revealed' | 'complete' | 'error';

export type DurationParts = {
  years: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
};

export type Question = {
  id: string;
  category: string;
  prompt: string;
  hint: string;
  answerMs: number;
  acceptedMinMs: number;
  acceptedMaxMs: number;
  displayAnswer: string;
  fact: string;
  sourceLabel: string;
  sourceUrl: string;
  sourceAccessedAt: string;
  difficulty: 1 | 2 | 3;
};

export type PublicQuestion = Omit<Question, 'answerMs' | 'acceptedMinMs' | 'acceptedMaxMs'>;

export type AnswerResult = {
  questionId: string;
  guessMs: number;
  actualMs: number;
  actualDisplay: string;
  points: number;
  ratio: number;
  errorLog: number;
  direction: 'too short' | 'too long' | 'exactly right';
  tier: string;
  fact: string;
  sourceLabel: string;
  sourceUrl: string;
  nextQuestion?: PublicQuestion;
  complete: boolean;
  totalScore: number;
  resultPattern: string[];
};

export type GameSession = {
  mode: Mode;
  attemptId: string;
  date?: string;
  questions: PublicQuestion[];
  currentIndex: number;
  totalScore: number;
  resultPattern: string[];
  complete?: boolean;
};

export type Profile = {
  id?: string;
  displayName: string;
  discriminator: string;
  emailLinked?: boolean;
};

export type Stats = {
  dailyPlayed: number;
  dailyAverage: number;
  dailyBest: number;
  currentStreak: number;
  longestStreak: number;
  practicePlayed: number;
  lastDailyDate?: string;
  perfectDays: number;
  dailyHistory: Record<string, { score: number; pattern: string[] }>;
};

export type LeaderboardEntry = {
  rank: number;
  displayName: string;
  discriminator: string;
  score: number;
  completedAt: string;
  resultPattern: string[];
};
