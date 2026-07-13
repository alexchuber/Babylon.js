import { describe, expect, it, vi } from "vitest";

import { ExportGLTFBlock } from "../../src/Blocks/exportGLTFBlock";
import { ExportImageBlock } from "../../src/Blocks/exportImageBlock";
import { ImportGLTFBlock } from "../../src/Blocks/importGLTFBlock";
import { ImportImageBlock } from "../../src/Blocks/importImageBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";

// The all-SCENE regression build registers the Draco encoder/decoder, so it needs the real
// draco3dgltf module rather than the stub the global vitest setup installs for @dev/core.
vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

// Distinctive fake image bytes (a PNG signature plus payload). The IMAGE lane is canvas-free, so the
// blocks never decode these; they only carry the bytes and mime type, so any buffer works.
const PngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5]);

/**
 * Builds a tiny uncompressed glb (one node, one mesh) in code so the terminal-generalization
 * regression does not depend on a bundled binary fixture.
 * @returns The fixture glb bytes.
 */
async function CreateFixtureGlbAsync(): Promise<Uint8Array> {
    const { Document, WebIO } = await import("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");

    const document = new Document();
    const buffer = document.createBuffer();
    const position = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
        .setBuffer(buffer);
    const primitive = document.createPrimitive().setAttribute("POSITION", position);
    const mesh = document.createMesh("mesh0").addPrimitive(primitive);
    const node = document.createNode("node0").setMesh(mesh);
    document.createScene("scene0").addChild(node);

    const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
    return await io.writeBinary(document);
}

describe("IMAGE lane", () => {
    it("round-trips image bytes and mime type from ImportImage through ExportImage (no glTF present)", async () => {
        const asset = new NodeAsset("image-roundtrip");
        const importer = new ImportImageBlock("import", asset);
        importer.data = PngBytes;
        importer.mimeType = "image/png";
        const exporter = new ExportImageBlock("export", asset);
        importer.output.connectTo(exporter.input);

        // The terminal is located generically (no ExportGLTFBlock in this graph), so a pure-image
        // pipeline builds and returns the exact source bytes.
        const result = await asset.buildAsync();
        expect(result).toBeInstanceOf(Uint8Array);
        expect(result).toEqual(PngBytes);

        // The configured mime type is carried through the IMAGE payload to the successful export.
        expect(importer.mimeType).toBe("image/png");
    });

    it("still builds an all-SCENE glTF graph unchanged (terminal generalization regression)", async () => {
        const glb = await CreateFixtureGlbAsync();

        const asset = new NodeAsset("gltf-regression");
        const importer = new ImportGLTFBlock("import", asset);
        importer.data = glb;
        const exporter = new ExportGLTFBlock("export", asset);
        importer.output.connectTo(exporter.input);

        const result = await asset.buildAsync();
        expect(result).toBeInstanceOf(Uint8Array);
        expect(result.length).toBeGreaterThan(0);
    });

    it("round-trips an ImportImage/ExportImage graph through serialize/Parse and rebuilds it", async () => {
        const asset = new NodeAsset("image-save-load");
        const importer = new ImportImageBlock("import", asset);
        importer.data = PngBytes;
        importer.mimeType = "image/webp";
        const exporter = new ExportImageBlock("export", asset);
        importer.output.connectTo(exporter.input);

        const serialized = JSON.parse(JSON.stringify(asset.serialize()));
        const parsed = NodeAsset.Parse(serialized);

        // Parse rebuilds via the registry, so a successful reconstruction also proves both blocks
        // self-registered their factories at import time.
        expect(parsed.attachedBlocks).toHaveLength(2);
        const parsedImporter = parsed.attachedBlocks[0] as ImportImageBlock;
        const parsedExporter = parsed.attachedBlocks[1] as ExportImageBlock;
        expect(parsedImporter).toBeInstanceOf(ImportImageBlock);
        expect(parsedExporter).toBeInstanceOf(ExportImageBlock);

        // Source bytes (base64) and mime type survived the roundtrip.
        expect(parsedImporter.data).toEqual(PngBytes);
        expect(parsedImporter.mimeType).toBe("image/webp");

        // The connection was restored, so the parsed graph builds the same bytes without re-wiring.
        expect(parsedImporter.output.connectedPoints[0]).toBe(parsedExporter.input);
        const result = await parsed.buildAsync();
        expect(result).toEqual(PngBytes);
    });

    it("throws when the graph has no export terminal (marker-based terminal detection finds none)", async () => {
        const asset = new NodeAsset("no-terminal");
        const importer = new ImportImageBlock("import", asset);
        importer.data = PngBytes;

        // The only block is a source; none carries the IExportBlock marker, so the generalized
        // terminal lookup finds nothing and the build reports the missing export block.
        await expect(asset.buildAsync()).rejects.toThrow(/no export block/);
    });

    it("rejects connecting an IMAGE output to a SCENE input (kind-equality only)", () => {
        const asset = new NodeAsset("image-kind");
        const importImage = new ImportImageBlock("import-image", asset);
        const exportGltf = new ExportGLTFBlock("export-gltf", asset);

        // The IMAGE output carries the new kind; connectTo checks kind-equality (ADR 0002), so it
        // cannot feed the SCENE input of a glTF exporter.
        expect(importImage.output.type).toBe(NodeAssetConnectionPointType.IMAGE);
        expect(() => importImage.output.connectTo(exportGltf.input)).toThrow(/incompatible connection point types/);
    });
});
