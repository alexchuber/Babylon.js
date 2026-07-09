import { type Document } from "@gltf-transform/core";
import { describe, expect, it, vi } from "vitest";

import { ExportGLTFBlock } from "../../src/Blocks/exportGLTFBlock";
import { ImportGLTFBlock } from "../../src/Blocks/importGLTFBlock";
import { JsonLiteral } from "../../src/Blocks/jsonLiteral";
import { MergeScenes } from "../../src/Blocks/mergeScenes";
import { Selector } from "../../src/Blocks/selector";
import { SetProperty } from "../../src/Blocks/setProperty";
import { NodeAsset } from "../../src/nodeAsset";

// The import/export blocks register the real Draco encoder/decoder, so use the actual draco3dgltf
// module rather than the stub the global vitest setup installs for @dev/core.
vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

/** The options that distinguish one synthetic part from another. */
interface IPartOptions {
    /** The material base color, so each source's material is distinguishable after a merge. */
    readonly color?: [number, number, number, number];
    /** The node's initial translation. */
    readonly translation?: [number, number, number];
}

/**
 * Builds a tiny single-part glb (one node → one mesh → one material, under a default scene) so a
 * composition test has an addressable `/nodes/0` and `/materials/0` per source. Every resource is
 * prefixed with `tag` so parts from different sources stay distinguishable after a merge.
 * @param tag - A unique prefix applied to every named resource (e.g. its node becomes `${tag}Node`).
 * @param options - Optional material color and initial node translation.
 * @returns The glb bytes.
 */
async function CreatePartGlbAsync(tag: string, options: IPartOptions = {}): Promise<Uint8Array> {
    const { Document, WebIO } = await import("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");

    const document = new Document();
    const buffer = document.createBuffer();
    const position = document
        .createAccessor(`${tag}Pos`)
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
        .setBuffer(buffer);
    const material = document
        .createMaterial(`${tag}Material`)
        .setEmissiveFactor([0, 0, 0])
        .setBaseColorFactor(options.color ?? [1, 1, 1, 1]);
    const primitive = document.createPrimitive().setAttribute("POSITION", position).setMaterial(material);
    const mesh = document.createMesh(`${tag}Mesh`).addPrimitive(primitive);
    const node = document
        .createNode(`${tag}Node`)
        .setMesh(mesh)
        .setTranslation(options.translation ?? [0, 0, 0]);
    const scene = document.createScene(`${tag}Scene`).addChild(node);
    // Real imported glbs declare a default scene ("scene": 0); mirror that so merges are exercised
    // against sources that carry a default-scene pointer.
    document.getRoot().setDefaultScene(scene);

    const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
    return await io.writeBinary(document);
}

/**
 * Re-parses exported glb bytes into a `Document` so every assertion reads the exported result rather
 * than any block's internal state.
 * @param glb - The glb bytes.
 * @returns The parsed document.
 */
async function ReparseAsync(glb: Uint8Array): Promise<Document> {
    const { WebIO } = await import("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
    const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
    return await io.readBinary(glb);
}

/**
 * Runs ImportGLTF → SetProperty(Selector pointer, JsonLiteral value) → ExportGLTF over a single part
 * and re-parses the result, so a placement write is asserted purely through export + reparse. The
 * pointer is authored by a Selector and the value by a JsonLiteral, matching slice-05's placement
 * story (no bespoke transform block).
 * @param glb - The source part glb.
 * @param pointer - The glTF Object Model JSON Pointer to write (e.g. `/nodes/0/translation`).
 * @param value - The JSON value to write at the pointer.
 * @returns The re-parsed output document.
 */
async function RunPlacementGraphAsync(glb: Uint8Array, pointer: string, value: unknown): Promise<Document> {
    const asset = new NodeAsset("placement");
    const importer = new ImportGLTFBlock("import", asset);
    importer.data = glb;
    const placementPointer = new Selector("pointer", asset);
    placementPointer.pointer = pointer;
    const placementValue = new JsonLiteral("value", asset);
    placementValue.value = value;
    const place = new SetProperty("place", asset);
    const exporter = new ExportGLTFBlock("export", asset);

    importer.output.connectTo(place.scene);
    placementPointer.output.connectTo(place.pointer);
    placementValue.output.connectTo(place.value);
    place.output.connectTo(exporter.input);

    return await ReparseAsync(await asset.buildAsync());
}

/** One branch of a diamond: the pointer it writes and the value it writes there. */
interface IBranchEdit {
    /** The glTF Object Model JSON Pointer this branch writes. */
    readonly pointer: string;
    /** The JSON value this branch writes at its pointer. */
    readonly value: unknown;
}

/**
 * Runs the diamond regression: a single ImportGLTF fanned out to two independent SetProperty branches
 * that reconverge at a MergeScenes and export. Each branch authors its pointer with a Selector and its
 * value with a JsonLiteral. Because the shared import fans out to two consumers, copy-on-fan-out gives
 * each branch its own SCENE clone, so the two branches cannot stomp each other in place.
 * @param glb - The single source glb that fans out to both branches.
 * @param branchA - The first branch's pointer/value edit.
 * @param branchB - The second branch's pointer/value edit.
 * @returns The re-parsed merged output document.
 */
async function RunDiamondAsync(glb: Uint8Array, branchA: IBranchEdit, branchB: IBranchEdit): Promise<Document> {
    const asset = new NodeAsset("diamond");
    const importer = new ImportGLTFBlock("import", asset);
    importer.data = glb;

    const aPointer = new Selector("aPointer", asset);
    aPointer.pointer = branchA.pointer;
    const aValue = new JsonLiteral("aValue", asset);
    aValue.value = branchA.value;
    const aSet = new SetProperty("aSet", asset);

    const bPointer = new Selector("bPointer", asset);
    bPointer.pointer = branchB.pointer;
    const bValue = new JsonLiteral("bValue", asset);
    bValue.value = branchB.value;
    const bSet = new SetProperty("bSet", asset);

    const merge = new MergeScenes("merge", asset);
    const exporter = new ExportGLTFBlock("export", asset);

    // Fan the one import out to both branches; each SetProperty output feeds one merge input.
    importer.output.connectTo(aSet.scene);
    importer.output.connectTo(bSet.scene);
    aPointer.output.connectTo(aSet.pointer);
    aValue.output.connectTo(aSet.value);
    bPointer.output.connectTo(bSet.pointer);
    bValue.output.connectTo(bSet.value);
    aSet.output.connectTo(merge.inputs[0]);
    bSet.output.connectTo(merge.inputs[1]);
    merge.output.connectTo(exporter.input);

    return await ReparseAsync(await asset.buildAsync());
}

describe("scene composition — placement (US4)", () => {
    it("places a node by writing its translation via SetProperty", async () => {
        const reparsed = await RunPlacementGraphAsync(await CreatePartGlbAsync("p"), "/nodes/0/translation", [5, 6, 7]);
        expect(reparsed.getRoot().listNodes()[0].getTranslation()).toEqual([5, 6, 7]);
    }, 30000);

    it("rotates a node by writing its rotation via SetProperty", async () => {
        // A 180° rotation about X; every component is exactly representable in Float32 so reparse is exact.
        const reparsed = await RunPlacementGraphAsync(await CreatePartGlbAsync("p"), "/nodes/0/rotation", [1, 0, 0, 0]);
        expect(reparsed.getRoot().listNodes()[0].getRotation()).toEqual([1, 0, 0, 0]);
    }, 30000);

    it("scales a node by writing its scale via SetProperty", async () => {
        const reparsed = await RunPlacementGraphAsync(await CreatePartGlbAsync("p"), "/nodes/0/scale", [2, 3, 4]);
        expect(reparsed.getRoot().listNodes()[0].getScale()).toEqual([2, 3, 4]);
    }, 30000);

    it("positions one merged part and leaves the other at the origin", async () => {
        // Two parts merge in port order, so the room's node is /nodes/0 and the chair's is /nodes/1.
        const roomGlb = await CreatePartGlbAsync("room");
        const chairGlb = await CreatePartGlbAsync("chair");

        const asset = new NodeAsset("compose-and-place");
        const importRoom = new ImportGLTFBlock("importRoom", asset);
        importRoom.data = roomGlb;
        const importChair = new ImportGLTFBlock("importChair", asset);
        importChair.data = chairGlb;
        const merge = new MergeScenes("merge", asset);
        const pointer = new Selector("pointer", asset);
        pointer.pointer = "/nodes/1/translation";
        const value = new JsonLiteral("value", asset);
        value.value = [2, 0, 0];
        const place = new SetProperty("place", asset);
        const exporter = new ExportGLTFBlock("export", asset);

        importRoom.output.connectTo(merge.inputs[0]);
        importChair.output.connectTo(merge.inputs[1]);
        merge.output.connectTo(place.scene);
        pointer.output.connectTo(place.pointer);
        value.output.connectTo(place.value);
        place.output.connectTo(exporter.input);

        const merged = await ReparseAsync(await asset.buildAsync());
        const nodes = merged.getRoot().listNodes();

        // The merge preserves both parts, in port order, so /nodes/1 is the chair the pointer moved.
        expect(nodes).toHaveLength(2);
        expect(nodes[0].getName()).toBe("roomNode");
        expect(nodes[1].getName()).toBe("chairNode");
        // The addressed part moved; the other part is untouched at the origin.
        expect(nodes[1].getTranslation()).toEqual([2, 0, 0]);
        expect(nodes[0].getTranslation()).toEqual([0, 0, 0]);
    }, 30000);
});

describe("scene composition — diamond non-interference (key regression)", () => {
    it("keeps a material edit and a node edit from different branches after merge (mixed edits)", async () => {
        // Branch A reddens the material; branch B moves the node. Both must survive the merge.
        const merged = await RunDiamondAsync(
            await CreatePartGlbAsync("part"),
            { pointer: "/materials/0/emissiveFactor", value: [1, 0, 0] },
            { pointer: "/nodes/0/translation", value: [5, 0, 0] }
        );

        // The merge yields two copies of each part; each carries exactly one branch's edit.
        const emissives = merged
            .getRoot()
            .listMaterials()
            .map((material) => material.getEmissiveFactor());
        const translations = merged
            .getRoot()
            .listNodes()
            .map((node) => node.getTranslation());

        expect(merged.getRoot().listMaterials()).toHaveLength(2);
        expect(merged.getRoot().listNodes()).toHaveLength(2);
        // Branch A's red material is present...
        expect(emissives).toContainEqual([1, 0, 0]);
        // ...and branch B's moved node is present.
        expect(translations).toContainEqual([5, 0, 0]);
    }, 30000);

    it("keeps BOTH values when two branches write the SAME pointer (same-pointer conflict)", async () => {
        // Both branches write /nodes/0/translation to DIFFERENT values. Copy-on-fan-out gives each
        // branch its own clone, and the merge preserves each source, so BOTH values survive on two
        // merged node copies. With in-place mutation (no copy-on-fan-out) the branches share one
        // Document, the second write clobbers the first, only [0,5,0] survives on both copies, and the
        // [5,0,0] assertion below fails — this is the regression net proving copy-on-fan-out is load-bearing.
        const merged = await RunDiamondAsync(
            await CreatePartGlbAsync("part"),
            { pointer: "/nodes/0/translation", value: [5, 0, 0] },
            { pointer: "/nodes/0/translation", value: [0, 5, 0] }
        );

        const nodes = merged.getRoot().listNodes();
        const translations = nodes.map((node) => node.getTranslation());

        expect(nodes).toHaveLength(2);
        // Both independent edits survive as two merged copies — neither branch stomped the other.
        expect(translations).toContainEqual([5, 0, 0]);
        expect(translations).toContainEqual([0, 5, 0]);
    }, 30000);
});
