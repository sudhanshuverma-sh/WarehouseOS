# WarehouseOS — Design System

**Audience:** anyone building or modifying UI in this repo.
**Status:** the system is fully applied to the navigation shell and the Diesel Procurement module. Everything else is pre-system. See [Rollout](#10-rollout).

---

## 0. What this product is

WarehouseOS is an internal operations tool. 200-300 people open it every working day — shift-floor POCs filing entries, and admins clearing approval queues.

That fact decides most arguments before they start:

- **Nobody is here to be impressed.** They're filing a diesel entry between two other tasks. The interface's job is to get out of the way.
- **It's used daily, for years.** Anything with personality gets seen ten thousand times. Restraint isn't timidity here, it's durability.
- **Mistakes have consequences.** An approval and a rejection are two clicks apart and one is hard to undo. Visual distinctions that carry meaning must be unambiguous.
- **Conditions are bad.** Cheap Android screens, glare, gloves, one-handed, 4G. Small type has to be legible, not merely small.

Reference points: Linear, Notion, Stripe Dashboard. Not marketing sites.

**The design has exactly one indulgence: the instrument dial (§7).** Everything else stays quiet so that it can land. If you're about to add a second flourish, remove it instead.

---

## 1. Color

### 1.1 Light mode (baseline)

```css
:root {
  /* Surfaces — three levels, never more */
  --bg-main:        #f8fafc;  /* app canvas */
  --bg-surface:     #ffffff;  /* cards, panels, table bodies */
  --bg-subtle:      #f1f5f9;  /* table headers, wells, disabled fields */

  /* Borders */
  --border-subtle:  #e2e8f0;  /* default dividers, card edges */
  --border-strong:  #cbd5e1;  /* inputs, focus-adjacent, emphasis */

  /* Text */
  --text-primary:   #0f172a;  /* headings, values, primary content */
  --text-secondary: #475569;  /* labels, supporting copy */
  --text-muted:     #64748b;  /* timestamps, hints, placeholders */

  /* Accent — one, platform-wide */
  --primary-accent: #0d9488;  /* teal-600 */
}
```

### 1.2 Status tokens

Semantic and **deliberately not the accent**. The accent means *"this is interactive."* Status means *"this is the state of a thing."* Conflating them is how users stop trusting color.

```css
:root {
  --success:     #059669;  --success-bg:  #ecfdf5;
  --warning:     #d97706;  --warning-bg:  #fffbeb;
  --critical:    #e11d48;  --critical-bg: #fff1f2;
  --info:        #4f46e5;  --info-bg:     #eef2ff;
}
```

| Token | Diesel lifecycle usage | General usage |
|---|---|---|
| `success` | Approved · Delivery Completed · Completed | Saved, passing, on-time |
| `warning` | Partial Delivery · Pending Admin Approval | Late, needs attention, degraded |
| `critical` | Rejected · Not Delivered | Failed, destructive action, blocking error |
| `info` | Payment Processing · Ready for Delivery | In progress, neutral system state |

**Never carry state by color alone.** Every status badge pairs a token color with a text label. Colour-blind users, glare, and cheap panels all break color-only encoding.

### 1.3 Resolving the Diesel rose exception

The Diesel Procurement module currently uses **rose-600** as its accent, from an explicit "ZHPL-style clean white interface with red accent" brand request. Everything else uses teal.

**Decision: unify on teal. Do not ship rose as an interactive accent.**

This isn't a taste call. It's a collision:

```
Tailwind rose-600  = #e11d48
--critical (token) = #e11d48
```

**They are the same color.** In the Diesel module — the one module in the entire product where a user approves or rejects a financial requisition — the primary action color is byte-identical to the destructive/failure color. The "Approve" button and the "Rejected" badge render in the same red. That is the worst possible place in this product for that ambiguity, and no amount of layout can fully compensate for it.

Two further reasons:

- **It breaks a learned rule.** After a week, users read teal as "you can act on this." Diesel silently teaches a second rule, and the cost lands on the module with the highest stakes.
- **It doubles the surface area.** Every component gains a module-conditional accent — buttons, focus rings, links, active nav, dial fill, spinners. That's permanent maintenance tax paid for a color.

**Honouring the brand request instead.** The ask has two halves. Take the first literally, redirect the second:

- **"Clean white interface"** — already true. `--bg-surface: #ffffff`, generous whitespace, hairline borders. This is most of what the request was actually about.
- **Red as module identity, never as a control.** Diesel gets a `--module-accent` used *only* in non-interactive identity positions:

```css
[data-module="diesel"] {
  --module-accent: #e11d48;
}
```

| Allowed | Forbidden |
|---|---|
| 3px rule beneath the module header | Buttons of any kind |
| Module icon / glyph tint | Links |
| Sidebar item marker when Diesel is active | Focus rings |
| Print/export header band | Dial fill |
| | Any control a user clicks |

The module still reads as ZHPL red on entry. No control ever inherits it.

**If the brand stakeholder pushes back**, the argument to bring is not aesthetic: *"the requested red is the same hex as our error color, in the screen where money gets approved."* That usually ends the conversation. If it truly cannot be won, the fallback is `#be123c` (rose-700) — visibly darker than `--critical`, still legible as ZHPL red — but this is a compromise, not the recommendation.

### 1.4 Dark mode

**The principle: dark mode is re-derived, not inverted.** Flipping lightness produces grey mush with unreadable accents. Three rules govern the derivation:

1. **Surfaces get lighter as they rise.** In light mode, elevation reads through shadow. On a dark canvas, shadow is nearly invisible — so elevation is carried by surface lightness plus a top-edge highlight. Higher = lighter.
2. **Accents get lighter, not darker.** `teal-600` on near-black fails contrast. Step to `teal-400`.
3. **Status backgrounds get darker and desaturated.** A light tint at 8-12% lightness, not the light-mode pastel.

```css
[data-theme="dark"] {
  /* Surfaces — note the direction: main is DARKEST, surface rises */
  --bg-main:        #0b1120;
  --bg-surface:     #0f172a;
  --bg-subtle:      #1e293b;

  --border-subtle:  #1e293b;
  --border-strong:  #334155;

  --text-primary:   #f1f5f9;
  --text-secondary: #94a3b8;
  --text-muted:     #64748b;

  --primary-accent: #2dd4bf;  /* teal-400 — lightened for contrast */

  --success:  #34d399;  --success-bg:  #022c22;
  --warning:  #fbbf24;  --warning-bg:  #431407;
  --critical: #fb7185;  --critical-bg: #4c0519;
  --info:     #818cf8;  --info-bg:     #1e1b4b;
}
```

Note `--text-muted` is unchanged at `#64748b`. It hits ~4.6:1 on `#0b1120` and ~4.1:1 on `#0f172a` — it works in both directions, which is why it doesn't move. Verify any token you change against its actual background, not against an assumption.

### 1.5 Contrast floor

| Content | Minimum | Notes |
|---|---|---|
| Body text ≤ 13px | **4.5:1** | The dominant size — no exceptions |
| Text ≥ 18px / 14px bold | 3:1 | Headings only |
| Icons, borders, controls | 3:1 | Includes the dial track |
| Disabled states | — | Exempt, but must still be *identifiable* as disabled |

`--text-muted` on `--bg-subtle` is the tightest common pairing. Check it whenever either token moves.

---

## 2. Typography

Three faces, three jobs. A face used outside its job is a bug.

| Face | Role | Where |
|---|---|---|
| **Space Grotesk** | Display | Page titles, module headers, dial readouts. Nothing else. |
| **Inter** | Body & UI | Everything: labels, table cells, buttons, form fields, copy. |
| **JetBrains Mono** | Data | Log IDs, SAP codes, timestamps, currency, quantities. |

```css
:root {
  --font-display: 'Space Grotesk', system-ui, sans-serif;
  --font-body:    'Inter', system-ui, -apple-system, sans-serif;
  --font-data:    'JetBrains Mono', ui-monospace, 'SF Mono', monospace;
}
```

### 2.1 The scale

11-13px is the dominant range. At that size legibility beats personality, which is why Inter — not the display face — does nearly all the work.

| Token | Size / line-height | Weight | Tracking | Face | Use |
|---|---|---|---|---|---|
| `display-lg` | 24 / 28 | 600 | -0.02em | Grotesk | Page title (one per screen) |
| `display` | 20 / 26 | 600 | -0.02em | Grotesk | Module header, dial readout |
| `heading` | 16 / 22 | 600 | -0.011em | Grotesk | Section heading |
| `title` | 14 / 20 | 600 | -0.006em | Inter | Card title, table group header |
| **`body`** | **13 / 18** | **400** | **0** | **Inter** | **Default. Most text is this.** |
| `body-sm` | 12 / 16 | 400 | +0.005em | Inter | Dense tables, secondary rows |
| `label` | 11 / 14 | 500 | +0.01em | Inter | Field labels, badges, meta |
| `overline` | 10 / 12 | 600 | +0.06em | Inter | Uppercase eyebrows. Use sparingly. |
| `data` | 12 / 16 | 450 | 0 | Mono | IDs, codes, timestamps |
| `data-lg` | 14 / 20 | 500 | 0 | Mono | Currency, quantity in detail views |

**The tracking rule.** Tracking runs opposite to size: large type tightens, small type opens up. Below 12px, letters crowd and the eye starts guessing — positive tracking buys real legibility on a glare-washed screen. This inversion is the single most important detail in the type system; get it wrong and everything reads slightly cheap.

### 2.2 Numerals

Any number in a column must not shift as it changes.

```css
.tabular { font-variant-numeric: tabular-nums; }
```

Apply to: every table cell containing a figure, every dial readout, every countdown or timer, every currency total. Inter and JetBrains Mono both support it.

**Currency:** JetBrains Mono, always. `₹ 47,250.00` — never a proportional face.

### 2.3 Restraint rules for Space Grotesk

Space Grotesk is the only face here with visible character. That makes it easy to overuse.

- **One `display-lg` per screen.** Maximum.
- **Never below 16px.** Its personality reads as noise at small sizes, and Inter is more legible there anyway.
- **Never in tables, buttons, form labels, or badges.** Those are Inter's job without exception.
- **Never at 400 weight.** It's used at 600 for structure. If you want lighter, you want Inter.

---

## 3. Elevation

Four levels. Each is **two shadows**: a tight contact shadow that grounds the object, and a wide ambient shadow that suggests the room. Single drop-shadows look pasted on; the pair looks lit.

**The light source is upper-left**, so shadows offset **down and to the right** — positive X and Y. This is deliberate and consistent; a shadow with `x: 0` is a bug in this system.

```css
:root {
  --elevate-1:
    1px 1px 1px -0.5px rgb(15 23 42 / 0.04),
    1px 2px 4px -1px   rgb(15 23 42 / 0.04);

  --elevate-2:
    1px 1px 2px -0.5px rgb(15 23 42 / 0.05),
    2px 4px 8px -2px   rgb(15 23 42 / 0.06);

  --elevate-3:
    2px 2px 4px -1px   rgb(15 23 42 / 0.06),
    4px 8px 16px -4px  rgb(15 23 42 / 0.08);

  --elevate-4:
    2px 4px 8px -2px   rgb(15 23 42 / 0.07),
    8px 16px 32px -8px rgb(15 23 42 / 0.10);
}

.elevate-1 { box-shadow: var(--elevate-1); }
.elevate-2 { box-shadow: var(--elevate-2); }
.elevate-3 { box-shadow: var(--elevate-3); }
.elevate-4 { box-shadow: var(--elevate-4); }
```

| Level | Meaning | Applied to |
|---|---|---|
| **1** | Resting on the surface | Cards, table containers, form sections |
| **2** | Lifted on interaction | Hovered rows, dragged items, active tiles |
| **3** | Floating above content | Dropdowns, popovers, tooltips, command palette |
| **4** | Blocking the surface | Modals, dialogs, confirmation sheets |

**Rules**
- Never skip levels. A card can't hover to `elevate-4`.
- Never stack elevation classes on nested elements — the shadows compound into mud.
- Elevation implies interactivity. A static banner doesn't get one.

### 3.1 Elevation in dark mode

Shadow does almost nothing on a dark canvas. Elevation switches to **surface lightness plus a 1px top highlight** simulating the same upper-left light catching the object's top edge.

```css
[data-theme="dark"] .elevate-1 {
  background: #131c2e;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.04),
    0 1px 2px rgb(0 0 0 / 0.4);
}
[data-theme="dark"] .elevate-2 {
  background: #1a2437;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.05),
    0 2px 6px rgb(0 0 0 / 0.45);
}
[data-theme="dark"] .elevate-3 {
  background: #202c42;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.06),
    0 6px 16px rgb(0 0 0 / 0.5);
}
[data-theme="dark"] .elevate-4 {
  background: #26334d;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.07),
    0 12px 32px rgb(0 0 0 / 0.6);
}
```

The mental model is preserved — higher still reads as closer — but the mechanism changes. This is what "invert consistently, not just flip lightness" means in practice.

---

## 4. Space, radius, layout

4px base unit. No arbitrary values.

```css
:root {
  --space-1:  4px;   --space-2:  8px;   --space-3: 12px;
  --space-4: 16px;   --space-5: 20px;   --space-6: 24px;
  --space-8: 32px;   --space-10: 40px;  --space-12: 48px;

  --radius-sm:   4px;   /* badges, tags, checkboxes */
  --radius-md:   6px;   /* buttons, inputs — the default */
  --radius-lg:   8px;   /* cards, panels */
  --radius-xl:  12px;   /* modals, sheets */
  --radius-full: 9999px;/* pills, dial, avatars */
}
```

### 4.1 Density and hit targets

This is a floor tool. Gloves, movement, one hand.

| Context | Row height | Minimum hit target |
|---|---|---|
| Desktop table row | 36px | 32 x 32 |
| Desktop control | 32px | 32 x 32 |
| **Touch / mobile** | **44px** | **44 x 44** |
| Destructive action | — | **44 x 44 everywhere**, plus confirmation |

Below 768px, everything goes to touch density. Reject/Delete never gets a compact target on any breakpoint.

---

## 5. Focus and keyboard

Admins clear queues by keyboard. Focus is functional, not decoration.

```css
:root { --focus-ring: 0 0 0 2px var(--bg-surface), 0 0 0 4px var(--primary-accent); }

:where(a, button, input, select, textarea, [tabindex]):focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
  border-radius: var(--radius-md);
}
```

The double ring — surface-colored inner, accent outer — keeps the ring legible against any background.

- `:focus-visible`, never `:focus`. Mouse users shouldn't see rings.
- **Never** `outline: none` without a replacement.
- Modals trap focus and restore it to the trigger on close.
- Destructive actions are never the default focus target when a dialog opens.

---

## 6. Motion

**Motion confirms that something happened. It does not decorate.** If an animation isn't reporting a state change, delete it.

```css
:root {
  --ease-out:     cubic-bezier(0.20, 0, 0, 1);
  --ease-in-out:  cubic-bezier(0.40, 0, 0.20, 1);

  --dur-micro:   120ms;  /* hover, press, checkbox */
  --dur-enter:   180ms;  /* popover, tooltip, toast */
  --dur-overlay: 240ms;  /* modal, drawer */
  --dur-layout:  320ms;  /* sliding nav indicator */
}
```

**Enter fast, exit faster.** Exit runs at ~0.75x enter — a dismissed thing should feel already gone.

### 6.1 Known bug: dead `animate-in` classes

Legacy screens reference `animate-in`, `fade-in`, `slide-in-from-bottom-2`, `zoom-in-95`. **These are from `tailwindcss-animate`, which is not installed.** They are inert strings. Popups using them appear and vanish instantly with no transition.

**This is a bug to sweep, not a style preference.** It looks like "no animation was designed," when in fact animation was specified and silently dropped.

```bash
grep -rEn "animate-in|animate-out|fade-in|fade-out|slide-in-from|slide-out-to|zoom-in|zoom-out" src/
```

Replace with real CSS. **Do not install the plugin** — these are the only four patterns needed, and owning them is cheaper than a dependency:

```css
@keyframes enter-pop {
  from { opacity: 0; transform: translateY(4px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0)   scale(1); }
}
@keyframes exit-pop {
  from { opacity: 1; transform: translateY(0)   scale(1); }
  to   { opacity: 0; transform: translateY(2px) scale(0.99); }
}

.popover[data-state="open"]   { animation: enter-pop var(--dur-enter) var(--ease-out); }
.popover[data-state="closed"] { animation: exit-pop  135ms var(--ease-out); }
```

### 6.2 The navigation indicator

The active-nav marker is a **single shared element that slides between items** — not per-item borders toggling on and off. The movement is what tells you where you came from.

```css
.nav-indicator {
  position: absolute; left: 0; width: 3px;
  background: var(--primary-accent);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  transition: transform var(--dur-layout) var(--ease-in-out),
              height    var(--dur-layout) var(--ease-in-out);
}
```

### 6.3 Reduced motion

Non-negotiable. Note it kills *movement*, not *feedback* — opacity survives so state changes remain visible.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  .nav-indicator { transition: none; }
  .dial__face    { transition: none; }
}
```

---

## 7. Signature element: the instrument dial

**This is the one memorable thing in the product. Protect it by not adding a second.**

Every percentage reading — compliance %, uptime %, deployment % — renders as a radial gauge built from a conic-gradient face with an inset bevel. Not a flat donut chart. It should read as a physical instrument on a control panel, because that is what this product is: an instrument panel for a warehouse network.

The detail that does the work is the **bevel**. A flat ring is a chart. A ring with a lit upper-left edge and a shadowed lower-right one is a machined object — and it lands because it uses the same light source as the elevation scale. The dial isn't decoration bolted on; it's the depth model applied to a control.

### 7.1 Implementation

Three layers: bezel (depth), face (the reading), readout (the number).

```html
<div class="dial" style="--dial-value: 87" role="img" aria-label="Compliance 87 percent">
  <div class="dial__face"></div>
  <div class="dial__readout">
    <span class="dial__number">87</span><span class="dial__unit">%</span>
  </div>
</div>
```

```css
.dial {
  --dial-size:  96px;
  --dial-width: 10px;          /* ring thickness */
  --dial-sweep: 270;           /* degrees; 90deg gap at bottom */
  --dial-fill:  var(--primary-accent);
  --dial-track: var(--bg-subtle);

  position: relative;
  width: var(--dial-size);
  aspect-ratio: 1;
  border-radius: var(--radius-full);
  display: grid;
  place-items: center;

  /* Bezel: outer lift + inset bevel, light from upper-left */
  background: var(--bg-surface);
  box-shadow:
    var(--elevate-1),
    inset  1px  1px 2px rgb(255 255 255 / 0.90),
    inset -1px -1px 3px rgb(15 23 42 / 0.10);
}

.dial__face {
  position: absolute;
  inset: 6px;
  border-radius: var(--radius-full);

  background: conic-gradient(
    from 135deg,
    var(--dial-fill)  0deg,
    var(--dial-fill)  calc(var(--dial-value) * (var(--dial-sweep) / 100) * 1deg),
    var(--dial-track) calc(var(--dial-value) * (var(--dial-sweep) / 100) * 1deg),
    var(--dial-track) calc(var(--dial-sweep) * 1deg),
    transparent       calc(var(--dial-sweep) * 1deg)
  );

  /* Punch the centre out to leave a ring */
  mask: radial-gradient(
    closest-side,
    transparent calc(100% - var(--dial-width)),
    #000        calc(100% - var(--dial-width) + 1px)
  );

  transition: --dial-value var(--dur-layout) var(--ease-out);
}

.dial__readout {
  display: flex; align-items: baseline; gap: 1px;
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}
.dial__number { font-size: 20px; font-weight: 600; letter-spacing: -0.02em; }
.dial__unit   { font-size: 11px; font-weight: 500; color: var(--text-muted); }

/* Animate the sweep where supported */
@property --dial-value {
  syntax: '<number>'; initial-value: 0; inherits: true;
}
```

### 7.2 Rules

| Rule | Why |
|---|---|
| **Percentages only** | A dial implies 0-100 with a full-scale maximum. Counts and currency are not that. Use `data-lg` type instead. |
| **Fill uses `--primary-accent` by default** | Switch to a status token only when the value is itself a pass/fail judgement (e.g. compliance below target -> `--warning`). Never both at once. |
| **Sizes: 64 / 96 / 128px** | Nothing else. Below 64 the bevel is invisible and it degrades into a bad donut. |
| **Maximum three per screen** | Four dials is a dashboard cliché. Three is an instrument panel. |
| **`role="img"` + `aria-label` mandatory** | The number is decorative markup to a screen reader without it. |
| **Never animate on every render** | It animates when the value *changes*, not on mount of a list. |

---

## 8. Component patterns

### 8.1 Status badge

The most-repeated component in the product. Always color **plus** label.

```html
<span class="badge badge--warning">Pending Admin Approval</span>
```

```css
.badge {
  display: inline-flex; align-items: center; gap: var(--space-1);
  padding: 2px var(--space-2);
  border-radius: var(--radius-sm);
  font: 500 11px/14px var(--font-body);
  letter-spacing: 0.01em;
  white-space: nowrap;
}
.badge--success  { color: var(--success);  background: var(--success-bg);  }
.badge--warning  { color: var(--warning);  background: var(--warning-bg);  }
.badge--critical { color: var(--critical); background: var(--critical-bg); }
.badge--info     { color: var(--info);     background: var(--info-bg);     }
```

### 8.2 Data cell

Any identifier or figure. Mono, tabular, `--text-primary`.

```css
.cell-data {
  font: 450 12px/16px var(--font-data);
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}
```

`DZHPL0042` and `PZHPL0107` must align character-for-character down a column. That alignment is the entire reason the mono face exists in this system.

---

## 9. Before / after

Real conversions. This is what "bringing a screen up to system" looks like in a diff.

### 9.1 A card

```jsx
// BEFORE — ad-hoc utilities
<div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
  <h3 className="text-sm font-semibold text-gray-900 mb-1">Diesel Requisitions</h3>
  <p className="text-xs text-gray-500">Pending your approval</p>
</div>
```

Four problems: `shadow-md` is a single flat drop-shadow with no contact layer and a zero X-offset, so it contradicts the upper-left light source. `gray-*` is a different hue ramp from the slate-based tokens — it reads subtly cold next to them. Sizes are Tailwind defaults, not the scale. Nothing here responds to dark mode.

```jsx
// AFTER — system tokens
<div className="elevate-1 rounded-lg p-4"
     style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
  <h3 className="text-title mb-1" style={{ color: 'var(--text-primary)' }}>
    Diesel Requisitions
  </h3>
  <p className="text-label" style={{ color: 'var(--text-muted)' }}>
    Pending your approval
  </p>
</div>
```

### 9.2 A status badge

```jsx
// BEFORE — hardcoded, and semantically wrong
<span className="px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800">
  Pending
</span>
```

`yellow-*` isn't the warning token. Two engineers will pick two different yellows. And "Pending" isn't the status — `Pending Admin Approval` is; truncating it loses which pending.

```jsx
// AFTER
<span className="badge badge--warning">Pending Admin Approval</span>
```

### 9.3 A popup (the dead-animation bug)

```jsx
// BEFORE — these classes do nothing; the plugin isn't installed
<div className="animate-in fade-in slide-in-from-top-2 duration-200 shadow-lg rounded-md">
```

```jsx
// AFTER — real transition, real elevation
<div className="popover elevate-3 rounded-md" data-state={open ? 'open' : 'closed'}>
```

---

## 10. Rollout

The system is live in the **navigation shell** and **Diesel Procurement**. Everything else uses ad-hoc Tailwind strings.

### 10.1 Priority

Ranked by `users x frequency x consequence` — not by which screen is easiest.

| # | Screen | Why here | Effort |
|---|---|---|---|
| **1** | **POC daily home / "today" list** | Every POC, every shift. Highest single-screen traffic in the product, and the first thing 200+ people see. | M |
| **2** | **Service submission forms** (Daily Site, Housekeeping, DG) | Filed daily by the same users. Inconsistent inputs across services is the most visible symptom of the split system. | L |
| **3** | **Admin approval queue** | Fewer users, but every action is a financial decision. Highest consequence per pixel. | M |
| **4** | **Compliance dashboard** | Where the dials belong. Currently the biggest gap between intent and reality. | M |
| **5** | **Data tables / trackers** | Read constantly, rarely acted on. Mono/tabular discipline matters most here. | L |
| **6** | Settings / master data screens | Low traffic, admin-only. | S |

**Do 1 and 2 as one push.** A POC moves between their home screen and a form in a single flow; converting one and not the other makes the seam more obvious than doing neither.

### 10.2 "Up to system" checklist

A screen is done when every box is ticked. Paste this into the PR.

**Color**
- [ ] No hex literals in JSX or CSS. All color via `var(--token)`
- [ ] No `gray-*` / `slate-*` / `zinc-*` Tailwind color utilities — those are the pre-system ramp
- [ ] Status colors use semantic tokens, never `green-500`, `yellow-100`, `red-600`
- [ ] Every status has a **text label**, not color alone
- [ ] `--primary-accent` appears only on interactive elements
- [ ] Rose/red appears **only** in permitted Diesel identity positions (§1.3)
- [ ] Renders correctly in dark mode

**Type**
- [ ] Every size maps to a scale token — no `text-[13px]`
- [ ] Space Grotesk only at ≥16px, and not in tables, buttons, labels, or badges
- [ ] All IDs, codes, timestamps, currency and quantities in JetBrains Mono
- [ ] `tabular-nums` on every numeric table column and dial readout
- [ ] Body text is 13px unless there's a stated reason

**Elevation**
- [ ] No `shadow-sm` / `shadow-md` / `shadow-lg` / `shadow-xl` utilities
- [ ] `.elevate-1` … `.elevate-4` used at the correct semantic level
- [ ] No nested elevation on parent *and* child
- [ ] Dark mode elevation verified — surfaces lighten, not just shadow

**Motion**
- [ ] `grep` clean for `animate-in|fade-in|slide-in-from|zoom-in` (§6.1)
- [ ] Every transition uses a `--dur-*` and `--ease-*` token
- [ ] Every animation reports a state change — none decorative
- [ ] Verified with `prefers-reduced-motion: reduce` enabled

**Interaction**
- [ ] `:focus-visible` ring on every interactive element
- [ ] No bare `outline: none`
- [ ] Full keyboard traversal; modals trap and restore focus
- [ ] 44x44 hit targets below 768px; destructive actions 44x44 everywhere

**Structure**
- [ ] Spacing from the 4px scale — no arbitrary values
- [ ] Radius tokens only
- [ ] Dials only for percentages, max three per screen, `aria-label` present
- [ ] Empty and error states designed, not defaulted

### 10.3 Preventing regression

Conversion is wasted if the next PR reintroduces the old patterns. Land these alongside the first converted screen:

```js
// eslint / stylelint — fail the build on pre-system patterns
'no-restricted-syntax': [
  'error',
  { selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
    message: 'Use a design token, not a hex literal. See DESIGN.md §1.' },
]
```

- Ban raw hex in JSX and CSS (tokens file exempted)
- Ban `shadow-{sm,md,lg,xl}`, `gray-*`, `zinc-*` utilities
- CI `grep` for dead `animate-*` classes — fail on any hit
- Register tokens once in Tailwind v4's `@theme` block so `text-body` and `bg-surface` resolve as first-class utilities and inline `style={{}}` becomes the exception rather than the pattern

---

## 11. Illustration

### 11.1 The direction: technical monoline, not doodles

Illustration belongs in this product. Doodles do not, and the distinction is worth being precise about — "add some illustrations" usually ends with an imported blob-people library.

**What's wrong with doodles here.** Hand-drawn squiggles, blob shapes, floating confetti and cartoon mascots read as friendly on day one and as clutter by day thirty — and this product is opened three hundred times a day for years. They also undercut a screen where someone approves ₹47,000 of diesel. A playful illustration beside a rejection reason is tonally wrong in a way users feel without being able to name.

**What replaces it.** Your subject matter is industrial: drums, tanks, pallets, crates, meters, cold rooms. Your signature element is already a machined instrument with a bevel. The language that follows from both is **technical monoline drawing** — the linework of an equipment manual.

This is the more distinctive choice, not the safer one. Every internal tool that reaches for illustration reaches for the same rounded-corner blob set. A library of precise 1.5px schematic drawings of the actual objects in your warehouses is specific to WarehouseOS and couldn't be lifted from anywhere else. It also ages the way Stripe ages rather than the way 2016 startup illustration ages.

### 11.2 Specification

| Property | Value | Why |
|---|---|---|
| Stroke width | **1.5px**, non-scaling | Matches the dial's ring weight |
| Caps / joins | `round` | Softens the technical line without making it cute |
| Fill | **None**, or one flat token at 8% opacity | Line drawing, not clip art |
| Grid | 24px, on a 96x96 artboard | Everything snaps; nothing is freehand |
| Colour | `currentColor` on all strokes | Inherits text colour — dark mode is free |
| Accent | **Exactly one element** in `--primary-accent` | The single point of interest |
| Perspective | Shallow top-down ellipse, light from upper-left | Same light source as the elevation scale |

**The one-accent rule is what makes the set look designed rather than assembled.** In a drum it's the fill line; in an inbox, the front lip; in a gauge, the needle. One teal element in an otherwise monochrome drawing directs the eye and ties the illustration back to the system. Two accents and it becomes decoration.

### 11.3 Where illustration is allowed

Five slots. Nowhere else.

| Slot | Size | Purpose |
|---|---|---|
| **Empty state** | 128px | Where the product currently shows nothing at all |
| **Completion moment** | 96px | Approval submitted, queue cleared, day complete |
| **Error / no permission** | 96px | Blocked, unreachable, not authorised |
| **First run / onboarding** | 160px | Once per user, ever |
| **Login screen** | 160px | The one screen with room to breathe |

**Forbidden:** dashboards, tables, forms, page headers, navigation, loading states, or anywhere near a control. If it appears on a screen a POC visits every shift, it's in the wrong place — the exception being the empty state, which by definition disappears the moment there's work to do.

### 11.4 Asset set

Draw these, in this style, as the starting library:

| Asset | Used for |
|---|---|
| Diesel drum | Diesel empty state, module identity |
| Storage tank + gauge | Fuel level, capacity |
| Pallet stack | Inventory, general warehouse |
| Crate | Crate washing service |
| Cold room door | Cold room service |
| Clipboard + checklist | Daily site activity, housekeeping |
| Meter face | DG power, readings |
| Empty tray | Generic empty state |
| Padlock | No permission |
| Disconnected plug | Offline, sync failure |

### 11.5 Reference implementations

Paste either of these into a screen to see the direction rendered in your real tokens.

**Empty tray** — the workhorse. Accent on the front lip.

```html
<svg class="illus" viewBox="0 0 96 96" width="128" height="128"
     fill="none" stroke="currentColor" stroke-width="1.5"
     stroke-linecap="round" stroke-linejoin="round"
     role="img" aria-hidden="true">
  <path d="M16 46 L28 20 h40 l12 26"/>
  <path d="M16 46v24a5 5 0 0 0 5 5h54a5 5 0 0 0 5-5V46"/>
  <path d="M16 46h17l5 9h20l5-9h17" stroke="var(--primary-accent)"/>
  <path d="M40 32h16M44 39h8" opacity="0.4"/>
</svg>
```

**Diesel drum** — accent on the fill level.

```html
<svg class="illus" viewBox="0 0 96 96" width="128" height="128"
     fill="none" stroke="currentColor" stroke-width="1.5"
     stroke-linecap="round" stroke-linejoin="round"
     role="img" aria-hidden="true">
  <ellipse cx="48" cy="26" rx="22" ry="8"/>
  <path d="M26 26v44c0 4.4 9.8 8 22 8s22-3.6 22-8V26"/>
  <path d="M26 41c0 4.4 9.8 8 22 8s22-3.6 22-8" opacity="0.45"/>
  <path d="M26 57c0 4.4 9.8 8 22 8s22-3.6 22-8" stroke="var(--primary-accent)"/>
  <circle cx="48" cy="22" r="3.5"/>
</svg>
```

```css
.illus {
  color: var(--text-muted);          /* strokes inherit this */
  vector-effect: non-scaling-stroke; /* 1.5px stays 1.5px at any size */
}
```

Because strokes use `currentColor`, dark mode needs no second asset — set `color` and the whole library follows.

### 11.6 Empty state anatomy

An empty screen is an invitation to act, not an apology. Four parts, centred, max-width 320px:

```
     [ illustration, 128px, --text-muted ]
              |  20px
     Heading — Space Grotesk 16/22, --text-primary
              |  6px
     One line — Inter 13/18, --text-secondary
              |  20px
     Primary action button
```

| Do | Don't |
|---|---|
| "No requisitions waiting" | "Nothing here yet" |
| "You're all caught up for today." | "Oops! It's empty in here" |
| "File diesel entry" | "Get started" |

Name the space, say what it means, offer the next action. No apology, no exclamation mark, no mascot.

---

## 12. Micro-interactions

Section 6 sets the law: **motion confirms that something happened.** This is the permitted catalogue. Anything not on this list needs a justification in the PR.

This is also, honestly, where "professional" actually comes from. A tool feels expensive because a button responds instantly, a number counts instead of jumping, and a list doesn't flash white while loading — not because it has illustrations.

| # | Interaction | Duration | What it reports |
|---|---|---|---|
| 1 | Button press — `scale(0.97)` | 90ms | The tap registered |
| 2 | Row hover — `elevate-1` -> `elevate-2` | 120ms | This row is actionable |
| 3 | Status badge cross-fade | 180ms | The record changed state |
| 4 | Number roll-up | 320ms | This figure is live |
| 5 | Dial sweep | 320ms | The reading moved |
| 6 | Checkmark draw-on | 400ms | Your approval went through |
| 7 | Row insert / remove | 200ms | The queue changed under you |
| 8 | Skeleton shimmer | 1.4s loop | Content is coming, here's its shape |
| 9 | Toast enter / exit | 180 / 135ms | Something happened off-screen |
| 10 | Nav indicator slide | 320ms | Where you moved from |

### 12.1 Number roll-up

Any figure that changes while the user is watching counts to its new value. Needs `tabular-nums` or the width jitters as digits change.

```css
@property --num { syntax: '<integer>'; initial-value: 0; inherits: false; }

.metric {
  counter-reset: n var(--num);
  font-variant-numeric: tabular-nums;
  transition: --num var(--dur-layout) var(--ease-out);
}
.metric::after { content: counter(n); }
```

```html
<span class="metric" style="--num: 47"></span>
```

Only for values the user is present for — a live queue count, a dial reading after approval. **Never on page load for a table of static figures.** That's decoration.

### 12.2 Approval checkmark

The highest-value 400ms in the product. An admin approving forty requisitions needs to feel each one land.

```css
.check-path {
  stroke-dasharray: 32;
  stroke-dashoffset: 32;
  animation: draw 400ms var(--ease-out) forwards;
}
@keyframes draw { to { stroke-dashoffset: 0; } }
```

```html
<svg viewBox="0 0 24 24" width="20" height="20" fill="none"
     stroke="var(--success)" stroke-width="2.5"
     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path class="check-path" d="M4 12.5 L9.5 18 L20 6"/>
</svg>
```

### 12.3 Skeletons, not spinners

**Replace every spinner with a skeleton of the content that's loading.**

A spinner says "wait." A skeleton says "here's what's arriving, and where." It reduces perceived wait, and more importantly it prevents the layout jump that makes an app feel cheap when content pops in and shoves everything down.

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--bg-subtle) 25%,
    var(--bg-main)   37%,
    var(--bg-subtle) 63%
  );
  background-size: 400% 100%;
  border-radius: var(--radius-sm);
  animation: shimmer 1.4s ease-in-out infinite;
}
@keyframes shimmer {
  0%   { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton { animation: none; background: var(--bg-subtle); }
}
```

Match the skeleton to the real layout — a table skeleton has the same row height and column widths as the table it replaces. A generic grey box is a spinner with extra steps.

### 12.4 Row insert and remove

When an admin approves, the row leaves the queue. Show it leaving.

```css
@keyframes row-out {
  to { opacity: 0; transform: translateX(12px); max-height: 0; }
}
.row[data-state="removing"] {
  animation: row-out 200ms var(--ease-out) forwards;
  overflow: hidden;
}
```

Without this the row vanishes and the list snaps upward, and for a moment the admin can't tell whether they acted on the row they meant to.

### 12.5 What stays banned

Restated, because "add animations" is where design systems go to die:

- Ambient floating shapes, parallax, gradient drift
- Entrance animations on page load — every element sliding in
- Anything looping that isn't reporting active progress
- Confetti, bounce, elastic, spring overshoot
- Hover effects on non-interactive elements
- Animated illustrations — the drawings are static
- Scroll-triggered reveals

**The test:** if it were removed, would the user lose information? If not, remove it.

---

## 13. UX patterns

Visual language is most of this document. These are the interaction rules — they matter more than another colour token, because an admin clears forty requisitions in a sitting and every friction point is paid forty times.

### 13.1 Forms

**Validate on blur, never on keystroke.** Turning a field red while someone is still typing their fourth character is the most common form mistake there is. Sequence: validate on blur -> clear the error the moment they start editing -> re-validate on blur -> block submit if anything is invalid.

**Errors sit under the field, not in a summary at the top.** A top-of-form list makes the user hunt. Inline error: 11px, `--critical`, 4px below the input, with the input border switching to `--border-critical`.

**Never disable the submit button to indicate invalidity.** A disabled button gives no reason and no tooltip on touch. Keep it enabled; on click, validate, focus the first invalid field, and show its error. The user learns what's wrong by acting, not by guessing why a button is dead.

**Read-only fields look different from disabled ones.** Auto-filled fields on the diesel form (email, entity, warehouse, cost centre, zone) are *facts*, not disabled inputs. Render them as `--bg-subtle` with `--text-secondary` and no border — they read as information, not as a control someone broke.

**Preserve drafts.** A POC filling a form on a warehouse floor will lose connection. Form state persists locally and restores on return.

### 13.2 Destructive and irreversible actions

Reject, delete, and close-out are one-way. They get three protections:

1. **A confirmation dialog** that names the specific thing: "Reject DZHPL0042?" — never "Are you sure?"
2. **The reason field lives in the dialog**, not after it. `rejectionReason` is mandatory, so collect it at the moment of decision.
3. **The destructive button is never the focused default** when the dialog opens. Focus lands on Cancel.

Confirmation dialogs are for irreversible actions only. Asking someone to confirm a save teaches them to click through dialogs without reading, which is exactly the habit you don't want when the reject dialog opens.

### 13.3 Feedback: toast, inline, or dialog

| Outcome | Where it goes |
|---|---|
| Succeeded, user is still on the page | **Inline** — the row updates, the badge changes. No toast. |
| Succeeded, result is off-screen | **Toast**, 4s, bottom-right |
| Failed, tied to one field | **Inline** under that field |
| Failed, tied to the whole action | **Banner** at the top of the form, persists until resolved |
| Requires a decision | **Dialog** |

**Never toast a success the user can already see.** Approving a row that visibly changes to "Approved" doesn't need a toast saying it was approved. That's noise forty times a sitting.

**Errors say what happened and what to do.** No "Error:" prefix, no apology, no raw exception text. "Couldn't reach the diesel sheet. Retry." — not "Error: request failed."

### 13.4 Tables

The dominant surface in this product after forms.

- **Sticky header** on every scrolling table. Scroll fifty rows and lose the column names and you're counting columns with a finger.
- **Row click opens detail; actions live in the row.** Never make the whole row a button that swallows the approve control.
- **Right-align numbers, left-align text**, always `tabular-nums`. `DZHPL0042` and `DZHPL0107` must align character-for-character.
- **Empty, loading, and error states are three different screens.** Loading = skeleton rows at the real row height. Empty = §11.6. Error = message plus retry.
- **Sort and filter state survives navigation.** An admin who filters to their zone, opens a record, and comes back to an unfiltered table will do it once and then stop trusting the filter.
- **Never paginate the approval queue.** Pending work is finite and needs to be seen whole. Virtualise if it's long.

### 13.5 Navigation

- **Current location is always visible** — the sliding nav indicator (§6.2), plus the page title.
- **Nav does not change between roles.** It shows fewer items for a Site POC than a Super Admin, in the same order and the same place. Reordering by role means nobody can help a colleague over the phone.
- **Back always works.** Filters, tabs and open records live in the URL, not in component state.

### 13.6 Density

The same screens are used at a desk and on the floor. Density is one switch, not a per-component prop.

| Mode | Row height | Control height | Base font |
|---|---|---|---|
| `comfortable` (default) | 44px | 40px | 13px |
| `compact` | 36px | 32px | 13px |

Below 768px, `comfortable` is forced regardless of preference — a compact 32px target on a phone held in one gloved hand is not usable.

---

## 14. Preferences and theming

Three user preferences persist: **theme**, **density**, and **reduced motion**. Nothing else. Every additional preference is a permanent branch in every screenshot, bug report and support conversation.

### 14.1 How theming works

Everything keys off one attribute on `<html>`. No conditional class names anywhere in components.

```html
<html data-theme="dark" data-density="compact">
```

```css
:root                  { /* light tokens — §1.1 */ }
[data-theme="dark"]    { /* dark tokens  — §1.4 */ }

[data-density="compact"] {
  --row-h: 36px;
  --control-h: 32px;
}
```

If a component needs to know the theme in JavaScript, that's a design smell — it means a colour was hardcoded somewhere it should have been a token.

### 14.2 Resolution order

```
1. Explicit user choice        (stored preference)
2. System preference           (prefers-color-scheme)
3. Default                     (light)
```

Store **`system`** as a real, distinct value — not as an absence. A user who has never chosen and a user who deliberately chose "follow my system" are different, and only one of them should flip when their OS switches at sunset.

### 14.3 Preventing the flash

Read and apply the preference in a blocking inline script in `<head>`, before first paint. Applying it in a React effect means every dark-mode user sees a white flash on every page load.

```html
<script>
  (function () {
    try {
      var p = localStorage.getItem('wos.prefs');
      var t = p ? JSON.parse(p).theme : 'system';
      if (t === 'system' || !t) {
        t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      document.documentElement.dataset.theme = t;
    } catch (e) {
      document.documentElement.dataset.theme = 'light';
    }
  })();
</script>
```

The `try/catch` matters — `localStorage` throws in private mode on some browsers, and an unhandled throw here blocks the entire page.

### 14.4 Storage, now and later

**Today (localStorage).** Preferences are device-local, which is acceptable while the whole app is device-local.

```ts
type Prefs = {
  theme: 'light' | 'dark' | 'system';
  density: 'comfortable' | 'compact';
  reducedMotion: 'system' | 'always';
};

const KEY = 'wos.prefs';

export const loadPrefs = (): Prefs => {
  const fallback: Prefs = { theme: 'system', density: 'comfortable', reducedMotion: 'system' };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return fallback;
  }
};

export const savePrefs = (p: Prefs) => {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode */ }
  applyPrefs(p);
};

export const applyPrefs = (p: Prefs) => {
  const el = document.documentElement;
  el.dataset.theme = p.theme === 'system'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : p.theme;
  el.dataset.density = p.density;
  el.dataset.motion = p.reducedMotion;
};
```

**After Firestore.** Preferences move to `users/{uid}/preferences` so they follow a POC from the site desktop to their phone. Keep `localStorage` as the read-through cache — it's what makes the pre-paint script possible, since a network read can't happen before first paint.

```
read:  localStorage (instant, pre-paint)  ->  Firestore (authoritative, on load)
write: both, optimistically
```

Because §14.1 keys everything off one attribute, this migration touches the storage functions only. No component changes.

### 14.5 Reduced motion

`prefers-reduced-motion` is honoured automatically (§6.3). The stored preference can only *add* restriction, never remove it — a user whose OS asks for reduced motion never gets animation back through an app setting.

```css
[data-motion="always"] *,
[data-motion="always"] *::before {
  animation-duration: 0.01ms !important;
  transition-duration: 0.01ms !important;
}
```

### 14.6 Where the control lives

One "Appearance" group in settings. Three segmented controls, applied live on change — no Save button. A preference that needs saving isn't a preference, it's a form.

---

## 15. Quick reference

```
COLOR      bg-main #f8fafc . bg-surface #ffffff . bg-subtle #f1f5f9
           border-subtle #e2e8f0 . border-strong #cbd5e1
           text-primary #0f172a . text-secondary #475569 . text-muted #64748b
           accent #0d9488 (teal, platform-wide — Diesel red is identity only)
           success #059669 . warning #d97706 . critical #e11d48 . info #4f46e5

TYPE       Space Grotesk = display ≥16px only
           Inter         = everything (13px default)
           JetBrains Mono = IDs, codes, timestamps, money
           Tracking: negative when large, positive when small

DEPTH      elevate-1 rest . 2 hover . 3 float . 4 modal
           Light from upper-left — shadows offset +X +Y
           Dark mode: lighter surfaces, not shadows

MOTION     120 micro . 180 enter . 240 overlay . 320 layout
           Confirms actions only. Never decorates.

SIGNATURE  Instrument dial — percentages only, 64/96/128px, max 3 per screen

ILLUS      Technical monoline — 1.5px, currentColor, ONE accent element
           Only in: empty state . completion . error . onboarding . login
           Never in: dashboards, tables, forms, headers, loading

MICRO      Skeletons not spinners . number roll-up . checkmark draw
           Row exit before removal . badge cross-fade
           Banned: ambient motion, entrance animations, confetti

UX         Validate on blur, never on keystroke
           Never disable submit — validate on click and focus the error
           Confirm dialogs for irreversible actions only, Cancel focused
           No toast for a success already visible on screen
           Sticky headers . tabular numbers . never paginate the queue

PREFS      html[data-theme][data-density] — one attribute, no JS branching
           theme . density . reduced-motion. Nothing else.
           Pre-paint inline script or dark users see a white flash
```

---

**When in doubt:** the quieter option is correct. This screen is opened three hundred times today by someone who is trying to finish their shift.
