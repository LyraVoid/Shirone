<script lang="ts">
/**
 * 时间线节点卡片（分子）：
 * - 纯 M3E 设计令牌驱动（--card-bg、--outline-variant、--primary 等）；
 * - 时间轴轨道（Rail & Marker）与事件内容卡片（Body）紧密联动；
 * - 重点里程碑（featured）高亮展示：主题色光环、Featured 徽标与视觉聚焦；
 * - 响应式断点自适应（桌面/平板宽幅、手机紧凑）。
 */

import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import { reveal } from "@utils/motion";
import type { TimelineItem } from "@/types/timelineConfig";

let {
	item,
	categoryLabel = "",
	categoryIcon = "",
	delay = 0,
	isLast = false,
}: {
	item: TimelineItem;
	categoryLabel?: string;
	categoryIcon?: string;
	delay?: number;
	isLast?: boolean;
} = $props();

const markerIcon = $derived(
	item.icon || categoryIcon || "material-symbols:flag-rounded",
);
</script>

<article
	class={`timeline-card ${item.featured ? "timeline-card--featured" : ""} ${isLast ? "timeline-card--last" : ""}`}
	use:reveal={{ delay }}
>
	<!-- 左侧时间线轨道与节点图标 -->
	<div class="timeline-card__rail" aria-hidden="true">
		<div class="timeline-card__track"></div>
		<div class="timeline-card__marker">
			<Icon icon={markerIcon} />
		</div>
	</div>

	<!-- 右侧内容卡片主体 -->
	<div class="timeline-card__body">
		<!-- 头部元数据栏：日期、分类标签、重点里程碑徽标 -->
		<div class="timeline-card__meta-bar">
			<time class="timeline-card__date">{item.date}</time>

			{#if categoryLabel}
				<span class="timeline-card__category">
					{#if categoryIcon}
						<Icon icon={categoryIcon} aria-hidden="true" />
					{/if}
					<span>{categoryLabel}</span>
				</span>
			{/if}

			{#if item.featured}
				<span class="timeline-card__featured-pill">
					<Icon icon="material-symbols:star-rounded" aria-hidden="true" />
					<span>Featured</span>
				</span>
			{/if}
		</div>

		<!-- 标题与机构/地点 -->
		<div class="timeline-card__heading">
			<h2 class="timeline-card__title">{item.title}</h2>

			{#if item.subtitle || item.location}
				<div class="timeline-card__sub-row">
					{#if item.subtitle}
						<span class="timeline-card__subtitle">
							<Icon icon="material-symbols:domain-rounded" aria-hidden="true" />
							<span>{item.subtitle}</span>
						</span>
					{/if}
					{#if item.location}
						<span class="timeline-card__location">
							<Icon icon="material-symbols:location-on-outline-rounded" aria-hidden="true" />
							<span>{item.location}</span>
						</span>
					{/if}
				</div>
			{/if}
		</div>

		<!-- 详细说明正文 -->
		{#if item.description}
			<p class="timeline-card__description">{item.description}</p>
		{/if}

		<!-- 亮点 / 成就列表 -->
		{#if item.highlights && item.highlights.length > 0}
			<ul class="timeline-card__highlights">
				{#each item.highlights as highlight (highlight)}
					<li>{highlight}</li>
				{/each}
			</ul>
		{/if}

		<!-- 技术栈 / 关联标签 -->
		{#if item.tags && item.tags.length > 0}
			<ul class="timeline-card__tags" aria-label={i18n(I18nKey.tags)}>
				{#each item.tags as tag (tag)}
					<li>{tag}</li>
				{/each}
			</ul>
		{/if}

		<!-- 外部链接列表 -->
		{#if item.links && item.links.length > 0}
			<div class="timeline-card__actions">
				{#each item.links as link (link.url)}
					<a
						href={link.url}
						target="_blank"
						rel="noopener noreferrer"
						class="timeline-card__link"
					>
						<Icon
							icon={link.icon ?? "material-symbols:open-in-new-rounded"}
							aria-hidden="true"
						/>
						<span>{link.label}</span>
					</a>
				{/each}
			</div>
		{/if}
	</div>
</article>

<style lang="stylus">
@import "../../styles/breakpoints.styl"

.timeline-card
	position: relative
	display: flex
	align-items: stretch
	gap: 1.25rem
	min-width: 0

	@media (max-width: bp-sm - 1px)
		gap: 0.75rem

	/* === 左侧轨道与节点 === */
	&__rail
		position: relative
		display: flex
		flex-direction: column
		align-items: center
		flex-shrink: 0
		width: 2.75rem

		@media (max-width: bp-sm - 1px)
			width: 2rem

	&__track
		position: absolute
		top: 0
		bottom: -1.5rem
		left: 50%
		width: 2px
		transform: translateX(-50%)
		background: var(--outline-variant)
		transition: background-color var(--m3e-duration-medium) var(--m3e-easing-standard)

	&--last &__track
		bottom: auto
		height: 1.5rem

	&__marker
		position: relative
		z-index: 1
		display: flex
		align-items: center
		justify-content: center
		width: 2.75rem
		height: 2.75rem
		box-sizing: border-box
		margin-top: 0.25rem
		border-radius: var(--shape-corner-full)
		border: 2px solid var(--outline-variant)
		background: var(--surface-container-high)
		color: var(--on-surface-variant)
		box-shadow: 0 0 0 4px var(--card-bg)
		transition:
			transform var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate),
			border-color var(--m3e-duration-medium) var(--m3e-easing-standard),
			background-color var(--m3e-duration-medium) var(--m3e-easing-standard),
			color var(--m3e-duration-medium) var(--m3e-easing-standard),
			box-shadow var(--m3e-duration-medium) var(--m3e-easing-standard)

		> :global(svg)
			width: 1.25rem
			height: 1.25rem

		@media (max-width: bp-sm - 1px)
			width: 2rem
			height: 2rem

			> :global(svg)
				width: 1rem
				height: 1rem

	&--featured &__marker
		border-color: var(--primary)
		background: var(--primary-container)
		color: var(--on-primary-container)
		box-shadow: 0 0 0 4px var(--card-bg), 0 0 0 6px unquote("color-mix(in oklab, var(--primary) 18%, transparent)")

	&:hover &__marker
		transform: scale(1.12)
		border-color: var(--primary)
		color: var(--primary)

	&--featured:hover &__marker
		color: var(--on-primary-container)
		box-shadow: 0 0 0 4px var(--card-bg), 0 0 0 7px unquote("color-mix(in oklab, var(--primary) 28%, transparent)")

	/* === 右侧卡片主体 === */
	&__body
		display: flex
		flex-direction: column
		flex: 1
		gap: 0.75rem
		min-width: 0
		margin-bottom: 1.5rem
		padding: 1.25rem 1.5rem
		box-sizing: border-box
		border: 1px solid var(--outline-variant)
		border-radius: var(--shape-corner-l)
		background: var(--card-bg)
		transition:
			border-color var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate),
			box-shadow var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate),
			background-color var(--m3e-duration-medium) var(--m3e-easing-standard)

		@media (max-width: bp-sm - 1px)
			padding: 1rem
			margin-bottom: 1rem

	&:hover &__body
		border-color: var(--outline)
		box-shadow: var(--m3e-elevation-1)
		background: unquote("color-mix(in oklab, var(--on-surface) 2%, var(--card-bg))")

	&--featured &__body
		border-color: unquote("color-mix(in oklab, var(--primary) 40%, var(--outline-variant))")

	&--featured:hover &__body
		border-color: var(--primary)

	/* 元数据栏 */
	&__meta-bar
		display: flex
		flex-wrap: wrap
		align-items: center
		gap: 0.5rem

	&__date
		display: inline-flex
		align-items: center
		padding: 0.125rem 0.625rem
		border-radius: var(--shape-corner-full)
		background: var(--surface-container-high)
		color: var(--on-surface)
		font: var(--m3e-type-label-medium)
		font-weight: 600
		font-variant-numeric: tabular-nums

	&__category
		display: inline-flex
		align-items: center
		gap: 0.25rem
		padding: 0.125rem 0.5rem
		border-radius: var(--shape-corner-full)
		background: var(--secondary-container)
		color: var(--on-secondary-container)
		font: var(--m3e-type-label-small)
		font-weight: 500

		> :global(svg)
			width: 0.875rem
			height: 0.875rem

	&__featured-pill
		display: inline-flex
		align-items: center
		gap: 0.25rem
		padding: 0.125rem 0.5rem
		border-radius: var(--shape-corner-full)
		background: unquote("color-mix(in oklab, var(--primary) 14%, transparent)")
		color: var(--primary)
		font: var(--m3e-type-label-small)
		font-weight: 600

		> :global(svg)
			width: 0.875rem
			height: 0.875rem

	/* 标题与副标 */
	&__heading
		display: flex
		flex-direction: column
		gap: 0.25rem
		min-width: 0

	&__title
		margin: 0
		min-width: 0
		color: var(--on-surface)
		font: var(--m3e-type-title-medium)
		font-weight: 600
		line-height: 1.3
		overflow-wrap: anywhere
		transition: color var(--m3e-duration-short) var(--m3e-easing-standard)

		.timeline-card:hover &
			color: var(--primary)

	&__sub-row
		display: flex
		flex-wrap: wrap
		align-items: center
		gap: 0.875rem
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-small)

	&__subtitle, &__location
		display: inline-flex
		align-items: center
		gap: 0.25rem

		> :global(svg)
			width: 0.875rem
			height: 0.875rem
			flex-shrink: 0

	/* 说明正文 */
	&__description
		margin: 0
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-medium)
		line-height: 1.6

	/* 亮点列表 */
	&__highlights
		display: flex
		flex-direction: column
		gap: 0.375rem
		margin: 0
		padding: 0
		list-style: none

		li
			position: relative
			padding-left: 1.125rem
			color: var(--on-surface-variant)
			font: var(--m3e-type-body-small)
			line-height: 1.5

			&::before
				content: ""
				position: absolute
				left: 0.25rem
				top: 0.5rem
				width: 5px
				height: 5px
				border-radius: var(--shape-corner-full)
				background: var(--primary)

	/* 标签 */
	&__tags
		display: flex
		flex-wrap: wrap
		gap: 0.375rem
		margin: 0
		padding: 0
		list-style: none

		li
			padding: 0.125rem 0.5rem
			border-radius: var(--shape-corner-xs)
			background: var(--surface-container-high)
			color: var(--on-surface-variant)
			font: var(--m3e-type-label-small)

	/* 外部操作链接 */
	&__actions
		display: flex
		flex-wrap: wrap
		gap: 0.875rem
		margin-top: 0.25rem
		padding-top: 0.5rem
		border-top: 1px solid var(--outline-variant)

	&__link
		display: inline-flex
		align-items: center
		gap: 0.25rem
		color: var(--primary)
		font: var(--m3e-type-label-medium)
		font-weight: 500
		text-decoration: none
		transition: opacity var(--m3e-duration-short) var(--m3e-easing-standard)

		&:hover
			text-decoration: underline

		> :global(svg)
			width: 1rem
			height: 1rem
</style>
