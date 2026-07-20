import { type Document } from "@gltf-transform/core";
import { describe, expect, it, vi } from "vitest";

import { DracoCompressionBlock } from "../../src/Blocks/dracoCompressionBlock";
import { ExportGLTFBlock } from "../../src/Blocks/exportGLTFBlock";
import { ImportGLTFBlock } from "../../src/Blocks/importGLTFBlock";
import { NodeAsset } from "../../src/nodeAsset";
import { CreateTestGltfAsset, GetTestGltfDocument } from "./testGltfAsset";

// The global vitest setup stubs draco3dgltf (it is optional for @dev/core). Node assets depends on it
// for real, so use the actual encoder/decoder here.
vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

const DracoExtensionName = "KHR_draco_mesh_compression";

type GridFixture = {
    glb: Uint8Array;
    vertexCount: number;
    indexCount: number;
};

/**
 * Builds an indexed grid mesh glb in code, large and smooth enough that Draco genuinely shrinks it.
 * A trivial (or non-indexed) mesh would not be Draco-compressed, so this fixture is deliberately
 * non-trivial and fully indexed.
 * @param segments - The number of quads per side; the grid has (segments + 1)^2 vertices.
 * @returns The fixture glb bytes plus its vertex and index counts.
 */
async function CreateIndexedGridGlbAsync(segments = 40): Promise<GridFixture> {
    const { Document, WebIO } = await import("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");

    const side = segments + 1;
    const vertexCount = side * side;
    const positions = new Float32Array(vertexCount * 3);
    for (let i = 0; i < side; i++) {
        for (let j = 0; j < side; j++) {
            const index = (i * side + j) * 3;
            positions[index] = i / segments - 0.5;
            positions[index + 1] = j / segments - 0.5;
            // A smooth height field keeps neighboring vertices correlated, which Draco compresses well.
            positions[index + 2] = 0.1 * Math.sin(i * 0.5) * Math.cos(j * 0.5);
        }
    }

    const indices = new Uint32Array(segments * segments * 6);
    let cursor = 0;
    for (let i = 0; i < segments; i++) {
        for (let j = 0; j < segments; j++) {
            const a = i * side + j;
            const b = a + 1;
            const c = a + side + 1;
            const d = a + side;
            indices[cursor++] = a;
            indices[cursor++] = b;
            indices[cursor++] = c;
            indices[cursor++] = a;
            indices[cursor++] = c;
            indices[cursor++] = d;
        }
    }

    const document = new Document();
    const buffer = document.createBuffer();
    const position = document.createAccessor().setType("VEC3").setArray(positions).setBuffer(buffer);
    const index = document.createAccessor().setType("SCALAR").setArray(indices).setBuffer(buffer);
    const primitive = document.createPrimitive().setAttribute("POSITION", position).setIndices(index);
    const mesh = document.createMesh("grid").addPrimitive(primitive);
    const node = document.createNode("gridNode").setMesh(mesh);
    document.createScene("scene0").addChild(node);

    const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
    const glb = await io.writeBinary(document);
    return { glb, vertexCount, indexCount: indices.length };
}

/**
 * Parses a glb's JSON chunk, exposing the extension declarations without decoding geometry.
 * @param glb - The glb bytes.
 * @returns The parsed `extensionsUsed` / `extensionsRequired` declarations.
 */
function ReadGlbExtensions(glb: Uint8Array): { extensionsUsed?: string[]; extensionsRequired?: string[] } {
    const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
    const jsonChunkLength = view.getUint32(12, true);
    const jsonBytes = new Uint8Array(glb.buffer, glb.byteOffset + 20, jsonChunkLength);
    return JSON.parse(new TextDecoder().decode(jsonBytes));
}

/**
 * Re-imports glb bytes through the (decoder-capable) {@link ImportGLTFBlock} so Draco-compressed
 * geometry reads back.
 * @param glb - The glb bytes to re-import.
 * @returns The imported gltf-transform `Document`.
 */
async function ReimportAsync(glb: Uint8Array): Promise<Document> {
    const importer = new ImportGLTFBlock("reimport", new NodeAsset("reimport"));
    importer.data = glb;
    await importer._buildBlockAsync();
    return GetTestGltfDocument(importer.output.value);
}

/**
 * Reads the POSITION and index counts of a single-primitive document.
 * @param document - The document to inspect.
 * @returns The vertex and index counts.
 */
function GetGeometryCounts(document: Document): { vertexCount: number; indexCount: number } {
    const primitive = document.getRoot().listMeshes()[0].listPrimitives()[0];
    return {
        vertexCount: primitive.getAttribute("POSITION")?.getCount() ?? 0,
        indexCount: primitive.getIndices()?.getCount() ?? 0,
    };
}

describe("DracoCompressionBlock", () => {
    it("registers a GLTF_DOCUMENT input and output on construction", () => {
        const asset = new NodeAsset("draco");
        const block = new DracoCompressionBlock("draco", asset);

        expect(asset.attachedBlocks).toContain(block);
        expect(block.inputs).toHaveLength(1);
        expect(block.outputs).toHaveLength(1);
        expect(block.input).toBe(block.inputs[0]);
        expect(block.output).toBe(block.outputs[0]);
    });

    it("produces a Draco-compressed glb that re-imports to equivalent geometry", async () => {
        const fixture = await CreateIndexedGridGlbAsync();

        const asset = new NodeAsset("draco-roundtrip");
        const importer = new ImportGLTFBlock("import", asset);
        importer.data = fixture.glb;
        const draco = new DracoCompressionBlock("draco", asset);
        const exporter = new ExportGLTFBlock("export", asset);
        importer.output.connectTo(draco.input);
        draco.output.connectTo(exporter.input);

        const compressedGlb = await asset.buildAsync();

        expect(compressedGlb).toBeInstanceOf(Uint8Array);
        expect(compressedGlb.length).toBeGreaterThan(0);

        // The exported glb must actually declare Draco compression.
        const extensions = ReadGlbExtensions(compressedGlb);
        expect(extensions.extensionsUsed).toContain(DracoExtensionName);
        expect(extensions.extensionsRequired).toContain(DracoExtensionName);

        // Re-importing (with the decoder) must recover the same mesh and vertex/index counts.
        const reimported = await ReimportAsync(compressedGlb);
        expect(reimported.getRoot().listNodes()).toHaveLength(1);
        expect(reimported.getRoot().listMeshes()).toHaveLength(1);

        const counts = GetGeometryCounts(reimported);
        expect(counts.vertexCount).toBe(fixture.vertexCount);
        expect(counts.indexCount).toBe(fixture.indexCount);
    }, 20000);

    it("produces a smaller glb than the plain roundtrip for a non-trivial mesh", async () => {
        const fixture = await CreateIndexedGridGlbAsync();

        const plainAsset = new NodeAsset("plain");
        const plainImporter = new ImportGLTFBlock("import", plainAsset);
        plainImporter.data = fixture.glb;
        const plainExporter = new ExportGLTFBlock("export", plainAsset);
        plainImporter.output.connectTo(plainExporter.input);
        const plainGlb = await plainAsset.buildAsync();

        const dracoAsset = new NodeAsset("draco");
        const dracoImporter = new ImportGLTFBlock("import", dracoAsset);
        dracoImporter.data = fixture.glb;
        const draco = new DracoCompressionBlock("draco", dracoAsset);
        const dracoExporter = new ExportGLTFBlock("export", dracoAsset);
        dracoImporter.output.connectTo(draco.input);
        draco.output.connectTo(dracoExporter.input);
        const dracoGlb = await dracoAsset.buildAsync();

        expect(dracoGlb.length).toBeLessThan(plainGlb.length);
    }, 20000);

    it("tags the input document for Draco and passes the same document through", async () => {
        const { Document } = await import("@gltf-transform/core");
        const document = new Document();

        const asset = new NodeAsset("tag");
        const block = new DracoCompressionBlock("draco", asset);
        const gltf = CreateTestGltfAsset(document);
        block.input.value = gltf;

        await block._buildBlockAsync();

        expect(block.output.value).toBe(gltf);
        const used = document
            .getRoot()
            .listExtensionsUsed()
            .map((extension) => extension.extensionName);
        expect(used).toContain(DracoExtensionName);
    });

    it("throws when the input document is missing", async () => {
        const asset = new NodeAsset("missing-input");
        const block = new DracoCompressionBlock("draco", asset);

        expect(block.input.value).toBeNull();
        await expect(block._buildBlockAsync()).rejects.toThrow();
    });

    it("rejects scene quantization when the document does not contain exactly one scene", async () => {
        const { Document } = await import("@gltf-transform/core");
        const document = new Document();
        document.createScene("one");
        document.createScene("two");
        const block = new DracoCompressionBlock("draco", new NodeAsset("scene-bounds"));
        block.quantizationVolume = "scene";
        block.input.value = CreateTestGltfAsset(document);

        await expect(block._buildBlockAsync()).rejects.toThrow(/exactly one scene.*choose Mesh or Custom bounds/i);
    });

    it("rejects a non-indexed primitive before enabling Draco compression, instead of silently exporting it uncompressed", async () => {
        // gltf-transform's own KHRDracoMeshCompression writer only `logger.warn`s and skips
        // non-indexed / non-TRIANGLES primitives (and omits the extension entirely if nothing
        // compressed), so without this block validating up front, the build would "succeed" while
        // silently doing nothing.
        const { Document } = await import("@gltf-transform/core");
        const document = new Document();
        const buffer = document.createBuffer();
        const position = document
            .createAccessor()
            .setType("VEC3")
            .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
            .setBuffer(buffer);
        const primitive = document.createPrimitive().setAttribute("POSITION", position); // No indices set.
        const mesh = document.createMesh("points").addPrimitive(primitive);
        const node = document.createNode("node0").setMesh(mesh);
        document.createScene("scene0").addChild(node);

        const block = new DracoCompressionBlock("draco", new NodeAsset("non-indexed"));
        block.input.value = CreateTestGltfAsset(document);

        await expect(block._buildBlockAsync()).rejects.toThrow(/indexed.*TRIANGLES/i);
        expect(block.output.value).toBeNull();
    });

    it("rejects a non-TRIANGLES primitive before enabling Draco compression", async () => {
        const { Document, Primitive } = await import("@gltf-transform/core");
        const document = new Document();
        const buffer = document.createBuffer();
        const position = document
            .createAccessor()
            .setType("VEC3")
            .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
            .setBuffer(buffer);
        const index = document
            .createAccessor()
            .setType("SCALAR")
            .setArray(new Uint16Array([0, 1, 2]))
            .setBuffer(buffer);
        const primitive = document.createPrimitive().setAttribute("POSITION", position).setIndices(index).setMode(Primitive.Mode.LINE_STRIP);
        const mesh = document.createMesh("lines").addPrimitive(primitive);
        const node = document.createNode("node0").setMesh(mesh);
        document.createScene("scene0").addChild(node);

        const block = new DracoCompressionBlock("draco", new NodeAsset("non-triangles"));
        block.input.value = CreateTestGltfAsset(document);

        await expect(block._buildBlockAsync()).rejects.toThrow(/indexed.*TRIANGLES/i);
        expect(block.output.value).toBeNull();
    });
});
