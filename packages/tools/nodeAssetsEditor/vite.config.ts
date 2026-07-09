import { defineConfig, type Plugin } from "vite";
import path from "path";
import { transform as esbuildTransform } from "esbuild";
// @ts-ignore -- untyped JS helper
import { commonDevViteConfiguration } from "../../public/viteToolsHelper.mjs";

const coreSrc = path.resolve("../../dev/core/src");
const loadersSrc = path.resolve("../../dev/loaders/src");
const viewerDist = path.resolve("../viewer/dist/tsbuild");

/**
 * Lower Babylon's standard (TC39) decorators for the browser.
 *
 * This editor bundles core/loaders from source rather than externalizing them to the CDN BABYLON global.
 * Core uses standard decorators (e.g. `@serialize`), which Vite 8's default transformer (oxc) does not
 * lower — it leaves them as raw syntax that the browser's ESM parser rejects. esbuild does implement the
 * standard-decorator transform (with correct semantics) when `useDefineForClassFields` is false, which is
 * how the whole repo compiles. Run esbuild `enforce: "pre"` on the decorated core/loaders source files so
 * oxc only ever sees decorator-free JS.
 */
function lowerStandardDecoratorsPlugin(): Plugin {
    const decoratorDirs = [coreSrc, loadersSrc];
    return {
        name: "lower-babylon-standard-decorators",
        enforce: "pre",
        async transform(code, id) {
            const file = id.split("?")[0];
            if (!file.endsWith(".ts") || file.endsWith(".d.ts")) {
                return null;
            }
            if (!decoratorDirs.some((dir) => file.startsWith(dir + path.sep))) {
                return null;
            }
            // Only pay the transform cost for files that actually use a decorator (line-anchored `@` avoids
            // matching TSDoc tags like ` * @param`, which are preceded by `*`).
            if (!/\n\s*@[A-Za-z]/.test(code)) {
                return null;
            }
            const result = await esbuildTransform(code, {
                loader: "ts",
                sourcefile: file,
                sourcemap: true,
                tsconfigRaw: { compilerOptions: { useDefineForClassFields: false } },
            });
            return { code: result.code, map: result.map };
        },
    };
}

const base = commonDevViteConfiguration({
    port: parseInt(process.env.NODE_ASSETS_EDITOR_PORT ?? "1348"),
    aliases: {
        core: coreSrc,
        loaders: loadersSrc,
        "node-assets": path.resolve("../../dev/node-assets/src"),
        "shared-ui-components": path.resolve("../../dev/sharedUiComponents/src"),
        viewer: viewerDist,
        // The glTF loader source imports this types-only package for its const enums; alias it to the
        // canonical runtime stub (as devHost/playground do) so Vite can resolve it from source.
        "babylonjs-gltf2interface": path.resolve("../../public/glTF2Interface/babylonjs-gltf2interface.stub.ts"),
    },
    productionExternals: {},
});

export default defineConfig({
    ...base,
    server: {
        ...base.server,
        fs: {
            ...base.server?.fs,
            // The KTX2 encoder's matched wasm + JS glue live in the root node_modules; allow the dev
            // server to serve them for the `?url` imports in blockCatalog (repo root is three levels up).
            allow: [...(base.server?.fs?.allow ?? []), path.resolve("../../..")],
        },
    },
    plugins: [...(base.plugins ?? []), lowerStandardDecoratorsPlugin()],
});
