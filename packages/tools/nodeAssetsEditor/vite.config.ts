import { defineConfig } from "vite";
import path from "path";
// @ts-ignore -- untyped JS helper
import { commonDevViteConfiguration } from "../../public/viteToolsHelper.mjs";

export default defineConfig(
    commonDevViteConfiguration({
        port: parseInt(process.env.NODE_ASSETS_EDITOR_PORT ?? "1348"),
        aliases: {
            core: path.resolve("../../dev/core/src"),
            "shared-ui-components": path.resolve("../../dev/sharedUiComponents/src"),
        },
        productionExternals: {},
    })
);
