# HowLong?

HowLong is a duration-estimation game. The v2 client is a Vite + React + TypeScript app with local Practice mode and an optional Supabase-backed Daily Challenge, profiles, and leaderboard.

## Local development

```sh
npm install
npm run validate:questions
npm run dev
```

Without Supabase environment variables, Practice is fully playable and Daily runs as an explicitly unranked local preview. No local result is presented as a global leaderboard score.

Copy `.env.example` to `.env.local` and add the Supabase project URL and publishable key to enable the online path.

## Supabase setup

1. Create a Supabase project and enable anonymous sign-ins, manual linking, and email OTP. If you use Turnstile, configure its secret in Supabase Auth CAPTCHA settings as well.
2. Apply `supabase/migrations/0001_howlong_v2.sql`.
3. Run `npm run generate:seed`, then apply the generated `supabase/seed.sql` in the SQL editor.
4. Deploy `supabase/functions/game-api` with the Supabase CLI. The function expects the platform-provided `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` secrets.
5. Configure the deployed site URL and email redirect URL. The profile sheet supports both saving an anonymous guest identity and signing back in with an existing email code.

The browser never receives answer durations before submission. Direct client writes to attempts and answers are revoked by RLS; the Edge Function owns scoring and leaderboard writes.

## Content notes

`src/data/questions.json` is the 100-question launch pool and includes source URLs, but each source should receive a final human review before public promotion. `npm run validate:questions` checks structure, category balance, ranges, and URLs.

## Deployment

GitHub Pages is configured in `.github/workflows/deploy.yml`. Enable **GitHub Actions** as the Pages source and add the public `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and optional `VITE_TURNSTILE_SITE_KEY` as repository variables. When a Turnstile site key is present, the home screen renders the security check before the first anonymous account is created.
