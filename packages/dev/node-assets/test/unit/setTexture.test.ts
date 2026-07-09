import { Document, WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ExportGLTFBlock } from "../../src/Blocks/exportGLTFBlock";
import { ExtractTexture } from "../../src/Blocks/extractTexture";
import { type ImageCanvasOperation } from "../../src/Blocks/imageCanvas";
import { type ImagePayload } from "../../src/Blocks/imagePayload";
import { ImportGLTFBlock } from "../../src/Blocks/importGLTFBlock";
import { ImportImageBlock } from "../../src/Blocks/importImageBlock";
import { ResizeImageBlock } from "../../src/Blocks/resizeImageBlock";
import { SetTexture } from "../../src/Blocks/setTexture";
import { StringLiteral } from "../../src/Blocks/stringLiteral";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";

// ImportGLTFBlock registers the Draco decoder, so use the real module rather than the stub the global
// vitest setup installs for @dev/core.
vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

// The resize op touches a real canvas only through the shared `imageCanvas` helper, whose
// `createImageBitmap`/`OffscreenCanvas` path is unavailable in this headless (Node) environment.
// Stubbing that single seam lets the round-trip build here: the stub swaps in distinctive "resized"
// bytes and echoes the requested dimensions — exactly the shape the real decode -> redraw -> encode
// helper returns — so the swap-through and diamond isolation can be asserted without a browser, while
// pixel-level correctness is left to the editor Playwright seam per slice 04.
const { processImageMock } = vi.hoisted(() => ({ processImageMock: vi.fn() }));
vi.mock("../../src/Blocks/imageCanvas", () => ({ ProcessImageAsync: processImageMock }));

// Distinctive fake image bytes (a file signature plus payload). The IMAGE lane is canvas-free, so
// nothing decodes these; only the bytes and mime type are carried, so any buffer works. Lengths are
// multiples of 4 so they survive the glb roundtrip byte-for-byte without alignment ambiguity.
const OriginalBaseColorPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8]);
const OriginalNormalPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9, 9, 9]);
const ImportedPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x10, 0x20, 0x30, 0x40]);
const ResizedBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xaa, 0xbb, 0xcc, 0xdd]);

const BaseColorPointer = "/materials/0/pbrMetallicRoughness/baseColorTexture";
const MetallicRoughnessPointer = "/materials/0/pbrMetallicRoughness/metallicRoughnessTexture";

/**
 * Builds a small in-code `Document` with a PBR material whose baseColor and normal slots hold known,
 * distinct images and whose metallicRoughness/emissive slots are empty. Factors are set to
 * non-default values so a write can prove it leaves the rest of the material untouched.
 * @returns The document and its material for direct assertions.
 */
function CreateFixture() {
    const document = new Document();
    const material = document.createMaterial("mat0").setBaseColorFactor([0.2, 0.4, 0.6, 1]).setMetallicFactor(0.25).setRoughnessFactor(0.75).setEmissiveFactor([0.1, 0.2, 0.3]);
    material.setBaseColorTexture(document.createTexture("baseColor").setImage(OriginalBaseColorPng).setMimeType("image/png"));
    material.setNormalTexture(document.createTexture("normal").setImage(OriginalNormalPng).setMimeType("image/png"));
    return { document, material };
}

/**
 * Builds a tiny glb with a mesh and a material carrying known baseColor and normal textures plus
 * non-default factors, so an import → set → export pipeline has a real, reparseable scene to write.
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
    const material = document
        .createMaterial("mat0")
        .setBaseColorFactor([0.2, 0.4, 0.6, 1])
        .setBaseColorTexture(document.createTexture("baseColor").setImage(OriginalBaseColorPng).setMimeType("image/png"))
        .setNormalTexture(document.createTexture("normal").setImage(OriginalNormalPng).setMimeType("image/png"));
    const primitive = document.createPrimitive().setAttribute("POSITION", position).setMaterial(material);
    const mesh = document.createMesh("mesh0").addPrimitive(primitive);
    const node = document.createNode("node0").setMesh(mesh);
    document.createScene("scene0").addChild(node);

    const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
    return await io.writeBinary(document);
}

/**
 * Re-parses exported glb bytes into a `Document` for assertions.
 * @param glb - The glb bytes.
 * @returns The parsed document.
 */
async function ReparseAsync(glb: Uint8Array): Promise<Document> {
    const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
    return await io.readBinary(glb);
}

describe("SetTexture", () => {
    beforeEach(() => {
        processImageMock.mockReset();
        // Echo a resize into distinctive fresh bytes, applying the requested dimensions and preserving
        // the source mime, mirroring what a real decode -> redraw -> encode produces.
        processImageMock.mockImplementation(async (payload: ImagePayload, operation: ImageCanvasOperation): Promise<ImagePayload> => {
            return { data: ResizedBytes, mimeType: operation.mimeType ?? payload.mimeType, width: operation.width, height: operation.height };
        });
    });

    it("registers SCENE + STRING + IMAGE inputs and a SCENE output", () => {
        const asset = new NodeAsset("shape");
        const setter = new SetTexture("set", asset);

        expect(setter.inputs).toHaveLength(3);
        expect(setter.outputs).toHaveLength(1);
        expect(setter.scene.type).toBe(NodeAssetConnectionPointType.SCENE);
        expect(setter.pointer.type).toBe(NodeAssetConnectionPointType.STRING);
        expect(setter.image.type).toBe(NodeAssetConnectionPointType.IMAGE);
        expect(setter.output.type).toBe(NodeAssetConnectionPointType.SCENE);
    });

    it("writes an IMAGE into an existing slot; a readback via ExtractTexture returns the new bytes and mime", async () => {
        const asset = new NodeAsset("existing-slot");
        const { document, material } = CreateFixture();

        const setter = new SetTexture("set", asset);
        setter.scene.value = document;
        setter.pointer.value = BaseColorPointer;
        setter.image.value = { data: ImportedPng, mimeType: "image/png" } satisfies ImagePayload;
        await setter._buildBlockAsync();

        // Read the slot back through the converter's get side (ExtractTexture): set and get are symmetric.
        const extract = new ExtractTexture("extract", asset);
        extract.scene.value = document;
        extract.pointer.value = BaseColorPointer;
        await extract._buildBlockAsync();
        const payload = extract.output.value as ImagePayload;
        expect(payload.data).toEqual(ImportedPng);
        expect(payload.mimeType).toBe("image/png");

        // The rest of the material is untouched.
        expect(material.getNormalTexture()!.getImage()).toEqual(OriginalNormalPng);
        expect(material.getBaseColorFactor()).toEqual([0.2, 0.4, 0.6, 1]);
        expect(material.getMetallicFactor()).toBe(0.25);
        expect(material.getRoughnessFactor()).toBe(0.75);
        expect(material.getEmissiveFactor()).toEqual([0.1, 0.2, 0.3]);
    });

    it("creates the texture when the slot is empty, then writes the image into it", async () => {
        const asset = new NodeAsset("create-on-empty");
        const { document, material } = CreateFixture();
        expect(material.getMetallicRoughnessTexture()).toBeNull();

        const setter = new SetTexture("set", asset);
        setter.scene.value = document;
        setter.pointer.value = MetallicRoughnessPointer;
        setter.image.value = { data: ImportedPng, mimeType: "image/png" } satisfies ImagePayload;
        await setter._buildBlockAsync();

        const texture = material.getMetallicRoughnessTexture();
        expect(texture).not.toBeNull();
        expect(texture!.getImage()).toEqual(ImportedPng);
        expect(texture!.getMimeType()).toBe("image/png");
        // The previously-populated baseColor slot is untouched.
        expect(material.getBaseColorTexture()!.getImage()).toEqual(OriginalBaseColorPng);
    });

    it("passes the same in-place-mutated Document reference through on its output", async () => {
        const asset = new NodeAsset("passthrough");
        const { document } = CreateFixture();

        const setter = new SetTexture("set", asset);
        setter.scene.value = document;
        setter.pointer.value = BaseColorPointer;
        setter.image.value = { data: ImportedPng, mimeType: "image/png" } satisfies ImagePayload;
        await setter._buildBlockAsync();

        // Same reference, mutated in place (no clone / copy-on-fan-out in the block itself).
        expect(setter.output.value).toBe(document);
        expect(setter.output.type).toBe(NodeAssetConnectionPointType.SCENE);
    });

    it("sets a texture from an ImportImage end-to-end (import -> set -> export -> reparse)", async () => {
        const asset = new NodeAsset("set-from-import");
        const importer = new ImportGLTFBlock("import", asset);
        importer.data = await CreateTexturedGlbAsync();
        const image = new ImportImageBlock("image", asset);
        image.data = ImportedPng;
        image.mimeType = "image/png";
        const pointer = new StringLiteral("pointer", asset);
        pointer.value = BaseColorPointer;
        const setter = new SetTexture("set", asset);
        const exporter = new ExportGLTFBlock("export", asset);

        importer.output.connectTo(setter.scene);
        pointer.output.connectTo(setter.pointer);
        image.output.connectTo(setter.image);
        setter.output.connectTo(exporter.input);

        const reparsed = await ReparseAsync(await asset.buildAsync());
        const reparsedMaterial = reparsed.getRoot().listMaterials()[0];
        // The baseColor slot now carries the imported image...
        expect(reparsedMaterial.getBaseColorTexture()!.getImage()).toEqual(ImportedPng);
        // ...and the untouched normal slot and factors survive unchanged.
        expect(reparsedMaterial.getNormalTexture()!.getImage()).toEqual(OriginalNormalPng);
        expect(reparsedMaterial.getBaseColorFactor()).toEqual([0.2, 0.4, 0.6, 1]);
    });

    it("round-trips a texture through extract -> resize -> set, keeping the read and write branches isolated", async () => {
        // The headline diamond: the imported SCENE fans out to an ExtractTexture read branch AND a
        // SetTexture write branch. Copy-on-fan-out (slice 05) hands each branch its own Document clone,
        // so the read branch sees the ORIGINAL texture while the write branch produces the resized one.
        const asset = new NodeAsset("extract-resize-set");
        const importer = new ImportGLTFBlock("import", asset);
        importer.data = await CreateTexturedGlbAsync();

        const extractPointer = new StringLiteral("extractPointer", asset);
        extractPointer.value = BaseColorPointer;
        const extract = new ExtractTexture("extract", asset);
        const resize = new ResizeImageBlock("resize", asset);
        resize.width = 8;
        resize.height = 8;

        const setPointer = new StringLiteral("setPointer", asset);
        setPointer.value = BaseColorPointer;
        const setter = new SetTexture("set", asset);
        const exporter = new ExportGLTFBlock("export", asset);

        // Fan the imported SCENE out to both the read branch and the write branch (the diamond).
        importer.output.connectTo(extract.scene);
        importer.output.connectTo(setter.scene);
        extractPointer.output.connectTo(extract.pointer);
        extract.output.connectTo(resize.input);
        resize.output.connectTo(setter.image);
        setPointer.output.connectTo(setter.pointer);
        setter.output.connectTo(exporter.input);

        const reparsed = await ReparseAsync(await asset.buildAsync());

        // The resize ran on the extracted texture and set its target dimensions on the new payload.
        const resized = resize.output.value as ImagePayload;
        expect(resized.data).toEqual(ResizedBytes);
        expect(resized.width).toBe(8);
        expect(resized.height).toBe(8);

        // The exported baseColor texture is the resized one (the swap round-tripped through export)...
        const reparsedMaterial = reparsed.getRoot().listMaterials()[0];
        expect(reparsedMaterial.getBaseColorTexture()!.getImage()).toEqual(ResizedBytes);
        // ...and the rest of the material (the normal slot, the base color factor) is unchanged.
        expect(reparsedMaterial.getNormalTexture()!.getImage()).toEqual(OriginalNormalPng);
        expect(reparsedMaterial.getBaseColorFactor()).toEqual([0.2, 0.4, 0.6, 1]);

        // Diamond isolation: each branch got its own Document clone (copy-on-fan-out)...
        const readDocument = extract.scene.value as Document;
        const writeDocument = setter.output.value as Document;
        expect(readDocument).not.toBe(writeDocument);
        // ...the read branch's clone still holds the ORIGINAL texture (the write did not stomp it)...
        expect(readDocument.getRoot().listMaterials()[0].getBaseColorTexture()!.getImage()).toEqual(OriginalBaseColorPng);
        // ...the write branch's clone holds the resized texture...
        expect(writeDocument.getRoot().listMaterials()[0].getBaseColorTexture()!.getImage()).toEqual(ResizedBytes);
        // ...and the canonical imported Document is never mutated by either branch.
        expect((importer.output.value as Document).getRoot().listMaterials()[0].getBaseColorTexture()!.getImage()).toEqual(OriginalBaseColorPng);
    });

    it("fails the build with the converter's clear error when the pointer does not name a texture slot", async () => {
        const asset = new NodeAsset("non-texture-slot");
        const { document } = CreateFixture();

        const setter = new SetTexture("set", asset);
        setter.scene.value = document;
        setter.pointer.value = "/materials/0/pbrMetallicRoughness/baseColorFactor";
        setter.image.value = { data: ImportedPng, mimeType: "image/png" } satisfies ImagePayload;

        await expect(setter._buildBlockAsync()).rejects.toThrow(/texture slot/i);
    });

    it("fails the build with the converter's clear error on an out-of-range pointer", async () => {
        const asset = new NodeAsset("bad-pointer");
        const { document } = CreateFixture();

        const setter = new SetTexture("set", asset);
        setter.scene.value = document;
        setter.pointer.value = "/materials/9/pbrMetallicRoughness/baseColorTexture";
        setter.image.value = { data: ImportedPng, mimeType: "image/png" } satisfies ImagePayload;

        await expect(setter._buildBlockAsync()).rejects.toThrow("/materials/9/pbrMetallicRoughness/baseColorTexture");
        await expect(setter._buildBlockAsync()).rejects.toThrow(/out of range/);
    });

    it("throws when the input document is missing", async () => {
        const asset = new NodeAsset("missing");
        const setter = new SetTexture("set", asset);
        setter.pointer.value = BaseColorPointer;
        setter.image.value = { data: ImportedPng, mimeType: "image/png" } satisfies ImagePayload;

        expect(setter.scene.value).toBeNull();
        await expect(setter._buildBlockAsync()).rejects.toThrow();
    });

    it("round-trips its identity through save/load", () => {
        const asset = new NodeAsset("roundtrip");
        new SetTexture("set", asset);

        const serialized = JSON.parse(JSON.stringify(asset.serialize()));
        const parsed = NodeAsset.Parse(serialized);

        expect(parsed.attachedBlocks).toHaveLength(1);
        expect(parsed.attachedBlocks[0].getClassName()).toBe(SetTexture.ClassName);
    });
});
