---
title: Mermaid Diagram Gallery
published: 2024-05-02
description: A gallery of Mermaid diagrams for processes, interactions, data models, schedules, and project history.
tags: [Demo, Example, Markdown, Mermaid]
category: Examples
lang: en
draft: false
---

Mermaid turns text descriptions in Markdown into diagrams. The examples below use Shirone's content workflow to demonstrate diagram types commonly used in technical articles and project notes.

## Flowchart

Flowcharts describe a process, including decisions and paths that return to an earlier step.

```mermaid
flowchart TD
    accTitle: Article publishing workflow
    accDescr: An article moves through writing, validation, preview, and build before publication. Failed validation returns it for revision.
    Draft[Write Markdown] --> Check{Validation passed?}
    Check -->|No| Revise[Revise article]
    Revise --> Check
    Check -->|Yes| Preview[Preview locally]
    Preview --> Build[Build static page]
    Build --> Publish[Publish]
```

## Sequence Diagram

Sequence diagrams present collaboration between participants in chronological order. This example follows a Swup navigation from request to Mermaid rendering.

```mermaid
sequenceDiagram
    accTitle: Diagram rendering after in-site navigation
    accDescr: A reader starts navigation, Swup replaces the article content, and the Mermaid renderer enhances diagrams on the new page.
    actor Reader
    participant Browser
    participant Swup
    participant Content as Article region
    participant Renderer as Mermaid renderer
    Reader->>Browser: Open another article
    Browser->>Swup: Start in-site navigation
    Swup->>Content: Replace page content
    Swup-->>Renderer: Emit content:replace
    Renderer->>Content: Find Mermaid containers
    Renderer-->>Browser: Insert themed SVGs
```

## Entity Relationship Diagram

Entity relationship diagrams model structured data and the connections between authors, posts, tags, and comments.

```mermaid
erDiagram
    accTitle: Blog content relationships
    accDescr: Authors write posts, posts receive comments, and join records connect posts to multiple tags.
    AUTHOR ||--o{ POST : writes
    POST ||--o{ COMMENT : receives
    POST ||--o{ POST_TAG : classified_by
    TAG ||--o{ POST_TAG : groups
    AUTHOR {
        string id PK
        string display_name
    }
    POST {
        string slug PK
        string title
        datetime published_at
        string author_id FK
    }
    COMMENT {
        string id PK
        string post_slug FK
        string body
    }
    TAG {
        string id PK
        string label
    }
    POST_TAG {
        string post_slug FK
        string tag_id FK
    }
```

## Class Diagram

Class diagrams communicate responsibilities, public methods, and dependency directions in a software design.

```mermaid
classDiagram
    accTitle: Markdown rendering modules
    accDescr: The content pipeline uses a Mermaid plugin to create fallback markup, which the client renderer later enhances into an SVG.
    class ContentPipeline {
        +render(markdown)
        +collectMetadata()
    }
    class MermaidPlugin {
        +transform(codeFence)
        +createFallback()
    }
    class DiagramRenderer {
        +initialize()
        +renderAll()
        +refreshTheme()
    }
    class ThemeTokens {
        +primary
        +surface
        +outline
    }
    ContentPipeline --> MermaidPlugin : uses
    DiagramRenderer --> MermaidPlugin : enhances output
    DiagramRenderer --> ThemeTokens : reads
```

## State Diagram

State diagrams show the lifecycle of an object and the events that move it between states.

```mermaid
stateDiagram-v2
    accTitle: Article lifecycle
    accDescr: An article moves from draft to review and publication. It may return for revision or eventually be archived.
    [*] --> Draft
    Draft --> InReview : submit
    InReview --> Draft : request changes
    InReview --> Published : approve
    Published --> Draft : retract
    Published --> Archived : archive
    Archived --> [*]
```

## XY Chart

XY charts combine bars and lines to compare values and trends over a shared axis.

```mermaid
xychart-beta
    accTitle: Six weeks of content performance
    accDescr: Bars show normalized weekly publishing volume, while the line shows normalized reading completion.
    title "Six weeks of content performance"
    x-axis "Week" [1, 2, 3, 4, 5, 6]
    y-axis "Relative score" 0 --> 100
    bar [36, 52, 44, 68, 76, 84]
    line [48, 55, 62, 61, 73, 81]
```

## Pie Chart

Pie charts provide a compact comparison of how categories contribute to a whole.

```mermaid
pie showData
    accTitle: Article topics by share
    accDescr: Engineering accounts for forty percent, design systems for twenty-five percent, and the remainder is split between guides and essays.
    title Article topics by share
    "Engineering" : 40
    "Design systems" : 25
    "Guides" : 20
    "Essays" : 15
```

## Gantt Chart

Gantt charts arrange tasks, dependencies, and milestones along a calendar timeline.

```mermaid
gantt
    accTitle: Theme release plan
    accDescr: The release plan moves from requirements and interaction design through component development, testing, and release.
    title Theme release plan
    dateFormat YYYY-MM-DD
    axisFormat %m/%d
    section Design
    Confirm requirements :done, brief, 2024-05-06, 2d
    Refine interactions :done, interaction, after brief, 3d
    section Implementation
    Develop components :active, components, after interaction, 6d
    Write examples :examples, after interaction, 4d
    section Validation
    Automated tests :tests, after components, 3d
    Release :milestone, release, after tests, 0d
```

## Mind Map

Mind maps expand a central topic into related areas and supporting concepts.

```mermaid
mindmap
  root((Shirone))
    Content experience
      Markdown
      Search
      Diagrams
    Interface system
      M3E tokens
      Responsive layout
      Color schemes
    Engineering quality
      Astro Check
      Playwright
      Accessibility
```

## Timeline

Timelines summarize significant events or phases without requiring exact calendar durations.

```mermaid
timeline
    title Mermaid support evolution
    Pipeline design : Detect Mermaid fences
                    : Preserve source fallback
    Client enhancement : Load the runtime on demand
                       : Apply theme tokens
    Reliability : Support Swup navigation
                : Verify responsive and accessible output
```

## User Journey

User journey diagrams combine actions, participants, and experience scores across the stages of a task.

```mermaid
journey
    accTitle: A reader understanding a technical article
    accDescr: The reader discovers an article, combines prose with diagrams to understand it, and then explores related topics.
    title A reader understanding a technical article
    section Discover
      Browse the article list: 4: Reader
      Choose a topic: 5: Reader
    section Understand
      Read the article: 4: Reader
      Inspect a relationship diagram: 5: Reader
    section Continue
      Open a related article: 4: Reader
      Bookmark the page: 3: Reader
```

## Git Graph

Git graphs show how work progresses on a feature branch before it merges into the main line.

```mermaid
gitGraph
    accTitle: Mermaid feature branch history
    accDescr: A feature branch adds the renderer and tests before merging into the main branch for release.
    commit id: "base"
    branch mermaid
    checkout mermaid
    commit id: "add-renderer"
    commit id: "add-tests"
    checkout main
    merge mermaid id: "merge-mermaid"
    commit id: "release"
```

## Kanban Board

Kanban boards group tasks by workflow state to make current progress easy to scan.

```mermaid
kanban
  backlog[Backlog]
    docs[Write author documentation]
    examples[Expand example data]
  active[In progress]
    themes[Verify theme adaptation]
  complete[Complete]
    fallback[Source fallback]
    rendering[Client rendering]
```

## Sankey Diagram

Sankey diagrams use link width to show how traffic or another quantity flows between nodes.

```mermaid
sankey-beta
Landing,Reading,720
Discovery,Reading,430
Reading,Explore,360
Reading,Topics,210
Reading,Outbound,140
```

## Line Breaks in Labels

HTML labels accept a line break, so a label can wrap without widening the diagram.

```mermaid
flowchart LR
  A[First line<br>Second line] --> B[Plain label]
```

Each example uses a standard `mermaid` code fence. The server preserves readable source markup, and the browser enhances it into an SVG that follows the active theme. Diagrams render again when the theme changes or when Swup navigates to this article.