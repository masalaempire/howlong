# HowLong?

HowLong is a duration-estimation game. The v2 client is a Vite + React + TypeScript app with local Practice mode and a Supabase-backed Daily Challenge, profiles, and leaderboard. Cloudflare Workers serves the built website; Supabase provides authentication, Postgres, and the `game-api` Edge Function.

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
5. Configure Supabase's Site URL and email redirect URLs with the final Cloudflare Worker URL.

The browser never receives answer durations before submission. Direct client writes to attempts and answers are revoked by RLS; the Edge Function owns scoring and leaderboard writes.

## Content notes

`src/data/questions.json` is the 100-question launch pool and includes source URLs, but each source should receive a final human review before public promotion. `npm run validate:questions` checks structure, category balance, ranges, and URLs.

## Cloudflare Workers deployment

The repository is configured for Cloudflare Workers Static Assets through `wrangler.jsonc`. The Vite app builds into `dist`, and SPA fallback keeps client-side routes working.

In Cloudflare Workers Builds, connect this GitHub repository and configure:

- Production branch: `main`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

Add these build-time variables in Cloudflare:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_TURNSTILE_SITE_KEY` (optional)

Never add a Supabase service-role or secret key to the frontend or Cloudflare build variables. When a Turnstile site key is present, the home screen renders the security check before the first anonymous account is created.

For a manual deployment from a logged-in development machine, run:

```sh
npm install
npm run deploy
```
