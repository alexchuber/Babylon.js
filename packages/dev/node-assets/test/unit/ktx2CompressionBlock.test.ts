import { describe, expect, it, vi } from "vitest";

import { ExportGLTFBlock } from "../../src/Blocks/exportGLTFBlock";
import { ImportGLTFBlock } from "../../src/Blocks/importGLTFBlock";
import { KTX2CompressionBlock } from "../../src/Blocks/ktx2CompressionBlock";
import { NodeAsset } from "../../src/nodeAsset";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";

// The global vitest setup stubs draco3dgltf (it is optional for @dev/core). Node assets depends on it
// for real (ImportGLTFBlock registers the Draco decoder), so use the actual module here.
vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

// KHR Data Format Descriptor color models identifying the Basis codec used in a KTX2 file.
const KHR_DF_MODEL_ETC1S = 163;
const KHR_DF_MODEL_UASTC = 166;

const DecodeWidth = 64;
const DecodeHeight = 64;

/**
 * Stand-in image decoder for the Node/test environment: the browser build decodes via canvas, but
 * the Node build requires an injected decoder. The block only needs raw RGBA + dimensions, so this
 * returns a solid buffer and ignores the (placeholder) source bytes.
 * @returns Raw RGBA image data with fixed dimensions.
 */
async function DecodeSolidRgbaAsync(): Promise<{ width: number; height: number; data: Uint8Array }> {
    return { width: DecodeWidth, height: DecodeHeight, data: new Uint8Array(DecodeWidth * DecodeHeight * 4).fill(128) };
}

/**
 * Reads the Basis color model (ETC1S vs UASTC) out of a KTX2 file's Data Format Descriptor without
 * pulling in a KTX2 parser: `colorModel` is the first byte of the DFD basic block, which starts
 * right after the u32 `dfdTotalSize` at the `dfdByteOffset` recorded in the KTX2 header.
 * @param ktx2Bytes - The KTX2 file bytes.
 * @returns The KHR Data Format color model identifier.
 */
function ReadKtx2ColorModel(ktx2Bytes: Uint8Array): number {
    const view = new DataView(ktx2Bytes.buffer, ktx2Bytes.byteOffset, ktx2Bytes.byteLength);
    const dfdByteOffset = view.getUint32(48, true);
    return view.getUint8(dfdByteOffset + 12);
}

/**
 * Builds a tiny glb with a material carrying a color (base color) and a data (normal) texture, so
 * the compression block has one texture of each codec class to encode.
 * @param colorMimeType - The mime type to assign to the base color texture (use an unsupported type
 * to exercise the passthrough path).
 * @returns The fixture glb bytes.
 */
async function CreateTexturedGlbAsync(colorMimeType = "image/png"): Promise<Uint8Array> {
    const { Document, WebIO } = await import("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");

    const document = new Document();
    const buffer = document.createBuffer();
    const position = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
        .setBuffer(buffer);

    const baseColorTexture = document.createTexture("baseColor").setImage(new Uint8Array(32).fill(1)).setMimeType(colorMimeType);
    const normalTexture = document.createTexture("normal").setImage(new Uint8Array(32).fill(2)).setMimeType("image/png");
    const material = document.createMaterial("material0").setBaseColorTexture(baseColorTexture).setNormalTexture(normalTexture);

    const primitive = document.createPrimitive().setAttribute("POSITION", position).setMaterial(material);
    const mesh = document.createMesh("mesh0").addPrimitive(primitive);
    const node = document.createNode("node0").setMesh(mesh);
    document.createScene("scene0").addChild(node);

    const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
    return await io.writeBinary(document);
}

describe("KTX2CompressionBlock", () => {
    it("exposes a GLTF input and output", () => {
        const asset = new NodeAsset("ktx2");
        const block = new KTX2CompressionBlock("ktx2", asset);

        expect(block.inputs).toHaveLength(1);
        expect(block.outputs).toHaveLength(1);
        expect(block.input.type).toBe(NodeAssetConnectionPointType.GLTF);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.GLTF);
        expect(asset.attachedBlocks).toContain(block);
    });

    it("compresses color textures to ETC1S and data textures to UASTC, flagging KHR_texture_basisu", async () => {
        const glb = await CreateTexturedGlbAsync();

        const asset = new NodeAsset("ktx2-roundtrip");
        const importer = new ImportGLTFBlock("import", asset);
        importer.data = glb;
        const compressor = new KTX2CompressionBlock("ktx2", asset);
        compressor.imageDecoder = DecodeSolidRgbaAsync;
        const exporter = new ExportGLTFBlock("export", asset);
        importer.output.connectTo(compressor.input);
        compressor.output.connectTo(exporter.input);

        const result = await asset.buildAsync();

        expect(result).toBeInstanceOf(Uint8Array);
        expect(result.length).toBeGreaterThan(0);

        // Re-parse the exported bytes to prove the KTX2 payloads and extension survive a real write.
        const { WebIO } = await import("@gltf-transform/core");
        const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
        const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
        const reparsed = await io.readBinary(result);

        expect(
            reparsed
                .getRoot()
                .listExtensionsUsed()
                .map((extension) => extension.extensionName)
        ).toContain("KHR_texture_basisu");

        const material = reparsed.getRoot().listMaterials()[0];
        const colorTexture = material.getBaseColorTexture()!;
        const dataTexture = material.getNormalTexture()!;

        expect(colorTexture.getMimeType()).toBe("image/ktx2");
        expect(dataTexture.getMimeType()).toBe("image/ktx2");
        expect(ReadKtx2ColorModel(colorTexture.getImage()!)).toBe(KHR_DF_MODEL_ETC1S);
        expect(ReadKtx2ColorModel(dataTexture.getImage()!)).toBe(KHR_DF_MODEL_UASTC);
    });

    it("passes unsupported textures through uncompressed and still exports a valid glb", async () => {
        // HDR is skipped by the design; represented here by an unsupported source mime type.
        const glb = await CreateTexturedGlbAsync("image/hdr");

        const asset = new NodeAsset("ktx2-passthrough");
        const importer = new ImportGLTFBlock("import", asset);
        importer.data = glb;
        const compressor = new KTX2CompressionBlock("ktx2", asset);
        compressor.imageDecoder = DecodeSolidRgbaAsync;
        const exporter = new ExportGLTFBlock("export", asset);
        importer.output.connectTo(compressor.input);
        compressor.output.connectTo(exporter.input);

        const result = await asset.buildAsync();

        const { WebIO } = await import("@gltf-transform/core");
        const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
        const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
        const reparsed = await io.readBinary(result);

        const material = reparsed.getRoot().listMaterials()[0];
        // The unsupported color texture is left untouched; only the supported normal texture compresses.
        expect(material.getBaseColorTexture()!.getMimeType()).toBe("image/hdr");
        expect(material.getNormalTexture()!.getMimeType()).toBe("image/ktx2");
    });
});
