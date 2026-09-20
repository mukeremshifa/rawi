# Rawi

A local prototype evolving into an AI tutor and mentor.

Requires Node.js 22.12+ and npm.

```sh
npm install
npm run dev
```

Open http://localhost:5173. No accounts, environment files, database, or AI
credentials are needed. All data and tutor responses are simulated in the
browser; changes reset on reload.

- `src/client/features/` — workspace, sources, concepts, sessions, Ask, and evidence UI.
- `src/client/api/local.ts` — in-memory data and simulated behavior.
- `src/client/api/demo.ts` — seeded learning content.
- `src/shared/` — schemas, API types, and shared messages.

`npm run build` creates a static preview; `npm run preview` serves it.
There are no test, lint, CI, deployment, or database workflows at this stage.
