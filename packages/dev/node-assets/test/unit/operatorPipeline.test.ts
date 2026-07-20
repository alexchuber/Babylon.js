import { type Document } from "@gltf-transform/core";
import { describe, expect, it, vi } from "vitest";

import { CenterBlock } from "../../src/Blocks/centerBlock";
import { DedupBlock } from "../../src/Blocks/dedupBlock";
import { ExportGLTFBlock } from "../../src/Blocks/exportGLTFBlock";
import { FlattenBlock } from "../../src/Blocks/flattenBlock";
import { ImportGLTFBlock } from "../../src/Blocks/importGLTFBlock";
import { JoinBlock } from "../../src/Blocks/joinBlock";
import { type NodeAssetConnectionPoint } from "../../src/connection/nodeAssetConnectionPoint";
import { NormalsBlock } from "../../src/Blocks/normalsBlock";
import { PruneBlock } from "../../src/Blocks/pruneBlock";
import { WeldBlock } from "../../src/Blocks/weldBlock";
import { NodeAsset } from "../../src/nodeAsset";
import { GetTestGltfDocument } from "./testGltfAsset";

/** A GLTF_DOCUMENT operator block, viewed only through its input and output ports. */
type OperatorBlock = { input: NodeAssetConnectionPoint; output: NodeAssetConnectionPoint };

// The global vitest setup stubs draco3dgltf (it is optional for @dev/core). The import/export blocks
// depend on it for real, so use the actual encoder/decoder here.
vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

/**
 * Builds a small indexed grid glb to feed through operator pipelines.
 * @param segments - The number of quads per side; the grid has (segments + 1)^2 vertices.
 * @returns The glb bytes plus its vertex and index counts.
 */
async function CreateGridGlbAsync(segments = 6): Promise<{ glb: Uint8Array; vertexCount: number; indexCount: number }> {
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
    document.createScene("scene0").addChild(document.createNode("gridNode").setMesh(mesh));

    const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
    const glb = await io.writeBinary(document);
    return { glb, vertexCount, indexCount: indices.length };
}

/**
 * Re-imports glb bytes through the import block so the resulting geometry can be inspected.
 * @param glb - The glb bytes to re-import.
 * @returns The imported gltf-transform `Document`.
 */
async function ReimportAsync(glb: Uint8Array): Promise<Document> {
    const importer = new ImportGLTFBlock("reimport", new NodeAsset("reimport"));
    importer.data = glb;
    await importer._buildBlockAsync();
    return GetTestGltfDocument(importer.output.value);
}

function GetGeometryCounts(document: Document): { vertexCount: number; indexCount: number } {
    const primitive = document.getRoot().listMeshes()[0].listPrimitives()[0];
    return {
        vertexCount: primitive.getAttribute("POSITION")?.getCount() ?? 0,
        indexCount: primitive.getIndices()?.getCount() ?? 0,
    };
}

describe("operator pipeline", () => {
    it("leaves geometry unchanged for a plain import to export roundtrip", async () => {
        const fixture = await CreateGridGlbAsync();

        const asset = new NodeAsset("roundtrip");
        const importer = new ImportGLTFBlock("import", asset);
        importer.data = fixture.glb;
        const exporter = new ExportGLTFBlock("export", asset);
        importer.output.connectTo(exporter.input);

        const glb = await asset.buildAsync();
        const reimported = await ReimportAsync(glb);

        expect(reimported.getRoot().listNodes()).toHaveLength(1);
        expect(reimported.getRoot().listMeshes()).toHaveLength(1);
        expect(reimported.getRoot().listExtensionsUsed()).toHaveLength(0);

        const counts = GetGeometryCounts(reimported);
        expect(counts.vertexCount).toBe(fixture.vertexCount);
        expect(counts.indexCount).toBe(fixture.indexCount);
    }, 20000);

    it("chains every operator without error and produces a valid glb", async () => {
        const fixture = await CreateGridGlbAsync();

        const asset = new NodeAsset("chain");
        const importer = new ImportGLTFBlock("import", asset);
        importer.data = fixture.glb;

        // A representative chain covering all operators, ending at export.
        const chain: OperatorBlock[] = [
            new WeldBlock("weld", asset),
            new DedupBlock("dedup", asset),
            new PruneBlock("prune", asset),
            new NormalsBlock("normals", asset),
            new JoinBlock("join", asset),
            new FlattenBlock("flatten", asset),
            new CenterBlock("center", asset),
        ];

        let previous: NodeAssetConnectionPoint = importer.output;
        for (const operator of chain) {
            previous.connectTo(operator.input);
            previous = operator.output;
        }
        const exporter = new ExportGLTFBlock("export", asset);
        previous.connectTo(exporter.input);

        const glb = await asset.buildAsync();

        expect(glb).toBeInstanceOf(Uint8Array);
        expect(glb.length).toBeGreaterThan(0);

        // The result must still re-import to a valid document with geometry.
        const reimported = await ReimportAsync(glb);
        expect(reimported.getRoot().listMeshes().length).toBeGreaterThan(0);
        expect(GetGeometryCounts(reimported).vertexCount).toBeGreaterThan(0);
    }, 30000);
});
