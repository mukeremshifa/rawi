# Design

**Target:** minimalist, spacious, editorial, calm. Reading-first. The screen
should look like a well-set page, not a dashboard.

Every ratio below was **computed**, not estimated, by
`node scripts/check-contrast.mjs` — which parses `src/client/styles/globals.css`
rather than carrying its own copy of the palette, so it cannot keep passing
after the palette has drifted away from it. Change a colour, re-run it, and
update the numbers here.

---

## The five rules

### 1. Neutrals are chroma 0

Every grey, in both themes, is achromatic. A grey tinted toward the accent
muddies the only colour allowed to mean anything. Carried from SynapseDeck
unchanged; nothing in the re-derivation argued against it.

### 2. One accent hue: OKLCH 255, a deep low-chroma blue-slate

SynapseDeck's yellow-green existed because "rating Easy is what the product
exists to produce" — the accent *was* the outcome. That argument does not
transfer, because **Rawi does not produce a rating**. What Rawi produces is a
reading surface you can think on for twenty minutes.

So the accent is a **mark** and a **focus ring**, the page itself carries no
colour at all, and the hue is the quietest one that still reads as a deliberate
choice rather than as grey. Blue-slate is also the hue that stays out of the way
of text — a warm accent beside a long paragraph competes with it.

### 3. `--primary` here IS a foreground, and that inverts the donor's rule

SynapseDeck's `--primary` was `oklch(.922 …)` — a near-white field, 1.21:1
against paper, that could never be ink. Its rule 2 said so explicitly.

Rawi's is `oklch(.45 .095 255)`: dark enough to be a link, an icon, or a focused
outline, and still able to carry white as a filled button (7.14:1). This is the
one structural change the hue change forces, and it is what lets the accent
appear as a small mark on a page that is otherwise ink on paper.

The consequence worth noting: **one `--ring` token serves both themes.** The
donor needed two, because a near-white accent cannot be a ring on white. Here
light and dark differ only in lightness.

### 4. The evidence ramp is two ramps, and that is not redundancy

A stop light enough for ink to sit on it (≥4.5:1) is too light to *be* a mark on
white paper (≥3:1). The two requirements barely overlap, and forcing one ramp to
serve both is how a "good" indicator dot ends up at 1.2:1 against the page.

- `--evidence-*` — the **field** ramp. A filled chip, a bar. Ink on top.
- `--evidence-*-mark` — the **ink-side** ramp. A dot, a rule, an icon.

Both climb in **lightness**, because value survives colour-blindness and hue
does not. The ramp is one hue plus a chroma-0 first stop, so the four states
separate by value alone.

The states are the product's, not a score: `not-checked` → `practicing` →
`independent-once` → `retained-on-review`. **There is deliberately no fifth stop
and no percentage anywhere near this ramp** (invariant 6).

### 5. Borders are two tokens

`--border` is decorative — a card hairline at 1.4:1, which is what a hairline
has to be to read as one. `--border-strong` is 3.17:1 and is what WCAG SC 1.4.11
actually governs: boundaries that carry information — a field outline, a
selected state, a focused control.

Using `--border` where meaning lives is the bug. Using `--border-strong` for
decoration makes the app look like a spreadsheet.

---

## The computed ratios

### Light theme

| Pair | Ratio | Min | Where |
| --- | ---: | ---: | --- |
| `foreground` on `background` | 19.41 | 4.5 | body text on the page |
| `muted-foreground` on `background` | 5.51 | 4.5 | secondary text on the page |
| `muted-foreground` on `muted` | 4.98 | 4.5 | secondary text on a muted fill |
| `card-foreground` on `card` | 19.41 | 4.5 | text on a card |
| `popover-foreground` on `popover` | 19.41 | 4.5 | text in a popover |
| `primary-foreground` on `primary` | 7.14 | 4.5 | label on the brand field |
| `secondary-foreground` on `secondary` | 17.54 | 4.5 | label on a secondary button |
| `accent-foreground` on `accent` | 17.54 | 4.5 | label on a hover surface |
| `destructive-foreground` on `destructive` | 5.17 | 4.5 | label on a destructive button |
| `border-strong` on `background` | 3.17 | 3.0 | a meaningful boundary |
| `input` on `background` | 3.17 | 3.0 | a field outline |
| `ring` on `background` | 7.46 | 3.0 | the focus ring |
| `evidence-ink` on `evidence-none` | 15.79 | 4.5 | ink on the not-checked field |
| `evidence-ink` on `evidence-practicing` | 16.54 | 4.5 | ink on the practicing field |
| `evidence-ink` on `evidence-independent` | 17.22 | 4.5 | ink on the independent field |
| `evidence-ink` on `evidence-retained` | 17.85 | 4.5 | ink on the retained field |
| `evidence-none-mark` on `background` | 7.44 | 3.0 | the not-checked dot |
| `evidence-practicing-mark` on `background` | 5.50 | 3.0 | the practicing dot |
| `evidence-independent-mark` on `background` | 4.11 | 3.0 | the independent dot |
| `evidence-retained-mark` on `background` | 3.11 | 3.0 | the retained dot |

`evidence-retained-mark` at 3.11 is the tightest pair in the palette. That is a
consequence of rule 4: the mark ramp has to climb *and* stay above 3:1 on white,
so the top stop sits near the floor by construction. It is the number to watch
if the ramp is ever re-pitched.

### Dark theme

| Pair | Ratio | Min | Where |
| --- | ---: | ---: | --- |
| `foreground` on `background` | 19.08 | 4.5 | body text on the page |
| `muted-foreground` on `background` | 8.00 | 4.5 | secondary text on the page |
| `muted-foreground` on `muted` | 5.87 | 4.5 | secondary text on a muted fill |
| `card-foreground` on `card` | 16.91 | 4.5 | text on a card |
| `primary-foreground` on `primary` | 7.83 | 4.5 | label on the brand field |
| `destructive-foreground` on `destructive` | 5.72 | 4.5 | label on a destructive button |
| `border-strong` on `background` | 3.91 | 3.0 | a meaningful boundary |
| `border-strong` on `card` | 3.47 | 3.0 | a boundary against a card |
| `ring` on `background` | 8.15 | 3.0 | the focus ring |
| `ring` on `card` | 7.23 | 3.0 | the focus ring on a card |
| `evidence-ink` on `evidence-none` | 10.39 | 4.5 | ink on the not-checked field |
| `evidence-ink` on `evidence-retained` | 15.88 | 4.5 | ink on the retained field |
| `evidence-none-mark` on `background` | 5.12 | 3.0 | the not-checked dot |
| `evidence-practicing-mark` on `background` | 6.51 | 3.0 | the practicing dot |
| `evidence-independent-mark` on `background` | 8.16 | 3.0 | the independent dot |
| `evidence-retained-mark` on `background` | 10.84 | 3.0 | the retained dot |

### Ramp monotonicity

| Theme | Role | L values | Steps |
| --- | --- | --- | --- |
| light | field | 0.93 → 0.945 → 0.96 → 0.975 | 0.015 each |
| light | mark | 0.45 → 0.52 → 0.59 → 0.66 | 0.070 each |
| dark | field | 0.80 → 0.85 → 0.90 → 0.94 | 0.050, 0.050, 0.040 |
| dark | mark | 0.60 → 0.66 → 0.72 → 0.80 | 0.060, 0.060, 0.080 |

Both ramps climb in both themes.

### Surface separation (dark only)

| Surfaces | Ratio | Min |
| --- | ---: | ---: |
| `card` / `background` | 1.128 | 1.10 |
| `muted` / `card` | 1.208 | 1.10 |
| `popover` / `background` | 1.128 | 1.10 |

**Dark theme only, and that is not an oversight.** Light theme separates a card
from the page with a hairline, not a fill — `--card` is pure white on white
paper, which is 1.00 and is *correct*. A light theme that tints its cards grey
to prove they are cards is the thing this palette deliberately does not do.

1.10 is a **drift alarm**, not an accessibility gate: surface separation is not
a WCAG criterion, and the bar is set just tight enough to catch a ramp
collapsing back to flat.

---

## Typography

Three faces, one job each.

- **sans — Inter.** Everything. The default, and the answer unless one of the
  two below applies.
- **serif — Source Serif 4.** The name of the thing you are looking at, once per
  screen, owned by `PageHeader`. **A text serif with a real 400 weight, not a
  display face** — this is the re-pick from the donor. SynapseDeck used DM Serif
  Display, which is correct for a card front you read in two seconds and wrong
  for Rawi, where a serif heading sits above a paragraph you will read properly.
  A display serif set at paragraph weight looks starved.
- **mono — JetBrains Mono.** A value you might compare, count or type: a date, a
  count, an id, an email. Always `tabular-nums`. Decoration is not the point.

**Self-hosted, all of them.** The page renders untrusted model output and
untrusted source text; it should not also be making a request to a font CDN on
every load.

## Spacing and density

Named by role, not size, because "gutter" survives a redesign and "space-6" does
not: `hairline` 4 / `tight` 8 / `snug` 12 / `base` 16 / `gutter` 24 /
`section` 40 / `page` 64.

**Rawi sits at the generous end.** A screen reaches for `section` and `page`
where SynapseDeck's three-pane working shell reached for `gutter`. The teaching
surface is a **single reading column** (`.ui-reading`, 38rem — about 70
characters at the base size), with sources and evidence *available* rather than
always present.

## Motion

`instant` 120ms (a state the user just caused) / `quick` 180ms (something
appearing in place) / `moving` 260ms (something that travels). Exits are faster
than entrances: a UI that lingers on the way out feels slow.

`prefers-reduced-motion` is honoured with a `*` match, so an opted-out user gets
every end state instantly. That is correct rather than a compromise — all of the
motion here is decoration on top of a state change that happens either way.

Written as keyframes in `globals.css` rather than pulled in as
`tailwindcss-animate`, so the durations are the tokens above rather than a
plugin's own scale.

## Elevation

Four steps, and a rule: **elevation means distance from the page, not
importance.** A card is not raised because it matters; it is raised because it
floats. Shadows are achromatic. On dark, depth comes from the surface steps
instead — shadows barely read on a dark ground — which is what the surface
separation check protects.

## The standing rules

- **Four states on every screen.** Loading (skeleton, never a spinner), Empty
  (says what to do next), Error (always carries a retry), Generating (breathes,
  not sweeps). A skeleton implies the answer exists and is in transit;
  generation implies it is being made and might fail partway.
- **What you are looking at lives in the URL**, not in local state.
- **One subject per screen. One serif heading.**
- **Tabs are not navigation.** If switching changes *what* you see, it is a
  route. The five workspace areas are routes for exactly this reason.
- **Nothing on screen is a lie.** Unknown renders as unknown: an em dash for a
  concept never attempted, a breathing bar for a job whose size is unknown, a
  sentence for a source still being counted. Never a zero standing in for an
  absent measurement.
