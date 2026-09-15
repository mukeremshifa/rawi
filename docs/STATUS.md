# Status

_Last verified: 15 September 2026._

## Verified working

`npm run verify` is green end to end, on a machine with no credentials and no
spend:

| Step | Result |
| --- | --- |
| lint | clean |
| typecheck | clean |
| test | 123 passed, 11 files |
| build | `dist/client`, 807 kB JS / 233 kB gzipped |
| check:bundle | 4 files scanned in the **live** build, nothing leaked |
| check:contrast | every pair passes in both themes; both ramps climb |
| check:routes | 32 operations, contract and Worker agree |
| deploy:check | `wrangler deploy --dry-run` succeeds, 23 assets |
| e2e | 6 passed, against `VITE_API_MODE=fake` |

Driven once in a browser against the fake: workspace list → plan → sources →
one source's passages → concept map → a concept → a full session including a
hint, a reveal and a submission → Ask with a citation → Ask with no grounding →
evidence → 404. **No console errors.**

The eleven invariants each have tests in `tests/invariants/`.

## Not done

- **Never deployed.** No Cloudflare deploy has been run. `docs/OPERATIONS.md` is
  the checklist.
- **Migrations 004–007 have not been applied.** They are written and additive;
  `supabase db push` has not been run against the live project.
- **Live AI has never been called.** The Vertex client is written and its
  request shape is unit-tested, but no real request has been made. `RAWI_AI_MODE`
  is `fixture`. `npm run eval:live` exists for the first live run.
- **Concept extraction is a placeholder.** `jobs/runner.ts` produces one concept
  per source with no authored items, so a real workspace reaches the honest
  "no questions written yet" state rather than a teaching session. The live
  extraction prompt exists; the call does not.
- **No age assurance.** See `docs/SAFETY.md`.
- **Uploads are read client-side.** `requestUpload` and the storage policy exist;
  the add-source dialog reads the file in the browser and sends text, so the
  signed-upload path has not been exercised.

## Next

1. Apply migrations 004–007 and create the private `sources` bucket.
2. Deploy once with `RAWI_AI_MODE=fixture` and drive the real Worker.
3. Wire live concept extraction, then run `npm run eval:live`.
