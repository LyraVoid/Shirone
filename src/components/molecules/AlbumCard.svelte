<script lang="ts">
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import { url } from "@utils/url-utils";
import type { AlbumIndexItem } from "@/types/album";

let { album }: { album: AlbumIndexItem } = $props();
</script>

<article class="album-card">
	<a class="album-card__link m3-state-layer" href={url(`/albums/${album.id}/`)} aria-label={album.title}>
		<div class="album-card__cover">
			<img
				src={album.cover ? url(album.cover) : ""}
				alt={album.title}
				loading="lazy"
				decoding="async"
				referrerpolicy="no-referrer"
			/>
			<div class="album-card__cover-fallback" aria-hidden="true">
				<Icon icon="material-symbols:image-outline-rounded" />
			</div>
			{#if album.protected}
				<div class="album-card__badges">
					<span class="album-card__protected" title={i18n(I18nKey.albumPasswordTitle)}>
						<Icon icon="material-symbols:lock-rounded" aria-hidden="true" />
						<span class="sr-only">{i18n(I18nKey.albumPasswordTitle)}</span>
					</span>
				</div>
			{/if}
		</div>
		<div class="album-card__body">
			<div class="album-card__title-row">
				<h2>{album.title}</h2>
				<Icon icon="material-symbols:arrow-forward-rounded" aria-hidden="true" />
			</div>
			{#if album.description}
				<p class="album-card__description">{album.description}</p>
			{/if}
			<div class="album-card__meta">
				<span>{album.date}</span>
				{#if album.location}<span>{album.location}</span>{/if}
			</div>
			{#if album.tags.length > 0}
				<div class="album-card__tags" aria-label={i18n(I18nKey.tags)}>
					{#each album.tags.slice(0, 4) as tag}<span>#{tag}</span>{/each}
				</div>
			{/if}
		</div>
	</a>
</article>

<style lang="stylus">
.album-card
	min-width: 0
	overflow: hidden
	border: 1px solid var(--outline-variant)
	border-radius: var(--shape-corner-l)
	background: var(--card-bg)
	transition: border-color var(--m3e-duration-medium) var(--m3e-easing-standard), box-shadow var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate)
	&:hover
		border-color: var(--outline)
		box-shadow: var(--m3e-elevation-1)
	&__link
		display: block
		color: inherit
		text-decoration: none
		&:focus-visible
			outline: 2px solid var(--primary)
			outline-offset: -2px
	&__cover
		position: relative
		aspect-ratio: 4 / 3
		overflow: hidden
		background: var(--surface-container-high)
		> :global(img)
			position: relative
			z-index: 1
			display: block
			width: 100%
			height: 100%
			object-fit: cover
	&__cover-fallback
		position: absolute
		inset: 0
		display: grid
		place-items: center
		color: var(--on-surface-variant)
		font-size: 2rem
		> :global(svg)
			width: 2rem
			height: 2rem
	&__badges
		position: absolute
		z-index: 2
		inset: 0.75rem 0.75rem auto
		display: flex
		justify-content: flex-end
		align-items: flex-start
	&__protected
		display: inline-flex
		align-items: center
		gap: 0.25rem
		min-height: 2rem
		padding: 0.25rem 0.5rem
		border-radius: var(--shape-corner-full)
		background: unquote("color-mix(in oklab, var(--scrim) 78%, transparent)")
		color: white
		font: var(--m3e-type-label-medium)
		backdrop-filter: blur(0.5rem)
		> :global(svg)
			width: 1.125rem
			height: 1.125rem
	&__body
		padding: var(--m3e-space-4) var(--m3e-space-4)
	&__title-row
		display: flex
		align-items: flex-start
		gap: 0.5rem
		> h2
			flex: 1
			min-width: 0
			margin: 0
			color: var(--on-surface)
			font: var(--m3e-type-title-large)
			font-weight: 700
			line-height: 1.25
		> :global(svg)
			flex: 0 0 auto
			color: var(--on-surface-variant)
			transition: color var(--m3e-duration-short) var(--m3e-easing-standard), transform var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate)
		.album-card:hover & > :global(svg)
			color: var(--primary)
			transform: translateX(0.25rem)
	&__description
		display: -webkit-box
		margin: 0.5rem 0 0
		overflow: hidden
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-medium)
		line-height: 1.5
		-webkit-box-orient: vertical
		-webkit-line-clamp: 2
	&__meta,
	&__tags
		display: flex
		flex-wrap: wrap
		gap: 0.5rem
		margin-top: 0.75rem
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-small)
	&__meta span + span::before
		content: "•"
		margin-inline-end: 0.5rem
		color: var(--outline)
	&__tags
		gap: 0.375rem
		margin-top: 0.625rem
		color: var(--primary)
		font: var(--m3e-type-label-medium)

:global(html.motion-reduced) .album-card
	transition: none

@media (prefers-reduced-motion: reduce)
	.album-card
		transition: none
</style>
