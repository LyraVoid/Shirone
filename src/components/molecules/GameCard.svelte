<script lang="ts">
/**
 * 游戏卡片（分子）：横屏封面为主视觉的布局，与设备/技能卡片的"图+正文"式排版刻意区分。
 *
 * 设计语言（原创，非照抄）：
 * - 主视觉是一张 16:9 的横屏封面胶囊图（object-fit: cover 满铺），标题与开发商
 *   压印在封面包底（深色 scrim 保证可读性——图像叠层可读性例外允许固定黑色）；
 * - 无封面时退化为"渐变横幅 + 居中大图标"，标题仍在横幅包底，保持同一条视觉基线；
 * - 状态 pill 与 Featured 徽章贴在横幅右上/左上，语义色经 inline
 *   --game-status-color 注入（避免动态 class 触发 unused-CSS 剥离）；
 * - 正文区是紧凑的元数据行：评分（星 + 数值）、游玩时长、平台，随后是类型 chips
 *   与两行钳制的简评，底部外链按钮右对齐；
 * - 卡片外壳沿用站点卡片语言（--card-bg + outline-variant 描边 + corner-l，
 *   hover 升级描边与 elevation-2），与项目/友链卡片保持一致。
 */
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import { reveal } from "@utils/motion";
import type { GameItem, GameStatus } from "@/types/gamesConfig";

let { game, delay = 0 }: { game: GameItem; delay?: number } = $props();

let coverFailed = $state(false);

// 状态 pill 用 M3 的 tonal 配对（bg/fg 成对），保证文字对比度达标：
// 叠在封面上时实底比"淡色底 + 状态色文字"更可靠，且各状态仍保有语义色。
const statusMeta: Record<
	GameStatus,
	{ key: I18nKey; icon: string; bg: string; fg: string }
> = {
	playing: {
		key: I18nKey.gamesStatusPlaying,
		icon: "material-symbols:play-circle-outline-rounded",
		bg: "var(--primary)",
		fg: "var(--on-primary)",
	},
	completed: {
		key: I18nKey.gamesStatusCompleted,
		icon: "material-symbols:trophy-outline-rounded",
		bg: "var(--tertiary)",
		fg: "var(--on-tertiary)",
	},
	backlog: {
		key: I18nKey.gamesStatusBacklog,
		icon: "material-symbols:hourglass-empty-rounded",
		bg: "var(--surface-container-highest)",
		fg: "var(--on-surface-variant)",
	},
	wishlist: {
		key: I18nKey.gamesStatusWishlist,
		icon: "material-symbols:bookmark-outline-rounded",
		bg: "var(--secondary)",
		fg: "var(--on-secondary)",
	},
};

const meta = $derived(statusMeta[game.status]);
const showCover = $derived(Boolean(game.cover) && !coverFailed);
const ratingLabel = $derived(
	game.rating === undefined
		? ""
		: `${i18n(I18nKey.gamesRating)} ${game.rating.toFixed(1)}`,
);
</script>

<article
	class={`game-card ${showCover ? "game-card--with-cover" : "game-card--no-cover"} ${game.featured ? "game-card--featured" : ""}`}
	data-game={game.id}
	style={`--game-status-bg: ${meta.bg}; --game-status-fg: ${meta.fg};`}
	use:reveal={{ delay }}
>
	<div class="game-card__banner">
		{#if showCover}
			<img
				class="game-card__cover"
				src={game.cover}
				alt={game.name}
				loading="lazy"
				decoding="async"
				onerror={() => (coverFailed = true)}
			/>
		{:else}
			<span class="game-card__banner-icon" aria-hidden="true">
				<Icon icon={game.icon ?? "material-symbols:sports-esports-outline-rounded"} />
			</span>
		{/if}

		<span class="game-card__scrim" aria-hidden="true"></span>

		{#if game.featured}
			<span class="game-card__featured">
				<Icon icon="material-symbols:star-rounded" aria-hidden="true" />
				{i18n(I18nKey.gamesFeatured)}
			</span>
		{/if}

		<span class="game-card__status" data-status={game.status} aria-label={i18n(meta.key)}>
			<Icon icon={meta.icon} aria-hidden="true" />
			{i18n(meta.key)}
		</span>

		<div class="game-card__caption">
			<h2 class="game-card__title">{game.name}</h2>
			<span class="game-card__developer">{game.developer}</span>
		</div>
	</div>

	<div class="game-card__body">
		<div class="game-card__meta">
			{#if game.rating !== undefined}
				<span class="game-card__rating" aria-label={ratingLabel}>
					<Icon icon="material-symbols:star-rounded" aria-hidden="true" />
					{game.rating.toFixed(1)}
				</span>
			{/if}
			{#if game.hours !== undefined}
				<span class="game-card__hours">
					<Icon icon="material-symbols:timer-outline-rounded" aria-hidden="true" />
					{game.hours}
					{i18n(I18nKey.gamesHours)}
				</span>
			{/if}
			{#if game.platform}
				<span class="game-card__platform">
					<Icon icon="material-symbols:sports-esports-outline-rounded" aria-hidden="true" />
					{game.platform}
				</span>
			{/if}
			{#if game.year}
				<span class="game-card__year">{game.year}</span>
			{/if}
		</div>

		{#if game.tags && game.tags.length > 0}
			<div class="game-card__tags">
				{#each game.tags as tag}
					<span class="game-card__tag">{tag}</span>
				{/each}
			</div>
		{/if}

		<p class="game-card__description">{game.description}</p>

		<div class="game-card__footer">
			{#if game.link}
				<a
					class="game-card__link"
					href={game.link}
					target="_blank"
					rel="noopener noreferrer"
				>
					<Icon icon="material-symbols:open-in-new-rounded" aria-hidden="true" />
					{i18n(I18nKey.gamesViewDetails)}
				</a>
			{/if}
		</div>
	</div>
</article>

<style lang="stylus">
@import "../../styles/breakpoints.styl"

.game-card
	display: flex
	flex-direction: column
	overflow: hidden
	background: var(--card-bg)
	border: 1px solid var(--outline-variant)
	border-radius: var(--shape-corner-l)
	transition:
		border-color var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate),
		box-shadow var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate),
		transform var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate),
		background-color var(--m3e-duration-medium) var(--m3e-easing-standard)

	&:hover
		border-color: var(--outline)
		box-shadow: var(--m3e-elevation-2)
		transform: translateY(-2px)
		background: unquote("color-mix(in oklab, var(--on-surface) 2%, var(--card-bg))")

	&--featured
		border-color: unquote("color-mix(in oklab, var(--tertiary) 40%, var(--outline-variant))")
		&:hover
			border-color: var(--tertiary)

	/* ── 横幅：16:9 横屏封面主视觉 ── */
	&__banner
		position: relative
		display: flex
		align-items: center
		justify-content: center
		width: 100%
		aspect-ratio: 16 / 9
		flex-shrink: 0
		overflow: hidden
		background: linear-gradient(150deg,
			unquote("color-mix(in oklab, var(--tertiary) 14%, var(--surface-container-low))"),
			var(--surface-container-high))

	&__cover
		position: absolute
		inset: 0
		display: block
		width: 100%
		height: 100%
		object-fit: cover
		transition: transform var(--m3e-duration-long) var(--m3e-easing-emphasized-decelerate)

		.game-card:hover &
			transform: scale(1.04)

	/* 无封面回退：居中大图标作为视觉锚点 */
	&__banner-icon
		position: relative
		z-index: 1
		display: flex
		align-items: center
		justify-content: center
		width: 4rem
		height: 4rem
		border-radius: var(--shape-corner-l)
		background: unquote("color-mix(in oklab, var(--tertiary) 12%, var(--surface-container-highest))")
		border: 1px solid var(--outline-variant)
		color: var(--tertiary)
		transition:
			transform var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate),
			box-shadow var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate)

		> :global(svg)
			width: 2rem
			height: 2rem

		.game-card:hover &
			transform: translateY(-0.125rem)
			box-shadow: var(--m3e-elevation-1)

	/* 封面包底压印渐变（图像叠层可读性例外：允许固定黑色） */
	&__scrim
		position: absolute
		inset: 0
		z-index: 1
		pointer-events: none
		background: linear-gradient(to top,
			rgba(0, 0, 0, 0.78) 0%,
			rgba(0, 0, 0, 0.42) 38%,
			rgba(0, 0, 0, 0) 72%)

	/* 无封面横幅不需要深色 scrim，改用表面色渐变托住文字 */
	&--no-cover &__scrim
		background: linear-gradient(to top,
			unquote("color-mix(in oklab, var(--surface-container-high) 92%, transparent)") 0%,
			unquote("color-mix(in oklab, var(--surface-container-high) 40%, transparent)") 45%,
			transparent 75%)

	&__featured
		position: absolute
		top: 0.625rem
		left: 0.625rem
		z-index: 3
		display: inline-flex
		align-items: center
		gap: 0.25rem
		padding: 0.1875rem 0.5625rem
		border-radius: var(--shape-corner-full)
		background: var(--tertiary-container)
		color: var(--on-tertiary-container)
		font: var(--m3e-type-label-small)
		font-weight: 700
		box-shadow: var(--m3e-elevation-1)

		> :global(svg)
			width: 0.875rem
			height: 0.875rem
			color: var(--tertiary)

	/* 状态 pill：语义色来自 inline --game-status-color，实底托底保证压在图上可读 */
	/* 状态 pill：bg/fg 为 M3 tonal 配对（inline 注入），叠在封面上仍达标 */
	&__status
		position: absolute
		top: 0.625rem
		right: 0.625rem
		z-index: 3
		display: inline-flex
		align-items: center
		gap: 0.3125rem
		padding: 0.125rem 0.5625rem
		border-radius: var(--shape-corner-full)
		background: var(--game-status-bg)
		color: var(--game-status-fg)
		font: var(--m3e-type-label-small)
		font-weight: 600
		border: 1px solid unquote("color-mix(in oklab, var(--game-status-fg) 24%, transparent)")
		box-shadow: var(--m3e-elevation-1)

		> :global(svg)
			width: 0.875rem
			height: 0.875rem
			flex-shrink: 0

	/* 标题压印在横幅包底 */
	&__caption
		position: absolute
		bottom: 0
		left: 0
		right: 0
		z-index: 2
		display: flex
		flex-direction: column
		gap: 0.125rem
		padding: 0.75rem var(--m3e-space-4)

	&__title
		margin: 0
		min-width: 0
		color: #fff
		font: var(--m3e-type-title-medium)
		font-weight: 700
		line-height: 1.3
		overflow-wrap: anywhere
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5)
		transition: color var(--m3e-duration-short) var(--m3e-easing-standard)

	&__developer
		color: rgba(255, 255, 255, 0.82)
		font: var(--m3e-type-label-medium)
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5)

	/* 无封面模式：文字回到表面语义色（无 text-shadow） */
	&--no-cover &__title
		color: var(--on-surface)
		text-shadow: none

	&--no-cover &__developer
		color: var(--on-surface-variant)
		text-shadow: none

	/* ── 正文：紧凑元数据 + 标签 + 简评 ── */
	&__body
		display: flex
		flex-direction: column
		flex: 1
		gap: var(--m3e-space-3)
		min-width: 0
		padding: var(--m3e-space-4)

	&__meta
		display: flex
		flex-wrap: wrap
		align-items: center
		gap: 0.375rem

	&__rating
		display: inline-flex
		align-items: center
		gap: 0.25rem
		padding: 0.125rem 0.5rem
		border-radius: var(--shape-corner-full)
		background: unquote("color-mix(in oklab, var(--tertiary) 12%, var(--surface-container-high))")
		color: var(--on-surface)
		font: var(--m3e-type-label-small)
		font-weight: 700
		font-variant-numeric: tabular-nums

		> :global(svg)
			width: 0.875rem
			height: 0.875rem
			color: var(--tertiary)

	&__hours
		display: inline-flex
		align-items: center
		gap: 0.25rem
		padding: 0.125rem 0.5rem
		border-radius: var(--shape-corner-full)
		background: var(--surface-container-high)
		color: var(--on-surface-variant)
		font: var(--m3e-type-label-small)
		font-variant-numeric: tabular-nums

		> :global(svg)
			width: 0.875rem
			height: 0.875rem
			flex-shrink: 0

	&__platform
		display: inline-flex
		align-items: center
		gap: 0.25rem
		padding: 0.125rem 0.5rem
		border-radius: var(--shape-corner-full)
		background: var(--surface-container-high)
		color: var(--on-surface-variant)
		font: var(--m3e-type-label-small)

		> :global(svg)
			width: 0.875rem
			height: 0.875rem
			flex-shrink: 0

	&__year
		padding: 0.125rem 0.5rem
		border-radius: var(--shape-corner-xs)
		background: var(--surface-container-high)
		color: var(--on-surface-variant)
		font: var(--m3e-type-label-small)
		font-variant-numeric: tabular-nums

	&__tags
		display: flex
		flex-wrap: wrap
		gap: 0.375rem
		min-width: 0

	&__tag
		padding: 0.0625rem 0.5rem
		border-radius: var(--shape-corner-full)
		background: unquote("color-mix(in oklab, var(--primary) 8%, var(--surface-container-high))")
		color: var(--primary)
		font: var(--m3e-type-label-small)
		font-weight: 500

	&__description
		display: -webkit-box
		margin: 0
		overflow: hidden
		-webkit-line-clamp: 2
		-webkit-box-orient: vertical
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-small)
		line-height: 1.5

	&__footer
		display: flex
		flex-wrap: wrap
		align-items: center
		justify-content: flex-end
		gap: 0.5rem
		margin-top: auto
		padding-top: 0.25rem

	&__link
		display: inline-flex
		align-items: center
		gap: 0.3125rem
		padding: 0.3125rem 0.75rem
		min-height: 2.25rem
		border-radius: var(--shape-corner-m)
		background: unquote("color-mix(in oklab, var(--primary) 8%, transparent)")
		color: var(--primary)
		font: var(--m3e-type-label-medium)
		font-weight: 600
		text-decoration: none
		border: 1px solid unquote("color-mix(in oklab, var(--primary) 16%, transparent)")
		transition:
			background-color var(--m3e-duration-short) var(--m3e-easing-standard),
			box-shadow var(--m3e-duration-short) var(--m3e-easing-standard),
			transform var(--m3e-duration-short) var(--m3e-easing-standard)

		&:hover
			background: unquote("color-mix(in oklab, var(--primary) 16%, transparent)")
			box-shadow: var(--m3e-elevation-1)
			transform: translateY(-1px)

		> :global(svg)
			width: 1rem
			height: 1rem
</style>
