<script lang="ts">
/**
 * 页内大标题（可复用）：装饰图标 + 标题 + 可选副标题。
 * 前置装饰：大号 primary 线性图标直接置于标题前，无容器、无额外装饰，
 * 与站内线性图标语言统一。
 *
 * `@iconify/svelte` 在这里是主题自身 `atoms/display/Icon.svelte` 的别名
 * （见 `src/integration/index.ts` 与 `tsconfig.json`），它在构建期内联服务端
 * SVG，所以本组件在纯 SSR 页面同样出图，不需要为图标加水合岛。
 */
import Icon from "@iconify/svelte";

let {
	title = "",
	subtitle = "",
	icon = "",
	class: className = "",
}: {
	title: string;
	subtitle?: string;
	/** 标题左侧装饰图标（Iconify 名） */
	icon?: string;
	class?: string;
} = $props();
</script>

<div class="page-header {className}">
	<div class="page-header__title-row">
		{#if icon}
			<span class="page-header__icon" aria-hidden="true">
				<Icon {icon} />
			</span>
		{/if}
		<h1 class="page-header__title">{title}</h1>
	</div>
	{#if subtitle}
		<p class="page-header__subtitle">{subtitle}</p>
	{/if}
</div>

<style lang="stylus">
.page-header
	margin-bottom: 1.5rem

	&__title-row
		display: flex
		align-items: center
		gap: 0.75rem

	&__icon
		display: inline-flex
		flex-shrink: 0
		color: var(--primary)
		> :global(svg)
			width: 2rem
			height: 2rem

	&__title
		margin: 0
		color: var(--on-surface)
		font: var(--m3e-type-headline-medium)
		font-weight: 700
		line-height: 1.2

	&__subtitle
		margin: 0.375rem 0 0
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-medium)
		line-height: 1.5
</style>
