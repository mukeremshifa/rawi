# Rawi

**Rawi** (راوي) — *narrator; the one who carries an account and passes it on.*

> Rawi takes material you do not understand, teaches it, verifies you can use it
> without help, and re-verifies later — and it never claims you know something it
> did not watch you do unaided.

## What it does

1. **Workspaces** — a subject you are learning. Every source, concept, session
   and piece of evidence belongs to exactly one, always named explicitly.
2. **Sources** — pasted text and uploaded `.txt`/`.md`, chunked and searchable.
   Everything the tutor says is grounded in these and cites them.
3. **Concept map** — extracted from your sources, each concept carrying an
   evidence state: `not-checked` → `practicing` → `independent-once` →
   `retained-on-review`.
4. **Teaching sessions** — diagnose → teach → practise → check, with hints and
   reveals that permanently change whether an answer counts as evidence.
5. **Ask** — grounded chat with citations, answering only from your sources.
   Using it during a check is support, and support is recorded.
6. **Delayed re-check** — a scheduled return to concepts you solved unaided,
   asking a **different** question from the same concept. Never the same one.
7. **Evidence** — per concept: what you did, unaided or not, when, what is due.
   No mastery percentage, ever.
8. **Study plan** — what to do next and why, derived from evidence and due dates.

**Not in v1:** classrooms, teacher dashboards, Arabic UI, PDF/OCR, vector
embeddings, collaboration, mobile apps.

## The line against SynapseDeck

Rawi and SynapseDeck are siblings, and they are not the same product.

| | SynapseDeck | Rawi |
| --- | --- | --- |
| You arrive with | Material you want to retain | Material you do not understand |
| Unit of account | A **card**, with an interval | A **concept**, with an evidence state |
| Who owns correctness | You do — you grade yourself | The server does — you cannot self-report |
| Core loop | Generate → gate → review | Diagnose → teach → practise → check → delayed re-check |
| Success | Retention curve holds | A learner solved something *new*, unaided |

Spaced repetition is a **mechanism** Rawi uses for the delayed re-check. It is
not Rawi's product, and Rawi never shows a card-and-interval UI.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173, against the in-browser fake
```

`VITE_API_MODE` defaults to `fake`, so this needs no credentials and spends
nothing. The demo workspace is seeded with one real source and one complete
concept.

To run the Worker as well:

```bash
cp .dev.vars.example .dev.vars   # then fill it in — docs/OPERATIONS.md §5.1
npm run dev:api                  # http://localhost:8787
VITE_API_MODE=live npm run dev
```

## The gate

```bash
npm run verify
```

lint → typecheck → tests → build → bundle-secret scan → contrast → route
parity → `wrangler deploy --dry-run` → Playwright. The whole thing runs with no
credentials and no spend. CI runs it and **does not deploy**; deployment is one
owner-run command after a green gate.

## The stack

Vite + React 19 + Tailwind v4 on the front, a Hono Worker on Cloudflare serving
both the API and the built client from one origin, Supabase for auth, Postgres
and private storage, and Vertex AI reached over REST with a service-account JWT
signed by Web Crypto.

## Where to read next

| Question | File |
| --- | --- |
| What is verified working, and what is next | [docs/STATUS.md](docs/STATUS.md) |
| Why the architecture is shaped this way | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| The design system, with computed contrast ratios | [docs/DESIGN.md](docs/DESIGN.md) |
| Secrets, external setup, deployment | [docs/OPERATIONS.md](docs/OPERATIONS.md) |
| Untrusted input, minors, deletion, export | [docs/SAFETY.md](docs/SAFETY.md) |
| How to work in this repo | [AGENTS.md](AGENTS.md) |

The invariants — the eleven rules that are the product rather than preferences —
are in [AGENTS.md](AGENTS.md) and enforced in `tests/invariants/`.
