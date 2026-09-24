# Cairn

[日本語](./README.md) | English

A collaboration app that started from mountain-trip planning and brings together project management, chat, a calendar, files, a gallery, and an AI assistant.

Design notes and task-specific references are in [`docs/README.md`](docs/README.md). Conventions for AI agents are in [`AGENTS.md`](AGENTS.md).

## Local development

Required tools: Node.js 20+ / pnpm 9+ / [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) / Docker (used by the Supabase CLI)

Run commands from the repository root.

```bash
pnpm install
supabase start                                          # PostgreSQL / Auth / Storage / Realtime / Studio
cp apps/web/.env.local.example apps/web/.env.local      # default keys from supabase start are already filled in
supabase migration up --local --include-all             # apply only migrations that are not applied yet
pnpm dev                                                # http://localhost:3128
```

- Create an account at `/auth/signup` the first time (local email confirmation is not required)
- After a pull or a branch switch, apply the diff with `supabase migration up --local --include-all`. You do not need to recopy `.env.local` or reset the database
- Mentions, DMs, and file notifications go through Inngest. Start the Inngest dev server when you want to check them
- If keys change, check `supabase status`. Stop the stack with `supabase stop`

## Commands

```bash
pnpm dev        # dev server (apps/web)
pnpm build      # build every package
pnpm typecheck  # typecheck
pnpm lint       # lint
pnpm test       # tests
pnpm format     # format
```

### Database migrations

`packages/db/src/schema/` is the source of truth. Generate SQL only when the schema changes.

```bash
pnpm --filter @cairn/db db:generate           # writes supabase/migrations/. Review it before applying
supabase migration up --local --include-all
pnpm --filter @cairn/db db:studio             # Drizzle Studio
```

- Filename and backward-compatibility rules are in [`packages/db/AGENTS.md`](packages/db/AGENTS.md)
- `--include-all` applies migrations that are missing from the history even when merge order and timestamps diverge during parallel work (same as CI [`migrate.yml`](.github/workflows/migrate.yml))
- `supabase db reset --local` rebuilds the database and drops existing data. Use it only in an environment you can throw away

## Repository layout

```
apps/
  web/        Next.js 15 (Web + API Route Handlers + remote MCP /api/mcp)
  mobile/     Expo (WebView wrapper + native chat + push)
  desktop/    Electron (shows the deployed web app)
packages/
  core/       Domain logic with no DB or framework dependency (@cairn/core/billing)
  db/         Drizzle ORM schema and client
  shared/     Shared types, Zod schemas, FEATURE_FLAGS
  config/     Shared tsconfig and ESLint config
supabase/     Supabase CLI config and migration SQL
docs/         Design notes
```

## Other apps and features

| Topic                                                               | Reference                                                                                   |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Local Expo development and device troubleshooting                   | [`docs/mobile-app.md`](docs/mobile-app.md)                                                  |
| Mobile Preview on PRs, Internal Distribution, and initial EAS setup | [`docs/mobile-internal-distribution.md`](docs/mobile-internal-distribution.md)              |
| App Store / TestFlight                                              | [`docs/app-store-submission.md`](docs/app-store-submission.md)                              |
| Electron desktop app                                                | [`docs/desktop-app.md`](docs/desktop-app.md)                                                |
| Web Push notifications (VAPID)                                      | [`docs/web-push.md`](docs/web-push.md)                                                      |
| Adding a PWA icon or accent color                                   | [`docs/frontend-guidelines.md`](docs/frontend-guidelines.md#pwa-アイコンとアクセントカラー) |
| Production deploy and release                                       | [`docs/production-deployment.md`](docs/production-deployment.md)                            |

## License

Apache License 2.0
