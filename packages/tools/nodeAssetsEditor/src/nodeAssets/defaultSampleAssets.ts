// The default orb sample asset, bundled into the editor via a Vite `?url` import so the
// seeded graph's first preview builds from the tool's own origin — with no dependency on a separate
// sample-asset CDN (see loadDefaultImportAsync in ./nodeAssetGraphController). This mirrors how the
// build worker bundles its encoder sidecars (see ./nodeAssetBuildWorkerResources).
//
// This file is a byte-for-byte copy of the canonical playground sample in
// packages/tools/playground/public/scenes/nodeAssets/; keep it in sync if the original changes.
import OrbGlbUrl from "./sampleAssets/orb.glb?url";

/** Same-origin URL for the bundled default orb sample asset, used to seed the import block. */
export const DefaultSampleAssetUrls = {
    orbGlb: OrbGlbUrl,
} as const;
