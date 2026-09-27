import { defineConfig } from "astro/config";
import shirones from "./src/integration/index.ts";

// The integration drives every mode, this repository included: integrations,
// fonts, markdown, vite aliases/plugins, trailingSlash and the image endpoint
// all come from `src/integration/` and `src/config/integrationsConfig.ts`.
// Do not re-add per-mode config here — update `src/config/` so both modes
// stay in lockstep (see `src/config/README.md`).
export default defineConfig({
	integrations: [shirones()],
});
