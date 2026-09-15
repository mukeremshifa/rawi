# Operations

Everything the owner does outside this repo, and exactly what to paste.

`.dev.vars.example` and `.env.example` mirror the tables below byte for byte.
Copy them, fill them in, and nothing here needs to be typed twice.

---

## 5.1 Server secrets

`.dev.vars` locally; `wrangler secret put <KEY>` in production. **Never in
`wrangler.jsonc`, never prefixed `VITE_`.**

| Key | Where it comes from | Notes |
| --- | --- | --- |
| `GOOGLE_CLOUD_PROJECT` | GCP project id | |
| `VERTEX_LOCATION` | `global` | Or a region; the client handles both hosts. |
| `VERTEX_MODEL` | `gemini-3.6-flash` | |
| `GOOGLE_SA_CLIENT_EMAIL` | `client_email` in the service-account JSON | `…@….iam.gserviceaccount.com` |
| `GOOGLE_SA_PRIVATE_KEY` | `private_key` in the service-account JSON | **Copy the value exactly as it appears in the JSON**, including the `\n` escape sequences and the `-----BEGIN PRIVATE KEY-----` header. Do not reformat it. |
| `SUPABASE_URL` | Supabase → Project Settings → API | |
| `SUPABASE_ANON_KEY` | same | Publishable. |
| `SUPABASE_SERVICE_ROLE_KEY` | same | **Server only.** Never in a `VITE_*` var, never in `wrangler.jsonc`. |
| `RAWI_AI_MONTHLY_CAP_USD` | your decision | Paid AI fails closed without it. |
| `RAWI_AI_USER_MONTHLY_CAP_USD` | your decision | Same. |
| `VERTEX_INPUT_USD_PER_MILLION` | Vertex pricing page | |
| `VERTEX_OUTPUT_USD_PER_MILLION` | Vertex pricing page | |

**Why the `\n`-escaped key form.** The downloaded service-account JSON already
stores the PEM as a single line with literal `\n` sequences, so you copy one
value with no reformatting — the step most likely to be got wrong.
`google-auth.ts` calls `.replace(/\\n/g, '\n')` before parsing.
`wrangler secret put` also accepts a genuine multi-line paste; both forms are
normalised on read, so either works.

**Why the prices are owner-set.** A price change at Google would otherwise
silently under-count every call in the ledger. Putting it in config makes a
price change a config edit rather than a quiet drift in what the caps mean.

## 5.2 Non-secret vars

`wrangler.jsonc` `vars`.

| Key | Default |
| --- | --- |
| `RAWI_AI_MODE` | `"fixture"` |
| `RAWI_INVITE_ONLY` | `"false"` |
| `RAWI_GOOGLE_OAUTH_ENABLED` | `"false"` |
| `RAWI_UPLOADS_ENABLED` | `"true"` |
| `RAWI_AI_TIMEOUT_MS` | `"20000"` |
| `RAWI_RETENTION_DAYS` | `"30"` |

## 5.3 Client vars

`.env`, read by Vite. **`VITE_*` only, and nothing secret may ever be prefixed
that way** — Vite inlines these into the browser bundle, and
`scripts/check-bundle-secrets.mjs` enforces it against `dist/`.

| Key | Notes |
| --- | --- |
| `VITE_SUPABASE_URL` | |
| `VITE_SUPABASE_ANON_KEY` | Publishable only. |
| `VITE_API_MODE` | `fake` \| `live`. Defaults to `fake`. |

---

## 5.4 External setup, in order

### 1. Google Cloud

1. Select or create a project. Note its id → `GOOGLE_CLOUD_PROJECT`.
2. Enable the **Vertex AI API** (`aiplatform.googleapis.com`).
3. Create a service account. Grant it **Vertex AI User**
   (`roles/aiplatform.user`) and nothing more.
4. Create a **JSON key** and download it.
5. Copy `client_email` → `GOOGLE_SA_CLIENT_EMAIL` and `private_key` →
   `GOOGLE_SA_PRIVATE_KEY` into `.dev.vars`. **Never commit the JSON file.**

### 2. Supabase

The project is already linked.

1. `supabase db push` — applies migrations 004–007. 001–003 are already applied
   and must not be modified.
2. Create a **private** storage bucket named `sources`.
3. Under **Authentication → Providers**, confirm the email (magic link) provider
   is on.
4. Under **Authentication → URL Configuration**, add the deployed origin and
   `http://localhost:5173` to the redirect allow-list. A magic link that
   redirects somewhere not on this list fails silently.

### 3. Cloudflare

1. `wrangler login`
2. Push every §5.1 key:
   ```bash
   wrangler secret put GOOGLE_CLOUD_PROJECT
   wrangler secret put VERTEX_LOCATION
   wrangler secret put VERTEX_MODEL
   wrangler secret put GOOGLE_SA_CLIENT_EMAIL
   wrangler secret put GOOGLE_SA_PRIVATE_KEY
   wrangler secret put SUPABASE_URL
   wrangler secret put SUPABASE_ANON_KEY
   wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   wrangler secret put RAWI_AI_MONTHLY_CAP_USD
   wrangler secret put RAWI_AI_USER_MONTHLY_CAP_USD
   wrangler secret put VERTEX_INPUT_USD_PER_MILLION
   wrangler secret put VERTEX_OUTPUT_USD_PER_MILLION
   ```

### 4. Turn AI on

Set `RAWI_AI_MODE` to `"live"` in `wrangler.jsonc` **once both caps are
present**. Until then the app runs entirely on fixtures and says so on the quota
surface — including *which* key is missing, so the fix is one line rather than a
source-reading exercise.

### 5. Deploy

```bash
npm run verify      # must be green
npm run deploy
```

---

## Verifying it worked

- `GET /api/health` returns `{ ok: true, mode: "live" }`.
- Sign in with a magic link. If the link opens and nothing happens, check the
  redirect allow-list (step 2.4).
- Add a source. The job should reach `succeeded` within a few polls. If it
  fails, the job row carries `error_code` and `error_message`.
- Ask a question. A grounded answer cites a passage; an ungrounded one says so
  rather than guessing.
- Check the quota surface. `mode: live`, and `unavailableReason` empty.

## When something is wrong

| Symptom | Almost certainly |
| --- | --- |
| Every AI call fails with "Vertex rejected the service account" | The private key was reformatted on paste, or the account lacks `roles/aiplatform.user`. |
| "The configured model is unavailable in this location" | `VERTEX_MODEL` or `VERTEX_LOCATION`. The host changes with the location — see `vertexEndpoint`. |
| The app says it is running on fixtures | `RAWI_AI_MODE` is not `live`, or a §5.1 key is missing. The quota surface names which. |
| The magic link does nothing | The origin is not in the Supabase redirect allow-list. |
| Uploads fail to prepare | The private `sources` bucket does not exist. |
| A job sits at `queued` | Nothing is polling it. The poll is what advances it. |

## Retention and deletion

`RAWI_RETENTION_DAYS` is the ceiling on how long ancillary data is kept.
Deleting a workspace cascades to its sources, chunks, concepts, sessions,
attempts and jobs — one row, and everything the learner put in goes with it.
See `docs/SAFETY.md`.
