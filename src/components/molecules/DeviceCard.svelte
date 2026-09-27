<script lang="ts">
/**
 * 设备卡片（分子）：统一卡片壳 + 单一骨架，无断点分叉。
 * - 卡片壳对齐站点卡片语言（ProjectCard/FriendCard/SkillCard）：
 *   --card-bg + outline-variant 描边 + corner-l，hover 升级描边与 elevation-2；
 * - 主力推荐（featured）：高亮边框渐变 + 角标；
 * - 媒体区：有 image 时展示设备图（object-contain 锁高，任意宽度不拉伸），
 *   无 image 时回退为精致图标瓷砖头；
 * - 状态指示器：右上角语义色 pill（active → primary / backup → secondary /
 *   archived → on-surface-variant / wishlist → tertiary），语义色经
 *   inline --device-status-color 注入，避免动态 class 触发 unused-CSS 剥离；
 * - 规格简述渲染为高可读性 pill 徽章；年份 chip；外链用 M3 胶囊按钮，
 *   带 rel=noopener noreferrer 由消费方保证的安全外链。
 */
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import { reveal } from "@utils/motion";
import type { DeviceItem, DeviceStatus } from "@/types/devicesConfig";

let { device, delay = 0 }: { device: DeviceItem; delay?: number } = $props();

let coverFailed = $state(false);

const statusMeta: Record<
	DeviceStatus,
	{ key: I18nKey; icon: string; color: string }
> = {
	active: {
		key: I18nKey.devicesStatusActive,
		icon: "material-symbols:check-circle-outline-rounded",
		color: "var(--primary)",
	},
	backup: {
		key: I18nKey.devicesStatusBackup,
		icon: "material-symbols:inventory-2-outline-rounded",
		color: "var(--secondary)",
	},
	archived: {
		key: I18nKey.devicesStatusArchived,
		icon: "material-symbols:history-rounded",
		color: "var(--on-surface-variant)",
	},
	wishlist: {
		key: I18nKey.devicesStatusWishlist,
		icon: "material-symbols:bookmark-outline-rounded",
		color: "var(--tertiary)",
	},
};

const meta = $derived(statusMeta[device.status]);
const showImage = $derived(Boolean(device.image) && !coverFailed);
</script>

<article
	class={`device-card ${showImage ? "device-card--with-image" : "device-card--without-image"} ${device.featured ? "device-card--featured" : ""}`}
	data-device={device.id}
	style={`--device-status-color: ${meta.color};`}
	use:reveal={{ delay }}
>
	{#if showImage}
		<div class="device-card__media">
			<img
				src={device.image}
				alt={device.name}
				loading="lazy"
				decoding="async"
				onerror={() => (coverFailed = true)}
			/>
		</div>
	{/if}

	<div class="device-card__body">
		<div class="device-card__header">
			{#if !showImage}
				<span class="device-card__icon" aria-hidden="true">
					<Icon icon={device.icon ?? "material-symbols:devices-rounded"} />
				</span>
			{/if}

			<div class="device-card__heading">
				<div class="device-card__title-row">
					<h2 class="device-card__title">{device.name}</h2>
					{#if device.year}
						<span class="device-card__year">{device.year}</span>
					{/if}
				</div>
				<span class="device-card__brand">{device.brand}</span>
			</div>

			<span
				class="device-card__status"
				data-status={device.status}
				aria-label={i18n(meta.key)}
			>
				<Icon icon={meta.icon} aria-hidden="true" />
				{i18n(meta.key)}
			</span>
		</div>

		{#if device.specs}
			<div class="device-card__specs">
				<Icon icon="material-symbols:code-rounded" aria-hidden="true" />
				<span>{device.specs}</span>
			</div>
		{/if}

		<p class="device-card__description">{device.description}</p>

		<div class="device-card__footer">
			{#if device.link}
				<a
					class="device-card__link"
					href={device.link}
					target="_blank"
					rel="noopener noreferrer"
				>
					<Icon icon="material-symbols:open-in-new-rounded" aria-hidden="true" />
					{i18n(I18nKey.devicesViewSpecs)}
				</a>
			{/if}
			{#if device.featured}
				<span class="device-card__featured" aria-hidden="true">
					<Icon icon="material-symbols:star-rounded" />
					{i18n(I18nKey.devicesFeatured)}
				</span>
			{/if}
		</div>
	</div>
</article>

<style lang="stylus">
@import "../../styles/breakpoints.styl"

.device-card
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

	/* 主力推荐特色高亮：边框微光 */
	&--featured
		border-color: unquote("color-mix(in oklab, var(--primary) 38%, var(--outline-variant))")
		&:hover
			border-color: var(--primary)

	/* 媒体区：设备图 object-contain，浅色调渐变背景衬底，任何宽度不拉伸 */
	&__media
		display: flex
		align-items: center
		justify-content: center
		width: 100%
		aspect-ratio: 16 / 10
		flex-shrink: 0
		overflow: hidden
		background: linear-gradient(160deg,
			unquote("color-mix(in oklab, var(--primary) 12%, var(--surface-container-low))"),
			var(--surface-container-high))

		> img
			display: block
			max-width: 100%
			max-height: 100%
			width: auto
			height: auto
			object-fit: contain
			padding: var(--m3e-space-3)
			transition: transform var(--m3e-duration-long) var(--m3e-easing-emphasized-decelerate)

			.device-card:hover &
				transform: scale(1.05)

	&__body
		display: flex
		flex-direction: column
		flex: 1
		gap: var(--m3e-space-3)
		min-width: 0
		padding: var(--m3e-space-4) var(--m3e-space-4)

	&__header
		display: flex
		align-items: flex-start
		gap: var(--m3e-space-3)
		min-width: 0

	/* 图标瓷砖：无图片设备的视觉锚点 */
	&__icon
		display: flex
		align-items: center
		justify-content: center
		width: 2.875rem
		height: 2.875rem
		flex-shrink: 0
		box-sizing: border-box
		border-radius: var(--shape-corner-m)
		background: linear-gradient(135deg,
			unquote("color-mix(in oklab, var(--primary) 14%, var(--surface-container-high))"),
			var(--surface-container-highest))
		border: 1px solid var(--outline-variant)
		color: var(--primary)
		transition:
			transform var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate),
			box-shadow var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate)

		> :global(svg)
			width: 1.5rem
			height: 1.5rem

		.device-card:hover &
			transform: translateY(-0.125rem)
			box-shadow: var(--m3e-elevation-1)

	&__heading
		display: flex
		flex-direction: column
		flex: 1
		gap: 0.25rem
		min-width: 0

	&__title-row
		display: flex
		align-items: baseline
		justify-content: space-between
		gap: 0.75rem
		min-width: 0

	&__title
		margin: 0
		min-width: 0
		color: var(--on-surface)
		font: var(--m3e-type-title-small)
		font-weight: 700
		line-height: 1.3
		overflow-wrap: anywhere
		transition: color var(--m3e-duration-short) var(--m3e-easing-standard)

		.device-card:hover &
			color: var(--primary)

	&__year
		flex-shrink: 0
		padding: 0.0625rem 0.375rem
		border-radius: var(--shape-corner-xs)
		background: var(--surface-container-high)
		color: var(--on-surface-variant)
		font: var(--m3e-type-label-small)
		font-variant-numeric: tabular-nums

	&__brand
		color: var(--on-surface-variant)
		font: var(--m3e-type-label-medium)

	/* 状态 pill：语义色来自 inline --device-status-color */
	&__status
		display: inline-flex
		align-items: center
		gap: 0.3125rem
		flex-shrink: 0
		padding: 0.125rem 0.5625rem
		border-radius: var(--shape-corner-full)
		background: unquote("color-mix(in oklab, var(--device-status-color) 12%, transparent)")
		color: var(--device-status-color)
		font: var(--m3e-type-label-small)
		font-weight: 600
		border: 1px solid unquote("color-mix(in oklab, var(--device-status-color) 22%, transparent)")

		> :global(svg)
			width: 0.875rem
			height: 0.875rem
			flex-shrink: 0

	/* 核心规格简述：pill 徽章 + 代码图标 */
	&__specs
		display: inline-flex
		align-items: center
		gap: 0.5rem
		align-self: flex-start
		max-width: 100%
		padding: 0.25rem 0.625rem
		border-radius: var(--shape-corner-m)
		background: var(--surface-container-high)
		color: var(--on-surface-variant)
		font: var(--m3e-type-label-small)
		font-weight: 500

		> :global(svg)
			width: 1rem
			height: 1rem
			flex-shrink: 0
			color: var(--primary)

	&__description
		display: -webkit-box
		margin: 0
		overflow: hidden
		-webkit-line-clamp: 3
		-webkit-box-orient: vertical
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-small)
		line-height: 1.5

	&__footer
		display: flex
		flex-wrap: wrap
		align-items: center
		justify-content: space-between
		gap: 0.5rem
		margin-top: auto
		padding-top: 0.25rem

	&__link
		display: inline-flex
		align-items: center
		gap: 0.3125rem
		padding: 0.25rem 0.625rem
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

	&__featured
		display: inline-flex
		align-items: center
		gap: 0.25rem
		color: var(--tertiary)
		font: var(--m3e-type-label-small)
		font-weight: 700

		> :global(svg)
			width: 0.875rem
			height: 0.875rem
			color: #facc15
</style>