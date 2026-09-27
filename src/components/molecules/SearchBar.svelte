<script lang="ts">
/**
 * M3E SearchBar — 导航栏折叠式胶囊搜索条分子。
 * 折叠时为 40px 图标按钮，点击后展开为
 * w-48 胶囊输入条，失焦延迟自动折叠。value / expanded 可双向绑定，
 * 展开折叠交互细节全部内聚在此，Search 有机体只负责搜索与结果面板。
 */
import Icon from "@iconify/svelte";

let {
	value = $bindable(""),
	expanded = $bindable(false),
	id = "search-input",
	name = "search",
	placeholder = "",
	onfocus = () => {},
	oncollapse = () => {},
}: {
	value?: string;
	expanded?: boolean;
	id?: string;
	name?: string;
	placeholder?: string;
	onfocus?: () => void;
	oncollapse?: () => void;
} = $props();

let blurTimer: ReturnType<typeof setTimeout>;

const expand = (): void => {
	expanded = true;
	setTimeout(() => {
		const input = document.getElementById(id) as HTMLInputElement;
		input?.focus();
	}, 0);
};

// 失焦后延迟折叠，允许搜索结果点击先执行
const handleBlur = (): void => {
	blurTimer = setTimeout(() => {
		expanded = false;
		oncollapse();
	}, 200);
};

const handleFocus = (): void => {
	clearTimeout(blurTimer);
	onfocus();
};
</script>

<div class="hidden lg:block relative w-10 h-10 shrink-0">
    <div
        class="m3-state-layer absolute right-0 top-0 flex items-center overflow-hidden rounded-full h-10 top-app-bar__search-shell
               {expanded ? 'top-app-bar__search-shell--expanded w-48 bg-(--surface-container-high)' : 'w-10 bg-transparent'}"
        style="transition: width var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate), background-color var(--m3e-duration-short) var(--m3e-easing-standard);"
        onclick={() => {
            if (!expanded) expand();
        }}
    >
        <Icon
            icon="material-symbols:search"
            class="pointer-events-none shrink-0 text-[1.25rem] transition-colors duration-[var(--m3e-duration-short)]
                   {expanded
                       ? 'ml-3 text-[var(--on-surface-variant)]'
                       : 'mx-auto text-[var(--on-surface)]'}"
        ></Icon>
        <input
            {id}
            {name}
            {placeholder}
            bind:value
            tabindex={expanded ? 0 : -1}
            onfocus={handleFocus}
            onblur={handleBlur}
            class="h-full bg-transparent outline-0 text-(--on-surface) caret-(--primary) transition-opacity duration-[var(--m3e-duration-short)]
                   {expanded ? 'w-32 pl-2 opacity-100' : 'w-0 opacity-0'}"
        />
    </div>
</div>
