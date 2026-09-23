# Rawi desktop direction: inspired by Microsoft Foundry

Status: proposed implementation brief for owner review. This session researched and planned the change. It did not implement the redesign. Research date: 23 September 2026.

## Intent

Give Rawi a composed desktop workspace with clear navigation, quieter surfaces, compact collection views, and a prominent next study action. Take inspiration from the newer Microsoft Foundry product portal. Keep Rawi's identity, existing fonts, student language, and learning behavior.

The central tradeoff is density versus reading comfort. Make navigation and management views compact. Keep readings, tutor responses, questions, and answer areas spacious.

## Evidence and current state

Exa research covered two angles: Foundry portal structure and Fluent layout guidance. Primary references:

- [Foundry navigation reference](https://learn.microsoft.com/en-us/azure/foundry/how-to/navigate-from-classic): the newer portal separates top-level sections from contextual left navigation. The classic portal uses one main left pane.
- [Microsoft's illustrated Foundry exercise](https://microsoftlearning.github.io/mslearn-ai-fundamentals/Instructions/Exercises/00-explore-foundry.html): visual references for project switching, a prominent home action, quiet navigation, page tabs, and divided working areas. Its screenshots are reference snapshots, not a guarantee of the current authenticated portal.
- [Build screenshot](https://microsoftlearning.github.io/mslearn-ai-fundamentals/Instructions/Exercises/media/build_page.png) and [playground screenshot](https://microsoftlearning.github.io/mslearn-ai-fundamentals/Instructions/Exercises/media/model-playground.png): shared neutral frame, distinct content surface, compact controls, contextual working panes.
- [Fluent layout guidance](https://fluent2.microsoft.design/layout): a flexible four-pixel spacing system and content-dependent grids. This supports compact controls alongside readable content.

The recommendations below are adaptations for Rawi. Dimensions and colors are proposed Rawi values, not measured Foundry specifications.

Read README, existing briefs, shared tokens and layouts, shell, routes, and representative feature code. Inspected Home, course Overview, Tutor home, an existing Tutor session, and Materials on the running dev server at a 1440 by 960 CSS viewport in the existing system-selected dark theme. Viewed Microsoft's Home, Build, and playground screenshots. No study answers were submitted and no demo data was reset. Other viewport sizes and light mode still need implementation validation.

Rawi already has a 56px header, 240px rail, semantic tokens, local fonts, and useful layout primitives. Current Home and Overview give many recommendations similarly large cards. Course context appears repeatedly in the rail, while global navigation and course tools share that rail. Materials uses spacious cards for records with comparable metadata. Light canvas and card colors are both white in the token definitions.

The same 768px media query activates the desktop navigation and tutor context panel. At 1024px, the rail and 320px context panel consume 560px before transcript padding. These regions need separate responsive thresholds.

## Design decisions

| Area | Proposed direction |
| --- | --- |
| Fonts | Preserve Inter Variable for UI, Source Serif 4 Variable for existing title roles, and JetBrains Mono Variable for numeric metadata. Keep the logo. No Segoe substitution or font dependency changes. |
| Desktop frame | Keep a 56px header. Place the course switcher next to the logo. Move Home, Courses, Planner, and Progress & history into the top navigation. Retain the theme control. |
| Course navigation | Show a 224px course rail only on course routes. Preserve all seven existing destinations and their labels. Group Overview separately, Syllabus & topics and Materials under Prepare, Tutor, Practice and Exams under Study, and Progress under Review. Group labels do not navigate. |
| Global pages | Use the full canvas without an empty course rail. The switcher says All courses. Keep the existing return-to-course action when applicable. Global Planner and history always remain cross-course views. |
| Surface hierarchy | Use a neutral shell, slightly contrasting canvas, and solid content surfaces. In light mode start around #f3f3f3 for the shell and #ffffff for content. In dark mode use distinct charcoal surfaces instead of one near-black field. Verify final contrast in both themes. |
| Accent | Keep Rawi's existing blue as the primary accent. Use a restrained tinted active background and a narrow blue marker or underline. Retain course accents and semantic status colors with text labels. |
| Shape and elevation | Use 6px control radii and 8px panel radii as starting values. Favor surface separation and fine borders. Reserve pronounced shadows for overlays. |
| Density | Use 24px page padding, 24px between major workspace sections, 16px inside compact panels, 36px desktop navigation rows, and 32px to 36px desktop buttons. Let rows grow for wrapped content. Do not reduce global reading spacing tokens indiscriminately. |
| Typography | Keep page titles approximately 28px to 30px, UI labels 14px, and secondary metadata at least 12px. Preserve 16px to 18px teaching text and the existing approximately 38rem reading measure. |
| Actions | Align page actions with the title. Give the main action visual priority. Use real existing local controls. Do not add decorative search, account, notification, or AI buttons. |

Desktop course structure:

```text
Rawi  [Course switcher]        Home  Courses  Planner  Progress & history  Theme
Course rail | Page title                                      Primary action
            | Existing tabs or local filters when needed
            | Main content                     Optional supporting context
```

All course routes belong to Courses in top-level navigation. Highlight exactly one destination within the course rail. Overview must only match the course root. Mark global section and local page context with appropriate accessible semantics. Switching courses opens the selected course Overview, preserving the current switcher's behavior. Keep full course names accessible when visually truncated.

Start desktop header navigation at 1024px. Below that, retain the single mounted navigation sheet with both global and course links. Enable simultaneous main and right context panes at 1280px, with context at 288px to 320px. Below that, use the existing context sheet or equivalent accessible toggle. Ordinary global and course pages scroll in shell main. Tutor keeps its purposeful internal scrollers and visible composer. Planner may retain its local horizontal calendar scroll.

## Page patterns

| Pattern | Changes and scope |
| --- | --- |
| Home | Use a dominant main column and approximately 320px supporting column where space permits. Give the first existing ranked recommendation a prominent Continue or Start action. Show other recommendations as concise rows with their reasons. Place upcoming assessments and course shortcuts alongside the main work. Keep all suggestions and recent activity accessible. Put the lengthy ranking explanation behind a labeled explanation control. Do not change ranking logic. |
| Course Overview | Keep course title and description. Use a compact status strip, one prominent next action, and remaining suggestions as rows. Place check-in alongside recommendations at wide sizes. Preserve topics, recent work, and reasons behind every recommendation. |
| Collections | Start with Materials: title and Add material action, existing search and type filters, then a desktop table with Title, Type, Topics, Passages, and Updated. Use actual stored metadata. Keep titles as links and avoid invented bulk actions or sorting controls. At narrow widths use stacked records. Courses can retain compact cards because their summaries are richer. Apply the collection pattern to saved practice and exam configurations where appropriate. |
| Tutor | Preserve the existing conversation, stage model, source context, composer, and authored responses. Restyle the session toolbar and panel boundaries. Keep context collapsible and the transcript readable. Avoid nesting a tiny passage scroller inside a second context scroller when one context scroll region suffices. |
| Reading, practice, exams | Apply consistent headers and surrounding surfaces. Retain readable text widths, source anchors, question flow, answer controls, timer visibility, and distraction-light exam behavior. A dense table treatment does not apply to learning content. |
| Planner, history, progress | Use the available workspace width and consistent action bars. Preserve planner week/list behavior, filters, evidence explanations, attempt links, and deliberate calendar scrolling. |

At very wide sizes, dashboards may cap around 1440px for scanability. Collection and planning surfaces may stretch further when useful. Keep forms near their existing 576px maximum and teaching content near its reading measure.

## Implementation sequence

1. Establish the shared frame and tokens in `src/client/features/shell/AppShell.tsx`, `src/client/components/layout.tsx`, and `src/client/styles/globals.css`. Add explicit workspace density and surface roles without compressing every shared component. Reuse the current Radix, Tailwind, Lucide, and resizable-panel stack. A Fluent UI package migration is unnecessary for this visual direction.
2. Build the first representative slice: `HomePage.tsx`, `OverviewPage.tsx`, `MaterialsPage.tsx`, and `TutorSessionPage.tsx`. Adjust shared `card.tsx`, `button.tsx`, `tabs.tsx`, and `table.tsx` only where the new patterns require it. Capture the result in light and dark themes for design review.
3. Apply the established patterns to remaining pages. Keep changes to stateful learning runners focused on layout and styling. Check the narrower desktop breakpoints before treating the pattern as reusable.
4. Finish the manual behavior checks below and commit coherent changes. Report the actual screens and sizes checked and any remaining limitations.

The first slice should demonstrate the complete visual direction across a dashboard, a collection, and a study workspace. That gives the owner a useful review point before the rest of the pages are refined. It does not require a new approval mechanism in the app.

## Preservation requirements

Read `AGENTS.md`, `README.md`, and `IMPLEMENTATION_BRIEF_03.md` before implementation. This brief proposes replacement visual layout choices only. Preserve the prior behavioral corrections and current routes, course ownership, deep links, local data, migrations, saved set identities, attempt histories, planner completion linkage, exam timing, answer persistence, and submission rules.

Keep simulated AI and fictional-content disclosures visible and accurate. Do not change recommendation eligibility, planner rules, or marking. Do not reset browser storage. No backend, model API, deployment, new infrastructure, automated tests, CI, or environment setup. Preserve `npm install` and `npm run dev`.

Follow the punctuation policy in AGENTS.md for new and edited first-party prose. Preserve imported or user-entered text and the documented exceptions. Keep keyboard focus visible, controls labeled, and status information understandable without color. Use semantic tables for actual tabular data and real links for navigation. Keep mobile navigation mounted only once.

## Manual acceptance checks for the implementation agent

- Inspect 1440 by 900, 1280 by 800, 1024 by 768, and a 390px-wide mobile viewport. Verify long course titles, wrapped actions, and both themes. Preserve the saved theme preference after inspection.
- Confirm global navigation, every course destination, switching courses, browser Back, and direct deep links. Confirm active highlighting is unambiguous and the switcher never silently filters global Planner or history.
- On Home, confirm a primary task and upcoming work are visible early, remaining suggestions remain accessible, and their destinations and ranking are unchanged.
- In Materials, verify existing search and type filters, opening a reading, and source-anchor navigation. Verify narrow-width record layout.
- In Tutor, resume an existing session, inspect source context and composer visibility, resize through the panel breakpoint, and check keyboard access to context. Verify no duplicate navigation landmarks or accidental body scrollbars.
- Check planner calendar/list navigation, a saved practice set and its resume path, and an exam's saved-answer and submission flow using disposable local work. Do not overwrite or submit the owner's existing unfinished attempts.
- Check empty states, a long content page, dialogs, visible focus, and readable text/control contrast. Run the normal build and inspect affected behavior in the dev server. Do not introduce a test framework.

Implementation handoff prompt: "Implement the proposed direction in IMPLEMENTATION_BRIEF_04.md. Preserve the existing fonts and all current learning behavior. Start with the shared desktop frame and representative pages, then carry the patterns through the remaining screens. Verify affected behavior in the dev server and report what you actually checked."
