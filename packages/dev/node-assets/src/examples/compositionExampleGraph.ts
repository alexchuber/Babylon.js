import { ExportGLTFBlock } from "../Blocks/exportGLTFBlock";
import { ImportGLTFBlock } from "../Blocks/importGLTFBlock";
import { JsonLiteral } from "../Blocks/jsonLiteral";
import { MergeScenes } from "../Blocks/mergeScenes";
import { Selector } from "../Blocks/selector";
import { SetProperty } from "../Blocks/setProperty";
import { NodeAsset } from "../nodeAsset";

/**
 * The glTF Object Model JSON Pointer the example graph places its second part at. The two imported
 * parts merge in port order, so the first part's single node is `/nodes/0` and the second part's is
 * `/nodes/1`; this pointer therefore repositions the second part while leaving the first at the origin.
 */
export const CompositionExamplePlacementPointer = "/nodes/1/translation";

/** The translation the example graph writes at {@link CompositionExamplePlacementPointer}. */
export const CompositionExamplePlacementTranslation: [number, number, number] = [2, 0, 0];

/**
 * Builds the premade "scene composition" example graph: two imports folded together and one part
 * repositioned, so a user can load it and see merge + placement working end to end. It is the
 * runnable form of slice-05's placement story and, like the milestone-1 starter graph, wires the
 * topology in code while leaving the source bytes to the caller.
 *
 * Wiring (every block already exists — this adds no new block, per ADR 0003; placement is a
 * {@link SetProperty} on a node's translation authored by a {@link Selector} and fed a
 * {@link JsonLiteral} value):
 *
 * ```text
 * ImportGLTF(part0) ─┐
 *                    ├─ MergeScenes ─ SetProperty(/nodes/1/translation, [2,0,0]) ─ ExportGLTF
 * ImportGLTF(part1) ─┘   (Selector emits the pointer; a JsonLiteral emits the value)
 * ```
 *
 * The merged second part is addressable at `/nodes/1` because {@link MergeScenes} preserves each
 * source's hierarchy under the combined roots. The import bytes are stored on the blocks, so the
 * returned graph builds headlessly through {@link NodeAsset.buildAsync} and round-trips through
 * {@link NodeAsset.serialize}/{@link NodeAsset.Parse}.
 * @param part0Glb - The glb bytes for the first part (stays at the origin, merged as `/nodes/0`).
 * @param part1Glb - The glb bytes for the second part (repositioned, merged as `/nodes/1`).
 * @returns The wired composition example graph.
 */
export function CreateCompositionExampleGraph(part0Glb: Uint8Array, part1Glb: Uint8Array): NodeAsset {
    const asset = new NodeAsset("compositionExample");

    const importPart0 = new ImportGLTFBlock("Import Part 0", asset);
    importPart0.data = part0Glb;
    const importPart1 = new ImportGLTFBlock("Import Part 1", asset);
    importPart1.data = part1Glb;

    const merge = new MergeScenes("Merge Scenes", asset);

    const placementPointer = new Selector("Placement Pointer", asset);
    placementPointer.pointer = CompositionExamplePlacementPointer;
    const placementValue = new JsonLiteral("Placement Value", asset);
    placementValue.value = CompositionExamplePlacementTranslation;
    const place = new SetProperty("Place Part", asset);

    const exporter = new ExportGLTFBlock("Export glTF", asset);

    importPart0.output.connectTo(merge.inputs[0]);
    importPart1.output.connectTo(merge.inputs[1]);
    merge.output.connectTo(place.scene);
    placementPointer.output.connectTo(place.pointer);
    placementValue.output.connectTo(place.value);
    place.output.connectTo(exporter.input);

    return asset;
}
