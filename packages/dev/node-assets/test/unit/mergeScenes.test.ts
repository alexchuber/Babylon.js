import { type Document } from "@gltf-transform/core";
import { describe, expect, it, vi } from "vitest";

import { CenterBlock } from "../../src/Blocks/centerBlock";
import { ExportGLTFBlock } from "../../src/Blocks/exportGLTFBlock";
import { ImportGLTFBlock } from "../../src/Blocks/importGLTFBlock";
import { MergeScenes } from "../../src/Blocks/mergeScenes";
import { NodeAsset } from "../../src/nodeAsset";
import { GetTestGltfDocument } from "./testGltfAsset";

// The global vitest setup stubs draco3dgltf (it is optional for @dev/core). The import/export blocks
// depend on it for real, so use the actual encoder/decoder here.
vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

/**
 * Builds a minimal glb with a single, distinctly named scene/node/mesh/material so a merged result can
 * be checked for the union of every source's parts.
 * @param tag - A unique prefix applied to every named resource, so parts from different sources are distinguishable.
 * @param color - The material base color, making each source's material distinct.
 * @returns The glb bytes.
 */
async function CreateGlbAsync(tag: string, color: [number, number, number, number]): Promise<Uint8Array> {
    const { Document, WebIO } = await import("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");

    const document = new Document();
    const buffer = document.createBuffer();
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const position = document.createAccessor(`${tag}Pos`).setType("VEC3").setArray(positions).setBuffer(buffer);
    const material = document.createMaterial(`${tag}Material`).setBaseColorFactor(color);
    const primitive = document.createPrimitive().setAttribute("POSITION", position).setMaterial(material);
    const mesh = document.createMesh(`${tag}Mesh`).addPrimitive(primitive);
    const scene = document.createScene(`${tag}Scene`).addChild(document.createNode(`${tag}Node`).setMesh(mesh));
    // Real imported glbs declare a default scene ("scene": 0); mirror that so the merge is exercised
    // against sources that carry a default-scene pointer.
    document.getRoot().setDefaultScene(scene);

    const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
    return await io.writeBinary(document);
}

/**
 * Builds a glb whose single scene root has a child node (a two-level hierarchy) so the merge can be
 * checked for preserving each source's node hierarchy.
 * @param tag - A unique prefix applied to every named resource.
 * @returns The glb bytes.
 */
async function CreateHierarchyGlbAsync(tag: string): Promise<Uint8Array> {
    const { Document, WebIO } = await import("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");

    const document = new Document();
    const buffer = document.createBuffer();
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const position = document.createAccessor(`${tag}Pos`).setType("VEC3").setArray(positions).setBuffer(buffer);
    const primitive = document.createPrimitive().setAttribute("POSITION", position);
    const mesh = document.createMesh(`${tag}Mesh`).addPrimitive(primitive);
    const child = document.createNode(`${tag}Child`).setMesh(mesh).setTranslation([1, 2, 3]);
    const parent = document.createNode(`${tag}Parent`).addChild(child);
    const scene = document.createScene(`${tag}Scene`).addChild(parent);
    document.getRoot().setDefaultScene(scene);

    const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
    return await io.writeBinary(document);
}

/**
 * Re-imports glb bytes into a `Document` so the merged result can be inspected.
 * @param glb - The glb bytes to re-import.
 * @returns The imported `Document`.
 */
async function ReimportAsync(glb: Uint8Array): Promise<Document> {
    const importer = new ImportGLTFBlock("reimport", new NodeAsset("reimport"));
    importer.data = glb;
    await importer._buildBlockAsync();
    return GetTestGltfDocument(importer.output.value);
}

/**
 * Wires an import block for each glb into a MergeScenes block, whose output feeds an export block, then
 * builds the asset and re-imports the exported result.
 * @param glbs - The source glbs, one per merge input.
 * @returns The re-imported merged `Document`, the asset, import blocks, and source documents captured before cleanup.
 */
async function MergeGlbsAsync(glbs: Uint8Array[]): Promise<{ merged: Document; asset: NodeAsset; imports: ImportGLTFBlock[]; sources: Document[] }> {
    const asset = new NodeAsset("merge");
    const merge = new MergeScenes("merge", asset);
    while (merge.inputs.length < glbs.length) {
        merge.addInput();
    }

    const imports = glbs.map((glb, index) => {
        const importer = new ImportGLTFBlock(`import${index}`, asset);
        importer.data = glb;
        importer.output.connectTo(merge.inputs[index]);
        return importer;
    });

    const exporter = new ExportGLTFBlock("export", asset);
    merge.output.connectTo(exporter.input);
    let sources: Document[] = [];
    const buildExportAsync = exporter._buildBlockAsync;
    vi.spyOn(exporter, "_buildBlockAsync").mockImplementation(async () => {
        sources = imports.map((importer) => GetTestGltfDocument(importer.output.value));
        await buildExportAsync.call(exporter);
    });

    const glb = await asset.buildAsync();
    const merged = await ReimportAsync(glb);
    return { merged, asset, imports, sources };
}

describe("MergeScenes", () => {
    it("starts with two GLTF_DOCUMENT inputs and one GLTF_DOCUMENT output", () => {
        const merge = new MergeScenes("merge", new NodeAsset("asset"));
        expect(merge.inputs).toHaveLength(2);
        expect(merge.inputs.map((input) => input.name)).toEqual(["input0", "input1"]);
        expect(merge.outputs).toHaveLength(1);
        expect(merge.output.name).toBe("output");
    });

    it("merges two imports into the union of their nodes, meshes and materials", async () => {
        const glbA = await CreateGlbAsync("a", [1, 0, 0, 1]);
        const glbB = await CreateGlbAsync("b", [0, 1, 0, 1]);

        const { merged } = await MergeGlbsAsync([glbA, glbB]);
        const root = merged.getRoot();

        expect(root.listNodes()).toHaveLength(2);
        expect(root.listMeshes()).toHaveLength(2);
        expect(root.listMaterials()).toHaveLength(2);
        expect(
            root
                .listMeshes()
                .map((mesh) => mesh.getName())
                .sort()
        ).toEqual(["aMesh", "bMesh"]);
        expect(
            root
                .listNodes()
                .map((node) => node.getName())
                .sort()
        ).toEqual(["aNode", "bNode"]);
        expect(
            root
                .listMaterials()
                .map((material) => material.getName())
                .sort()
        ).toEqual(["aMaterial", "bMaterial"]);

        // The parts collapse into a single default scene so every source is visible on export.
        expect(root.listScenes()).toHaveLength(1);
        expect(root.listScenes()[0].listChildren()).toHaveLength(2);
        // The combined scene must be marked the default, or the exported glb has no `scene` pointer.
        expect(root.getDefaultScene()).not.toBeNull();
        expect(root.getDefaultScene()).toBe(root.listScenes()[0]);
    }, 30000);

    it("merges three inputs and round-trips the input count and wiring through save/load", async () => {
        const glbA = await CreateGlbAsync("a", [1, 0, 0, 1]);
        const glbB = await CreateGlbAsync("b", [0, 1, 0, 1]);
        const glbC = await CreateGlbAsync("c", [0, 0, 1, 1]);

        const { merged, asset } = await MergeGlbsAsync([glbA, glbB, glbC]);
        expect(merged.getRoot().listNodes()).toHaveLength(3);
        expect(merged.getRoot().listMeshes()).toHaveLength(3);
        expect(merged.getRoot().listMaterials()).toHaveLength(3);

        // A saved three-input merge must reload with three inputs, all still wired, and rebuild identically.
        const parsed = NodeAsset.Parse(asset.serialize());
        const parsedMerge = parsed.attachedBlocks.find((block): block is MergeScenes => block instanceof MergeScenes);
        expect(parsedMerge).toBeDefined();
        expect(parsedMerge!.inputs).toHaveLength(3);
        expect(parsedMerge!.inputs.every((input) => input.isConnected)).toBe(true);

        const reloaded = await ReimportAsync(await parsed.buildAsync());
        expect(reloaded.getRoot().listNodes()).toHaveLength(3);
        expect(reloaded.getRoot().listMeshes()).toHaveLength(3);
        expect(reloaded.getRoot().listMaterials()).toHaveLength(3);
    }, 40000);

    it("merges any GLTF_DOCUMENT source regardless of how it was produced", async () => {
        const glbA = await CreateGlbAsync("a", [1, 0, 0, 1]);
        const glbB = await CreateGlbAsync("b", [0, 1, 0, 1]);

        // input0 is produced by an operator block, input1 comes straight from an import.
        const asset = new NodeAsset("merge");
        const importA = new ImportGLTFBlock("importA", asset);
        importA.data = glbA;
        const center = new CenterBlock("center", asset);
        importA.output.connectTo(center.input);

        const importB = new ImportGLTFBlock("importB", asset);
        importB.data = glbB;

        const merge = new MergeScenes("merge", asset);
        center.output.connectTo(merge.inputs[0]);
        importB.output.connectTo(merge.inputs[1]);

        const exporter = new ExportGLTFBlock("export", asset);
        merge.output.connectTo(exporter.input);

        const merged = await ReimportAsync(await asset.buildAsync());
        expect(merged.getRoot().listNodes()).toHaveLength(2);
        expect(merged.getRoot().listMeshes()).toHaveLength(2);
    }, 30000);

    it("does not mutate its source documents", async () => {
        const glbA = await CreateGlbAsync("a", [1, 0, 0, 1]);
        const glbB = await CreateGlbAsync("b", [0, 1, 0, 1]);

        const { sources } = await MergeGlbsAsync([glbA, glbB]);

        // mergeDocuments copies each source into the target, so each source is left exactly as imported.
        for (const source of sources) {
            expect(source.getRoot().listNodes()).toHaveLength(1);
            expect(source.getRoot().listMeshes()).toHaveLength(1);
            expect(source.getRoot().listMaterials()).toHaveLength(1);
            expect(source.getRoot().listScenes()).toHaveLength(1);
        }
    }, 30000);

    it("preserves each source's node hierarchy under the combined scene so per-source pointers resolve", async () => {
        const hierarchyGlb = await CreateHierarchyGlbAsync("h");
        const flatGlb = await CreateGlbAsync("f", [0, 1, 0, 1]);

        const { merged } = await MergeGlbsAsync([hierarchyGlb, flatGlb]);
        const root = merged.getRoot();

        // Two roots (one per source) under the single combined scene; three nodes total (parent+child+flat).
        expect(root.listScenes()).toHaveLength(1);
        expect(root.listScenes()[0].listChildren()).toHaveLength(2);
        expect(root.listNodes()).toHaveLength(3);

        const parent = root.listNodes().find((node) => node.getName() === "hParent");
        expect(parent).toBeDefined();
        expect(parent!.listChildren()).toHaveLength(1);
        expect(parent!.listChildren()[0].getName()).toBe("hChild");
        expect(parent!.listChildren()[0].getTranslation()).toEqual([1, 2, 3]);
    }, 30000);

    it("tolerates being wired with a single source", async () => {
        const glbA = await CreateGlbAsync("a", [1, 0, 0, 1]);

        // A merge with one input still produces a valid single-part scene.
        const asset = new NodeAsset("merge");
        const merge = new MergeScenes("merge", asset);
        const importA = new ImportGLTFBlock("importA", asset);
        importA.data = glbA;
        importA.output.connectTo(merge.inputs[0]);

        // Connect the second default input too, since the evaluator requires every input wired.
        const importA2 = new ImportGLTFBlock("importA2", asset);
        importA2.data = glbA;
        importA2.output.connectTo(merge.inputs[1]);

        const exporter = new ExportGLTFBlock("export", asset);
        merge.output.connectTo(exporter.input);

        const merged = await ReimportAsync(await asset.buildAsync());
        expect(merged.getRoot().listNodes()).toHaveLength(2);
    }, 30000);
});
