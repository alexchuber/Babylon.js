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

/** Same-origin URLs for the bundled default "energy orb" sample assets, used to seed the import blocks. */
export const DefaultSampleAssetUrls = {
    orbGlb: OrbGlbUrl,
    orbMetalImage: OrbMetalImageUrl,
    orbPatternImage: OrbPatternImageUrl,
} as const;
