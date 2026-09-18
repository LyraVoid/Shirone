---
title: Include Video in the Posts
published: 2023-08-01
description: This post demonstrates how to include embedded video in a blog post.
tags: [Example, Video]
series: media-embeds
seriesOrder: 1
category: Examples
draft: false
---

Just copy the embed code from YouTube or other platforms, and paste it in the markdown file.

```yaml
---
title: Include Video in the Post
published: 2023-10-19
// ...
---

<iframe width="100%" height="468" src="https://www.youtube.com/embed/5gIf0_xpFPI?si=N1WTorLKL0uwLsU_" title="YouTube video player" frameborder="0" allowfullscreen></iframe>
```

## YouTube

::youtube{id="5gIf0_xpFPI" title="YouTube video" preload="auto"}

## Bilibili

::bilibili{bvid="BV1fK4y1s7Qf" title="Bilibili video" p=1 preload="auto"}

## AcFun

::acfun{acid="ac48649632" title="AcFun video" preload="auto"}

## ArtPlayer

::artplayer{src="https://www.pexels.com/download/video/38538991/" title="Sintel trailer" preload="auto"}
