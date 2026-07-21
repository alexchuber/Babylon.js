import { EncodeArrayBufferToBase64 } from "core/Misc/stringTools";

import { DracoCompressionBlock } from "node-assets/Blocks/dracoCompressionBlock";
import { KTX2CompressionBlock } from "node-assets/Blocks/ktx2CompressionBlock";
import { type NodeAssetBlock } from "node-assets/blockFoundation/nodeAssetBlock";
import { type NodeAsset } from "node-assets/nodeAsset";

import { type INodeAssetLibraryEntry } from "./nodeAssetLibrary";
import { BuiltInLibraryFixtures } from "./builtInLibraryFixtures";

type SerializedBlock = Record<string, unknown> & {
    readonly customType: string;
    readonly id: number;
    readonly name: string;
};

type BlockReference = {
    readonly id: number;
};

type AggregateExposure = {
    readonly publicName: string;
    readonly blockId: number;
    readonly pointName: string;
};

type EditorBlock = {
    readonly id: number;
    readonly position: { readonly x: number; readonly y: number };
    readonly title: string;
    readonly collapsed: boolean;
};

const SerializationOnlyNodeAsset = {
    _registerBlock(): void {},
} as unknown as NodeAsset;

function GetSerializedBlockProperties(block: NodeAssetBlock): Record<string, unknown> {
    const properties: Record<string, unknown> = { ...block.serialize() };
    delete properties.customType;
    delete properties.id;
    delete properties.name;
    return properties;
}

const DefaultKtx2CompressionProperties = GetSerializedBlockProperties(new KTX2CompressionBlock("KTX2 serialization defaults", SerializationOnlyNodeAsset));
const DefaultDracoCompressionProperties = GetSerializedBlockProperties(new DracoCompressionBlock("Draco serialization defaults", SerializationOnlyNodeAsset));

class BuiltInPipelineBuilder {
    private _nextId = 1;
    private readonly _blocks: SerializedBlock[] = [];
    private readonly _connections: Array<{ readonly fromBlock: number; readonly fromPoint: string; readonly toBlock: number; readonly toPoint: string }> = [];
    private readonly _editorBlocks: EditorBlock[] = [];

    public constructor(private readonly _name: string) {}

    public addBlock(customType: string, name: string, x: number, y: number, properties: Record<string, unknown> = {}): BlockReference {
        const id = this._allocateId();
        this._blocks.push({ customType, id, name, ...properties });
        this._editorBlocks.push({ id, position: { x, y }, title: name, collapsed: false });
        return { id };
    }

    public addImport(
        customType: string,
        name: string,
        x: number,
        y: number,
        readCustomType: string,
        readName: string,
        transcoderCustomType: string,
        transcoderName: string,
        data: Uint8Array | null,
        source: string,
        sourceKind: "url" | "upload"
    ): BlockReference {
        const readId = this._allocateId();
        const transcoderId = this._allocateId();
        return this._addAggregate(
            customType,
            name,
            x,
            y,
            [
                { customType: readCustomType, id: readId, name: readName, data: data ? EncodeArrayBufferToBase64(data) : null, source, sourceKind },
                { customType: transcoderCustomType, id: transcoderId, name: transcoderName },
            ],
            [{ fromBlock: readId, fromPoint: "output", toBlock: transcoderId, toPoint: "input" }],
            [],
            [{ publicName: "output", blockId: transcoderId, pointName: "output" }]
        );
    }

    public addExport(x: number, y: number): BlockReference {
        const transcoderId = this._allocateId();
        const writeId = this._allocateId();
        return this._addAggregate(
            "ExportGLTFAggregateBlock",
            "Export glTF",
            x,
            y,
            [
                { customType: "UniversalToGLTFBlock", id: transcoderId, name: "Universal to glTF" },
                { customType: "WriteGLTFBlock", id: writeId, name: "Write glTF", fileName: "scene" },
            ],
            [{ fromBlock: transcoderId, fromPoint: "output", toBlock: writeId, toPoint: "input" }],
            [{ publicName: "input", blockId: transcoderId, pointName: "input" }],
            []
        );
    }

    public addDeduplicateResources(x: number, y: number): BlockReference {
        const materialsId = this._allocateId();
        const texturesId = this._allocateId();
        const meshesId = this._allocateId();
        const dataId = this._allocateId();
        return this._addAggregate(
            "DeduplicateResourcesBlock",
            "Deduplicate Resources",
            x,
            y,
            [
                { customType: "DeduplicateMaterialsBlock", id: materialsId, name: "Deduplicate Materials", keepUniqueNames: true },
                { customType: "DeduplicateTexturesBlock", id: texturesId, name: "Deduplicate Textures", keepUniqueNames: true },
                { customType: "ReuseIdenticalMeshesBlock", id: meshesId, name: "Reuse Identical Meshes", keepUniqueNames: true },
                { customType: "DeduplicateDataBlock", id: dataId, name: "Deduplicate Data", keepUniqueNames: true },
            ],
            [
                { fromBlock: materialsId, fromPoint: "output", toBlock: texturesId, toPoint: "input" },
                { fromBlock: texturesId, fromPoint: "output", toBlock: meshesId, toPoint: "input" },
                { fromBlock: meshesId, fromPoint: "output", toBlock: dataId, toPoint: "input" },
            ],
            [{ publicName: "input", blockId: materialsId, pointName: "input" }],
            [{ publicName: "output", blockId: dataId, pointName: "output" }]
        );
    }

    public connect(from: BlockReference, to: BlockReference, toPoint = "input", fromPoint = "output"): void {
        this._connections.push({ fromBlock: from.id, fromPoint, toBlock: to.id, toPoint });
    }

    public createEntry(): INodeAssetLibraryEntry {
        return Object.freeze({
            id: `built-in:${this._name}`,
            name: this._name,
            baseName: this._name,
            version: 1,
            source: "built-in",
            serializedGraph: JSON.stringify(
                {
                    graph: { name: this._name, blocks: this._blocks, connections: this._connections },
                    editor: { blocks: this._editorBlocks, frames: [] },
                },
                null,
                2
            ),
        });
    }

    private _addAggregate(
        customType: string,
        name: string,
        x: number,
        y: number,
        blocks: SerializedBlock[],
        connections: Array<{ readonly fromBlock: number; readonly fromPoint: string; readonly toBlock: number; readonly toPoint: string }>,
        exposedInputs: AggregateExposure[],
        exposedOutputs: AggregateExposure[]
    ): BlockReference {
        return this.addBlock(customType, name, x, y, {
            aggregateVersion: 1,
            subgraph: { name: `${name} subgraph`, blocks, connections },
            exposedInputs,
            exposedOutputs,
        });
    }

    private _allocateId(): number {
        return this._nextId++;
    }
}

function CreateGltfImport(builder: BuiltInPipelineBuilder, name = "Import glTF", x = 40, y = 120, data = BuiltInLibraryFixtures.gltf): BlockReference {
    return builder.addImport(
        "ImportGLTFAggregateBlock",
        name,
        x,
        y,
        "ReadGLTFBlock",
        "Read glTF",
        "GLTFToUniversalBlock",
        "glTF to Universal",
        data,
        "catalog-triangle.glb",
        "upload"
    );
}

function CreateUsdImport(builder: BuiltInPipelineBuilder, x = 40, y = 120): BlockReference {
    return builder.addImport(
        "ImportUSDAggregateBlock",
        "Import USD",
        x,
        y,
        "ReadUSDBlock",
        "Read USD",
        "USDToUniversalBlock",
        "USD to Universal",
        BuiltInLibraryFixtures.usd,
        "catalog-triangle.usda",
        "upload"
    );
}

function CreateBabylonImport(builder: BuiltInPipelineBuilder, x = 40, y = 120): BlockReference {
    return builder.addImport(
        "ImportBabylonAggregateBlock",
        "Import Babylon",
        x,
        y,
        "ReadBabylonBlock",
        "Read Babylon",
        "BabylonToUniversalBlock",
        "Babylon to Universal",
        BuiltInLibraryFixtures.babylon,
        "catalog-triangle.babylon",
        "upload"
    );
}

function CreateNodeGeometryImport(builder: BuiltInPipelineBuilder, x = 40, y = 120): BlockReference {
    return builder.addImport(
        "ImportNodeGeometryAggregateBlock",
        "Import Node Geometry",
        x,
        y,
        "ReadNodeGeometryBlock",
        "Read Node Geometry",
        "NodeGeometryToUniversalBlock",
        "Node Geometry to Universal",
        BuiltInLibraryFixtures.nodeGeometry,
        "catalog-box.json",
        "upload"
    );
}

function CreateGltfOptimizationEntry(): INodeAssetLibraryEntry {
    const builder = new BuiltInPipelineBuilder("glTF Optimization");
    const source = builder.addImport(
        "ImportGLTFAggregateBlock",
        "Import glTF",
        40,
        120,
        "ReadGLTFBlock",
        "Read glTF",
        "GLTFToUniversalBlock",
        "glTF to Universal",
        null,
        "https://assets.babylonjs.com/meshes/roundedCube.glb",
        "url"
    );
    const weld = builder.addBlock("WeldVerticesBlock", "Weld Vertices", 340, 120, { overwrite: true });
    const prune = builder.addBlock("RemoveUnusedResourcesBlock", "Remove Unused Resources", 640, 120, {
        keptPropertyTypes: [],
        keepLeafNodes: false,
        keepAttributes: false,
        keepSolidTextures: false,
        keepExtras: false,
    });
    const output = builder.addExport(960, 120);
    builder.connect(source, weld);
    builder.connect(weld, prune);
    builder.connect(prune, output);
    return builder.createEntry();
}

function CreateUsdOptimizationEntry(): INodeAssetLibraryEntry {
    const builder = new BuiltInPipelineBuilder("USD to Optimized glTF");
    const source = CreateUsdImport(builder);
    const prune = builder.addBlock("RemoveUnusedResourcesBlock", "Remove Unused Resources", 360, 120, {
        keptPropertyTypes: [],
        keepLeafNodes: false,
        keepAttributes: false,
        keepSolidTextures: false,
        keepExtras: false,
    });
    const output = builder.addExport(680, 120);
    builder.connect(source, prune);
    builder.connect(prune, output);
    return builder.createEntry();
}

function CreateBabylonOptimizationEntry(): INodeAssetLibraryEntry {
    const builder = new BuiltInPipelineBuilder("Babylon to Optimized glTF");
    const source = CreateBabylonImport(builder);
    const weld = builder.addBlock("WeldVerticesBlock", "Weld Vertices", 360, 120, { overwrite: true });
    const output = builder.addExport(660, 120);
    builder.connect(source, weld);
    builder.connect(weld, output);
    return builder.createEntry();
}

function CreateNodeGeometryEntry(): INodeAssetLibraryEntry {
    const builder = new BuiltInPipelineBuilder("Node Geometry to glTF");
    const source = CreateNodeGeometryImport(builder);
    const output = builder.addExport(400, 120);
    builder.connect(source, output);
    return builder.createEntry();
}

function CreateMultiSourceEntry(): INodeAssetLibraryEntry {
    const builder = new BuiltInPipelineBuilder("Multi-Source Universal Merge");
    const gltf = CreateGltfImport(builder, "Import glTF", 40, 40);
    const babylon = CreateBabylonImport(builder, 40, 260);
    const merge = builder.addBlock("MergeScenesBlock", "Merge Scenes", 380, 140, { inputCount: 2 });
    const output = builder.addExport(700, 140);
    builder.connect(gltf, merge, "input0");
    builder.connect(babylon, merge, "input1");
    builder.connect(merge, output);
    return builder.createEntry();
}

function CreateAdvancedCompressionEntry(): INodeAssetLibraryEntry {
    const builder = new BuiltInPipelineBuilder("Advanced glTF Compression");
    const source = CreateGltfImport(builder);
    const toGltf = builder.addBlock("UniversalToGLTFBlock", "Universal to glTF", 340, 120);
    const textures = builder.addBlock("KTX2CompressionBlock", "Compress Textures (KTX2)", 640, 120, DefaultKtx2CompressionProperties);
    const geometry = builder.addBlock("DracoCompressionBlock", "Compress Geometry (Draco)", 960, 120, DefaultDracoCompressionProperties);
    const write = builder.addBlock("WriteGLTFBlock", "Write glTF", 1280, 120, { fileName: "scene" });
    builder.connect(source, toGltf);
    builder.connect(toGltf, textures);
    builder.connect(textures, geometry);
    builder.connect(geometry, write);
    return builder.createEntry();
}

function CreateFullOptimizationEntry(): INodeAssetLibraryEntry {
    const builder = new BuiltInPipelineBuilder("Full Universal Optimization");
    const source = CreateGltfImport(builder, "Import glTF", 40, 120, BuiltInLibraryFixtures.unweldedGltf);
    const tangents = builder.addBlock("GenerateTangentsBlock", "Generate Tangents", 320, 120);
    const weld = builder.addBlock("WeldVerticesBlock", "Weld Vertices", 600, 120, { overwrite: true });
    const deduplicate = builder.addDeduplicateResources(880, 120);
    const winding = builder.addBlock("FixFaceWindingBlock", "Fix Face Winding", 1180, 120);
    const quantize = builder.addBlock("QuantizeAttributesBlock", "Quantize Attributes", 1460, 120, {
        positionBits: 14,
        normalBits: 10,
        textureCoordinateBits: 12,
        colorBits: 8,
        weightBits: 8,
        genericBits: 12,
        normalizeWeights: true,
        attributePattern: ".*",
        morphTargetPattern: ".*",
        quantizationVolume: "mesh",
        cleanup: true,
    });
    const split = builder.addBlock("SplitMeshesByMaterialBlock", "Split Meshes by Material", 1760, 120);
    const output = builder.addExport(2080, 120);
    builder.connect(source, tangents);
    builder.connect(tangents, weld);
    builder.connect(weld, deduplicate);
    builder.connect(deduplicate, winding);
    builder.connect(winding, quantize);
    builder.connect(quantize, split);
    builder.connect(split, output);
    return builder.createEntry();
}

const BuiltInNodeAssetLibraryEntries = Object.freeze([
    CreateGltfOptimizationEntry(),
    CreateUsdOptimizationEntry(),
    CreateBabylonOptimizationEntry(),
    CreateNodeGeometryEntry(),
    CreateMultiSourceEntry(),
    CreateAdvancedCompressionEntry(),
    CreateFullOptimizationEntry(),
]);

/**
 * Gets the source-controlled NodeAsset pipelines shown before user-saved graphs.
 * @returns The immutable production catalog.
 */
export function CreateBuiltInNodeAssetLibraryEntries(): readonly INodeAssetLibraryEntry[] {
    return BuiltInNodeAssetLibraryEntries;
}

/**
 * Gets the maintained catalog graph used when the editor opens.
 * @returns The default built-in pipeline.
 */
export function GetDefaultBuiltInNodeAssetLibraryEntry(): INodeAssetLibraryEntry {
    return BuiltInNodeAssetLibraryEntries[0];
}
