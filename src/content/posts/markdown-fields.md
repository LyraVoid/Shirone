---
title: Markdown Field Cards
description: API and component parameter documentation cards.
published: 2026-08-30
draft: true
---

Use `field-group` when several related options belong to the same API or component. Put the field name on the opening line, then add metadata tags before the description.

:::: field-group

::: field tex
@type object
@optional

TeX parser options.
:::

::: field output
@type `'svg' | 'chtml'`
@default `'svg'`
@optional

Output format, SVG or generic HTML.
:::

::::

## Basic Fields

Required, optional, and deprecated statuses can be mixed in one group. Default values are kept separate from the type so they remain easy to scan.

:::: field-group

::: field title
@type string
@required

The visible title of the component. This value is shown in the page heading and should be short enough to scan quickly.
:::

::: field disabled
@type boolean
@default `false`
@optional

Whether the control starts in a disabled state.
:::

::: field locale
@type `'en' | 'zh-CN' | 'ja-JP'`
@default `'en'`
@optional

Locale used for formatting dates, numbers, and accessible labels.
:::

::::

## Rich Descriptions

Descriptions are ordinary Markdown. Links, emphasis, lists, and inline code remain available after the metadata lines.

:::: field-group

::: field render
@type `(value: unknown) => string`
@required

Render a value into the final output. The callback should return a **safe string** and may use the `formatValue` helper.

- Keep rendering deterministic.
- Avoid network requests inside the callback.
:::

::: field retries
@type number
@default `3`
@optional

Maximum number of attempts before the request is reported as failed.
:::

::: field legacyMode
@type boolean
@deprecated

Kept for backwards compatibility. New integrations should use `compatibility` instead.
:::

::::

## Standalone Field

A single field can be used without a group when documenting one option next to an example or code block.

::: field format
@type `'short' | 'long'`
@default `'short'`
@optional

Controls how the result is formatted.
:::

## Authoring Notes

- `@type` and `@default` values are rendered as code tokens.
- `@required`, `@optional`, and `@deprecated` add a status badge.
- Any normal Markdown after the metadata becomes the field description.
- Unknown `@tags` remain visible as description text instead of being discarded.
