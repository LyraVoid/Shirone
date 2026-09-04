<script lang="ts">
import Button from "@components/atoms/action/Button.svelte";
import IconButton from "@components/atoms/action/IconButton.svelte";
import TextField from "@components/atoms/input/TextField.svelte";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import { decryptProtectedContent } from "@utils/password-protection";
import {
	protectedPayloadId,
	readProtectedSession,
	writeProtectedSession,
} from "@utils/protected-session";
import { onMount } from "svelte";
import type { ProtectedPayload } from "@/types/protectedContent";

let {
	payload,
	scope,
	hint = "",
	title = "",
	description = "",
	headingIcon = "",
	onunlocked,
}: {
	payload: ProtectedPayload;
	scope: string;
	hint?: string;
	title?: string;
	description?: string;
	headingIcon?: string;
	onunlocked: (content: string) => void;
} = $props();

let password = $state("");
let error = $state("");
let loading = $state(false);
let passwordVisible = $state(false);

const isPostScope = scope.startsWith("post:");
const resolvedTitle =
	title ||
	(isPostScope
		? i18n(I18nKey.postPasswordTitle)
		: i18n(I18nKey.albumPasswordTitle));
const resolvedDescription =
	description ||
	(isPostScope
		? i18n(I18nKey.postPasswordDescription)
		: i18n(I18nKey.albumPasswordDescription));
const resolvedHeadingIcon =
	headingIcon ||
	(isPostScope
		? "material-symbols:article-outline-rounded"
		: "material-symbols:photo-library-outline-rounded");

const inputId = `password-gate-${scope.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
const headingId = `${inputId}-title`;
const payloadId = protectedPayloadId(payload);
const expectedContentType = isPostScope ? "text/html" : "application/json";

onMount(() => {
	if (payload.contentType !== expectedContentType) return;
	const session = readProtectedSession(scope, payloadId);
	if (session) onunlocked(session.content);
});

function clearError() {
	if (error) error = "";
}

async function unlock() {
	if (!password.trim()) {
		error = isPostScope
			? i18n(I18nKey.postPasswordRequired)
			: i18n(I18nKey.albumPasswordRequired);
		return;
	}
	error = "";
	loading = true;
	try {
		if (payload.contentType !== expectedContentType) throw new Error();
		const content = await decryptProtectedContent(payload, password, scope);
		writeProtectedSession(scope, payloadId, content);
		onunlocked(content);
	} catch {
		error = isPostScope
			? i18n(I18nKey.postPasswordInvalid)
			: i18n(I18nKey.albumPasswordInvalid);
	} finally {
		loading = false;
	}
}
</script>

<section
	class={`password-gate${loading ? " password-gate--loading" : ""}`}
	aria-labelledby={headingId}
	aria-busy={loading}
>
	<div class="password-gate__visual" aria-hidden="true">
		<div class="password-gate__mosaic">
			<span class={`password-gate__tile password-gate__tile--one`}></span>
			<span class={`password-gate__tile password-gate__tile--two`}></span>
			<span class={`password-gate__tile password-gate__tile--three`}></span>
			<span class={`password-gate__tile password-gate__tile--four`}></span>
		</div>
		<div class="password-gate__seal">
			<Icon icon="material-symbols:shield-lock-rounded" aria-hidden="true" />
		</div>
	</div>

	<div class="password-gate__content">
		<div class="password-gate__heading">
			<div class="password-gate__heading-icon" aria-hidden="true">
				<Icon icon={resolvedHeadingIcon} />
			</div>
			<div>
				<h2 id={headingId}>{resolvedTitle}</h2>
				<p>{resolvedDescription}</p>
			</div>
		</div>

		{#if hint}
			<div class="password-gate__hint">
				<Icon icon="material-symbols:key-rounded" aria-hidden="true" />
				<span>{hint}</span>
			</div>
		{/if}

		<form
			class="password-gate__form"
			onsubmit={(event) => {
				event.preventDefault();
				void unlock();
			}}
		>
			<div class="password-gate__field">
				<TextField
					id={inputId}
					name="password"
					type={passwordVisible ? "text" : "password"}
					bind:value={password}
					label={isPostScope
						? i18n(I18nKey.postPasswordLabel)
						: i18n(I18nKey.albumPasswordLabel)}
					placeholder={isPostScope
						? i18n(I18nKey.postPasswordLabel)
						: i18n(I18nKey.albumPasswordLabel)}
					variant="outlined"
					autocomplete="current-password"
					disabled={loading}
					{error}
					oninput={clearError}
					class="password-gate__input"
				>
					<Icon slot="leading" icon="material-symbols:lock-rounded" aria-hidden="true" />
					<IconButton
						slot="trailing"
						icon={passwordVisible
							? "material-symbols:visibility-off-rounded"
							: "material-symbols:visibility-rounded"}
						size="small"
						label={i18n(
							passwordVisible
								? (isPostScope ? I18nKey.postPasswordHide : I18nKey.albumPasswordHide)
								: (isPostScope ? I18nKey.postPasswordShow : I18nKey.albumPasswordShow),
						)}
						disabled={loading}
						onclick={() => (passwordVisible = !passwordVisible)}
					/>
				</TextField>
			</div>
			<Button
				type="submit"
				label={loading
					? (isPostScope
							? i18n(I18nKey.postPasswordUnlocking)
							: i18n(I18nKey.albumPasswordUnlocking))
					: (isPostScope
							? i18n(I18nKey.postPasswordUnlock)
							: i18n(I18nKey.albumPasswordUnlock))}
				icon={loading
					? "material-symbols:progress-activity"
					: "material-symbols:lock-open-rounded"}
				size="medium"
				full
				disabled={loading}
				class="password-gate__submit"
			/>
		</form>
	</div>
</section>

<style lang="stylus">
@import "../../styles/breakpoints.styl"

.password-gate
	display: grid
	grid-template-columns: minmax(16rem, 0.9fr) minmax(0, 1.1fr)
	width: 100%
	max-width: 62rem
	min-height: 22rem
	margin: 0 auto
	overflow: hidden
	border: 1px solid var(--outline-variant)
	border-radius: var(--shape-corner-l)
	background: var(--surface-container-lowest)
	color: var(--on-surface)

	&__visual
		position: relative
		display: grid
		place-items: center
		min-width: 0
		overflow: hidden
		background: var(--surface-container-high)

	&__mosaic
		position: absolute
		inset: var(--m3e-space-6)
		display: grid
		grid-template-columns: 1.15fr 0.85fr
		grid-template-rows: 0.85fr 1.15fr
		gap: var(--m3e-space-3)
		transform: rotate(-3deg) scale(1.08)

	&__tile
		min-width: 0
		border-radius: var(--shape-corner-l)
		box-shadow: inset 0 0 0 1px var(--outline-variant)

	&__tile--one
		background: var(--primary-container)

	&__tile--two
		background: var(--tertiary-container)

	&__tile--three
		background: var(--secondary-container)

	&__tile--four
		background: var(--surface-container-highest)

	&__seal
		position: relative
		display: grid
		place-items: center
		width: 5rem
		height: 5rem
		border: var(--m3e-space-2) solid var(--surface-container-lowest)
		border-radius: var(--shape-corner-full)
		background: var(--primary)
		box-shadow: var(--m3e-elevation-3)
		color: var(--on-primary)
		> :global(svg)
			width: 2rem
			height: 2rem

	&__content
		display: flex
		flex-direction: column
		justify-content: center
		gap: var(--m3e-space-5)
		min-width: 0
		padding: var(--m3e-space-8)

	&__heading
		display: grid
		grid-template-columns: auto minmax(0, 1fr)
		align-items: start
		gap: var(--m3e-space-4)

	&__heading-icon
		display: grid
		place-items: center
		width: 3rem
		height: 3rem
		border-radius: var(--shape-corner-m)
		background: var(--secondary-container)
		color: var(--on-secondary-container)
		> :global(svg)
			width: 1.5rem
			height: 1.5rem

	h2
		margin: 0
		color: var(--on-surface)
		font: var(--m3e-type-title-large)

	&__heading p
		margin: var(--m3e-space-1) 0 0
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-medium)

	&__hint
		display: flex
		align-items: center
		gap: var(--m3e-space-3)
		min-width: 0
		padding: var(--m3e-space-3) var(--m3e-space-4)
		border-radius: var(--shape-corner-m)
		background: var(--surface-container-high)
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-medium)
		> :global(svg)
			flex: none
			width: 1.25rem
			height: 1.25rem
			color: var(--primary)
		span
			min-width: 0
			overflow-wrap: anywhere

	&__form
		display: grid
		grid-template-columns: minmax(0, 1fr) /* 明确网格列可收缩，防止隐式轨道被子项内容撑大 */
		gap: var(--m3e-space-4)
		width: 100%

	&__field
		min-width: 0 /* 覆盖网格项默认的最小尺寸限制，防止移动端窄屏溢出 */
		min-height: 4.5rem

	:global(.password-gate__input)
		border-radius: var(--shape-corner-m)

	:global(.password-gate__input .m3-text-field__trailing)
		margin-right: calc(var(--m3e-space-2) * -1)

	&--loading :global(.password-gate__submit .m3-button__icon)
		animation: password-gate-spin var(--m3e-duration-long) linear infinite

@keyframes password-gate-spin
	to
		transform: rotate(1turn)

@media (max-width: bp-md - 1px)
	.password-gate
		grid-template-columns: 1fr
		min-height: 0

		&__visual
			min-height: 12rem

		&__mosaic
			inset: var(--m3e-space-5)

		&__content
			padding: var(--m3e-space-6)

@media (max-width: bp-sm - 1px)
	.password-gate
		&__visual
			min-height: 9rem

		&__mosaic
			inset: var(--m3e-space-4)
			gap: var(--m3e-space-2)

		&__seal
			width: 4rem
			height: 4rem
			border-width: var(--m3e-space-1)

		&__content
			gap: var(--m3e-space-4)
			padding: var(--m3e-space-5)

		&__heading
			gap: var(--m3e-space-3)

@media (prefers-reduced-motion: reduce)
	.password-gate--loading :global(.password-gate__submit .m3-button__icon)
		animation: none
</style>
