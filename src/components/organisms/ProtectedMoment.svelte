<script lang="ts">
/** 受保护动态：复用通用密码门控，解锁后恢复标准 MomentCard。 */
import MomentCard, {
	type MomentAuthor,
} from "@components/molecules/MomentCard.svelte";
import PasswordGate from "@components/organisms/PasswordGate.svelte";
import type {
	MomentImage,
	MomentProtectedContent,
	ProtectedMomentItem,
	PublicMomentItem,
} from "@utils/content-utils";
import { initFancyboxRuntime } from "@utils/fancybox-runtime";
import { initMarkdownRuntime } from "@utils/markdown-runtime";
import { tick } from "svelte";

let {
	moment,
	author,
	delay = 0,
}: {
	moment: ProtectedMomentItem;
	author: MomentAuthor;
	delay?: number;
} = $props();

let unlockedMoment = $state<PublicMomentItem | null>(null);

function isMomentImage(value: unknown): value is MomentImage {
	if (!value || typeof value !== "object") return false;
	const image = value as Partial<MomentImage>;
	return (
		typeof image.src === "string" &&
		typeof image.alt === "string" &&
		(image.thumbnailSrc === undefined ||
			typeof image.thumbnailSrc === "string") &&
		(image.thumbnailSrcset === undefined ||
			typeof image.thumbnailSrcset === "string")
	);
}

function parseMomentContent(serialized: string): MomentProtectedContent {
	const value: unknown = JSON.parse(serialized);
	if (!value || typeof value !== "object") throw new Error();
	const content = value as Partial<MomentProtectedContent>;
	if (
		typeof content.html !== "string" ||
		typeof content.location !== "string" ||
		typeof content.mood !== "string" ||
		!Array.isArray(content.tags) ||
		!content.tags.every((tag) => typeof tag === "string") ||
		!Array.isArray(content.images) ||
		!content.images.every(isMomentImage)
	) {
		throw new Error();
	}
	return content as MomentProtectedContent;
}

async function unlock(serialized: string) {
	try {
		const content = parseMomentContent(serialized);
		unlockedMoment = {
			...moment,
			...content,
			encrypted: false,
			passwordHint: "",
			payload: null,
		};
		await tick();
		const container = document.getElementById(`moment-${moment.id}`);
		if (container) {
			void initMarkdownRuntime(container);
			void initFancyboxRuntime(container);
		}
	} catch {
		unlockedMoment = null;
	}
}
</script>

{#if unlockedMoment}
	<MomentCard moment={unlockedMoment} {author} {delay} />
{:else}
	<MomentCard {moment} {author} {delay}>
		<PasswordGate
			payload={moment.payload}
			scope={moment.payload.scope}
			hint={moment.passwordHint}
			variant="compact"
			cacheSession={false}
			onunlocked={(content) => void unlock(content)}
		/>
	</MomentCard>
{/if}
