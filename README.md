<div align="center">

<img src="./public/logo/icon.webp" width="88" height="88" alt="Shirone logo" />

# Shirone

**An expressive, anime-inspired blog theme built on Material 3 Expressive.**

A calm reading space for long-form writing, personal collections, and the small details that make a site feel like yours.

[Live demo](https://shirone.mysqil.com/) · [Documentation](https://docs.shirone.mysqil.com/) · [Report an issue](https://github.com/LyraVoid/Shirone/issues)

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md)

![Node.js >= 22.12](https://img.shields.io/badge/Node.js-%3E%3D22.12-5FA04E?logo=nodedotjs&logoColor=white)
![pnpm 9](https://img.shields.io/badge/pnpm-9-F69220?logo=pnpm&logoColor=white)
![Astro 7](https://img.shields.io/badge/Astro-7-BC52EE?logo=astro&logoColor=white)
[![License: MIT](https://img.shields.io/badge/License-MIT-3DA639.svg)](./LICENSE)

</div>

> [!IMPORTANT]
> **Start with the [online documentation](https://docs.shirone.mysqil.com/).** It is the primary guide for setup, configuration, content workflows, and deployment.

## Start Here

The [online documentation](https://docs.shirone.mysqil.com/) is the main entry point for setup, configuration, content workflows, and deployment. This repository contains the theme source; use [Shirone-Content](https://github.com/LyraVoid/Shirone-Content) when you want to keep personal content in a separate repository.

## Verified In Practice

The current reference run scores 100 for Performance, Accessibility, Best Practices, and SEO, with all three agentic browsing checks passing. The detailed performance metrics also reach 100 in this run; results can vary with hosting, content, and network conditions.

![Shirone benchmark](./Benchmark.webp)

![Shirone homepage](./public/assets/projects/shirone.webp)

<table>
  <tr>
    <td align="center"><strong>Chromatic Spell</strong><br><sub>Dynamic HCT palettes that respond to light, mood, and choice.</sub></td>
    <td align="center"><strong>Seamless Passage</strong><br><sub>Swup navigation keeps the surrounding world gently in motion.</sub></td>
  </tr>
  <tr>
    <td align="center"><strong>Story Grimoire</strong><br><sub>Markdown, MDX, math, diagrams, code, and images in one writing flow.</sub></td>
    <td align="center"><strong>Quiet by Design</strong><br><sub>SSR-first, accessible, and truly weightless when features are disabled.</sub></td>
  </tr>
</table>

## ✦ A Small Spell for Every Story

Shirone is a static personal blog theme built with Astro 7, Svelte 5, Tailwind CSS 4, and Stylus. Its magic is not a layer of spectacle: it lives in colors that shift with light and mood, pages that turn without breaking the atmosphere, and small details that make a personal corner of the web feel alive.

Behind that softness is a token-driven Material 3 Expressive component system. Content is rendered server-side, while Swup provides smooth in-site navigation and keeps the surrounding application shell alive between pages.

The theme is designed for long-form writing as well as personal collections such as moments, albums, anime lists, friends, projects, skills, and timelines.

## ✦ Inside the Grimoire

- Dynamic HCT color palettes with Material 3 and Material 3 Expressive specifications
- Light and dark themes, banner and solid backgrounds, optional textures, and visitor display preferences
- Responsive layouts with configurable single or dual sidebars
- Smooth Swup navigation with a persistent shell, route progress, and reduced-motion support
- Markdown and MDX content with math, Mermaid, admonitions, enhanced code blocks, and image galleries
- Full-text search powered by Pagefind, plus RSS and sitemap output
- Article table of contents, related posts, sharing, encryption, and optional comments
- Dedicated pages for archives, categories, tags, friends, moments, anime, albums, projects, skills, and timelines
- Ten built-in interface locales
- SSR-first output, keyboard-friendly interactions, and accessibility testing
- Optional integrations follow a zero-burden rule: when disabled, they add no external requests, DOM, layout shift, or main-bundle code

## ✦ AI Skills

Shirone ships with [agent skills](./.agents/skills/README.md) in `.agents/skills/`. AI coding assistants that support the Agent Skills standard (Claude Code, Codex, ZCode, and others) discover them automatically after you clone the repository — developer-oriented skills guide theme development, while user-oriented skills help you write posts, use the custom Markdown syntaxes, and configure your site. To package the same skills as one installable Codex plugin, run `pnpm.cmd skills:package -- --zip`.

## Quick Start

### Requirements

- [Node.js](https://nodejs.org/) 22.12 or newer
- [pnpm](https://pnpm.io/) 9.x (the repository pins `pnpm@9.14.4`)

### Run locally

```bash
git clone https://github.com/LyraVoid/Shirone.git
cd Shirone
corepack enable
pnpm install
pnpm dev
```

Open `http://localhost:4321` in your browser.

On Windows PowerShell installations where script execution is restricted, use `pnpm.cmd` and `npx.cmd` instead.

### Use the npm package

Prefer not to clone the theme? Install it as the `shirones` npm package and
scaffold a blog from an empty folder — no Astro starter and no manual installs:

```bash
mkdir my-blog
cd my-blog
npx shirones init   # writes package.json, installs astro + the theme + peers
pnpm dev
```

`init` creates `astro.config.mjs`, the typed configuration under `shirones/`,
example content and static assets; `src/components/` and `src/layouts/` still
work for overriding theme components. Re-run `npx shirones init` anytime to
check for drift (it never overwrites your files), or pass `--force` to restore
template files. See [npm package mode](./docs/npm-package-mode.md) and the
[shirones repository](https://github.com/yCENzh/shirones) for details.

### Customize your site

1. Set the canonical URL, title, language, theme, banner, and display options in `src/config/siteConfig.ts`.
2. Update the profile and navigation in `src/config/profileConfig.ts` and `src/config/navBarConfig.ts`.
3. Review the feature-specific files in `src/config/`; their inline comments document defaults and supported values.
4. Replace the sample posts, personal data, and media under `src/content/`, `src/data/`, and `public/`.
5. Create a post with `pnpm new-post <filename>`, then edit it under `src/content/posts/`.

See [`src/config/README.md`](./src/config/README.md) for the complete configuration contract.

## Official Companion Repositories

Shirone keeps theme source, personal site content, and npm publishing responsibilities separate. These official repositories serve different workflows:

| Repository | Use it for | What it contains |
| --- | --- | --- |
| [Shirone-Content](https://github.com/LyraVoid/Shirone-Content) | Running a blog in the external-content, dual-repository mode | A content template for posts, moments, data, media, and `config/*.yaml` overlays. Fork or clone it into your own repository, normally private, then point this theme repository at it. See the [content-separation guide](./docs/content-separation/README.md). |
| [shirones](https://github.com/yCENzh/shirones) | Maintaining and publishing the `shirones` npm package | The manual build-and-publish pipeline. It pulls this repository at build time and deliberately contains no theme source; regular blog users install `shirones` rather than working in this repository. See [npm package mode](./docs/npm-package-mode.md). |

## Main Configuration

| File | Purpose |
| --- | --- |
| `src/config/siteConfig.ts` | Site URL, identity, locale, dynamic color, banner, texture, TOC, and display settings |
| `src/config/profileConfig.ts` | Author profile and social links |
| `src/config/navBarConfig.ts` | Main navigation |
| `src/config/sidebarConfig.ts` | Sidebar layout, widgets, and page filters |
| `src/config/postListConfig.ts` | Pagination and list/grid presentation |
| `src/config/articleConfig.ts` | Update notice, related posts, and article sharing |
| `src/config/commentConfig.ts` | Optional comment provider |
| `src/config/musicConfig.ts` | Optional local, custom, Meting, or mixed music source |
| `src/config/animeConfig.ts` | Anime page and local/Bangumi/Bilibili snapshot source |

## Writing a Post

Posts live in `src/content/posts/` and may be Markdown or MDX. A minimal frontmatter block looks like this:

```yaml
---
title: My First Post
published: 2026-08-26
description: A short summary shown in post lists and metadata.
image: ./cover.webp
tags: [Astro, Notes]
category: Writing
draft: false
---
```

Frequently used optional fields include `updated`, `pinned`, `comment`, `lang`, `encrypted`, `password`, `passwordHint`, and `hideHomeContent`. Images may be remote URLs, absolute paths from `public/`, or paths relative to the post file.

## Commands

| Command | Action |
| --- | --- |
| `pnpm dev` | Start the development server |
| `pnpm new-post <filename>` | Create a new post |
| `pnpm format` | Format source files with Biome (mandatory before commit) |
| `pnpm check` | Run Astro diagnostics |
| `pnpm type-check` | Run TypeScript checks |
| `pnpm check:manifest` | Validate the component manifest |
| `pnpm test` | Run the Playwright test suite |
| `pnpm build` | Build the site and Pagefind index into `dist/` |
| `pnpm preview` | Preview the production build |
| `pnpm lighthouse` | Run the desktop production audit |

## Deployment

Shirone produces a static `dist/` directory and can be deployed to Vercel, Netlify, GitHub Pages, or any static hosting service.

Before deploying, update `site` and `base` in `src/config/siteConfig.ts`, then run:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm type-check
pnpm check:manifest
pnpm build
```

Use `pnpm build` as the build command and `dist` as the output directory. More details are available in [`INDEX.md`](./INDEX.md).

## Documentation

- [`src/config/README.md`](./src/config/README.md) - configuration reference
- [`docs/m3e-standard.md`](./docs/m3e-standard.md) - design tokens and component standard
- [`docs/atomic-structure.md`](./docs/atomic-structure.md) - component layers and dependency rules
- [`docs/markdown-extensions.md`](./docs/markdown-extensions.md) - Markdown plugin, styling, cache, and testing contracts
- [`docs/markdown-on-demand-loading.md`](./docs/markdown-on-demand-loading.md) - content-driven Markdown asset loading and Swup lifecycle
- [`docs/sidebar-system.md`](./docs/sidebar-system.md) - sidebar orchestration and Swup synchronization
- [`docs/on-demand-loading.md`](./docs/on-demand-loading.md) - zero-burden optional features
- [`docs/font-system.md`](./docs/font-system.md) - font configuration and production subsetting
- [`docs/npm-package-mode.md`](./docs/npm-package-mode.md) - how the theme also runs as an npm package, and the override system
- [`docs/packaging-contract.md`](./docs/packaging-contract.md) - rules new theme code must follow to keep working when installed from npm

## Contributing

Issues and pull requests are welcome. For substantial features or visual changes, please open an issue or discussion first. Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) and the repository rules before submitting code. Always format your changes with `pnpm format` before committing, keep each pull request focused, and use Conventional Commits.

## Acknowledgements

Shirone began as a refactor of [Fuwari](https://github.com/saicaca/fuwari) by [saicaca](https://github.com/saicaca). Its current M3E design system, component architecture, page modules, and orchestration are developed as Shirone. Thanks to the Fuwari project and its contributors for the original foundation.

## Contributors

Every contribution adds a new line to Shirone's spellbook. Thank you to everyone who helps this little world grow.

<div align="center">
  <a href="https://github.com/LyraVoid/Shirone/graphs/contributors">
    <img src="https://contrib.rocks/image?repo=LyraVoid/Shirone" alt="Shirone contributors" />
  </a>
</div>

## Star Trail

<div align="center">
  <a href="https://star-history.com/#LyraVoid/Shirone&amp;Date">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=LyraVoid/Shirone&amp;type=Date&amp;theme=dark" />
      <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=LyraVoid/Shirone&amp;type=Date" />
      <img alt="Shirone Star History chart" src="https://api.star-history.com/svg?repos=LyraVoid/Shirone&amp;type=Date" />
    </picture>
  </a>
  <p><sub>Each star is a spark that helps Shirone shine a little farther.</sub></p>
</div>

## License

Shirone is released under the [MIT License](./LICENSE). The repository retains the original copyright notice required by that license.
