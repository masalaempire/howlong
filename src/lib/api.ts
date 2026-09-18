import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AnswerResult, GameSession, LeaderboardEntry, Mode, Profile, PublicQuestion } from '../types';
import { loadProfile } from './storage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const backendConfigured = Boolean(supabaseUrl && supabaseKey);

export class GameApi {
  private client: SupabaseClient;
  private baseUrl: string;

  constructor() {
    if (!backendConfigured) throw new Error('The online game service is not configured.');
    this.client = createClient(supabaseUrl!, supabaseKey!, { auth: { persistSession: true, autoRefreshToken: true } });
    this.baseUrl = `${supabaseUrl}/functions/v1/game-api`;
  }

  async ensureGuest(): Promise<void> {
    const { data } = await this.client.auth.getSession();
    if (!data.session) {
      const profile = loadProfile();
      const { error } = await this.client.auth.signInAnonymously({ options: { data: { display_name: profile.displayName } } });
      if (error) throw error;
    }
  }

  private async request<T>(route: string, method: 'GET' | 'POST' | 'PATCH', body?: unknown): Promise<T> {
    await this.ensureGuest();
    const { data } = await this.client.auth.getSession();
    const response = await fetch(`${this.baseUrl}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'The online game service could not answer.');
    return payload as T;
  }

  start(mode: Mode, category?: string): Promise<GameSession> {
    return this.request<GameSession>(`/${mode}/start`, 'POST', { category });
  }

  answer(mode: Mode, payload: { attemptId: string; questionId: string; position: number; guessMs: number }): Promise<AnswerResult> {
    return this.request<AnswerResult>(`/${mode}/answer`, 'POST', payload);
  }

  leaderboard(date: string): Promise<LeaderboardEntry[]> {
    return this.request<LeaderboardEntry[]>(`/leaderboard?date=${encodeURIComponent(date)}`, 'GET');
  }

  updateProfile(profile: Profile): Promise<Profile> {
    return this.request<Profile>('/profile', 'PATCH', profile);
  }

  async sendEmailCode(email: string): Promise<void> {
    const { error } = await this.client.auth.updateUser({ email });
    if (error) throw error;
  }

  async verifyEmailCode(email: string, token: string): Promise<void> {
    const { error } = await this.client.auth.verifyOtp({ email, token, type: 'email_change' });
    if (error) throw error;
  }

  async sendSignInCode(email: string): Promise<void> {
    const { error } = await this.client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
    });
    if (error) throw error;
  }

  async verifySignInCode(email: string, token: string): Promise<void> {
    const { error } = await this.client.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
  }

  getClient() { return this.client; }
}

export const onlineApi = backendConfigured ? new GameApi() : null;
