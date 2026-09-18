import type { Profile, Stats } from '../types';

const PROFILE_KEY = 'howlong:v2:profile';
const STATS_KEY = 'howlong:v2:stats';
const SESSION_KEY = 'howlong:v2:session';

export type SavedSession = {
  mode: 'daily' | 'practice';
  attemptId: string;
  date?: string;
  questionIds: string[];
  currentIndex: number;
  totalScore: number;
  resultPattern: string[];
};

const defaultStats = (): Stats => ({
  dailyPlayed: 0,
  dailyAverage: 0,
  dailyBest: 0,
  currentStreak: 0,
  longestStreak: 0,
  practicePlayed: 0,
  perfectDays: 0,
  dailyHistory: {},
});

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing and storage quotas should not prevent a local game.
  }
}

export function makeHandle(): string {
  const animals = ['Otter', 'Comet', 'Clover', 'Moth', 'Puffin', 'Badger', 'Heron', 'Fox'];
  const adjectives = ['Curious', 'Patient', 'Bright', 'Lucky', 'Quiet', 'Cosmic', 'Early', 'Wandering'];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return `${adjective} ${animal}`;
}

export function loadProfile(): Profile {
  return safeRead<Profile>(PROFILE_KEY, { displayName: makeHandle(), discriminator: randomDiscriminator() });
}

function randomDiscriminator(): string {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

export function saveProfile(profile: Profile) {
  safeWrite(PROFILE_KEY, profile);
}

export function loadStats(): Stats {
  return safeRead<Stats>(STATS_KEY, defaultStats());
}

export function saveStats(stats: Stats) {
  safeWrite(STATS_KEY, stats);
}

export function loadSession(): SavedSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) as SavedSession : null;
  } catch {
    return null;
  }
}

export function saveSession(session: SavedSession) {
  safeWrite(SESSION_KEY, session);
}

export function clearSession() {
  try { window.localStorage.removeItem(SESSION_KEY); } catch { /* ignored */ }
}

export function recordCompletedDaily(date: string, score: number, pattern: string[]): Stats {
  const stats = loadStats();
  if (!stats.dailyHistory[date]) {
    stats.dailyHistory[date] = { score, pattern };
    stats.dailyPlayed += 1;
    const scores = Object.values(stats.dailyHistory).map((item) => item.score);
    stats.dailyAverage = Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
    stats.dailyBest = Math.max(stats.dailyBest, score);
    if (score >= 5000) stats.perfectDays += 1;
  }
  const previous = stats.lastDailyDate ? new Date(`${stats.lastDailyDate}T00:00:00Z`) : undefined;
  const current = new Date(`${date}T00:00:00Z`);
  const dayGap = previous ? Math.round((current.getTime() - previous.getTime()) / 86400000) : Infinity;
  stats.currentStreak = dayGap === 1 || !previous ? stats.currentStreak + 1 : dayGap === 0 ? stats.currentStreak : 1;
  stats.longestStreak = Math.max(stats.longestStreak, stats.currentStreak);
  stats.lastDailyDate = date;
  saveStats(stats);
  return stats;
}

export function recordPractice() {
  const stats = loadStats();
  stats.practicePlayed += 1;
  saveStats(stats);
  return stats;
}
