import { DracoCompressionBlock } from "node-assets/Blocks/dracoCompressionBlock";
import { ExportGLTFBlock } from "node-assets/Blocks/exportGLTFBlock";
import { ExtractTexture } from "node-assets/Blocks/extractTexture";
import { ImportGLTFBlock } from "node-assets/Blocks/importGLTFBlock";
import { ImportImageBlock } from "node-assets/Blocks/importImageBlock";
import { ImportUSDBlock } from "node-assets/Blocks/importUSDBlock";
import { JsonLiteral } from "node-assets/Blocks/jsonLiteral";
import { KTX2CompressionBlock } from "node-assets/Blocks/ktx2CompressionBlock";
import { MergeScenes } from "node-assets/Blocks/mergeScenes";
import { ResizeImageBlock } from "node-assets/Blocks/resizeImageBlock";
import { Selector } from "node-assets/Blocks/selector";
import { SetProperty } from "node-assets/Blocks/setProperty";
import { SetTexture } from "node-assets/Blocks/setTexture";
import { type NodeAssetBlock } from "node-assets/blockFoundation/nodeAssetBlock";
import { NodeAsset } from "node-assets/nodeAsset";

import { type INodeAssetLibraryEntry } from "./nodeAssetLibrary";

interface ISampleEditorBlock {
    readonly id: number;
    readonly position: { readonly x: number; readonly y: number };
    readonly title: string;
    readonly collapsed: boolean;
}

interface ISampleBuilder {
    readonly asset: NodeAsset;
    addBlock<BlockT extends NodeAssetBlock>(block: BlockT, x: number, y: number): BlockT;
}

function CreateBuiltInEntry(name: string, configure?: (builder: ISampleBuilder) => void): INodeAssetLibraryEntry {
    const asset = new NodeAsset(name);
    const blocks: ISampleEditorBlock[] = [];
    configure?.({
        asset,
        addBlock: (block, x, y) => {
            blocks.push({ id: block.uniqueId, position: { x, y }, title: block.name, collapsed: false });
            return block;
        },
    });

    return {
        id: `built-in:${name}`,
        name,
        baseName: name,
        version: 1,
        source: "built-in",
        serializedGraph: JSON.stringify({ graph: asset.serialize(), editor: { blocks } }, null, 2),
    };
}

/**
 * Creates the source-controlled NodeAsset examples shown before user-saved graphs in the Library.
 * @returns The bundled Library entries.
 */
export function CreateBuiltInNodeAssetLibraryEntries(): readonly INodeAssetLibraryEntry[] {
    return [
        CreateBuiltInEntry("USD to Optimized glTF", ({ asset, addBlock }) => {
            const source = addBlock(new ImportUSDBlock("Import USD", asset), 50, 50);
            const draco = addBlock(new DracoCompressionBlock("Draco Compression", asset), 310, 50);
            const output = addBlock(new ExportGLTFBlock("Export glTF", asset), 570, 50);
            source.output.connectTo(draco.input);
            draco.output.connectTo(output.input);
        }),
        CreateBuiltInEntry("USD with Custom Textures", ({ asset, addBlock }) => {
            const source = addBlock(new ImportUSDBlock("Import USD", asset), 50, 40);
            const image = addBlock(new ImportImageBlock("Import Image", asset), 310, 190);
            const selector = addBlock(new Selector("Selector", asset), 310, 340);
            const setTexture = addBlock(new SetTexture("Set Texture", asset), 570, 40);
            const output = addBlock(new ExportGLTFBlock("Export glTF", asset), 830, 50);
            selector.pointer = "/materials/0/pbrMetallicRoughness/baseColorTexture";
            source.output.connectTo(setTexture.scene);
            image.output.connectTo(setTexture.image);
            selector.output.connectTo(setTexture.pointer);
            setTexture.output.connectTo(output.input);
        }),
        CreateBuiltInEntry("Multi-Source Merge", ({ asset, addBlock }) => {
            const usd = addBlock(new ImportUSDBlock("Import USD", asset), 50, 30);
            const gltf = addBlock(new ImportGLTFBlock("Import glTF", asset), 50, 190);
            const merge = addBlock(new MergeScenes("Merge Scenes", asset), 310, 60);
            const draco = addBlock(new DracoCompressionBlock("Draco Compression", asset), 570, 75);
            const ktx2 = addBlock(new KTX2CompressionBlock("KTX2 Compress", asset), 830, 75);
            const output = addBlock(new ExportGLTFBlock("Export glTF", asset), 1090, 75);
            usd.output.connectTo(merge.inputs[0]);
            gltf.output.connectTo(merge.inputs[1]);
            merge.output.connectTo(draco.input);
            draco.output.connectTo(ktx2.input);
            ktx2.output.connectTo(output.input);
        }),
        CreateBuiltInEntry("Material Decomposition", ({ asset, addBlock }) => {
            const source = addBlock(new ImportGLTFBlock("Import glTF", asset), 50, 200);
            const baseSelector = addBlock(new Selector("Base Color Selector", asset), 280, 20);
            const normalSelector = addBlock(new Selector("Normal Selector", asset), 280, 170);
            const ormSelector = addBlock(new Selector("ORM Selector", asset), 280, 320);
            const extractBase = addBlock(new ExtractTexture("Extract Base Color", asset), 510, 20);
            const extractNormal = addBlock(new ExtractTexture("Extract Normal", asset), 510, 170);
            const extractOrm = addBlock(new ExtractTexture("Extract ORM", asset), 510, 320);
            const resizeBase = addBlock(new ResizeImageBlock("Resize Base Color", asset), 740, 20);
            const resizeNormal = addBlock(new ResizeImageBlock("Resize Normal", asset), 740, 170);
            const resizeOrm = addBlock(new ResizeImageBlock("Resize ORM", asset), 740, 320);
            const setBase = addBlock(new SetTexture("Set Base Color", asset), 970, 20);
            const setNormal = addBlock(new SetTexture("Set Normal", asset), 1200, 120);
            const setOrm = addBlock(new SetTexture("Set ORM", asset), 1430, 220);
            const roughnessSelector = addBlock(new Selector("Roughness Selector", asset), 1430, 430);
            const roughnessValue = addBlock(new JsonLiteral("Roughness Value", asset), 1430, 560);
            const setRoughness = addBlock(new SetProperty("Set Roughness", asset), 1660, 260);
            const output = addBlock(new ExportGLTFBlock("Export glTF", asset), 1890, 280);

            baseSelector.pointer = "/materials/0/pbrMetallicRoughness/baseColorTexture";
            normalSelector.pointer = "/materials/0/normalTexture";
            ormSelector.pointer = "/materials/0/pbrMetallicRoughness/metallicRoughnessTexture";
            roughnessSelector.pointer = "/materials/0/pbrMetallicRoughness/roughnessFactor";
            roughnessValue.value = 0.65;

            source.output.connectTo(extractBase.scene);
            source.output.connectTo(extractNormal.scene);
            source.output.connectTo(extractOrm.scene);
            source.output.connectTo(setBase.scene);
            baseSelector.output.connectTo(extractBase.pointer);
            baseSelector.output.connectTo(setBase.pointer);
            normalSelector.output.connectTo(extractNormal.pointer);
            normalSelector.output.connectTo(setNormal.pointer);
            ormSelector.output.connectTo(extractOrm.pointer);
            ormSelector.output.connectTo(setOrm.pointer);
            extractBase.output.connectTo(resizeBase.input);
            extractNormal.output.connectTo(resizeNormal.input);
            extractOrm.output.connectTo(resizeOrm.input);
            resizeBase.output.connectTo(setBase.image);
            resizeNormal.output.connectTo(setNormal.image);
            resizeOrm.output.connectTo(setOrm.image);
            setBase.output.connectTo(setNormal.scene);
            setNormal.output.connectTo(setOrm.scene);
            setOrm.output.connectTo(setRoughness.scene);
            roughnessSelector.output.connectTo(setRoughness.pointer);
            roughnessValue.output.connectTo(setRoughness.value);
            setRoughness.output.connectTo(output.input);
        }),
        CreateBuiltInEntry("USD Preview", ({ asset, addBlock }) => {
            const source = addBlock(new ImportUSDBlock("Import USD", asset), 50, 50);
            const output = addBlock(new ExportGLTFBlock("Export glTF", asset), 310, 50);
            source.output.connectTo(output.input);
        }),
        CreateBuiltInEntry("Full Supported Pipeline", ({ asset, addBlock }) => {
            const usd = addBlock(new ImportUSDBlock("Import USD", asset), 40, 30);
            const gltfA = addBlock(new ImportGLTFBlock("Import glTF A", asset), 40, 170);
            const gltfB = addBlock(new ImportGLTFBlock("Import glTF B", asset), 40, 310);
            const mergeSources = addBlock(new MergeScenes("Merge Sources", asset), 310, 60);
            const mergeAssembly = addBlock(new MergeScenes("Merge Assembly", asset), 570, 140);
            const draco = addBlock(new DracoCompressionBlock("Draco Compression", asset), 830, 155);
            const ktx2 = addBlock(new KTX2CompressionBlock("KTX2 Compress", asset), 1090, 155);
            const output = addBlock(new ExportGLTFBlock("Export glTF", asset), 1350, 155);
            usd.output.connectTo(mergeSources.inputs[0]);
            gltfA.output.connectTo(mergeSources.inputs[1]);
            mergeSources.output.connectTo(mergeAssembly.inputs[0]);
            gltfB.output.connectTo(mergeAssembly.inputs[1]);
            mergeAssembly.output.connectTo(draco.input);
            draco.output.connectTo(ktx2.input);
            ktx2.output.connectTo(output.input);
        }),
    ];
}
