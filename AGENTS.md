# Working on Rawi

Read README.md and the code relevant to the task. This is a local prototype
for an AI tutor and mentor; architecture and product behavior can evolve.

- Keep development runnable with `npm install` and `npm run dev`.
- Use dummy local data until the owner chooses a backend/deployment checkpoint.
- Keep changes focused and explain the main tradeoff. Avoid speculative infrastructure.
- Do not add tests, CI, environment setup, or approval gates unless requested.
- Check affected behavior in the dev server; report what was actually checked.
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
