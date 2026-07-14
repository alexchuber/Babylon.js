import { Document, WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { describe, expect, it, vi } from "vitest";

import { ExportImageBlock } from "../../src/Blocks/exportImageBlock";
import { ExtractTexture } from "../../src/Blocks/extractTexture";
import { type ImagePayload } from "../../src/Blocks/imagePayload";
import { ImportGLTFBlock } from "../../src/Blocks/importGLTFBlock";
import { StringLiteral } from "../../src/Blocks/stringLiteral";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";
import { CreateTestGltfAsset } from "./testGltfAsset";

// ImportGLTFBlock registers the Draco decoder, so use the real module rather than the stub the global
// vitest setup installs for @dev/core.
vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

// Distinctive fake image bytes (a file signature plus payload). The IMAGE lane is canvas-free, so
// nothing decodes these; only the bytes and mime type are carried, so any buffer works. Lengths are
// multiples of 4 so they survive the glb roundtrip byte-for-byte without alignment ambiguity.
const BaseColorPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8]);
const EmissiveJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7, 6]);

const BaseColorPointer = "/materials/0/pbrMetallicRoughness/baseColorTexture";

/**
 * Builds a small in-code `Document` with a PBR material whose baseColor slot holds a known image and
 * whose emissive slot holds a second distinct image, leaving the metallicRoughness and normal slots
 * empty. Factors are set to non-default values so a read can prove it leaves them untouched.
 * @returns The document and its material for direct assertions.
 */
function CreateFixture() {
    const document = new Document();
    const material = document.createMaterial("mat0").setBaseColorFactor([0.2, 0.4, 0.6, 1]).setMetallicFactor(0.25).setRoughnessFactor(0.75).setEmissiveFactor([0.1, 0.2, 0.3]);
    material.setBaseColorTexture(document.createTexture("baseColor").setImage(BaseColorPng).setMimeType("image/png"));
    material.setEmissiveTexture(document.createTexture("emissive").setImage(EmissiveJpeg).setMimeType("image/jpeg"));
    return { document, material };
}

/**
 * Builds a tiny glb with a mesh and a material carrying a known baseColor texture, so an
 * ImportGLTF → ExtractTexture → ExportImage pipeline has a real texture to pull out through the terminal.
 * @returns The fixture glb bytes.
 */
async function CreateTexturedGlbAsync(): Promise<Uint8Array> {
    const document = new Document();
    const buffer = document.createBuffer();
    const position = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
        .setBuffer(buffer);
    const baseColorTexture = document.createTexture("baseColor").setImage(BaseColorPng).setMimeType("image/png");
    const material = document.createMaterial("mat0").setBaseColorTexture(baseColorTexture);
    const primitive = document.createPrimitive().setAttribute("POSITION", position).setMaterial(material);
    const mesh = document.createMesh("mesh0").addPrimitive(primitive);
    const node = document.createNode("node0").setMesh(mesh);
    document.createScene("scene0").addChild(node);

    const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
    return await io.writeBinary(document);
}

describe("ExtractTexture", () => {
    it("registers GLTF_DOCUMENT + STRING inputs and an IMAGE output", () => {
        const asset = new NodeAsset("shape");
        const extract = new ExtractTexture("extract", asset);

        expect(extract.inputs).toHaveLength(2);
        expect(extract.outputs).toHaveLength(1);
        expect(extract.scene.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
        expect(extract.pointer.type).toBe(NodeAssetConnectionPointType.STRING);
        expect(extract.output.type).toBe(NodeAssetConnectionPointType.IMAGE);
    });

    it("extracts the slot texture's exact bytes and mime type as an IMAGE payload", async () => {
        const asset = new NodeAsset("extract");
        const { document } = CreateFixture();

        const extract = new ExtractTexture("extract", asset);
        extract.scene.value = CreateTestGltfAsset(document);
        extract.pointer.value = BaseColorPointer;
        await extract._buildBlockAsync();

        const payload = extract.output.value as ImagePayload;
        expect(payload.data).toEqual(BaseColorPng);
        expect(payload.mimeType).toBe("image/png");
        expect(extract.output.type).toBe(NodeAssetConnectionPointType.IMAGE);
    });

    it("is driven by the pointer, resolving standalone slots such as emissiveTexture too", async () => {
        const asset = new NodeAsset("extract-emissive");
        const { document } = CreateFixture();

        const extract = new ExtractTexture("extract", asset);
        extract.scene.value = CreateTestGltfAsset(document);
        extract.pointer.value = "/materials/0/emissiveTexture";
        await extract._buildBlockAsync();

        const payload = extract.output.value as ImagePayload;
        expect(payload.data).toEqual(EmissiveJpeg);
        expect(payload.mimeType).toBe("image/jpeg");
    });

    it("pulls a texture out through the terminal (ImportGLTF -> ExtractTexture -> ExportImage)", async () => {
        const asset = new NodeAsset("extract-to-export");

        const importer = new ImportGLTFBlock("import", asset);
        importer.data = await CreateTexturedGlbAsync();
        const pointer = new StringLiteral("pointer", asset);
        pointer.value = BaseColorPointer;
        const extract = new ExtractTexture("extract", asset);
        const exporter = new ExportImageBlock("export", asset);

        importer.output.connectTo(extract.scene);
        pointer.output.connectTo(extract.pointer);
        extract.output.connectTo(exporter.input);

        // The extracted texture is a first-class IMAGE: it flows through the terminal and the built
        // bytes are the source texture's exact bytes.
        const result = await asset.buildAsync();
        expect(result).toEqual(BaseColorPng);
    });

    it("reads without mutating or re-emitting the SCENE", async () => {
        const asset = new NodeAsset("read-only");
        const { document, material } = CreateFixture();

        const extract = new ExtractTexture("extract", asset);
        extract.scene.value = CreateTestGltfAsset(document);
        extract.pointer.value = BaseColorPointer;
        await extract._buildBlockAsync();

        // The only output is the IMAGE payload; the SCENE is neither mutated nor passed through.
        expect(extract.outputs).toHaveLength(1);
        expect(extract.output.type).toBe(NodeAssetConnectionPointType.IMAGE);
        expect(material.getBaseColorTexture()!.getImage()).toEqual(BaseColorPng);
        expect(material.getBaseColorFactor()).toEqual([0.2, 0.4, 0.6, 1]);
        expect(material.getMetallicFactor()).toBe(0.25);
        expect(material.getRoughnessFactor()).toBe(0.75);
        expect(material.getEmissiveFactor()).toEqual([0.1, 0.2, 0.3]);
    });

    it("fails the build with the converter's clear error on an empty slot", async () => {
        const asset = new NodeAsset("empty-slot");
        const { document } = CreateFixture();

        const extract = new ExtractTexture("extract", asset);
        extract.scene.value = CreateTestGltfAsset(document);
        extract.pointer.value = "/materials/0/normalTexture";

        await expect(extract._buildBlockAsync()).rejects.toThrow("/materials/0/normalTexture");
        await expect(extract._buildBlockAsync()).rejects.toThrow(/no texture/i);
    });

    it("fails the build when the pointer does not name a texture slot", async () => {
        const asset = new NodeAsset("non-texture-slot");
        const { document } = CreateFixture();

        const extract = new ExtractTexture("extract", asset);
        extract.scene.value = CreateTestGltfAsset(document);
        extract.pointer.value = "/materials/0/pbrMetallicRoughness/baseColorFactor";

        await expect(extract._buildBlockAsync()).rejects.toThrow(/texture slot/i);
    });

    it("fails the build with the converter's clear error on an out-of-range pointer", async () => {
        const asset = new NodeAsset("bad-pointer");
        const { document } = CreateFixture();

        const extract = new ExtractTexture("extract", asset);
        extract.scene.value = CreateTestGltfAsset(document);
        extract.pointer.value = "/materials/9/pbrMetallicRoughness/baseColorTexture";

        await expect(extract._buildBlockAsync()).rejects.toThrow("/materials/9/pbrMetallicRoughness/baseColorTexture");
        await expect(extract._buildBlockAsync()).rejects.toThrow(/out of range/);
    });

    it("throws when the input document is missing", async () => {
        const asset = new NodeAsset("missing");
        const extract = new ExtractTexture("extract", asset);
        extract.pointer.value = BaseColorPointer;

        expect(extract.scene.value).toBeNull();
        await expect(extract._buildBlockAsync()).rejects.toThrow();
    });

    it("round-trips its identity through save/load", () => {
        const asset = new NodeAsset("roundtrip");
        new ExtractTexture("extract", asset);

        const serialized = JSON.parse(JSON.stringify(asset.serialize()));
        const parsed = NodeAsset.Parse(serialized);

        expect(parsed.attachedBlocks).toHaveLength(1);
        expect(parsed.attachedBlocks[0].getClassName()).toBe(ExtractTexture.ClassName);
    });
});
