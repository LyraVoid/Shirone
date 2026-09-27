<script lang="ts">
/**
 * 站点瓷砖（分子，纯展示）：44×44 图标 + 站点名 + 一行说明，整卡外链。
 * 形态为竖向瓷砖（区别于参考实现的横排描边小卡）：底色与站内卡片一致
 * （card-bg + outline-variant 边框，同 anime/friends 语言），hover 时
 * 边框加深 + 阴影抬起 + 图标上浮；原创辨识度由竖向形态与图标 hover 上浮承担。
 * 图标四态（本地判定，不依赖第三方 favicon 服务），优先级：
 * 1. image（用户自定义图片 URL，http(s)/绝对路径）→ lazy img，onerror 降级首字母块；
 * 2. icon 为 Iconify 名（`material-symbols:xxx` 等）→ 24px primary 线性图标；
 * 3. icon 为图片 URL → lazy img（onerror 降级首字母块）；
 * 4. 缺省 → label 首字符大写 tonal 块。
 * 图片在图标容器内恒有内边距（不贴边），object-fit: contain。
 * 无 note 时副行回退为域名（hostname，解析失败原样显示）。
 */
import Icon from "@iconify/svelte";
import { reveal } from "@utils/motion";
import type { CompassEntry } from "../../data/compass";

let {
	entry,
	/** stagger 入场延迟 ms（由分组传入：第 i 项 i × step） */
	delay = 0,
}: { entry: CompassEntry; delay?: number } = $props();

/** 图片 URL 加载失败 → 降级首字母块 */
let imgFailed = $state(false);

/** 图标形态判定（优先级：自定义图片 > Iconify 名 > icon 图片 URL > 首字母） */
const iconKind = $derived(
	entry.image
		? "image"
		: /^[\w-]+:[\w-]+$/.test(entry.icon ?? "")
			? "iconify"
			: /^https?:\/\//.test(entry.icon ?? "") || /^\//.test(entry.icon ?? "")
				? "image"
				: "letter",
);

/** 图片形态的 src：image 优先，回退 icon 的图片 URL */
const imageSrc = $derived(entry.image || entry.icon || "");

const letter = $derived((entry.label.charAt(0) || "?").toUpperCase());

const host = $derived.by(() => {
	try {
		return new URL(entry.href).hostname.replace(/^www\./, "");
	} catch {
		return entry.href;
	}
});
</script>

<article class="compass-tile m3-state-layer" use:reveal={{ delay }}>
	<a
		class="compass-tile__link"
		href={entry.href}
		target="_blank"
		rel="noopener noreferrer"
	>
		<span class="compass-tile__icon" aria-hidden="true">
			{#if iconKind === "image" && !imgFailed}
				<img
					src={imageSrc}
					alt=""
					loading="lazy"
					referrerpolicy="no-referrer"
					onerror={() => (imgFailed = true)}
				/>
			{:else if iconKind === "iconify"}
				<Icon icon={entry.icon!} />
			{:else}
				<span class="compass-tile__letter">{letter}</span>
			{/if}
		</span>
		<span class="compass-tile__label">{entry.label}</span>
		<span class="compass-tile__note">{entry.note || host}</span>
	</a>
</article>

<style lang="stylus">
/* 竖向瓷砖：底色与站内卡片一致（card-bg + outline-variant 边框），hover 加深 */
.compass-tile
	box-sizing: border-box
	background: var(--card-bg)
	border: 1px solid var(--outline-variant)
	border-radius: var(--shape-corner-l)
	padding: var(--m3e-space-3) var(--m3e-space-4)
	--m3e-state-color: var(--on-surface)
	transition:
		border-color var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate),
		box-shadow var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate),
		background-color var(--m3e-duration-medium) var(--m3e-easing-standard)

	&:hover
		border-color: var(--outline)
		box-shadow: var(--m3e-elevation-1)
		background: unquote("color-mix(in oklab, var(--on-surface) 3%, var(--card-bg))")

	&__link
		display: flex
		flex-direction: column
		gap: var(--m3e-space-2)
		min-width: 0
		text-decoration: none

	/* 图标位：44×44 灰块（highest 混 6% on-surface，两种模式下均自成一级），悬停轻微上浮。
	   内边距保证图片形态不贴边（image 撑满内容区，object-fit: contain） */
	&__icon
		display: flex
		align-items: center
		justify-content: center
		width: 2.75rem
		height: 2.75rem
		flex-shrink: 0
		padding: 0.375rem
		box-sizing: border-box
		border-radius: var(--shape-corner-m)
		background: unquote("color-mix(in oklab, var(--on-surface) 6%, var(--surface-container-highest))")
		color: var(--primary)
		transition: transform var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate)
		> :global(svg)
			width: 1.5rem
			height: 1.5rem
		> :global(img)
			width: 100%
			height: 100%
			object-fit: contain
			border-radius: var(--shape-corner-s)
		.compass-tile:hover &
			transform: translateY(-0.125rem)

	/* 首字母兜底：tonal 块内的大号字（on-surface-variant） */
	&__letter
		color: var(--on-surface-variant)
		font: var(--m3e-type-title-medium)
		font-weight: 600
		line-height: 1

	&__label
		margin: 0
		color: var(--on-surface)
		font: var(--m3e-type-title-small)
		font-weight: 600
		line-height: 1.25
		white-space: nowrap
		overflow: hidden
		text-overflow: ellipsis
		transition: color var(--m3e-duration-short) var(--m3e-easing-standard)
		.compass-tile:hover &
			color: var(--primary)

	&__note
		margin: 0
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-small)
		line-height: 1.4
		white-space: nowrap
		overflow: hidden
		text-overflow: ellipsis
</style>
