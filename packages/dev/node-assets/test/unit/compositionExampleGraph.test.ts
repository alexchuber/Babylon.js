import { type Document } from "@gltf-transform/core";
import { describe, expect, it, vi } from "vitest";

import { ImportGLTFBlock } from "../../src/Blocks/importGLTFBlock";
import { CompositionExamplePlacementPointer, CompositionExamplePlacementTranslation, CreateCompositionExampleGraph } from "../../src/examples/compositionExampleGraph";
import { NodeAsset } from "../../src/nodeAsset";

// The import/export blocks register the real Draco encoder/decoder, so use the actual draco3dgltf
// module rather than the stub the global vitest setup installs for @dev/core.
vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

/**
 * Builds a tiny single-node glb tagged so its node is distinguishable after a merge.
 * @param tag - A unique prefix applied to the node/mesh/scene (its node becomes `${tag}Node`).
 * @returns The glb bytes.
 */
async function CreatePartGlbAsync(tag: string): Promise<Uint8Array> {
    const { Document, WebIO } = await import("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");

    const document = new Document();
    const buffer = document.createBuffer();
    const position = document
        .createAccessor(`${tag}Pos`)
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
        .setBuffer(buffer);
    const primitive = document.createPrimitive().setAttribute("POSITION", position);
    const mesh = document.createMesh(`${tag}Mesh`).addPrimitive(primitive);
    const scene = document.createScene(`${tag}Scene`).addChild(document.createNode(`${tag}Node`).setMesh(mesh));
    document.getRoot().setDefaultScene(scene);

    const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
    return await io.writeBinary(document);
}

/**
 * Re-parses exported glb bytes into a `Document` for assertions.
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
 * Asserts the exported bytes hold the expected merged + placed result: both parts are present and
 * only the second (addressed) part is repositioned.
 * @param glb - The exported glb bytes to inspect.
 */
async function ExpectMergedAndPlacedAsync(glb: Uint8Array): Promise<void> {
    const merged = await ReparseAsync(glb);
    const nodes = merged.getRoot().listNodes();

    // Both parts merged, in port order, so the placement pointer's /nodes/1 is the second part.
    expect(nodes).toHaveLength(2);
    expect(nodes[0].getName()).toBe("part0Node");
    expect(nodes[1].getName()).toBe("part1Node");
    expect(nodes[1].getTranslation()).toEqual(CompositionExamplePlacementTranslation);
    expect(nodes[0].getTranslation()).toEqual([0, 0, 0]);
}

describe("composition example graph (premade)", () => {
    it("exposes the placement it demonstrates", () => {
        expect(CompositionExamplePlacementPointer).toBe("/nodes/1/translation");
        expect(CompositionExamplePlacementTranslation).toEqual([2, 0, 0]);
    });

    it("builds headlessly to the expected merged + placed result", async () => {
        const asset = CreateCompositionExampleGraph(await CreatePartGlbAsync("part0"), await CreatePartGlbAsync("part1"));
        const glb = await asset.buildAsync();
        expect(glb.length).toBeGreaterThan(0);
        await ExpectMergedAndPlacedAsync(glb);
    }, 30000);

    it("round-trips through save/load and rebuilds identically", async () => {
        const asset = CreateCompositionExampleGraph(await CreatePartGlbAsync("part0"), await CreatePartGlbAsync("part1"));

        const parsed = NodeAsset.Parse(JSON.parse(JSON.stringify(asset.serialize())));

        // The two imports' bytes survive the base64 round-trip, so the reloaded graph is self-contained.
        const parsedImports = parsed.attachedBlocks.filter((block): block is ImportGLTFBlock => block instanceof ImportGLTFBlock);
        expect(parsedImports).toHaveLength(2);
        expect(parsedImports.every((importer) => importer.data !== null)).toBe(true);

        // The reloaded graph produces the same merged + placed result.
        const glb = await parsed.buildAsync();
        expect(glb.length).toBeGreaterThan(0);
        await ExpectMergedAndPlacedAsync(glb);
    }, 30000);
});
