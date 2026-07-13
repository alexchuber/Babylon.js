// The default "energy orb" sample assets, bundled into the editor via Vite `?url` imports so the
// seeded graph's first preview builds from the tool's own origin — with no dependency on a separate
// sample-asset CDN (see loadDefaultImportAsync in ./nodeAssetGraphController). This mirrors how the
// build worker bundles its encoder sidecars (see ./nodeAssetBuildWorkerResources).
//
// These files are byte-for-byte copies of the canonical playground samples in
// packages/tools/playground/public/scenes/nodeAssets/; keep them in sync if the originals change.
import OrbGlbUrl from "./sampleAssets/orb.glb?url";
import OrbMetalImageUrl from "./sampleAssets/orbMetal.png?url";
import OrbPatternImageUrl from "./sampleAssets/orbPattern.png?url";
import ToyCarUsdaUrl from "./sampleAssets/toycar.usda?url";
import ToyCarUsdzUrl from "./sampleAssets/toycar.usdz?url";
import ToyCarBabylonUrl from "./sampleAssets/toycar.babylon?url";

/** Same-origin URLs for the bundled default "energy orb" sample assets, used to seed the import blocks. */
export const DefaultSampleAssetUrls = {
    orbGlb: OrbGlbUrl,
    orbMetalImage: OrbMetalImageUrl,
    orbPatternImage: OrbPatternImageUrl,
} as const;

/** Same-origin URLs keyed by the stable asset keys used by the demo catalog JSON definitions. */
export const DemoCatalogAssetUrls: Readonly<Record<string, string>> = Object.fromEntries([
    ["orb-glb", DefaultSampleAssetUrls.orbGlb],
    ["orb-metal", DefaultSampleAssetUrls.orbMetalImage],
    ["orb-pattern", DefaultSampleAssetUrls.orbPatternImage],
    ["toycar-usda", ToyCarUsdaUrl],
    ["toycar-usdz", ToyCarUsdzUrl],
    ["toycar-babylon", ToyCarBabylonUrl],
]);

/**
 * Resolves a catalog asset key to a URL served by the editor's own origin.
 *
 * @param assetKey - Stable key from a catalog asset binding.
 * @returns The Vite-bundled URL.
 */
export function GetDemoCatalogAssetUrl(assetKey: string): string {
    const url = DemoCatalogAssetUrls[assetKey];
    if (!url) {
        throw new Error(`No same-origin bundled asset is registered for "${assetKey}".`);
    }
    return url;
}
