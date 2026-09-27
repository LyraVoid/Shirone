<script lang="ts">
import Avatar from "@components/atoms/display/Avatar.svelte";
import Icon from "@iconify/svelte";
import type { FriendItem } from "../../data/friends";

let { friend }: { friend: FriendItem } = $props();

const host = $derived.by(() => {
	try {
		return new URL(friend.siteurl).hostname.replace(/^www\./, "");
	} catch {
		return friend.siteurl;
	}
});
</script>

<a
	class="friend-card m3-state-layer"
	href={friend.siteurl}
	target="_blank"
	rel="noopener noreferrer"
	aria-label={friend.title}
>
	<div class="friend-card__body">
		<div class="friend-card__header">
			<Avatar
				src={friend.imgurl}
				alt={friend.title}
				size={40}
				shape="circle"
			/>

			<div class="friend-card__info">
				<span class="friend-card__title">
					<span class="friend-card__title-text">{friend.title}</span>
				</span>

				<div class="friend-card__host">
					<span>{host}</span>
				</div>
			</div>

			<span class="friend-card__arrow" aria-hidden="true">
				<Icon icon="material-symbols:chevron-right-rounded" />
			</span>
		</div>

		{#if friend.desc}
			<p class="friend-card__desc">{friend.desc}</p>
		{/if}

		{#if friend.tags.length > 0}
			<div class="friend-card__tags">
				{#each friend.tags as tag (tag)}
					<span class="friend-card__tag">#{tag}</span>
				{/each}
			</div>
		{/if}
	</div>
</a>

<style lang="stylus">
.friend-card
	position: relative
	display: flex
	flex-direction: column
	box-sizing: border-box
	width: 100%
	overflow: hidden
	border-radius: var(--shape-corner-l)
	background: var(--card-bg)
	color: var(--on-surface)
	border: 1px solid var(--outline-variant)
	text-decoration: none
	transition:
		border-color var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate),
		box-shadow var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate),
		background-color var(--m3e-duration-medium) var(--m3e-easing-standard)
	&:hover
		border-color: var(--outline)
		box-shadow: var(--m3e-elevation-1)
		background: unquote("color-mix(in oklab, var(--on-surface) 3%, var(--card-bg))")

	&__body
		flex: 1
		min-width: 0
		padding: var(--m3e-space-4) var(--m3e-space-5)

	&__header
		display: flex
		align-items: center
		gap: var(--m3e-space-3)
		margin-bottom: var(--m3e-space-3)

	&__info
		min-width: 0
		flex: 1

	&__title
		display: flex
		align-items: center
		margin: 0
		color: var(--on-surface)
		font: var(--m3e-type-title-small)
		font-weight: 600
		line-height: 1.3
		text-decoration: none
		transition: color var(--m3e-duration-short) var(--m3e-easing-standard)
		.friend-card:hover &
			color: var(--primary)

	&__title-text
		min-width: 0
		overflow: hidden
		text-overflow: ellipsis
		white-space: nowrap

	&__host
		margin-top: 0.125rem
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-small)

	&__arrow
		display: inline-flex
		align-items: center
		flex-shrink: 0
		color: var(--on-surface-variant)
		transition:
			color var(--m3e-duration-short) var(--m3e-easing-standard),
			transform var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate)
		> :global(svg)
			width: 1.25rem
			height: 1.25rem

		.friend-card:hover &
			color: var(--primary)
			transform: translateX(0.25rem)

	&__desc
		margin: 0 0 var(--m3e-space-2)
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-small)
		line-height: 1.5
		display: -webkit-box
		-webkit-line-clamp: 2
		-webkit-box-orient: vertical
		overflow: hidden

	&__tags
		display: flex
		flex-wrap: wrap
		gap: var(--m3e-space-1)

	&__tag
		color: var(--on-surface-variant)
		font: var(--m3e-type-label-small)
</style>
