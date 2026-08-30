import type { SidebarPage } from "./sidebarConfig";

export type ContextMenuAction = "copySelection" | "backToTop" | "sharePageLink";

export interface ContextMenuConfig {
	/** Master switch. False means zero DOM and zero client runtime. */
	enable: boolean;
	/** Pages where the enhancement is allowed. Omit for every page. */
	pages?: SidebarPage[];
	/** Menu actions in display order. */
	actions: ContextMenuAction[];
}
