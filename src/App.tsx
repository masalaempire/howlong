import { useCallback, useEffect, useRef, useState } from 'react';
import { categories } from './data/questions';
import { answerLocal, makeLocalSession, questionForSession, utcDate } from './lib/gameEngine';
import { onlineApi } from './lib/api';
import { durationToMs, emptyDuration, formatDuration, isValidDuration } from './lib/duration';
import { ratioLabel } from './lib/scoring';
import { clearSession, loadProfile, loadSession, loadStats, recordCompletedDaily, recordPractice, saveProfile, saveSession } from './lib/storage';
import type { AnswerResult, DurationParts, GameSession, LeaderboardEntry, Mode, Profile, PublicQuestion, Stats } from './types';
import './styles.css';

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void; 'expired-callback'?: () => void; 'error-callback'?: () => void }) => string;
    };
  }
}

type Screen = 'home' | 'game' | 'result' | 'complete';

const isValidName = (name: string) => /^[\p{L}\p{N}][\p{L}\p{N} _-]{1,18}[\p{L}\p{N}]$/u.test(name.trim());

function countdownToTomorrow(): string {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const seconds = Math.max(0, Math.floor((tomorrow.getTime() - now.getTime()) / 1000));
  const hours = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const remaining = String(seconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${remaining}`;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [session, setSession] = useState<GameSession | null>(null);
  const [guess, setGuess] = useState<DurationParts>(emptyDuration());
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [profile, setProfile] = useState<Profile>(() => loadProfile());
  const [stats, setStats] = useState<Stats>(() => loadStats());
  const [nameDraft, setNameDraft] = useState(profile.displayName);
  const [screenNotice, setScreenNotice] = useState('');
  const [inputError, setInputError] = useState('');
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(countdownToTomorrow());
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [resumeAvailable, setResumeAvailable] = useState(Boolean(loadSession()));
  const [selectedCategory, setSelectedCategory] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => setCountdown(countdownToTomorrow()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const currentQuestion = session ? questionForSession(session) : undefined;
  const isPreview = Boolean(session?.attemptId.startsWith('local-'));
  const gameScore = session?.totalScore ?? 0;
  const questionNumber = session ? Math.min(session.currentIndex + 1, session.mode === 'daily' ? 5 : 10) : 1;
  const totalQuestions = session?.mode === 'daily' ? 5 : 10;

  const persistSession = useCallback((next: GameSession) => {
    saveSession({
      mode: next.mode,
      attemptId: next.attemptId,
      date: next.date,
      questionIds: next.questions.map((question) => question.id),
      currentIndex: next.currentIndex,
      totalScore: next.totalScore,
      resultPattern: next.resultPattern,
    });
  }, []);

  const storeProfile = useCallback(async (draftName = nameDraft) => {
    const normalized = draftName.trim().replace(/\s+/g, ' ');
    if (!isValidName(normalized)) {
      setScreenNotice('Choose a display name between 3 and 20 letters, numbers, spaces, or hyphens.');
      return false;
    }
    const next = { ...profile, displayName: normalized };
    setProfile(next);
    setNameDraft(normalized);
    saveProfile(next);
    if (onlineApi) {
      try { await onlineApi.updateProfile(next); } catch (error) { setScreenNotice(error instanceof Error ? error.message : 'Your name could not be saved online.'); }
    }
    return true;
  }, [nameDraft, profile]);

  const startGame = async (mode: Mode) => {
    if (!(await storeProfile())) return;
    setBusy(true);
    setScreenNotice('');
    try {
      let next: GameSession;
      if (onlineApi) {
        next = await onlineApi.start(mode, mode === 'practice' ? selectedCategory || undefined : undefined);
      } else {
        next = makeLocalSession(mode, mode === 'practice' ? selectedCategory || undefined : undefined);
        if (mode === 'daily') setScreenNotice('Online mode is not configured, so this Daily preview is unranked. Practice remains fully playable.');
      }
      if (next.complete) {
        setScreenNotice('You have already completed today\'s Daily Challenge. Come back after the UTC reset.');
        setScreen('home');
        return;
      }
      setSession(next);
      persistSession(next);
      setGuess(emptyDuration());
      setInputError('');
      setResult(null);
      setResumeAvailable(true);
      setScreen('game');
    } catch (error) {
      if (mode === 'practice') {
        const next = makeLocalSession('practice', selectedCategory || undefined);
        setSession(next);
        persistSession(next);
        setScreen('game');
        setScreenNotice('The online service is unavailable. You are playing local Practice mode.');
      } else {
        setScreenNotice(error instanceof Error ? error.message : 'The Daily Challenge could not load.');
      }
    } finally {
      setBusy(false);
    }
  };

  const restoreSavedGame = () => {
    const saved = loadSession();
    if (!saved) return;
    if (!saved.attemptId.startsWith('local-')) {
      void startGame(saved.mode);
      return;
    }
    const source = makeLocalSession(saved.mode, undefined, saved.date);
    const questions = saved.questionIds.map((id) => source.questions.find((question) => question.id === id)).filter(Boolean) as PublicQuestion[];
    const restored: GameSession = { ...source, attemptId: saved.attemptId, date: saved.date, questions, currentIndex: saved.currentIndex, totalScore: saved.totalScore, resultPattern: saved.resultPattern };
    setSession(restored);
    setGuess(emptyDuration());
    setScreen('game');
    setScreenNotice('Your unfinished game is back.');
  };

  const submitGuess = async () => {
    if (!session || !currentQuestion || busy) return;
    const guessMs = durationToMs(guess);
    if (!isValidDuration(guess)) {
      setInputError('Set a duration greater than zero before locking it in.');
      return;
    }
    setBusy(true);
    setInputError('');
    try {
      let answer: AnswerResult;
      if (onlineApi && !isPreview) {
        answer = await onlineApi.answer(session.mode, { attemptId: session.attemptId, questionId: currentQuestion.id, position: session.currentIndex, guessMs });
      } else {
        const working: GameSession = { ...session, questions: [...session.questions], resultPattern: [...session.resultPattern] };
        answer = answerLocal(working, guessMs);
      }
      const nextQuestions = answer.nextQuestion && !session.questions.some((question) => question.id === answer.nextQuestion?.id)
        ? [...session.questions, answer.nextQuestion]
        : session.questions;
      const nextSession: GameSession = {
        ...session,
        questions: nextQuestions,
        currentIndex: session.currentIndex + 1,
        totalScore: answer.totalScore,
        resultPattern: answer.resultPattern,
      };
      setSession(nextSession);
      setResult(answer);
      setGuess(emptyDuration());
      if (!answer.complete) persistSession(nextSession);
      if (answer.complete) {
        clearSession();
        setResumeAvailable(false);
        const nextStats = session.mode === 'daily' && session.date ? recordCompletedDaily(session.date, answer.totalScore, answer.resultPattern) : recordPractice();
        setStats(nextStats);
      }
      setScreen('result');
    } catch (error) {
      setInputError(error instanceof Error ? error.message : 'That estimate could not be submitted.');
    } finally {
      setBusy(false);
    }
  };

  const continueAfterResult = () => {
    if (!result) return;
    if (result.complete) {
      setScreen('complete');
    } else {
      setScreen('game');
      setInputError('');
    }
  };

  const openLeaderboard = async () => {
    setShowLeaderboard(true);
    if (!onlineApi) return;
    try { setLeaderboard(await onlineApi.leaderboard(utcDate())); } catch (error) { setScreenNotice(error instanceof Error ? error.message : 'Leaderboard unavailable.'); }
  };

  const shareResult = async () => {
    if (!result || !session) return;
    const text = `HowLong? ${session.mode === 'daily' ? utcDate() : 'Practice'}\n${result.totalScore}/${session.mode === 'daily' ? 5000 : 10000}\n${result.resultPattern.join('')}\n${window.location.origin}/`;
    try {
      if (navigator.share) await navigator.share({ title: 'HowLong?', text });
      else await navigator.clipboard.writeText(text);
      setScreenNotice('Result copied — now challenge someone.');
    } catch { /* sharing was cancelled */ }
  };

  return (
    <main className="game-shell">
      <header className={screen === 'home' || screen === 'complete' ? 'site-header' : 'site-header visible'}>
        <button className="brand" onClick={() => { setScreen('home'); setResult(null); }} aria-label="Return to How Long home">How Long<span>?</span></button>
        <div className="header-actions">
          {screen !== 'home' && <span className="score-chip">SCORE&nbsp; {String(gameScore).padStart(4, '0')}</span>}
          <button className="icon-button" onClick={() => setShowProfile(true)} aria-label="Open profile">{profile.displayName.slice(0, 1).toUpperCase()}</button>
        </div>
      </header>

      {screenNotice && <div className="notice" role="status">{screenNotice}<button onClick={() => setScreenNotice('')} aria-label="Dismiss notice">×</button></div>}

      {screen === 'home' && (
        <section className="home-screen">
          <div className="home-copy">
            <p className="eyebrow">A tiny game about time</p>
            <h1>Some things take <em>much</em> longer than you think.</h1>
            <p className="intro">Set your best estimate, then find out how your sense of time holds up.</p>
          </div>
          <div className="name-row">
            <label htmlFor="display-name">Playing as</label>
            <input id="display-name" value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} maxLength={20} />
            <span>#{profile.discriminator}</span>
          </div>
          <div className="mode-grid">
            <button className="mode-card daily-card" onClick={() => void startGame('daily')} disabled={busy}>
              <span className="mode-label">Daily challenge</span>
              <strong>Five questions.<br />One shared board.</strong>
              <small>Resets in {countdown} UTC</small>
              <span className="mode-arrow">→</span>
            </button>
            <div className="practice-card">
              <div>
                <span className="mode-label">Practice</span>
                <strong>Ten questions.<br />No pressure.</strong>
              </div>
              <label htmlFor="category">Category</label>
              <select id="category" value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
                <option value="">All categories</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              <button className="start-button" onClick={() => void startGame('practice')} disabled={busy}>Start practice <span>→</span></button>
            </div>
          </div>
          {onlineApi && import.meta.env.VITE_TURNSTILE_SITE_KEY && <TurnstileWidget />}
          {resumeAvailable && <button className="resume-link" onClick={restoreSavedGame}>Resume unfinished game <span>↗</span></button>}
          <div className="home-meta"><span>100 questions</span><span>guest-friendly</span><span>real things only</span><button onClick={() => void openLeaderboard()}>Leaderboard</button></div>
        </section>
      )}

      {screen === 'game' && session && currentQuestion && (
        <section className="game-card" aria-live="polite">
          <div className="game-topline"><span className="eyebrow">{currentQuestion.category}</span><span className="round-label">{String(questionNumber).padStart(2, '0')} <i /> {String(totalQuestions).padStart(2, '0')}</span></div>
          <div className="progress-track"><span style={{ width: `${(session.currentIndex / totalQuestions) * 100}%` }} /></div>
          <h1>{currentQuestion.prompt}</h1>
          <p className="hint">{currentQuestion.hint}</p>
          <DurationComposer value={guess} onChange={setGuess} disabled={busy} />
          {inputError && <p className="input-error" role="alert">{inputError}</p>}
          <div className="game-actions"><button className="secondary-button" onClick={() => setGuess(emptyDuration())} disabled={busy}>Reset</button><button className="submit-button" onClick={() => void submitGuess()} disabled={busy}>{busy ? 'Checking…' : 'Lock it in'} <span>→</span></button></div>
          <p className="privacy-note">Your guess is scored by ratio, so milliseconds and millennia can share the same rules.</p>
        </section>
      )}

      {screen === 'result' && result && session && (
        <section className="result-card" aria-live="polite">
          <p className="eyebrow">{result.complete ? 'Run complete' : `Question ${questionNumber - 1} revealed`}</p>
          <h1 className="result-title">{result.tier}</h1>
          <div className="result-summary"><div><span>Your guess</span><strong>{formatDuration(result.guessMs)}</strong></div><div><span>Actually</span><strong>{result.actualDisplay}</strong></div></div>
          <p className="result-difference">{result.direction === 'exactly right' ? 'You landed inside the accepted range.' : `You were ${ratioLabel(result.ratio)} ${result.direction}.`} <b>+{result.points} points</b></p>
          <LogMeter guessMs={result.guessMs} actualMs={result.actualMs} />
          <aside className="fact-box"><span>{result.sourceLabel}</span><p>{result.fact}</p><a href={result.sourceUrl} target="_blank" rel="noreferrer">Read the reference ↗</a></aside>
          <div className="result-actions"><button className="secondary-button" onClick={() => void shareResult()}>Share result</button><button className="submit-button" onClick={continueAfterResult}>{result.complete ? 'See your score' : 'Next question'} <span>→</span></button></div>
        </section>
      )}

      {screen === 'complete' && session && result && (
        <section className="complete-screen">
          <p className="eyebrow">{session.mode === 'daily' ? 'Daily challenge complete' : 'Practice complete'}</p>
          <h1>You have a feeling for <em>time.</em></h1>
          <div className="final-score"><span>FINAL SCORE</span><strong>{String(result.totalScore).padStart(4, '0')}</strong><small>out of {session.mode === 'daily' ? '5,000' : '10,000'}</small></div>
          <div className="share-pattern" aria-label="Your result pattern">{result.resultPattern.map((tile, index) => <span key={`${tile}-${index}`}>{tile}</span>)}</div>
          <p className="end-copy">{session.mode === 'daily' ? `${stats.currentStreak} day streak. Come back tomorrow to keep it alive.` : 'A little practice makes the strange scale of time feel less strange.'}</p>
          <div className="complete-actions"><button className="start-button" onClick={() => { setScreen('home'); setSession(null); setResult(null); }}>Back home <span>↗</span></button><button className="secondary-button" onClick={() => void shareResult()}>Share result</button></div>
        </section>
      )}

      <footer><span>Estimate first. Be surprised after.</span><button onClick={() => void openLeaderboard()}>View leaderboard</button><span>{stats.currentStreak > 0 ? `STREAK ${stats.currentStreak}` : 'START A STREAK'}</span></footer>

      {showLeaderboard && <LeaderboardModal entries={leaderboard} onClose={() => setShowLeaderboard(false)} date={utcDate()} />}
      {showProfile && <ProfileModal profile={profile} stats={stats} onClose={() => setShowProfile(false)} onSave={storeProfile} />}
    </main>
  );
}

function DurationComposer({ value, onChange, disabled }: { value: DurationParts; onChange: (value: DurationParts) => void; disabled: boolean }) {
  const [history, setHistory] = useState<DurationParts[]>([]);
  const valueRef = useRef(value);
  const holdRef = useRef<{ timeout?: number; interval?: number }>({});
  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => () => { if (holdRef.current.timeout) window.clearTimeout(holdRef.current.timeout); if (holdRef.current.interval) window.clearInterval(holdRef.current.interval); }, []);
  const update = (key: keyof DurationParts, raw: string, step = false) => {
    const current = valueRef.current;
    const old = { ...current };
    const nextValue = step ? Math.max(0, (current[key] || 0) + Number(raw)) : Math.max(0, Math.floor(Number(raw.replace(/\D/g, '')) || 0));
    const next = { ...current, [key]: nextValue };
    setHistory((past) => [...past.slice(-9), old]);
    valueRef.current = next;
    onChange(next);
  };
  const beginHold = (key: keyof DurationParts, delta: number) => {
    if (disabled) return;
    if (holdRef.current.timeout) window.clearTimeout(holdRef.current.timeout);
    if (holdRef.current.interval) window.clearInterval(holdRef.current.interval);
    holdRef.current.timeout = window.setTimeout(() => {
      update(key, String(delta), true);
      holdRef.current.interval = window.setInterval(() => update(key, String(delta), true), 110);
    }, 450);
  };
  const endHold = () => {
    if (holdRef.current.timeout) window.clearTimeout(holdRef.current.timeout);
    if (holdRef.current.interval) window.clearInterval(holdRef.current.interval);
    holdRef.current = {};
  };
  const undo = () => { const previous = history.at(-1); if (!previous) return; setHistory((past) => past.slice(0, -1)); valueRef.current = previous; onChange(previous); };
  return <div className="composer" aria-label="Duration estimate">
    <div className="composer-fields">
      {([
        ['years', 'years'], ['days', 'days'], ['hours', 'hours'], ['minutes', 'minutes'], ['seconds', 'seconds'], ['milliseconds', 'ms'],
      ] as Array<[keyof DurationParts, string]>).map(([key, label]) => <div className="duration-field" key={key}>
        <label htmlFor={`duration-${key}`}>{label}</label>
        <div className="field-control"><button type="button" onClick={() => update(key, '-1', true)} onPointerDown={() => beginHold(key, -1)} onPointerUp={endHold} onPointerCancel={endHold} onPointerLeave={endHold} disabled={disabled} aria-label={`Decrease ${label}`}>−</button><input id={`duration-${key}`} type="number" min="0" inputMode="numeric" value={value[key] || ''} placeholder="0" onChange={(event) => update(key, event.target.value)} onKeyDown={(event) => { if (event.key === 'ArrowUp') update(key, '1', true); if (event.key === 'ArrowDown') update(key, '-1', true); }} onWheel={(event) => { if (document.activeElement === event.currentTarget) { event.preventDefault(); update(key, event.deltaY < 0 ? '1' : '-1', true); } }} disabled={disabled} /><button type="button" onClick={() => update(key, '1', true)} onPointerDown={() => beginHold(key, 1)} onPointerUp={endHold} onPointerCancel={endHold} onPointerLeave={endHold} disabled={disabled} aria-label={`Increase ${label}`}>+</button></div>
      </div>)}
    </div>
    <div className="composer-bottom"><p>Your estimate: <strong>{formatDuration(durationToMs(value), 3)}</strong></p><button className="undo-button" onClick={undo} disabled={disabled || history.length === 0}>Undo last change</button></div>
  </div>;
}

function TurnstileWidget() {
  const ref = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    if (!sitekey || !onlineApi || !ref.current) return;
    const api = onlineApi;
    let cancelled = false;
    let attempts = 0;
    const render = () => {
      if (cancelled || !ref.current) return;
      if (window.turnstile) {
        window.turnstile.render(ref.current, {
          sitekey,
          callback: (token) => api.setCaptchaToken(token),
          'expired-callback': () => api.setCaptchaToken(''),
          'error-callback': () => { api.setCaptchaToken(''); setNotice('Security check unavailable. Try refreshing.'); },
        });
      } else if (attempts < 20) {
        attempts += 1;
        window.setTimeout(render, 250);
      } else setNotice('Security check unavailable.');
    };
    render();
    return () => { cancelled = true; };
  }, []);
  return <div className="turnstile-wrap"><div ref={ref} aria-label="Security check" />{notice && <small>{notice}</small>}</div>;
}

function LogMeter({ guessMs, actualMs }: { guessMs: number; actualMs: number }) {
  const guessPosition = Math.max(4, Math.min(96, 50 + Math.log10(guessMs / actualMs) * 18));
  return <div className="log-meter" aria-label="Logarithmic comparison between your guess and the actual duration"><div className="meter-labels"><span>much shorter</span><span>same scale</span><span>much longer</span></div><div className="meter-track"><span className="meter-center" /><span className="meter-guess" style={{ left: `${guessPosition}%` }} /></div><div className="meter-caption"><span>actual</span><span>your guess</span></div></div>;
}

function LeaderboardModal({ entries, date, onClose }: { entries: LeaderboardEntry[] | null; date: string; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="leaderboard-title"><div className="modal-heading"><div><p className="eyebrow">{date}</p><h2 id="leaderboard-title">Daily leaderboard</h2></div><button className="close-button" onClick={onClose} aria-label="Close leaderboard">×</button></div>{entries === null ? <div className="empty-state"><strong>{onlineApi ? 'Loading the board…' : 'The board is waiting for its online service.'}</strong><p>Connect Supabase to publish and compare ranked Daily scores.</p></div> : entries.length === 0 ? <div className="empty-state"><strong>Be the first name on the board.</strong><p>Complete today’s Daily Challenge to claim the top line.</p></div> : <ol className="leaderboard-list">{entries.map((entry) => <li key={`${entry.rank}-${entry.discriminator}`}><span className="rank">{String(entry.rank).padStart(2, '0')}</span><span className="leader-name">{entry.displayName}<small>#{entry.discriminator}</small></span><span className="leader-pattern">{entry.resultPattern.join('')}</span><strong>{entry.score}</strong></li>)}</ol>}</section></div>;
}

function ProfileModal({ profile, stats, onClose, onSave }: { profile: Profile; stats: Stats; onClose: () => void; onSave: (name: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState(profile.displayName);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title"><div className="modal-heading"><div><p className="eyebrow">Your time sense</p><h2 id="profile-title">{draft}</h2></div><button className="close-button" onClick={onClose} aria-label="Close profile">×</button></div><div className="stat-grid"><div><strong>{stats.dailyPlayed}</strong><span>Daily played</span></div><div><strong>{stats.practicePlayed}</strong><span>Practice played</span></div><div><strong>{stats.dailyAverage || '—'}</strong><span>Average score</span></div><div><strong>{stats.dailyBest || '—'}</strong><span>Best score</span></div><div><strong>{stats.currentStreak}</strong><span>Current streak</span></div><div><strong>{stats.longestStreak}</strong><span>Longest streak</span></div></div><HistoryCalendar history={stats.dailyHistory} /><label className="modal-label" htmlFor="profile-name">Display name</label><div className="profile-name-edit"><input id="profile-name" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={20} /><button className="secondary-button" onClick={() => void onSave(draft)}>Save</button></div><p className="guest-profile-note"><strong>Guest profile</strong><br />Your game identity works instantly on this browser. Account recovery and Google sign-in may be added later.</p></section></div>;
}

function HistoryCalendar({ history }: { history: Stats['dailyHistory'] }) {
  const today = new Date();
  const todayKey = utcDate(today);
  const days = Array.from({ length: 28 }, (_, index) => {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (27 - index)));
    const key = utcDate(date);
    const item = history[key];
    return { key, item, missed: key < todayKey && !item };
  });
  return <section className="history-section" aria-labelledby="history-title"><div className="history-heading"><h3 id="history-title">Daily history</h3><span>Last 28 days</span></div><div className="history-grid">{days.map(({ key, item, missed }) => <span key={key} className={`history-day ${item ? item.score >= 5000 ? 'perfect' : 'complete' : missed ? 'missed' : ''}`} title={`${key}${item ? ` · ${item.score} points` : missed ? ' · missed' : ''}`} aria-label={`${key}${item ? `, ${item.score} points` : missed ? ', missed' : ', not played'}`} />)}</div><div className="history-legend"><span><i className="complete" />played</span><span><i className="perfect" />perfect</span><span><i className="missed" />missed</span></div></section>;
}
