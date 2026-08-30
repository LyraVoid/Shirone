import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { showSnackbar } from "@utils/snackbar";

/** Copy the current URL and keep link-button feedback consistent everywhere. */
export async function copyPageLink(): Promise<boolean> {
	if (typeof window === "undefined") return false;

	try {
		await navigator.clipboard.writeText(window.location.href);
		showSnackbar(i18n(I18nKey.copySuccess), {
			icon: "material-symbols:link-rounded",
		});
		return true;
	} catch {
		showSnackbar(i18n(I18nKey.copyFailed));
		return false;
	}
}
