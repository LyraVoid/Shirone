---
title: Markdown Collapse Panels
published: 2026-08-28
description: Group optional Markdown content into compact, accessible M3E disclosure panels.
tags: [Demo, Markdown, Collapse, Shirone]
category: Guides
lang: en
draft: false
---

Collapse panels keep related optional details in one compact group. Titles and bodies retain inline and block Markdown, while native disclosure semantics make every panel usable without client JavaScript.

## Independent panels

Items open independently by default. Prefix a title with `:+` to open that item initially or `:-` to keep it closed when the group uses `expand`.

::: collapse
- **Package requirements**

  Use Node.js 26.13.0 or newer and enable Corepack before installing packages.

- :+ Install dependencies

  Run the workspace package command from the repository root.

  ```powershell
  pnpm.cmd install
  ```

- Validation commands

  Check the content pipeline before building the production output.

  - `pnpm.cmd check:manifest`
  - `npx.cmd astro check`
:::

## Accordion mode

Add `accordion` when only one answer should remain open. The browser groups the native disclosures directly, so opening another item closes the previous one without hydration.

::: collapse accordion expand
- What does `expand` do here?

  It opens the first item initially when no item has a `:+` marker.

- Can a title contain Markdown?

  Yes. Titles support inline **emphasis** and `code`, while panel bodies support full block Markdown.

- What happens on a narrow screen?

  Content padding becomes compact, long text wraps, and embedded code keeps its own horizontal scrolling area.
:::

## Author syntax

````markdown
::: collapse accordion
- :+ First title

  First panel content.

- Second title with `code`

  Second panel content.
:::
````

The container must contain exactly one top-level unordered list. Every item needs a title paragraph, a blank line, and body content. Invalid or mixed input remains an ordinary readable Markdown list.
