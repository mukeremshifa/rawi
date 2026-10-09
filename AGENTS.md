# Working on Rawi

Read README.md and the relevant code. Rawi is one account-based full-stack app.
README.md lists the remaining work. Offline storage, device-storage UI, and
user-facing JSON recovery/export remain excluded.

- Keep development runnable with `npm install` and `npm run dev`.
- Use the designated development backend. Sample courses belong in an explicit
  development seed, never automatic app data or a fallback workspace.
- Keep changes focused and explain the main tradeoff. Avoid speculative infrastructure.
- Do not add tests, CI, environment setup, or approval gates unless requested.
- Check affected behavior in the dev server and report what was actually checked.
- Keep documentation minimal and commit coherent changes.

## Punctuation in first-party prose

Do not use em dashes or semicolons in text the product writes: labels, headings,
placeholders, descriptions, tooltips, validation, notifications, empty states,
generated planner explanations, sample course content, tutor scripts, feedback,
accessibility labels, and first-party documentation. Use a colon, a comma, a
period, or rephrase. Do not substitute a double hyphen or another long dash.

This is editorial, not mechanical. Keep punctuation that programming syntax,
entities, file formats and commands require. Do not rewrite imported user
material or anything the user typed. Review strings deliberately rather than
running a blind replacement over code or stored data.

Four places keep an em dash on purpose, so leave them alone:

- The source attributions under a question's extract, such as
  `- Valderrama, *Atlantic Crossings* (fictional)`. That is a citation
  convention rather than prose punctuation.
- The sample syllabus in `dev/fixtures/syllabus.md`. It stands in for a document
  somebody else wrote, and the syllabus reader has to cope with the punctuation
  real syllabuses use.
- The schedule-line matcher in `src/server/services/outline/rules.ts`, which must
  recognise an em dash in the documents students upload.
- The em-dash glyph used as an empty-value placeholder in a statistic.
