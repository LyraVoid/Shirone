---
title: Shirone Markdown Enhancements
published: 2026-08-19
pinned: true
description: Explore Shirone's custom Markdown extensions, expressive components, and authoring syntax.
tags: [Demo, Markdown, Extensions, Theme, Shirone]
category: Guide
lang: en
draft: false
---

Shirone provides a collection of theme-exclusive Markdown extensions and custom syntax containers. Built on top of our native unified AST processing pipeline, all extensions render into accessible, semantic HTML during site build time with **zero client JavaScript hydration overhead** and **100% M3E design token alignment**.

## File Trees

File Trees turn multi-level project structures, source hierarchies, and terminal directory outputs into compact, interactive tree views with automatic extension icons, diff highlighting, and collapsible branches.

### 1. Nested List Syntax (`:::file-tree`)

Use the `:::file-tree` block directive when writing the file hierarchy directly as a Markdown nested list.

```markdown
:::file-tree{title="Shirone source tree"}
- src
  - components/
    - ++ Navigation.svelte # added component
    - -- Button.astro # removed component
  - content
    - posts/
      - markdown-enhancements.md
  - layouts/
    - PostLayout.astro
  - plugins
    - markdown/
      - rehype-file-tree.mjs
  - styles
    - markdown/
      - trees.css
  - **content.config.ts** # important file
- public/
  - favicon.svg
- package.json
:::
```

:::file-tree{title="Shirone source tree"}
- src
  - components/
    - ++ Navigation.svelte # added component
    - -- Button.astro # removed component
  - content
    - posts/
      - markdown-enhancements.md
  - layouts/
    - PostLayout.astro
  - plugins
    - markdown/
      - rehype-file-tree.mjs
  - styles
    - markdown/
      - trees.css
  - **content.config.ts** # important file
- public/
  - favicon.svg
- package.json
:::

#### Authoring Rules & Markers

- **Diff States**: Prefix an item with `++` (green background & badge) or `--` (red background & strikethrough) to highlight changes.
- **Comments**: Any text following a `#` is rendered as a muted, right-aligned inline comment.
- **Emphasis**: Wrap names in `**bold**` to give key files prominent visual weight.
- **Collapsible Folders**: Directories inferred from nested list items start expanded by default. Add a trailing slash (e.g. `components/`) to create a collapsed directory that readers can expand on click or via keyboard navigation.

---

### 2. Terminal Output Syntax (```` ```file-tree ````)

When you already have directory tree text generated from command-line tools like `tree`, paste it directly into a `file-tree` fenced code block. Both Unicode branch characters (`├──`, `└──`, `│`) and ASCII branches are automatically parsed.

````markdown
```file-tree title="Build output" icon="simple"
dist
├── _astro/
│   ├── index.css
│   └── page.js
└── favicon.ico
```
````

```file-tree title="Build output" icon="simple"
dist
├── _astro/
│   ├── index.css
│   └── page.js
└── favicon.ico
```

#### Configuration Options

- `title="string"`: Sets a custom header title and accessible label for the tree.
- `icon="colored" | "simple"`: Choose between multi-color extension icons (`colored`, default) or minimal monochrome icons (`simple`).

---

## Code Trees

Interactive Code Trees pair a multi-level file hierarchy navigation pane on the left with instant code panel switching on the right. They provide an IDE-like reading experience for multi-file examples, modules, or whole directory walk-throughs.

### 1. Container Syntax (`:::code-tree`)

Combine multiple fenced code blocks within a `:::code-tree` block directive. Each code block specifies its path via `title="path/to/file"`.

````markdown
:::code-tree{title="Shirone Component Demo" height="380px" entry="src/Button.svelte"}
```svelte title="src/Button.svelte"
<script lang="ts">
  let { label = "Click me" } = $props();
</script>

<button class="m3-btn">{label}</button>
```

```stylus title="src/styles/button.styl"
.m3-btn
  background: var(--primary)
  color: var(--on-primary)
  border-radius: var(--shape-corner-m)
```

```json title="package.json"
{
  "name": "button-demo",
  "version": "1.0.0"
}
```
:::
````

:::code-tree{title="Shirone Component Demo" height="380px" entry="src/Button.svelte"}
```svelte title="src/Button.svelte"
<script lang="ts">
  let { label = "Click me" } = $props();
</script>

<button class="m3-btn">{label}</button>
```

```stylus title="src/styles/button.styl"
.m3-btn
  background: var(--primary)
  color: var(--on-primary)
  border-radius: var(--shape-corner-m)
```

```json title="package.json"
{
  "name": "button-demo",
  "version": "1.0.0"
}
```
:::

#### Configuration & Markers

- `title="string"`: Sets the header title and accessible label for the code tree.
- `height="string"`: Sets the height for the desktop view (default `420px`, e.g. `380px`, `26rem`).
- `entry="filepath"`: Specifies which file is active upon first load.
- `icon="colored" | "simple"`: Switch between colorful or minimal monochrome file icons.
- `:active`: Place `:active` on any fenced code block to designate it as the default active tab.

---

### 2. Local Directory Auto-Import (`@[code-tree]`)

Point directly to any local directory path in the workspace to automatically scan and generate an interactive code tree at build time without manually copying file contents.

```markdown
@[code-tree title="Anime Utilities" entry="status.ts"](/src/utils/anime)
```

@[code-tree title="Site Configuration" entry="siteConfig.ts"](/src/config)

