<script lang="ts">
/**
 * M3E 通用原子 — Avatar 头像。
 * 图片加载失败或未提供时回退为文字（首字母 / 自定义 fallback）。
 */
import Skeleton from "@components/atoms/display/Skeleton.svelte";
import { imageFeedback } from "@utils/image-feedback";

let {
	src = "",
	srcset,
	sizes,
	width,
	height,
	loading = "lazy",
	fetchPriority,
	alt = "",
	/** 直径（px），默认 40 */
	size = 40,
	/** 形状：circle 圆形（默认）/ rounded 圆角方形 / square 方形 */
	shape = "circle",
	/** 无图 / 加载失败时的回退文字（默认取 alt 首字符） */
	fallback = "",
	/** 可选局部加载占位与淡入；不阻塞父列表。 */
	loadingFeedback = false,
	class: className = "",
}: {
	src?: string;
	srcset?: string;
	sizes?: string;
	width?: number;
	height?: number;
	loading?: "lazy" | "eager";
	fetchPriority?: "high" | "low" | "auto";
	alt?: string;
	size?: number;
	shape?: "circle" | "rounded" | "square";
	fallback?: string;
	loadingFeedback?: boolean;
	class?: string;
} = $props();

let failed = $state(false);
let image = $state<HTMLImageElement>();
$effect(() => {
	if (loadingFeedback && image?.complete && image.naturalWidth === 0)
		failed = true;
});
const style = `--m3e-avatar-size: ${size}px`;
const initial = fallback || (alt.trim() ? alt.trim()[0] : "?");
</script>

<div
	class="m3-avatar m3-avatar--{shape} {className}"
	{style}
	role={alt ? "img" : undefined}
	aria-label={alt || undefined}
>
	{#if src && !failed}
		<img
			bind:this={image}
			src={src}
			{srcset}
			{sizes}
			{width}
			{height}
			alt={alt}
			{loading}
			fetchpriority={fetchPriority}
			decoding="async"
			onerror={() => (failed = true)}
			use:imageFeedback={loadingFeedback ? src : undefined}
		/>
		{#if loadingFeedback}
			<span class="m3-avatar__loading" aria-hidden="true">
				<Skeleton width="100%" height="100%" radius="0" />
			</span>
		{/if}
	{:else}
		<span class="m3-avatar__fallback">{initial}</span>
	{/if}
</div>

<style lang="stylus">
.m3-avatar
	position: relative
	display: flex
	align-items: center
	justify-content: center
	flex-shrink: 0
	width: var(--m3e-avatar-size)
	/* 保持 1:1 正方形：宽度可被调用方覆盖（如 !w-full），高度随宽自适应 */
	aspect-ratio: 1
	height: auto
	overflow: hidden
	background: var(--surface-container-high)
	color: var(--on-surface-variant)
	user-select: none

	&--circle
		border-radius: var(--shape-corner-full)
	&--rounded
		border-radius: var(--shape-corner-m)
	&--square
		border-radius: 0

	> img
		display: block
		width: 100%
		height: 100%
		object-fit: cover
		/* The action owns this runtime attribute; exclude it from CSS pruning. */
		&:global([data-image-state])
			transition: opacity var(--m3e-duration-short) var(--m3e-easing-standard)
		&:global([data-image-state="pending"])
			opacity: 0

	&__loading
		display: none
		position: absolute
		inset: 0
		pointer-events: none

	&:has(:global(img[data-image-state="pending"])) .m3-avatar__loading
		display: block

	&__fallback
		font: var(--m3e-type-title-medium)
		font-weight: 700
</style>
