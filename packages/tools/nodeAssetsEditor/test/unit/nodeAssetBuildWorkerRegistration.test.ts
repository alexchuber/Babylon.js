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
import { GetDefaultBuiltInNodeAssetLibraryEntry } from "../../src/nodeAssets/builtInLibraryEntries";

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
    "WeldVerticesBlock",
    "DedupBlock",
    "DeduplicateMaterialsBlock",
    "DeduplicateTexturesBlock",
    "ReuseIdenticalMeshesBlock",
    "DeduplicateDataBlock",
    "DeduplicateResourcesBlock",
    "PruneBlock",
    "RemoveUnusedResourcesBlock",
    "RemoveDegenerateGeometryBlock",
    "FixFaceWindingBlock",
    "QuantizeAttributesBlock",
    "SimplifyMeshesBlock",
    "FlattenBlock",
    "JoinBlock",
    "FlattenHierarchyBlock",
    "JoinMeshesBlock",
    "SplitMeshesByMaterialBlock",
    "MergeScenesBlock",
    "NormalsBlock",
    "RecomputeNormalsBlock",
    "GenerateTangentsBlock",
    "StripAttributesBlock",
    "CenterBlock",
    "TransformSceneBlock",
    "CenterSceneBlock",
    "ResizeTexturesBlock",
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
    "ReadNodeGeometryBlock",
    "NodeGeometryToUniversalBlock",
    "ImportNodeGeometryAggregateBlock",
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
    "ReadUSDBlock",
    "USDToUniversalBlock",
    "ImportUSDAggregateBlock",
    "CustomAggregateBlock",
    "ReadBabylonBlock",
    "BabylonToUniversalBlock",
    "ImportBabylonAggregateBlock",
    "ReadUSDBlock",
    "USDToUniversalBlock",
    "ImportUSDAggregateBlock",
    "DeduplicateMaterialsBlock",
    "DeduplicateTexturesBlock",
    "ReuseIdenticalMeshesBlock",
    "DeduplicateDataBlock",
    "DeduplicateResourcesBlock",
] as const;

const DefaultPipelineClassNames = ["ImportGLTFAggregateBlock", "WeldVerticesBlock", "RemoveUnusedResourcesBlock", "ExportGLTFAggregateBlock"] as const;

describe("preview build worker block registration", () => {
    // Regression for the worker block-registration drift: the worker core used to side-effect import only
    // a hand-picked subset of block modules, so blocks that were registered on the main thread (via the
    // UI descriptors) stayed unregistered in the worker realm. Deserializing the seed graph then threw
    // `Cannot deserialize unknown block type "ImportImageBlock"` in the worker and surfaced as a preview
    // build error. Importing the package barrel registers every block, so the worker can never drift
    // behind the blocks a saved graph might contain.
    it("deserializes the maintained default catalog graph the preview worker builds", () => {
        const editorFile = JSON.parse(GetDefaultBuiltInNodeAssetLibraryEntry().serializedGraph) as { graph: unknown };
        const parsed = NodeAsset.Parse(editorFile.graph);
        expect(parsed.attachedBlocks.map((block) => block.getClassName())).toEqual([...DefaultPipelineClassNames]);
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
