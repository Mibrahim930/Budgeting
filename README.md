# Budgeting

A small, self-hosted envelope budgeting web app for me and a few friends.

- **Stack:** SvelteKit, TypeScript, SQLite (Drizzle), Better Auth, Tailwind.
- **Background:** see [docs/research.md](docs/research.md) for the research behind it and [docs/plan.md](docs/plan.md) for the plan.

## Development

```sh
cp .env.example .env   # fill in the secrets
npm install
npm run dev
```

| Command               | What it does                                                                    |
| --------------------- | ------------------------------------------------------------------------------- |
| `npm run check`       | Type-check                                                                      |
| `npm run lint`        | Prettier + ESLint                                                               |
| `npm test`            | Unit tests (Vitest)                                                             |
| `npm run test:e2e`    | Browser tests (Playwright). Set `PW_CHROMIUM_PATH` to use an existing Chromium. |
| `npm run db:generate` | Create a migration after editing `src/lib/server/db/schema.ts`                  |

Migrations run automatically when the app opens the database.
