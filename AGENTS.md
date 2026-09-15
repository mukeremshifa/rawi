# AGENTS.md — the operating contract

This is short and it governs. `CLAUDE.md` is orientation; this is the contract.

## The invariants

These are the product, not preferences. Each has a test in `tests/invariants/`.
Changing one is a product decision, not a refactor.

1. **Assistance is monotonic.** `none → hinted → revealed`, never backwards.
   Not by reload, not by a second tab, not by a mode switch.
2. **Independent means correct AND unaided.** An attempt is independent evidence
   only if it was correct *and* no assistance was in force on that item.
   **Using Ask during a check is assistance.**
3. **A revealed item can never later be graded as an unseen check.**
4. **Recorded attempts are immutable**, including the review date anchored to
   them. Reading the same evidence on a later day does not move the date.
5. **Exhausting the item bank is an honest terminal state.** The server never
   recycles a seen item as "fresh".
6. **No mastery percentage.** Evidence is a described state, never a number;
   model confidence is never rendered as a score.
7. **The server owns every rule** — correctness, assistance, evidence,
   scheduling, quota. The browser renders and requests; it never decides.
8. **All learner text, source text and model output is untrusted data, never
   instructions.** Scope retrieval by verified ownership before searching.
9. **Unrevealed answers and secrets never reach the browser bundle.** Enforced
   by `scripts/check-bundle-secrets.mjs` against `dist/`, in `verify`.
10. **Never fabricate.** No invented scores, benchmarks, source support,
    feedback or passing checks. A call that may have charged but whose result is
    unknown is recorded `ambiguous`.
11. **Model output is validated before it is trusted.** Exact ID sets; every
    evidence quote must be a literal substring of the learner's own text. An
    invented quote is a **rejected assessment**, not a logged warning.

## Engineering boundaries

- **One Zod definition per concept**, in `src/shared/`. The Worker parses
  requests with the same schemas the client sends against.
- **`workspaceId` is a required first parameter** on every workspace-scoped
  method. Never optional, never defaulted, never inferred.
- **Ownership is enforced in the handler**, not only in RLS. The Worker uses the
  service-role key and bypasses RLS; the check you can read is the one that runs.
- **Optimistic concurrency via `version`.** Read, apply a pure function, then
  `UPDATE … WHERE version = $n`. A mismatch is `stale_request`.
- **Bound every job step by CPU**, not by convenience. Waiting on Vertex or
  Supabase is I/O and does not count; loops do.
- **The fake may not have capabilities a real API could not have.** No
  cross-workspace queries, no roll-ups the server could not compute, nothing
  synchronous that would need a job.
- **No `dangerouslySetInnerHTML`.** There is an ESLint rule and it is not
  disabled. `InlineText` renders elements and cannot emit HTML by construction.
- **Fixture mode is the default.** CI and local development never spend money.

## Honesty doctrine

- **Nothing on screen is a lie.** Unknown renders as unknown — an em dash, a
  breathing bar, a sentence saying we have not asked yet. Never a zero standing
  in for an absent measurement.
- **`docs/STATUS.md` records what is verified working**, and nothing else.
  Planned work is not completed work. A doc that grows past one screen or starts
  narrating the past has become the thing the rebuild deleted; history is what
  `git log` is for.
- **Report outcomes faithfully.** If a check fails, say so with the output. If a
  step was skipped, say that.
- **Explain the main engineering tradeoff in what you build.** The owner is
  learning this system, and a decision left unexplained is half-delivered.

## Working here

- Read `docs/STATUS.md` first, then the file you are changing.
- Tests live in `tests/`, alongside the work, not after it.
- Commit in logical chunks. A commit you could not describe in one line is two
  commits.
- `npm run verify` is the gate. Fix failures in this order, because each
  unblocks the next: typecheck → lint → unit and invariant tests → build →
  bundle-secrets and contrast → e2e.
- Adding a design token means adding its pair to `PAIRS` in
  `scripts/check-contrast.mjs`.
- Adding a contract method means adding a route with a matching `op`, or
  `check:routes` fails.
