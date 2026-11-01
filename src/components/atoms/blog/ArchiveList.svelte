<script lang="ts">
/**
 * M3E 博客原子 — ArchiveList 归档时间轴（分组可折叠，组标题数据驱动）。
 * 数据驱动：groups 为 { id, title, items: { title, href, date, tags? } }[]；
 * 组头可折叠（chevron 旋转，m3-state-layer），时间轴节点行，
 * hover 标题变 primary 右移、节点放大；分类以 primary 小徽标前置。
 * Svelte 实现：ArchivePanel（Svelte）与 Astro 演示页均可复用。
 */
import Icon from "@iconify/svelte";
import { collapse } from "@utils/motion";

export interface ArchiveItem {
	title: string;
	href: string;
	/** 展示日期（如 "08-13"） */
	date: string;
	category?: string;
	tags?: string[];
}
export interface ArchiveGroup {
	/** 折叠状态键（组内唯一）：年份 / 分类名 / 标签名 */
	id: string;
	/** 头部主文本：年份数字 / 分类名 / #标签名 */
	title: string;
	items: ArchiveItem[];
}

let {
	groups = [],
	/** 单复数文案回调，如 (n) => `${n} 篇` */
	countLabel = (count: number) => `${count} 篇`,
	/** none 全部展开 / firstExpanded 多于一排时仅首年展开 */
	collapsedByDefault = "firstExpanded" as "none" | "firstExpanded",
	/** 由上层持久化后恢复的折叠状态 */
	restoredCollapsed = undefined as Record<string, boolean> | undefined,
	onCollapsedChange = undefined as
		| ((collapsed: Record<string, boolean>) => void)
		| undefined,
	class: className = "",
}: {
	groups?: ArchiveGroup[];
	countLabel?: (count: number) => string;
	collapsedByDefault?: "none" | "firstExpanded";
	restoredCollapsed?: Record<string, boolean>;
	onCollapsedChange?: (collapsed: Record<string, boolean>) => void;
	class?: string;
} = $props();

function createCollapsedState(nextGroups: ArchiveGroup[]) {
	const collapseAllButFirst =
		collapsedByDefault === "firstExpanded" && nextGroups.length > 1;
	const next: Record<string, boolean> = {};
	nextGroups.forEach((group, index) => {
		next[group.id] =
			restoredCollapsed?.[group.id] ?? (collapseAllButFirst && index > 0);
	});
	return next;
}

let collapsed = $state<Record<string, boolean>>(createCollapsedState(groups));
let previousGroups = groups;
let previousRestoredCollapsed = restoredCollapsed;
let animatedGroupId = $state<string | null>(null);

// 数据重组或持久状态恢复时直接落到终态；只有用户点击的组播放动画。
$effect(() => {
	if (
		groups === previousGroups &&
		restoredCollapsed === previousRestoredCollapsed
	) {
		return;
	}
	previousGroups = groups;
	previousRestoredCollapsed = restoredCollapsed;
	animatedGroupId = null;
	collapsed = createCollapsedState(groups);
});

function toggleGroup(id: string) {
	animatedGroupId = id;
	collapsed[id] = !collapsed[id];
	onCollapsedChange?.({ ...collapsed });
}
</script>

<div class="m3-blog-archive {className}">
	{#each groups as g (g.id)}
		<section class="m3-blog-archive__group">
			<button
				type="button"
				class="m3-blog-archive__header m3-state-layer"
				aria-expanded={!collapsed[g.id]}
				onclick={() => toggleGroup(g.id)}
			>
				<span class="m3-blog-archive__group-title">{g.title}</span>
				<span class="m3-blog-archive__dot" aria-hidden="true"></span>
				<span class="m3-blog-archive__count">{countLabel(g.items.length)}</span>
				<span
					class="m3-blog-archive__chevron"
					class:m3-blog-archive__chevron--open={!collapsed[g.id]}
					aria-hidden="true"
				>
					<Icon icon="material-symbols:keyboard-arrow-down" />
				</span>
			</button>
			<div
				class="m3-blog-archive__body"
				use:collapse={{
					open: !collapsed[g.id],
					animate: animatedGroupId === g.id,
					resetKey: groups,
				}}
			>
				<ul class="m3-blog-archive__list">
					{#each g.items as it (it.href)}
						<li>
							<a class="m3-blog-archive__item" href={it.href}>
								<span class="m3-blog-archive__date">{it.date}</span>
								<span class="m3-blog-archive__node" aria-hidden="true"></span>
								<span class="m3-blog-archive__title">
									{#if it.category}
										<span class="m3-blog-archive__cat">{it.category}</span>
									{/if}
									<span class="m3-blog-archive__title-text">{it.title}</span>
								</span>
								{#if it.tags && it.tags.length > 0}
									<span class="m3-blog-archive__tags">{it.tags.map((t) => `#${t}`).join(" ")}</span>
								{/if}
							</a>
						</li>
					{/each}
				</ul>
			</div>
		</section>
	{/each}
</div>

<style lang="stylus">
@import "../../../styles/breakpoints.styl"

.m3-blog-archive
	&__group + &__group
		margin-top: 1.5rem

	&__header
		display: flex
		align-items: center
		gap: 1rem
		width: 100%
		height: 3.75rem
		box-sizing: border-box
		padding: 0 0.75rem 0 0.5rem
		border: none
		border-radius: var(--shape-corner-m)
		background: transparent
		box-shadow: none
		text-align: left
		cursor: pointer
		color: inherit
		--m3e-state-color: var(--on-surface)
		transition:
			background-color var(--m3e-duration-short) var(--m3e-easing-standard),
			border-radius var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate),
			box-shadow var(--m3e-duration-short) var(--m3e-easing-standard),
			transform var(--m3e-duration-short) var(--m3e-easing-standard)
		&:hover
			background: var(--surface-container)
			border-radius: var(--shape-corner-l)
			box-shadow: var(--m3e-elevation-1)
		&:active
			background: unquote("color-mix(in oklab, var(--primary) 7%, transparent)")
			border-radius: var(--shape-corner-l)
			box-shadow: var(--m3e-elevation-1)
			transform: translateY(1px)
		&:focus-visible
			outline-offset: -2px
		&:focus-within:not(:focus-visible)::before
			opacity: 0

	&__group-title
		flex: 1 1 auto
		min-width: 3.5rem
		text-align: left
		font: var(--m3e-type-title-large)
		font-weight: 700
		color: var(--on-surface)
		white-space: nowrap
		overflow: hidden
		text-overflow: ellipsis

	&__dot
		flex-shrink: 0
		width: 0.75rem
		height: 0.75rem
		border-radius: var(--shape-corner-full)
		border: 3px solid var(--primary)
		background: var(--surface)

	&__count
		font: var(--m3e-type-body-small)
		color: var(--on-surface-variant)

	&__chevron
		display: inline-flex
		align-items: center
		justify-content: center
		flex-shrink: 0
		width: 2rem
		height: 2rem
		margin-left: auto
		border-radius: var(--shape-corner-full)
		color: var(--on-surface-variant)
		transition:
			color var(--m3e-duration-short) var(--m3e-easing-standard),
			transform var(--m3e-duration-short) var(--m3e-easing-emphasized-decelerate)
		> :global(svg)
			width: 1.25rem
			height: 1.25rem
		.m3-blog-archive__header:hover &
			color: var(--primary)
		.m3-blog-archive__header:active &
			color: var(--primary)

		&--open
			transform: rotate(180deg)

	&__list
		display: flex
		flex-direction: column
		list-style: none
		margin: 0
		padding: 0

	&__item
		display: flex
		align-items: center
		gap: 0.75rem
		width: 100%
		min-height: 2.5rem
		padding: 0.25rem 0.5rem
		border-radius: var(--shape-corner-s)
		text-decoration: none
		transition: background-color var(--m3e-duration-short) var(--m3e-easing-standard)
		&:hover
			background: unquote("color-mix(in oklab, var(--on-surface) 5%, transparent)")
		&:active
			background: unquote("color-mix(in oklab, var(--on-surface) 10%, transparent)")
		&:focus-visible
			outline: 2px solid var(--secondary)
			outline-offset: -2px

	&__date
		flex-shrink: 0
		width: 4rem
		font: var(--m3e-type-body-small)
		color: var(--on-surface-variant)

	&__node
		flex-shrink: 0
		width: 0.375rem
		height: 0.375rem
		border-radius: var(--shape-corner-full)
		background: var(--on-surface-variant)
		transition:
			background-color var(--m3e-duration-short) var(--m3e-easing-standard),
			transform var(--m3e-duration-short) var(--m3e-easing-emphasized-decelerate)
		.m3-blog-archive__item:hover &
			background: var(--primary)
			transform: scale(1.6)

	&__title
		flex: 1
		min-width: 0
		display: flex
		align-items: center
		gap: 0.5rem
		font: var(--m3e-type-body-medium)
		font-weight: 700
		color: var(--on-surface)
		transition:
			color var(--m3e-duration-short) var(--m3e-easing-standard),
			transform var(--m3e-duration-short) var(--m3e-easing-emphasized-decelerate)
		.m3-blog-archive__item:hover &
			color: var(--primary)
			transform: translateX(0.25rem)

	&__title-text
		min-width: 0
		overflow: hidden
		text-overflow: ellipsis
		white-space: nowrap

	&__cat
		flex-shrink: 0
		display: inline-flex
		align-items: center
		height: 1.25rem
		padding: 0 0.375rem
		border-radius: var(--shape-corner-xs)
		background: var(--primary-container)
		color: var(--on-primary-container)
		font: var(--m3e-type-label-small)
		font-weight: 600
		transition:
			background-color var(--m3e-duration-short) var(--m3e-easing-standard),
			color var(--m3e-duration-short) var(--m3e-easing-standard)
		.m3-blog-archive__item:hover &
			background: var(--primary)
			color: var(--on-primary)

	&__tags
		flex-shrink: 1
		min-width: 0
		overflow: hidden
		text-overflow: ellipsis
		white-space: nowrap
		max-width: 20%
		font: var(--m3e-type-body-small)
		color: var(--on-surface-variant)
		@media (max-width: bp-md - 1px)
			display: none

	@media (max-width: bp-sm - 1px)
		&__group + &__group
			margin-top: 1rem
		&__header
			gap: 0.75rem
			padding-right: 0.5rem
		&__group-title
			min-width: 3.25rem
		&__item
			gap: 0.5rem
		&__date
			width: 3.5rem
		&__cat
			max-width: 6rem
			overflow: hidden
			text-overflow: ellipsis
			white-space: nowrap

	@media (hover: none)
		&__header:not(:active)
			background: transparent
			box-shadow: none
			transform: none
			&::before
				opacity: 0
</style>
