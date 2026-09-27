import type { I18nConfig } from "../types/i18nConfig.ts";
import { withUserConfig } from "../utils/config-overlay.ts";

export const i18nConfig: I18nConfig = withUserConfig("i18n", {});
