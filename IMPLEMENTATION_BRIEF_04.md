# Rawi frontend: Microsoft Foundry design adoption

Prepared 27 September 2026. This is the implementation handoff for the next frontend build.

## 1. Assignment and design direction

Redesign the existing Rawi frontend using the current Microsoft Foundry portal as a visual and structural reference. Deliver a polished learning workspace with substantially more breathing room than both Foundry and the current Rawi interface.

The owner specifically wants:

- Foundry's coherent shell, clear context, restrained surfaces, precise controls, and considered content hierarchy.
- A super spacious Rawi, including inside cards, lists, forms, and study workspaces.
- Removal of the current decorative layout dividers and colored left border accents.
- A reusable frontend foundation that can accommodate future enterprise SaaS features.

The desired impression is calm, capable, and precise. Preserve Rawi's identity as an AI tutor and mentor. Use typography, alignment, whitespace, and surface contrast to establish hierarchy. Avoid making every piece of information a bordered card.

Read `AGENTS.md`, `README.md`, and the relevant current code before implementation. This brief replaces earlier visual direction where it conflicts. Earlier briefs describe historical checkpoints and must not override current working behavior. In particular, the current app includes a local API and real Vertex AI integration. Preserve it. Do not revert to scripted AI.

This build covers presentation, navigation composition, shared components, and responsive behavior across existing routes. Preserve existing data, URLs, course scoping, planner logic, saved work, and AI behavior. Use local data for any new illustrative UI. Adding accounts, billing, organizations, deployment, or a new backend is outside this build.

## 2. Reference and interpretation

Use the **current Microsoft Foundry portal**, rather than combining unrelated Azure portal and classic Foundry screenshots. Microsoft documents top-level sections with contextual left navigation and project context in the shell. Adapt that separation to Rawi's existing global and course scopes. [Microsoft's navigation reference](https://learn.microsoft.com/en-us/azure/foundry/how-to/navigate-from-classic#navigate-the-portal)

The [official Foundry home screenshot](https://learn.microsoft.com/en-us/azure/foundry/media/navigate-from-classic/foundry-home.png) is the primary shell reference: a neutral surrounding surface, a clear top navigation row, a prominent sans-serif heading, and contained content surfaces. The red annotation box is documentation markup and is not part of the design.

Use Fluent 2 as supporting guidance for the component language. It describes role-based tokens, a consistent spacing system, controlled corner radii, and elevation that communicates layering. These are reference principles. They do not establish which implementation library Foundry uses. [Tokens](https://fluent2.microsoft.design/design-tokens), [layout](https://fluent2.microsoft.design/layout), [shapes](https://fluent2.microsoft.design/shapes), [elevation](https://fluent2.microsoft.design/elevation)

| Reference concept | Rawi adoption |
| --- | --- |
| Global navigation plus contextual navigation | Global top bar plus course sidebar |
| Project context | Existing course switcher and course-aware breadcrumbs |
| Neutral surfaces with controlled emphasis | Soft neutral canvas, clear panels, restrained Rawi blue |
| Consistent component geometry | A small radius scale and deliberate control sizing |
| Task-oriented content hierarchy | Page title, purpose, primary action, then grouped work |
| Compact operational interfaces | Increase spacing and readable type throughout Rawi |

Keep Microsoft product names, branding, infrastructure terminology, and dense console layouts out of Rawi. The measurements below are Rawi design decisions, not claims about Foundry's exact values.

## 3. New application shell

### Global navigation

On a wide desktop, use a 72px top bar containing the Rawi logo, the existing course switcher, the four global destinations, and the theme control. Give the elements space rather than filling the bar with additional utilities.

- Destinations remain **Home**, **Courses**, **Planner**, and **Progress & history**, with the existing URLs.
- Course routes keep **Courses** active at the global level. The contextual sidebar indicates the precise course area.
- Label the switcher **All courses** on global pages and show the active course on course pages. Retain the existing way to resume the last course without making global pages appear course-filtered.
- Active items use a subtle filled background and stronger text. Do not add vertical accent strips or long rules below navigation.
- Do not add nonfunctional search, notification, profile, organization, or billing controls merely to resemble enterprise software.

Global pages use the full main canvas without an otherwise redundant sidebar. Inside a course, show a 256px contextual sidebar with Overview, Syllabus & topics, Materials, Tutor, Practice, Exams, Progress, and the existing Course settings destination. Use quiet group labels and spacing if grouping helps. Avoid repeating the full course name in several adjacent places.

Remove the current deadline card from persistent navigation. Keep deadlines clearly available in Home, course Overview, Planner, and Exams. The navigation should explain location and scope.

Use background differences and a 24 to 32px gap to distinguish the sidebar from the content. Remove the continuous header bottom rule and sidebar right rule. Avoid wrapping the entire application in a large outlined container.

### Responsive shell

- At approximately 1200px and above, show the full top navigation. Tune the exact transition based on actual content fit.
- Below that width, put global navigation and contextual navigation into one accessible navigation sheet, separated by headings and whitespace. Keep current location and course context visible in the compact header.
- At phone widths, use a 64px header, 20px page gutters, wrapping page actions, and one content column. Give the course name an intentional truncation treatment and expose the full name accessibly.
- Do not reuse the current 768px `MEDIA_WIDE` breakpoint for every decision. Shell navigation, seven-day calendars, and two-pane study views have different minimum widths.
- Preserve keyboard navigation, active-route semantics, sheet focus management, and closing the sheet on navigation. Mount only one navigation version.
- Retain one primary page scroll owner. Explicit conversation and source panes can scroll independently when that serves the workflow. Avoid accidental nested page scrolling.
- Audit standalone `/welcome` and not-found pages as well. They sit outside `AppShell`, so they need their own working viewport and scrolling treatment.

## 4. Visual system and measurable spacing

### Surfaces, borders, and color

Start the light theme with a soft neutral canvas around `#F5F6F8`, white content surfaces, near-black text, and a muted blue brand accent related to Rawi's existing blue. Start the dark theme with a charcoal canvas around `#14161A` and surfaces around `#1D2026`. Final colors must be checked together for contrast.

Define semantic tokens for canvas, navigation, surface, inset surface, overlay, text, muted text, subtle border, control border, focus, and interactive states. Distinguish selected, hover, pressed, disabled, error, and success states in both themes. Avoid a single generic accent fill doing every job.

Use quiet full-perimeter borders only where they clarify an actual control or container. A panel may separate through its fill alone. Small shadows belong chiefly to overlays and lightly elevated surfaces. Do not apply an outline and shadow to every object by default.

Remove colored left borders from course cards, planned sessions, history entries, suggestions, alerts, and any other first-party decorative treatment. Course identity becomes a small dot or icon tile alongside a visible name, with a restrained tinted chip where useful. Selection uses a fill and text or icon state. Status uses a label and icon. Color must never carry meaning alone.

Remove routine section rules, metadata separators, and panel edge dividers. Retain a line only when it has a concrete information or interaction purpose, such as a calendar time boundary, a necessary table header boundary, or a draggable resize handle. Keep useful focus indicators and input outlines. Replace rules deliberately, not with a global CSS override that hides all borders.

### Geometry and rhythm

| Element | Implementation target |
| --- | --- |
| Page padding on desktop | 48px horizontal, 56 to 64px vertical |
| Page padding on tablet | 32px horizontal, 40px vertical |
| Page padding on phone | 20px horizontal, 32px vertical |
| Gap between major sections | 56 to 64px desktop, 40px phone |
| Card and panel padding | 32px desktop, 24px phone |
| Gap between peer cards | 24 to 32px, replacing common 8px gaps |
| Section heading to content | 24px |
| Field groups | 24 to 32px between fields, 8px label to control |
| Standard control height | 44 to 48px |
| Navigation items | Minimum 44px high, 8px between items |
| Informational list rows | Usually at least 72px, expandable for wrapped content |
| Controls and navigation radius | 6 to 8px |
| Content panel radius | 12px |
| Dialog and sheet radius | 12 to 16px on exposed corners |
| Border weight | Usually 1px, stronger only for meaningful interaction states |

These targets deliberately expand the current 24px page gutters, 12px row padding, and common 8px card gaps. Apply them through semantic tokens and component variants. Keep small internal gaps between an icon and its label. Do not enlarge every spacing token indiscriminately.

Use a maximum dashboard content width around 1360px, excluding page gutters, with two substantial columns as the default. Permit a third catalog column only when each card has comfortable width, around 320px or more. A global Home page may use a two-thirds main column and one-third supporting column when the available content width supports it.

For reading and tutoring, keep text around 65 to 75 characters per line. Let the surrounding workspace grow while the text measure remains comfortable. Forms should have a readable field column around 640 to 720px. Planner and operational lists may use wider available space.

Spaciousness is also a content decision. Reduce simultaneously competing blocks, place secondary details behind useful disclosures, and let pages scroll naturally. Do not create a giant empty hero above the user's work. At a 1440 by 900 viewport, the title, primary action, and at least one meaningful work item should be visible without scrolling when content exists.

### Typography and controls

Use the existing self-hosted Inter as the primary UI typeface, including page titles. Target 32 to 36px page titles, 20 to 24px section headings, 16px primary body text, and 14px supporting text. Reserve 12px for genuinely minor metadata. Use generous body line height, around 1.6, and around 1.75 for long reading passages.

Retain Source Serif only where it improves source reading or the Rawi wordmark. Remove the current rule that page titles must use serif. Use tabular numerals for timers and comparative numbers, with monospace reserved for cases that actually benefit from it.

Standardize buttons, fields, selects, tabs, menus, dialogs, sheets, chips, empty states, loading states, and feedback together. Page actions should wrap cleanly. Give each page one visually dominant action and a quieter secondary group. Avoid long strings of equally prominent outlined buttons.

Retain subtle motion and reduced-motion support. Do not add decorative animation or large gradients to manufacture polish.

## 5. Page and workflow adoption

| Area | Required treatment |
| --- | --- |
| Home | Clear Today header, today's work or a resume action first, then suggestions. Place upcoming assessments in a supporting column where space allows. Show fewer equally weighted suggestions initially, with an explicit way to see all. Put lengthy ranking explanations behind a labeled disclosure while retaining each suggestion's reason. Keep courses and recent activity below the primary work. |
| Courses | Spacious catalog cards with a course name, goal, concise status, and clear open action. Remove all left stripes. Preserve create, archive, restore, and reset behavior and their existing safeguards. |
| Course Overview | Course title and purpose, a restrained summary group, the next useful action, then suggested work, check-in, topics, and history. Avoid a wall of equal-sized statistic and suggestion cards. |
| Syllabus & topics | Clear stages for entering, reviewing, and confirming an outline. Spacious topic rows and readable hierarchy. Preserve review before topics are created and all import limitations. |
| Materials | Consistent collection toolbar and comfortable list or grid. Reader uses a quiet text column, spacious headings, and clear source actions. Preserve passage selection, notes, citation targets, and tutor/practice handoffs. |
| Tutor | A clear session header, generous conversation measure, distinguishable message roles, and a comfortable composer. Present context and sources in a separate surface with a gap, without the current vertical border. Open context in a drawer when two panes would squeeze the conversation. Keep stop, retry, citations, provenance, incomplete replies, and unavailable states visible. |
| Practice | One consistent collection, setup, saved-set, run, and result language. Give questions and answer controls room. Keep question formats, drafts, resumability, repeat attempts, and pending or failed written feedback intact. |
| Exams | Distinguish assessment dates from rehearsal configurations. Use a quiet, focused run workspace with a visible timer and accessible question navigator. Reduce surrounding visual noise without hiding exit or navigation behavior. Never expose marking or feedback before whole-paper submission. |
| Planner | Use the wider global canvas. Give day columns and session blocks real padding. Replace event stripes with course name and dot or chip. Keep week and day-by-day views. At widths where seven columns become cramped, favor the day view while retaining access to Week in a contained horizontal scroller. Preserve plan review, unscheduled explanations, constraints, and manual editing. |
| Progress & history | Readable evidence groups and comfortable chronological rows. Keep course, date, status, and outcome aligned. Remove left stripes and routine metadata rules. Maintain access to the attempts behind every indicator. |
| Forms, settings, welcome, recovery, and 404 | Apply the same typography, field rhythm, action hierarchy, surfaces, and states. Complete long-form and small-screen scrolling. Do not leave auxiliary pages in the previous visual language. |

Treat data-heavy layouts as a distinct page pattern. Tables can retain meaningful row structure, but should not make 12px text and compressed controls the product default. Never truncate essential reasons, course names, or error details without a usable way to read them.

## 6. Shared architecture and dependency decision

Default to the current React, Tailwind, Radix, Lucide, and resizable-panel stack. It already provides accessible primitives and editable wrappers. Recreating Foundry's appearance does not require adopting its component implementation.

Keep one component language. Do not mix stock Fluent controls with differently styled Radix controls. Adding a dependency is authorized when it solves a concrete gap, but a wholesale Fluent migration is not the default recommendation. If a replacement is demonstrably needed, check its current React compatibility, styling model, accessibility, and bundle cost first. Keep it behind Rawi-owned wrappers and migrate the affected family consistently.

The principal tradeoff is deliberate custom theming in exchange for preserving mature interactions and avoiding a second styling system. Spend the effort on Rawi's layouts and density instead of replacing working infrastructure.

Build on existing shared components. Introduce only the abstractions used by this migration:

- Shell composition with global navigation, contextual navigation, and a course context slot.
- Page templates for overview, collection, form, reading, and active study workspaces.
- A small set of shared surfaces, collection toolbars, content rows, status treatments, and empty/error/loading states.
- Semantic spacing, width, color, type, radius, and elevation tokens with appropriate responsive values.

Keep route definitions, navigation metadata, and page presentation separate enough that a future feature can join a navigation group and use a page template. Keep URLs as the authority for course scope. Do not introduce a module framework, permissions engine, tenant store, or speculative plugin system.

Future organization, administration, billing, and team features should have a clear place in the shell composition when they exist. Reserve that flexibility in component structure without rendering empty destinations or fake account controls today.

### File map

| Starting point | Work |
| --- | --- |
| `src/client/styles/globals.css` | Semantic tokens, responsive rhythm, typography, surfaces, and removal of obsolete design-rule comments |
| `src/client/features/shell/AppShell.tsx` | Global top bar, contextual course navigation, responsive sheet, current-context treatment |
| `src/client/components/layout.tsx` | Page templates and widths, header hierarchy, wrapping toolbars, border-free rails and pane spacing |
| `src/client/components/ui/` | Consistent primitives, especially card, button, input, textarea, select, tabs, dialog, sheet, table, and resizable handles |
| `src/client/components/domain.tsx` | Course identity and status treatments, including existing accent-border mappings |
| `src/client/components/states.tsx`, `Prose.tsx`, `Meter.tsx`, `ThemeToggle.tsx`, `Logo.tsx` | State presentation, reading, evidence, and shared visual consistency |
| `src/client/features/` | Migrate all existing page families, including ad hoc cards and rows that bypass shared primitives |
| `src/client/routes.tsx` | Preserve routes and course scope, integrate layout changes only as necessary |

Audit `border-l-4`, `borderLeftColor`, accent border mappings, shell borders, `Separator`, `divide-*`, fixed toolbar heights, `text-xs`, and tightly spaced ad hoc cards. These searches identify review candidates, not instructions for blind replacement. Existing left stripes occur in Home, Courses, Planner, History, and domain mappings. Tutor and exam side panels also carry structural left borders.

## 7. Execution sequence

1. Capture representative baseline views with the current local data. Inspect Home, course Overview, Planner, Materials, Tutor, Practice, and Exams. Record existing behavior and any unrelated working-tree changes.
2. Establish the token system, shared primitives, and shell. Rebuild Home and course Overview as the reference implementation. Check them in both themes and at desktop and phone widths, then continue without adding a new approval gate.
3. Migrate collections, forms, syllabus, settings, progress, and history using the shared page patterns. Replace all decorative course stripes and routine dividers.
4. Migrate reading, tutoring, practice, and exam workspaces. Resolve responsive pane widths, scroll ownership, sticky controls, and long content explicitly.
5. Finish Planner, standalone pages, and all supporting states. Review every route for remnants of the old visual language.
6. Run the existing build and inspect affected behavior in the dev server. Fix observed regressions, document only material limitations, and commit coherent changes without including unrelated work.

Keep `npm install` and `npm run dev` working. Do not add tests, CI, environment setup, new approval gates, or deployment work. Keep documentation minimal. Follow the punctuation rules in `AGENTS.md`, including its explicit exceptions, when editing first-party prose.

## 8. Acceptance and handoff

The implementation is complete when all existing screen families visibly share the new design, rather than only the shell or landing page changing.

Validate manually in the dev server:

- Review 1440 by 900, 1280 by 800, approximately 1024px and 768px widths, and a 390px phone width. Check representative screens in light and dark themes and at 200 percent zoom.
- Verify the proposed gutters, card padding, section gaps, and control heights. Compare the same content before and after. Ordinary content should look visibly more spacious without pushing all useful work below the fold.
- Confirm there are no decorative left accent strips, continuous shell dividing rules, or card grids separated by tiny gaps. Functional borders, focus rings, and information-bearing calendar lines remain available.
- Check long course names, long questions, empty collections, many records, errors, loading, disabled actions, and wrapped action groups. No horizontal page overflow, clipped controls, or inaccessible content.
- Check keyboard traversal, visible focus, selected states, accessible control names, drawer/dialog focus return, reduced motion, and readable contrast. Aim for WCAG AA text contrast and adequate non-text contrast for controls and focus indicators.
- Open existing deep links, switch courses, use browser back and forward, and reload saved work. Confirm current context and selected navigation stay correct.
- Exercise a material-to-tutor handoff, a saved practice set and resume path, exam navigation and submission behavior, planner proposal review and editing, and a progress-to-attempt link using disposable local records where a workflow writes data. Preserve existing user records and do not reset the workspace.
- Verify the existing AI unavailable state without credentials. Where configured and appropriate, verify streaming, stop/retry, citations, and pending feedback. Do not trigger model requests simply by opening redesigned screens. Clearly report any live AI path that was not exercised.
- Run `npm run build`. Report the actual screens, viewports, themes, and workflows checked, with representative before/after screenshots and remaining limitations. Do not claim full behavioral coverage from visual inspection alone.

Research for this brief included the repository README, routes, shared layout and design tokens, shell, relevant feature code, Microsoft's current portal documentation, and Fluent 2 guidance. Home, course Overview, and Planner were visually inspected on the running local frontend in its existing dark theme at 1280 by 720. This was a design audit, not a full interaction or regression check. The separate official Foundry screenshot was also visually inspected. No frontend implementation is included in this planning handoff.
