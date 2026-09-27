---
version: alpha
name: Shirone
description: A soft, anime-oriented personal blog theme built on Material 3 Expressive (M3E) foundations with dynamic HCT theming, adaptive reading layouts, and token-driven architecture.
colors:
  primary: "oklch(42% 0.16 315)"
  on-primary: "oklch(99% 0.02 315)"
  primary-container: "oklch(90% 0.06 315)"
  on-primary-container: "oklch(24% 0.09 315)"
  inverse-primary: "oklch(90% 0.13 315)"
  primary-fixed: "oklch(90% 0.06 315)"
  on-primary-fixed: "oklch(24% 0.09 315)"
  secondary: "oklch(52% 0.13 20)"
  on-secondary: "oklch(99% 0.02 20)"
  secondary-container: "oklch(90% 0.05 20)"
  on-secondary-container: "oklch(26% 0.08 20)"
  tertiary: "oklch(50% 0.12 215)"
  on-tertiary: "oklch(99% 0.02 215)"
  tertiary-container: "oklch(90% 0.05 215)"
  on-tertiary-container: "oklch(26% 0.08 215)"
  surface: "oklch(96% 0.012 315)"
  surface-dim: "oklch(93% 0.014 315)"
  surface-bright: "oklch(98% 0.008 315)"
  surface-container-lowest: "oklch(98.5% 0.006 315)"
  surface-container-low: "oklch(96.5% 0.01 315)"
  surface-container: "oklch(94% 0.015 315)"
  surface-container-high: "oklch(92% 0.02 315)"
  surface-container-highest: "oklch(90% 0.025 315)"
  surface-variant: "oklch(90% 0.02 315)"
  surface-tint: "oklch(42% 0.16 315)"
  on-surface: "oklch(16% 0.02 315)"
  on-surface-variant: "oklch(34% 0.03 315)"
  inverse-surface: "oklch(16% 0.02 315)"
  inverse-on-surface: "oklch(96% 0.012 315)"
  outline: "oklch(45% 0.03 315)"
  outline-variant: "oklch(76% 0.02 315)"
  error: "oklch(57% 0.21 27)"
  on-error: "oklch(99% 0.01 27)"
  error-container: "oklch(93% 0.06 27)"
  on-error-container: "oklch(36% 0.12 27)"
  shadow: "oklch(16% 0.02 315 / 0.12)"
  scrim: "oklch(16% 0.02 315 / 0.32)"
typography:
  display-lg:
    fontFamily: "var(--font-sans)"
    fontSize: 3.5rem
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: -0.25px
  display-md:
    fontFamily: "var(--font-sans)"
    fontSize: 2.8125rem
    fontWeight: 400
    lineHeight: 1.16
    letterSpacing: 0px
  display-sm:
    fontFamily: "var(--font-sans)"
    fontSize: 2.25rem
    fontWeight: 400
    lineHeight: 1.22
    letterSpacing: 0px
  headline-lg:
    fontFamily: "var(--font-sans)"
    fontSize: 2rem
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: 0px
  headline-md:
    fontFamily: "var(--font-sans)"
    fontSize: 1.75rem
    fontWeight: 400
    lineHeight: 1.29
    letterSpacing: 0px
  headline-sm:
    fontFamily: "var(--font-sans)"
    fontSize: 1.5rem
    fontWeight: 400
    lineHeight: 1.33
    letterSpacing: 0px
  title-lg:
    fontFamily: "var(--font-sans)"
    fontSize: 1.375rem
    fontWeight: 400
    lineHeight: 1.27
    letterSpacing: 0px
  title-md:
    fontFamily: "var(--font-sans)"
    fontSize: 1rem
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: 0.15px
  title-sm:
    fontFamily: "var(--font-sans)"
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.43
    letterSpacing: 0.1px
  body-lg:
    fontFamily: "var(--font-sans)"
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0.5px
  body-md:
    fontFamily: "var(--font-sans)"
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.43
    letterSpacing: 0.25px
  body-sm:
    fontFamily: "var(--font-sans)"
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1.33
    letterSpacing: 0.4px
  label-lg:
    fontFamily: "var(--font-sans)"
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.43
    letterSpacing: 0.1px
  label-md:
    fontFamily: "var(--font-sans)"
    fontSize: 0.75rem
    fontWeight: 500
    lineHeight: 1.33
    letterSpacing: 0.5px
  label-sm:
    fontFamily: "var(--font-sans)"
    fontSize: 0.6875rem
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: 0.5px
  code:
    fontFamily: "var(--font-mono)"
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.43
    letterSpacing: 0px
  display:
    fontFamily: "var(--font-sans)"
    fontSize: 2.75rem
    fontWeight: 700
    lineHeight: 1.18
  headline:
    fontFamily: "var(--font-sans)"
    fontSize: 1.5rem
    fontWeight: 500
    lineHeight: 1.33
  title:
    fontFamily: "var(--font-sans)"
    fontSize: 1rem
    fontWeight: 500
    lineHeight: 1.5
  body:
    fontFamily: "var(--font-sans)"
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
  body-small:
    fontFamily: "var(--font-sans)"
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1.33
  label:
    fontFamily: "var(--font-sans)"
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.43
rounded:
  none: 0px
  xs: 4px
  extra-small: 4px
  sm: 8px
  small: 8px
  md: 12px
  medium: 12px
  lg: 16px
  large: 16px
  large-increased: 20px
  xl: 28px
  extra-large: 28px
  extra-large-increased: 32px
  extra-extra-large: 48px
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  compact: 8px
  sm: 8px
  control: 12px
  space-3: 12px
  md: 16px
  space-4: 16px
  space-5: 20px
  section: 24px
  lg: 24px
  space-6: 24px
  content: 32px
  xl: 32px
  space-8: 32px
  page: 40px
  xxl: 40px
  space-10: 40px
  gutter: 16px
  margin: 24px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.medium}"
    padding: "{spacing.control}"
    height: 40px
  button-elevated:
    backgroundColor: "{colors.surface-container-low}"
    textColor: "{colors.primary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.medium}"
    padding: "{spacing.control}"
    height: 40px
  button-tonal:
    backgroundColor: "{colors.secondary-container}"
    textColor: "{colors.on-secondary-container}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.medium}"
    padding: "{spacing.control}"
    height: 40px
  button-outlined:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.medium}"
    padding: "{spacing.control}"
    height: 40px
  button-text:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.medium}"
    padding: "{spacing.compact}"
    height: 40px
  fab:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.large}"
    padding: "{spacing.space-4}"
    size: 56px
  fab-extended:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.large}"
    padding: "{spacing.space-4}"
    height: 56px
  icon-button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.full}"
    padding: "{spacing.compact}"
    size: 40px
  segmented-button:
    backgroundColor: "{colors.surface-container-low}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: "{spacing.compact}"
    height: 40px
  card:
    backgroundColor: "{colors.surface-container-high}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.large}"
    padding: "{spacing.section}"
  card-elevated:
    backgroundColor: "{colors.surface-container-low}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.large}"
    padding: "{spacing.section}"
  card-outlined:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.large}"
    padding: "{spacing.section}"
  post-card:
    backgroundColor: "{colors.surface-container-high}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.large}"
    padding: "{spacing.section}"
  chip:
    backgroundColor: "{colors.surface-container-low}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: "{spacing.compact}"
    height: 32px
  input:
    backgroundColor: "{colors.surface-container-high}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.medium}"
    padding: "{spacing.control}"
    height: 56px
  input-outlined:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.medium}"
    padding: "{spacing.control}"
    height: 56px
  switch:
    backgroundColor: "{colors.surface-container-highest}"
    rounded: "{rounded.full}"
    height: 32px
    width: 52px
  checkbox:
    backgroundColor: "{colors.primary}"
    rounded: "{rounded.extra-small}"
    size: 18px
  radio:
    backgroundColor: "{colors.primary}"
    rounded: "{rounded.full}"
    size: 20px
  dialog:
    backgroundColor: "{colors.surface-container-high}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.extra-large}"
    padding: "{spacing.section}"
  bottom-sheet:
    backgroundColor: "{colors.surface-container-low}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.large}"
    padding: "{spacing.section}"
  side-sheet:
    backgroundColor: "{colors.surface-container-low}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.large}"
    padding: "{spacing.section}"
    width: 360px
  menu:
    backgroundColor: "{colors.surface-container}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.large}"
    padding: "{spacing.compact}"
  snackbar:
    backgroundColor: "{colors.inverse-surface}"
    textColor: "{colors.inverse-on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.extra-small}"
    padding: "{spacing.space-4}"
  tooltip:
    backgroundColor: "{colors.inverse-surface}"
    textColor: "{colors.inverse-on-surface}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.extra-small}"
    padding: "{spacing.compact}"
  top-app-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.title-lg}"
    height: 64px
  navigation-bar:
    backgroundColor: "{colors.surface-container}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    height: 80px
  search-bar:
    backgroundColor: "{colors.surface-container-high}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.full}"
    padding: "{spacing.space-4}"
    height: 56px
  state-layer:
    backgroundColor: "color-mix(in oklab, var(--on-surface) 8%, transparent)"
  code-block:
    backgroundColor: "var(--codeblock-bg)"
    textColor: "{colors.on-surface}"
    typography: "{typography.code}"
    rounded: "{rounded.small}"
    padding: "{spacing.section}"
  divider:
    backgroundColor: "{colors.outline-variant}"
    height: 1px
  badge:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-error}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
  progress-indicator:
    backgroundColor: "{colors.primary}"
    height: 4px
  loading-indicator:
    backgroundColor: "{colors.primary}"
    size: 48px
  scrim-backdrop:
    backgroundColor: "{colors.scrim}"
  elevation-shadow:
    backgroundColor: "{colors.shadow}"
---

## Overview

Shirone is a personal anime blog that treats reading as the primary interaction. Its visual language is **soft material editorial**: expressive enough to feel personal, restrained enough to keep long-form writing comfortable. Material 3 Expressive (MD3/M3E) supplies the interaction grammar and architectural backbone, while the anime character comes from the chosen wallpaper, dynamic hue, rounded geometry, and gentle typography rather than decorative UI chrome.

The design philosophy aligns directly with Google Material Design 3:
- **Personal**: Dynamic color adapts the UI to the configured seed hue, style, color specification, and light/dark mode via the client-side HCT engine (`mc-utils.ts`). Theming is individual and algorithmic rather than a static swatch book.
- **Adaptive**: The layout scaffold transforms smoothly across five window size classes (Compact, Medium, Expanded, Large, and Extra-large), adapting persistent shells and content containers responsively.
- **Expressive**: Shape morphing, spring physics approximations, emphasized typography, and tonal elevation create moments of delight without sacrificing long-form reading comfort or accessibility.

The interface feels calm on a first visit and efficient on a repeat visit. A reader can immediately orient themselves, identify the current page, scan post metadata, navigate comfortably across devices, and engage with content without friction.

## Colors

The palette is a tonal surface system, not a fixed swatch collection. All colors are calculated algorithmically in HCT (Hue, Chroma, Tone) space and written to runtime CSS custom properties (`--mc-*`), with semantic tokens (`--primary`, `--surface-container-*`, `--outline-*`) mapped in `src/styles/variables.styl`.

### Accent Roles
- **Primary**: High-emphasis actions, active page indicators, interactive links, reading progress, and focus outlines. Paired with **On-Primary** for text/icons on primary surfaces.
- **Primary Container**: Standout containers for key components such as the FAB, selected category chips, and highlighted notices. Paired with **On-Primary-Container**.
- **Secondary**: Selection and grouping states such as tonal chips, tabs, navigation indicators, and filter pills. Paired with **On-Secondary** and **Secondary Container** / **On-Secondary-Container**.
- **Tertiary**: Contrasting accent for expressive content, badges, and semantic distinctions (such as anime/timeline highlights) that should balance the reading path without competing with primary navigation. Paired with **On-Tertiary** and **Tertiary Container**.

### Surface Hierarchy
Depth in MD3 is communicated through **tonal surface color**, not shadows. Five container levels establish clean nesting hierarchy and depth:
- **Surface**: The baseline background for pages and resting areas (`--surface`).
- **Surface Dim / Bright**: Maintain relative brightness across both light and dark themes.
- **Surface Container Lowest**: The lowest-emphasis container, used for cards in light mode (`--surface-container-lowest`).
- **Surface Container Low**: Low-emphasis container, default page background in light mode (`--surface-container-low`).
- **Surface Container**: Default container for navigation bars, menus, and docked chrome (`--surface-container`).
- **Surface Container High**: High-emphasis container for inputs, dialogs, and dark mode cards (`--surface-container-high`).
- **Surface Container Highest**: Highest-emphasis container for switches, active chips, and selected list rows (`--surface-container-highest`).
- **On-Surface**: Default reading text and prominent icons.
- **On-Surface-Variant**: Supporting text, timestamps, metadata, and unselected icons.

### Outline and Boundaries
- **Outline**: Important boundaries requiring a 3:1 contrast ratio, such as text field borders and focused component frames.
- **Outline Variant**: Decorative boundaries, dividers, card borders, and subtle separators. Never use `outline` for simple dividers; reserve `outline` for interactive boundaries.

### Error and Inverse Roles
- **Error**: Urgent alerts, validation failures, protected-content password prompts, and error badges. Paired with **On-Error**, **Error Container**, and **On-Error-Container**.
- **Inverse Surface / Inverse On-Surface**: High-contrast transient feedback elements such as Snackbars and tooltips.
- **Inverse Primary**: Actionable buttons within inverse surfaces.

### Contrast Invariants
Color usage must adhere to strict WCAG 2.1 AA contrast requirements across both light and dark modes:
- Normal body and heading text must maintain at least **4.5:1** contrast against its background container.
- Large text (18pt+ or 14pt+ bold) and interactive UI boundaries (text field borders, focus rings) must maintain at least **3:1** contrast.
- Colors must only be combined in their intended tonal pairs (e.g., `primary` with `on-primary`, `surface-container` with `on-surface`). Arbitrary pairings are prohibited as they break dynamic HCT calculation and contrast modes.

## Typography

Shirone uses a refined typography hierarchy calibrated for bilingual editorial comfort. The default configuration pairs **Outfit** for Latin UI text, **Yozai Medium** for CJK text, and **JetBrains Mono** for code.

The system adopts the complete Material Design 3 15-scale baseline hierarchy organized into five categories (Display, Headline, Title, Body, Label) across three sizes (Large, Medium, Small), supplemented by Emphasized variants and a dedicated Code scale:

- **Display (Large 57sp / Medium 45sp / Small 36sp)**: Reserved strictly for the home banner, prominent hero typography, and major page brand statements. Never leak display styles into compact panels, sidebars, or utility controls.
- **Headline (Large 32sp / Medium 28sp / Small 24sp)**: Establishes section and article hierarchy. Shirone favors typographic rhythm and generous measure over aggressive marketing headlines.
- **Title (Large 22sp / Medium 16sp / Small 14sp)**: Used for card headers, dialog titles, sidebar widget headers, and post card titles. Title Medium is the standard heading for content cards.
- **Body (Large 16sp / Medium 14sp / Small 12sp)**: The primary long-form reading style. Body Large (16px / 1.5 line-height) ensures comfortable reading in articles, with generous line height and paragraph spacing. Body Medium serves card descriptions and excerpts; Body Small serves secondary footnotes and supporting metadata.
- **Label (Large 14sp / Medium 12sp / Small 11sp)**: Controls, buttons, navigation items, chips, and metadata badges. Labels maintain rapid scannability without visual noise.
- **Code (14sp / 0.875rem)**: Employs JetBrains Mono for code blocks and inline code, maintaining character legibility and punctuation balance.

Emphasized variants apply a medium/semi-bold weight to baseline tokens for active navigation states, primary buttons, and critical updates. All typography styles are tokenized as shorthand font tokens (`--m3e-type-*`) in `variables.styl`.

## Layout

Shirone implements an expressive adaptive reading layout built upon MD3 window size classes and an 8dp spacing system:

### Window Size Classes
- **Compact (<600dp / <640px)**: Single vertical reading column. The top app bar simplifies to a compact 64dp header with drawer/menu trigger; bottom navigation bar or modal sheets manage navigation; sidebar widgets stack below the content or tuck into drawers; touch targets expand to at least 48dp.
- **Medium (600–839dp / 640–768px)**: Adaptive reading column with a persistent navigation rail or compact header; cards and search views switch to docked layouts.
- **Expanded (840–1199dp / 768–1024px)**: Primary reading layout featuring a persistent sidebar alongside the main article stream; top app bar features full breadcrumbs and search triggers.
- **Large (1200–1599dp / 1024–1280px)**: Three-column layout expands when the secondary widget column is populated. Content width is constrained to preserve line measure readability.
- **Extra-large (1600dp+ / 1280px+)**: Constrained maximum reading width (840–1040dp) centered with generous gutters. Text lines must never stretch infinitely across ultra-wide monitors.

### Spacing System
Layout rhythm is governed by an **8dp spacing system** with a 4dp micro-step:
- `--m3e-space-1` (4px): Micro adjustments, inline icon gaps.
- `--m3e-space-2` / `compact` (8px): Chip padding, list item gaps, tight control spacing.
- `--m3e-space-3` / `control` (12px): Standard button padding, input padding.
- `--m3e-space-4` (16px): Card internal padding on compact screens, standard gutters.
- `--m3e-space-5` (20px): Intermediate component margins.
- `--m3e-space-6` / `section` (24px): Standard card padding, desktop margins, widget spacing.
- `--m3e-space-8` / `content` (32px): Major section separation within articles.
- `--m3e-space-10` / `page` (40px): Page header margins and vertical layout breaks.

### Density
Density defaults to **comfortable** (`--m3e-density: 0`) on touch devices and automatically adjusts to **compact** (`--m3e-density: -1`) on desktop precision pointers (`(hover: hover) and (pointer: fine)`), scaling component heights smoothly via `calc(base + var(--m3e-density) * 4px)`.

## Elevation & Depth

Depth is established primarily through **tonal surface elevation** and secondarily through subtle ambient shadows:

### Tonal Elevation Levels
- **Level 0 (0dp, flat)**: Page background (`--page-bg`), flat surfaces at rest.
- **Level 1 (1dp, +5% primary tint)**: Elevated cards at rest, modal bottom sheets, side sheets, lowered FAB.
- **Level 2 (3dp, +8% primary tint)**: Scrolled top app bar, floating toolbars, menus, elevated cards on hover.
- **Level 3 (6dp, +11% primary tint)**: Floating Action Buttons (FAB), dialogs, docked search bar, snackbars.
- **Level 4 (8dp, +12% primary tint)**: FAB hover and focus elevation, active drawer sheets.
- **Level 5 (12dp, +14% primary tint)**: Highest priority modal focus states.

### Shadow Layering
Shadows are calculated dynamically against `--mc-shadow` with low-opacity multi-layer blur to ensure natural separation without muddy dark rings. Heavy drop shadows, decorative glows, and frosted glass (glassmorphism) effects are strictly avoided: readability of text remains paramount.

## Shapes

Shirone employs a rounded, disciplined shape language reflecting both Material 3 Expressive and gentle anime aesthetics. Shapes range from sharp corners to full pill capsules:

- **None (0dp)**: Fullscreen search views, edge-to-edge banners.
- **Extra-small (4dp, `--shape-corner-xs`)**: Tooltips, snackbars, code inline tags.
- **Small (8dp, `--shape-corner-s`)**: Code blocks, menu containers, sub-chips.
- **Medium (12dp, `--shape-corner-m`)**: **Core control shape** — buttons, text fields, selects, autocomplete dropdowns.
- **Large (16dp, `--shape-corner-l`)**: **Core container shape** — post cards, content cards, sidebar widgets.
- **Large-increased (20dp)**: Expressive cards, expanded post previews.
- **Extra-large (28dp, `--shape-corner-xl`)**: Dialogs, alert dialogs, modal sheets, docked search bar.
- **Extra-large-increased (32dp) & Extra-extra-large (48dp)**: Expressive featured banners, large FAB morphs.
- **Full (9999px, `--shape-corner-full`)**: Chips, segmented buttons, badges, pill indicators, FABs.

### Shape Morphing
Components utilize shape morphing to communicate state transitions:
- **ToggleButton**: Unselected pill (full) morphs through 6dp corner radius under press to 12dp rounded rectangle when selected.
- **SplitButton**: Inner adjacent corners sharpen under rest (4dp) and expand to 12dp on interaction.
- **SearchBar**: 56dp docked capsule morphs to a 28px rounded rectangle when expanded into search results.

## Components

Components follow atomic design layering (`atoms/ → molecules/ → organisms/ → layouts/ → pages/`). Interactive feedback is governed by `.m3-state-layer`, which layers dynamic hover (8%), focus (10%), and pressed (12%) tints over the surface with native keyboard focus indicators.

### Action Components
- **Button**: Five official variants:
  - *Filled*: `primary` fill with `on-primary` text, for the primary page action.
  - *Elevated*: `surface-container-low` with `primary` text and Level 1 elevation, for secondary actions on flat backgrounds.
  - *Tonal*: `secondary-container` with `on-secondary-container` text, for mid-emphasis utilitarian actions.
  - *Outlined*: 1px `outline` border with `primary` text, for secondary standalone actions.
  - *Text*: Transparent container with `primary` text, for low-emphasis inline actions.
  Sizes span xsmall (32px), small (40px, default), medium (56px), large (96px), and xlarge (136px).
- **FAB & Extended FAB**: Floating action button anchored at Level 3 elevation. Primary, Secondary, Tertiary, and Surface variants provide responsive quick actions (e.g. Back-to-Top, Theme Switcher).
- **Icon Button**: Standard, filled, tonal, and outlined variants in 40px bounding box (with 48px touch target).
- **Segmented Button**: Multi-choice and single-choice grouped controls with animated checkmark selection.

### Containment & Display
- **Card**: Filled (`surface-container-highest`), elevated (`surface-container-low` + Level 1), and outlined (`surface` + `outline-variant`) variants. Rounded to 16px (`--shape-corner-l`).
- **PostCard**: Editorial card primitive combining metadata, responsive cover imagery (28% desktop width), title link, and reading metrics without nested interactive anchor tags.
- **Divider**: 1px `outline-variant` rule.

### Navigation & Search
- **Top App Bar**: 64dp persistent header providing site brand, search trigger, and navigation links.
- **Navigation Bar / Rail**: Bottom navigation for compact viewports; vertical rail for medium screens.
- **Search Bar & Search View**: Docked 56dp search bar with smooth animated expansion to docked or full-screen search view with history, suggestion keyboard navigation, and zero bundle impact when closed.

### Input & Feedback
- **TextField**: Filled (surface-container-high + bottom active indicator) and Outlined (1px outline-variant + 2px primary focus) variants with floating labels and assistive helper/error text.
- **Select & Autocomplete**: M3 compliant dropdowns with anchored elevation and typeahead navigation.
- **Switch, Checkbox, Radio**: Fully accessible selection controls with animated glyph transitions.
- **Chips**: Assist, filter, input, and suggestion chips in 32px height with full pill rounding.
- **Snackbar & Tooltip**: Transient notifications anchored in inverse surface tokens.
- **Progress & Loading Indicators**: Determinate/indeterminate linear and circular indicators, alongside M3 Expressive 7-shape polygon morphing loaders.

## Do's and Don'ts

- **Do** use semantic tokens (`--primary`, `--surface-container-*`, `--shape-corner-*`) for all styling.
- **Do** respect tonal pairing rules (always use `on-primary` on `primary`, `on-surface` on `surface`).
- **Do** preserve the 4.5:1 text contrast and 3:1 UI boundary contrast invariants.
- **Do** maintain the 12px button/input, 16px card, and 28px dialog/sheet shape contract.
- **Do** enforce readable maximum measure constraints (840–1040dp) on large viewports.
- **Do** ensure interactive elements provide at least a 48×48dp accessible touch target.
- **Do** support `prefers-reduced-motion` by falling back to instant opacity transitions.
- **Do** ensure optional third-party integrations adhere strictly to the zero extra burden rule.
- **Don't** hard-code hex, rgb, or fixed color values anywhere in component code.
- **Don't** use `outline` for decorative dividers; use `outline-variant` instead.
- **Don't** use shadows as the primary depth cue; depth must be established through tonal surface containers.
- **Don't** mix rounded and sharp corners arbitrarily across components.
- **Don't** create nested cards or use cards as generic section wrappers.
- **Don't** load heavy Web Components or client-side JavaScript on purely static SSR reading paths.
- **Don't** stretch body reading text across unlimited browser widths.
