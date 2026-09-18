import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

type Question = {
  id: string;
  category: string;
  prompt: string;
  hint: string;
  answer_ms: number;
  accepted_min_ms: number;
  accepted_max_ms: number;
  display_answer: string;
  fact: string;
  source_label: string;
  source_url: string;
  source_accessed_at: string;
  difficulty: number;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const fail = (message: string, status = 400) => json({ error: message }, status);
const publicQuestion = (question: Question) => {
  const { answer_ms: _answer, accepted_min_ms: _min, accepted_max_ms: _max, ...safe } = question;
  return safe;
};
const todayUtc = () => new Date().toISOString().slice(0, 10);
const safeNumber = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 315576000000000;

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}

function scoreGuess(guessMs: number, question: Question) {
  const min = Math.max(1, Number(question.accepted_min_ms));
  const max = Math.max(min, Number(question.accepted_max_ms));
  const withinRange = guessMs >= min && guessMs <= max;
  const target = Math.min(max, Math.max(min, guessMs));
  const ratio = withinRange ? 1 : Math.max(guessMs, target) / Math.min(guessMs, target);
  const errorLog = Math.abs(Math.log(ratio));
  const points = Math.max(0, Math.min(1000, Math.round(1000 * Math.exp(-0.7 * errorLog))));
  const direction = guessMs < min ? 'too short' : guessMs > max ? 'too long' : 'exactly right';
  const tier = points >= 975 ? 'Time wizard.' : points >= 850 ? 'Remarkably close.' : points >= 650 ? 'Excellent instinct.' : points >= 400 ? 'Good scale, keep tuning.' : points >= 200 ? 'A brave estimate.' : 'A wonderfully wild guess.';
  const pattern = points >= 900 ? '🟧' : points >= 650 ? '🟨' : points >= 350 ? '⬜' : '⬛';
  return { points, ratio, errorLog, direction, tier, pattern };
}

async function currentUser(request: Request) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error ? null : data.user;
}

async function ensureProfile(user: { id: string; user_metadata?: Record<string, unknown> }) {
  const existing = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (existing.data) return existing.data;
  const displayName = String(user.user_metadata?.display_name || 'Curious Player').trim().slice(0, 20) || 'Curious Player';
  const discriminator = Math.random().toString(36).slice(2, 6).toUpperCase();
  const inserted = await supabase.from('profiles').insert({ id: user.id, display_name: displayName, discriminator }).select('*').single();
  if (inserted.error) throw inserted.error;
  return inserted.data;
}

async function activeQuestions() {
  const response = await supabase.from('questions').select('*').eq('status', 'active');
  if (response.error) throw response.error;
  if (!response.data?.length) throw new Error('No active questions are seeded yet.');
  return response.data as Question[];
}

async function dailyQuestionIds(date: string): Promise<string[]> {
  const existing = await supabase.from('daily_sets').select('question_ids').eq('daily_date', date).maybeSingle();
  if (existing.data?.question_ids) return existing.data.question_ids;
  const recent = await supabase.from('daily_sets').select('question_ids').lt('daily_date', date).order('daily_date', { ascending: false }).limit(30);
  const excluded = new Set((recent.data ?? []).flatMap((row) => row.question_ids ?? []));
  const questions = (await activeQuestions()).sort((a, b) => hash(`${date}:${a.id}`) - hash(`${date}:${b.id}`));
  const picked: Question[] = [];
  const categories = new Set<string>();
  for (const question of questions) {
    if (picked.length >= 5) break;
    if (!excluded.has(question.id) && !categories.has(question.category)) { picked.push(question); categories.add(question.category); }
  }
  for (const question of questions) {
    if (picked.length >= 5) break;
    if (!picked.some((item) => item.id === question.id)) picked.push(question);
  }
  const ids = picked.slice(0, 5).map((question) => question.id);
  const inserted = await supabase.from('daily_sets').insert({ daily_date: date, question_ids: ids }).select('question_ids').maybeSingle();
  if (inserted.data?.question_ids) return inserted.data.question_ids;
  const raced = await supabase.from('daily_sets').select('question_ids').eq('daily_date', date).single();
  if (raced.error) throw raced.error;
  return raced.data.question_ids;
}

async function getQuestions(ids: string[]) {
  const response = await supabase.from('questions').select('*').in('id', ids);
  if (response.error) throw response.error;
  const byId = new Map((response.data as Question[]).map((question) => [question.id, question]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as Question[];
}

async function startAttempt(userId: string, mode: 'daily' | 'practice', category?: string) {
  const date = mode === 'daily' ? todayUtc() : undefined;
  if (date) {
    const existing = await supabase.from('attempts').select('*').eq('user_id', userId).eq('mode', mode).eq('daily_date', date).maybeSingle();
    if (existing.data) return existing.data;
  }
  let ids: string[];
  if (mode === 'daily') ids = await dailyQuestionIds(date!);
  else {
    const all = await activeQuestions();
    const pool = category ? all.filter((question) => question.category === category) : all;
    ids = pool.sort(() => Math.random() - 0.5).slice(0, 10).map((question) => question.id);
  }
  const inserted = await supabase.from('attempts').insert({ user_id: userId, mode, daily_date: date, question_ids: ids }).select('*').single();
  if (inserted.error) {
    if (mode === 'daily') {
      const raced = await supabase.from('attempts').select('*').eq('user_id', userId).eq('mode', mode).eq('daily_date', date).single();
      if (!raced.error) return raced.data;
    }
    throw inserted.error;
  }
  return inserted.data;
}

async function startResponse(attempt: any) {
  const questions = await getQuestions(attempt.question_ids);
  const next = questions[attempt.current_position];
  return {
    mode: attempt.mode,
    attemptId: attempt.id,
    date: attempt.daily_date ?? undefined,
    questions: next ? [publicQuestion(next)] : [],
    currentIndex: attempt.current_position,
    totalScore: attempt.total_score,
    resultPattern: attempt.result_pattern ?? [],
    complete: attempt.status === 'complete',
  };
}

async function answerAttempt(userId: string, attemptId: string, questionId: string, position: number, guessMs: number) {
  if (!safeNumber(guessMs) || !Number.isInteger(position) || position < 0) throw new Error('That estimate is outside the playable range.');
  const attemptResponse = await supabase.from('attempts').select('*').eq('id', attemptId).eq('user_id', userId).single();
  if (attemptResponse.error) throw new Error('Game attempt not found.');
  const attempt = attemptResponse.data;
  if (attempt.status !== 'playing') throw new Error('This game is already complete.');
  if (attempt.current_position !== position || attempt.question_ids[position] !== questionId) throw new Error('That question is not the next question.');
  const questionResponse = await supabase.from('questions').select('*').eq('id', questionId).single();
  if (questionResponse.error) throw new Error('Question data is unavailable.');
  const question = questionResponse.data as Question;
  const score = scoreGuess(guessMs, question);
  const inserted = await supabase.from('answers').insert({ attempt_id: attempt.id, user_id: userId, question_id: questionId, position, guess_ms: guessMs, points: score.points, error_log: score.errorLog });
  if (inserted.error) throw new Error('This answer was already submitted.');
  const nextPosition = position + 1;
  const complete = nextPosition >= attempt.question_ids.length;
  const nextPattern = [...(attempt.result_pattern ?? []), score.pattern];
  const updated = await supabase.from('attempts').update({ current_position: nextPosition, total_score: attempt.total_score + score.points, total_error: Number(attempt.total_error) + score.errorLog, result_pattern: nextPattern, status: complete ? 'complete' : 'playing', completed_at: complete ? new Date().toISOString() : null }).eq('id', attempt.id).eq('user_id', userId).select('*').single();
  if (updated.error) throw updated.error;
  const nextQuestion = complete ? undefined : (await getQuestions([attempt.question_ids[nextPosition]]))[0];
  return { questionId, guessMs, actualMs: Number(question.answer_ms), actualDisplay: question.display_answer, points: score.points, ratio: score.ratio, errorLog: score.errorLog, direction: score.direction, tier: score.tier, fact: question.fact, sourceLabel: question.source_label, sourceUrl: question.source_url, nextQuestion: nextQuestion ? publicQuestion(nextQuestion) : undefined, complete, totalScore: updated.data.total_score, resultPattern: nextPattern };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await currentUser(request);
    if (!user) return fail('Sign in anonymously before playing.', 401);
    await ensureProfile(user);
    const url = new URL(request.url);
    const route = url.pathname.replace(/^.*\/game-api/, '') || '/';
    if (request.method === 'GET' && route === '/leaderboard') {
      const date = url.searchParams.get('date') || todayUtc();
      const board = await supabase.from('daily_leaderboard').select('rank, display_name, discriminator, score, completed_at, result_pattern').eq('daily_date', date).order('rank', { ascending: true }).limit(100);
      if (board.error) throw board.error;
      return json((board.data ?? []).map((entry) => ({ rank: Number(entry.rank), displayName: entry.display_name, discriminator: entry.discriminator, score: entry.score, completedAt: entry.completed_at, resultPattern: entry.result_pattern ?? [] })));
    }
    const body = request.method === 'GET' ? {} : await request.json().catch(() => ({}));
    if (request.method === 'PATCH' && route === '/profile') {
      const name = String(body.displayName ?? '').trim().replace(/\s+/g, ' ');
      if (!/^[\p{L}\p{N}][\p{L}\p{N} _-]{1,18}[\p{L}\p{N}]$/u.test(name)) return fail('Display names must be 3–20 letters, numbers, spaces, or hyphens.');
      const updated = await supabase.from('profiles').update({ display_name: name }).eq('id', user.id).select('*').single();
      if (updated.error) throw updated.error;
      return json({ displayName: updated.data.display_name, discriminator: updated.data.discriminator, id: updated.data.id });
    }
    const mode = route.startsWith('/daily') ? 'daily' : route.startsWith('/practice') ? 'practice' : null;
    if (!mode) return fail('Route not found.', 404);
    if (route.endsWith('/start') && request.method === 'POST') {
      const attempt = await startAttempt(user.id, mode, body.category);
      return json(await startResponse(attempt));
    }
    if (route.endsWith('/answer') && request.method === 'POST') {
      if (!body.attemptId || !body.questionId) return fail('Missing answer fields.');
      return json(await answerAttempt(user.id, body.attemptId, body.questionId, Number(body.position), Number(body.guessMs)));
    }
    return fail('Route not found.', 404);
  } catch (error) {
    console.error(error);
    return fail(error instanceof Error ? error.message : 'Unexpected game service error.', 500);
  }
});
