<script lang="ts">
/**
 * 番剧卡片（分子）：2:3 封面 + 状态 tonal pill + 评分 + 追番进度。
 * - cover 省略时显示主题色渐变占位（tv 水印），补图前不破版；
 * - link 存在时整张封面可点（外链），悬停显示播放层；否则封面为纯展示块；
 * - watching 状态渲染 ProgressIndicator（linear determinate）+ watched/total 文本；
 * - 状态语义色经 inline --anime-status-color 注入（ANIME_STATUS_META 的 M3E 角色映射），
 *   避免动态 class 触发 Svelte unused-CSS 剥离（见 rules/pitfalls.md 1.6）。
 */

import ProgressIndicator from "@components/atoms/feedback/ProgressIndicator.svelte";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import { ANIME_STATUS_META } from "@utils/anime/status";
import { reveal } from "@utils/motion";
import { url } from "@utils/url-utils";
import type { AnimeItem } from "../../data/anime";

let {
	anime,
	/** stagger 入场延迟 ms（由列表传入：第 i 项 i × step） */
	delay = 0,
}: { anime: AnimeItem; delay?: number } = $props();

const statusMeta = $derived(ANIME_STATUS_META[anime.status]);
const isWatching = $derived(anime.status === "watching");
const progressRatio = $derived(
	anime.progress.total > 0
		? Math.min(anime.progress.watched / anime.progress.total, 1)
		: 0,
);
const metaLine = $derived(
	[anime.year, anime.studio].filter(Boolean).join(" · "),
);
</script>

<article
	class="anime-card"
	data-status={anime.status}
	style={`--anime-status-color: ${statusMeta.color};`}
	use:reveal={{ delay }}
>
	<!-- 封面内部内容（img/占位 + 播放层 + 评分）：link/非 link 两分支共享，避免重复维护 -->
	{#snippet coverContent()}
		{#if anime.cover}
			<img
				class="anime-card__cover-img"
				src={url(anime.cover)}
				alt={anime.title}
				loading="lazy"
				referrerpolicy="no-referrer"
			/>
		{:else}
			<span class="anime-card__placeholder" aria-hidden="true">
				<Icon icon="material-symbols:live-tv-outline-rounded" />
			</span>
		{/if}
		<span class="anime-card__scrim" aria-hidden="true"></span>
		{#if anime.link}
			<!-- 可点封面：悬停深色 scrim + 播放钮 -->
			<span class="anime-card__play" aria-hidden="true">
				<Icon icon="material-symbols:play-arrow-rounded" />
			</span>
		{/if}
		<span class="anime-card__rating">
			<Icon icon="material-symbols:star-rounded" aria-hidden="true" />
			<span>{anime.rating}</span>
		</span>
	{/snippet}

	{#if anime.link}
		<a
			class="anime-card__cover"
			href={anime.link}
			target="_blank"
			rel="noopener noreferrer"
			aria-label={anime.title}
		>
			{@render coverContent()}
		</a>
	{:else}
		<div class="anime-card__cover">
			{@render coverContent()}
		</div>
	{/if}

	<div class="anime-card__body">
		<div class="anime-card__header-row">
			<span class="anime-card__status">
				<span class="anime-card__status-dot" aria-hidden="true"></span>
				{i18n(statusMeta.key)}
			</span>
		</div>

		<span class="anime-card__title" title={anime.title}>{anime.title}</span>

		{#if isWatching}
			<div class="anime-card__progress">
				<span class="anime-card__progress-track">
					<ProgressIndicator
						progress={progressRatio}
						label={`${anime.progress.watched}/${anime.progress.total}`}
					/>
				</span>
				<span class="anime-card__progress-text">{anime.progress.watched}/{anime.progress.total}</span>
			</div>
		{/if}

		{#if anime.description}
			<p class="anime-card__desc">{anime.description}</p>
		{/if}

		{#if metaLine}
			<p class="anime-card__meta">{metaLine}</p>
		{/if}

		{#if anime.genres.length > 0}
			<div class="anime-card__genres">
				{#each anime.genres as genre (genre)}
					<span class="anime-card__genre">#{genre}</span>
				{/each}
			</div>
		{/if}
	</div>
</article>

<style lang="stylus">
.anime-card
	position: relative
	display: flex
	flex-direction: column
	box-sizing: border-box
	overflow: hidden
	border-radius: var(--shape-corner-l)
	background: var(--card-bg)
	border: 1px solid var(--outline-variant)
	transition:
		border-color var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate),
		box-shadow var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate),
		transform var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate)
	&:hover
		border-color: var(--outline)
		box-shadow: var(--m3e-elevation-2)
		transform: translateY(-2px)

	/* 2:3 海报封面：渐变占位同时充当图片加载背景 */
	&__cover
		position: relative
		display: block
		aspect-ratio: 2 / 3
		overflow: hidden
		background: linear-gradient(160deg,
			unquote("color-mix(in oklab, var(--primary) 16%, var(--surface-container-low))"),
			var(--surface-container-high))
		text-decoration: none

	&__cover-img
		display: block
		width: 100%
		height: 100%
		object-fit: cover
		transition: transform var(--m3e-duration-long) var(--m3e-easing-emphasized-decelerate)
		.anime-card:hover &
			transform: scale(1.05)

	/* 封面顶部/底部渐变暗影（确保评分徽标可读性） */
	&__scrim
		position: absolute
		inset: 0
		pointer-events: none
		background: linear-gradient(180deg, rgba(0, 0, 0, 0.45) 0%, transparent 40%, rgba(0, 0, 0, 0.25) 100%)
		opacity: 0.6
		transition: opacity var(--m3e-duration-medium) var(--m3e-easing-standard)
		.anime-card:hover &
			opacity: 0.8

	/* 悬停播放层：深色 scrim + 圆形播放钮（仅 link 卡片），hover 淡入放大 */
	&__play
		position: absolute
		inset: 0
		display: flex
		align-items: center
		justify-content: center
		background: unquote("color-mix(in srgb, #000 40%, transparent)")
		opacity: 0
		transition:
			opacity var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate),
			transform var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate)
		transform: scale(0.9)
		> :global(svg)
			width: 2.75rem
			height: 2.75rem
			color: #fff
			filter: drop-shadow(0 0.125rem 0.375rem rgba(0, 0, 0, 0.5))
		.anime-card:hover &
			opacity: 1
			transform: scale(1)

	/* 占位水印：主题色淡渐变 + tv 图标（无封面时） */
	&__placeholder
		position: absolute
		inset: 0
		display: flex
		align-items: center
		justify-content: center
		color: unquote("color-mix(in oklab, var(--on-surface-variant) 40%, transparent)")
		> :global(svg)
			width: 2.5rem
			height: 2.5rem

	/* 评分 scrim pill：毛玻璃 + star 图标 + 数字 */
	&__rating
		position: absolute
		top: 0.5rem
		right: 0.5rem
		z-index: 2
		display: inline-flex
		align-items: center
		gap: 0.1875rem
		padding: 0.1875rem 0.5rem
		border-radius: var(--shape-corner-full)
		background: unquote("color-mix(in srgb, #000 60%, transparent)")
		backdrop-filter: blur(0.375rem)
		-webkit-backdrop-filter: blur(0.375rem)
		color: #fff
		font: var(--m3e-type-label-small)
		font-weight: 700
		font-variant-numeric: tabular-nums
		border: 1px solid rgba(255, 255, 255, 0.15)
		> :global(svg)
			width: 0.875rem
			height: 0.875rem
			color: #facc15

	&__body
		display: flex
		flex-direction: column
		flex: 1
		min-width: 0
		gap: 0.375rem
		padding: 0.75rem 0.875rem 0.875rem

	&__header-row
		display: flex
		align-items: center
		justify-content: space-between
		gap: 0.5rem

	/* 状态 tonal pill：语义色来自 inline --anime-status-color */
	&__status
		display: inline-flex
		align-items: center
		align-self: flex-start
		gap: 0.3125rem
		padding: 0.125rem 0.5rem
		border-radius: var(--shape-corner-full)
		background: unquote("color-mix(in oklab, var(--anime-status-color) 12%, transparent)")
		color: var(--anime-status-color)
		font: var(--m3e-type-label-small)
		font-weight: 600

	&__status-dot
		width: 0.375rem
		height: 0.375rem
		border-radius: var(--shape-corner-full)
		background: currentColor

	&__title
		margin: 0
		color: var(--on-surface)
		font: var(--m3e-type-title-small)
		font-weight: 600
		line-height: 1.3
		display: -webkit-box
		-webkit-line-clamp: 2
		-webkit-box-orient: vertical
		overflow: hidden
		transition: color var(--m3e-duration-short) var(--m3e-easing-standard)
		.anime-card:hover &
			color: var(--primary)

	&__desc
		margin: 0
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-small)
		line-height: 1.4
		display: -webkit-box
		-webkit-line-clamp: 2
		-webkit-box-orient: vertical
		overflow: hidden

	&__progress
		display: flex
		align-items: center
		gap: 0.5rem
		padding: 0.125rem 0

	&__progress-track
		flex: 1
		min-width: 0

	&__progress-text
		flex-shrink: 0
		color: var(--on-surface-variant)
		font: var(--m3e-type-label-small)
		font-weight: 600
		font-variant-numeric: tabular-nums

	/* 年份 · 制作：沉底，让无进度/无感想的卡片对齐 */
	&__meta
		margin: auto 0 0
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-small)
		white-space: nowrap
		overflow: hidden
		text-overflow: ellipsis

	&__genres
		display: flex
		flex-wrap: wrap
		gap: 0.25rem 0.375rem

	&__genre
		color: var(--on-surface-variant)
		font: var(--m3e-type-label-small)
		transition: color var(--m3e-duration-short) var(--m3e-easing-standard)
		&:hover
			color: var(--primary)

:global(html.motion-reduced) .anime-card,
:global(html.motion-reduced) .anime-card__cover-img,
:global(html.motion-reduced) .anime-card__play
	transition: none
	transform: none

@media (prefers-reduced-motion: reduce)
	.anime-card,
	.anime-card__cover-img,
	.anime-card__play
		transition: none
		transform: none
</style>
