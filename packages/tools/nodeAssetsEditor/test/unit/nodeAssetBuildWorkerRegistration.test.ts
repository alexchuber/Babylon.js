import { describe, expect, it } from "vitest";

// Importing the worker core evaluates its block-registration side effect in THIS test realm. Nothing
// else here registers blocks: we deliberately read the registry through the node-assets submodules and
// never import the node-assets package barrel or the editor's blockDescriptors (either would register
// every block via another path and mask a worker that under-registers). Vitest isolates the module
// registry per test file, so the registry below reflects exactly what the preview build worker can
// deserialize.
import "../../src/nodeAssets/nodeAssetBuildWorkerCore";
import { CreateBlockByClassName, GetRegisteredBlockClassNames } from "node-assets/blockFoundation/blockRegistry";
import { NodeAsset } from "node-assets/nodeAsset";

// The built-in block ClassNames, hardcoded (not derived from the package barrel) so this test fails
// if the worker realm ever registers a different set than the package publishes. Keep in sync with
// packages/dev/node-assets/test/unit/blockRegistry.test.ts.
const ExpectedBlockClassNames = [
    "ImportGLTFBlock",
    "ImportUSDBlock",
    "DracoCompressionBlock",
    "ExportGLTFBlock",
    "KTX2CompressionBlock",
    "WeldBlock",
    "DedupBlock",
    "DeduplicateMaterialsBlock",
    "DeduplicateTexturesBlock",
    "ReuseIdenticalMeshesBlock",
    "DeduplicateDataBlock",
    "DeduplicateResourcesBlock",
    "PruneBlock",
    "QuantizeBlock",
    "SimplifyBlock",
    "FlattenBlock",
    "JoinBlock",
    "NormalsBlock",
    "CenterBlock",
    "NumberLiteral",
    "StringLiteral",
    "JsonLiteral",
    "MergeScenes",
    "ImportImageBlock",
    "ExportImageBlock",
    "Selector",
    "GetProperty",
    "SetProperty",
    "SetTexture",
    "BuildPBRMaterial",
    "ResizeImageBlock",
    "ConvertImageFormatBlock",
    "FlipImageBlock",
    "ExtractTexture",
    "CompositeImageBlock",
    "ImportBabylonBlock",
    "ImportNodeGeometryBlock",
    "USD2GLTFBlock",
    "USD2BabylonBlock",
    "GLTF2BabylonBlock",
    "Babylon2GLTFBlock",
    "EvaluateNodeGeometryBlock",
    "DecomposeGLTFMaterialBlock",
    "ComposeGLTFMaterialBlock",
    "GetBabylonMeshBlock",
    "SetBabylonPropertyBlock",
    "GetUSDPrimBlock",
    "GLTFSelectorBlock",
    "USDSelectorBlock",
    "BabylonSelectorBlock",
    "ReadGLTFBlock",
    "GLTFToUniversalBlock",
    "UniversalToGLTFBlock",
    "WriteGLTFBlock",
    "ImportGLTFAggregateBlock",
    "ExportGLTFAggregateBlock",
    "CustomAggregateBlock",
] as const;

// The energy-orb showcase graph the editor seeds on open: a dark-metal base and a cyan pattern composite
// into the base colour, the same pattern fans out to the emissive input, and an imported sphere is built
// into a self-lit PBR material that flows through KTX2 + Draco compression to export. This is a
// hand-authored copy of what `NodeAsset.serialize()` produces, so `NodeAsset.Parse` is the only consumer
// of the block registry and the assertion pins the exact graph the preview worker must deserialize.
const EnergyOrbSeedClassNames = [
    "ImportImageBlock",
    "ImportImageBlock",
    "ImportGLTFBlock",
    "CompositeImageBlock",
    "BuildPBRMaterial",
    "KTX2CompressionBlock",
    "DracoCompressionBlock",
    "ExportGLTFBlock",
] as const;
const EnergyOrbSerializedGraph = {
    name: "energy-orb",
    blocks: [
        { customType: "ImportImageBlock", id: 1, name: "Import Image" },
        { customType: "ImportImageBlock", id: 2, name: "Import Image" },
        { customType: "ImportGLTFBlock", id: 3, name: "Import glTF" },
        { customType: "CompositeImageBlock", id: 4, name: "Composite Image" },
        { customType: "BuildPBRMaterial", id: 5, name: "Build PBR Material" },
        { customType: "KTX2CompressionBlock", id: 6, name: "KTX2 Compress" },
        { customType: "DracoCompressionBlock", id: 7, name: "Draco Compression" },
        { customType: "ExportGLTFBlock", id: 8, name: "Export glTF" },
    ],
    connections: [
        { fromBlock: 1, fromPoint: "output", toBlock: 4, toPoint: "base" },
        { fromBlock: 2, fromPoint: "output", toBlock: 4, toPoint: "overlay" },
        { fromBlock: 4, fromPoint: "output", toBlock: 5, toPoint: "baseColor" },
        { fromBlock: 2, fromPoint: "output", toBlock: 5, toPoint: "emissive" },
        { fromBlock: 3, fromPoint: "output", toBlock: 5, toPoint: "scene" },
        { fromBlock: 5, fromPoint: "output", toBlock: 6, toPoint: "input" },
        { fromBlock: 6, fromPoint: "output", toBlock: 7, toPoint: "input" },
        { fromBlock: 7, fromPoint: "output", toBlock: 8, toPoint: "input" },
    ],
};

describe("preview build worker block registration", () => {
    // Regression for the worker block-registration drift: the worker core used to side-effect import only
    // a hand-picked subset of block modules, so blocks that were registered on the main thread (via the
    // UI descriptors) stayed unregistered in the worker realm. Deserializing the seed graph then threw
    // `Cannot deserialize unknown block type "ImportImageBlock"` in the worker and surfaced as a preview
    // build error. Importing the package barrel registers every block, so the worker can never drift
    // behind the blocks a saved graph might contain.
    it("deserializes the energy-orb seed graph the preview worker builds", () => {
        const parsed = NodeAsset.Parse(EnergyOrbSerializedGraph);
        expect(parsed.attachedBlocks.map((block) => block.getClassName())).toEqual([...EnergyOrbSeedClassNames]);
    });

    it("registers every built-in block in the worker realm", () => {
        const registered = GetRegisteredBlockClassNames();
        expect(registered).toEqual(expect.arrayContaining([...ExpectedBlockClassNames]));
        expect(registered).toHaveLength(ExpectedBlockClassNames.length);
    });

    it.each(ExpectedBlockClassNames)("round-trips %s through NodeAsset.Parse in the worker realm", (className) => {
        const asset = new NodeAsset("worker-realm-coverage");
        const created = CreateBlockByClassName(className, className, asset);
        expect(created.getClassName()).toBe(className);

        const serialized = JSON.parse(JSON.stringify(asset.serialize()));
        const parsed = NodeAsset.Parse(serialized);

        expect(parsed.attachedBlocks).toHaveLength(1);
        expect(parsed.attachedBlocks[0].getClassName()).toBe(className);
    });
});
