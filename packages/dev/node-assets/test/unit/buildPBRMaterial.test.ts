import { type Document, type Primitive } from "@gltf-transform/core";
import { describe, expect, it, vi } from "vitest";

import { BuildPBRMaterial } from "../../src/Blocks/buildPBRMaterial";
import { ExportGLTFBlock } from "../../src/Blocks/exportGLTFBlock";
import { type ImagePayload } from "../../src/Blocks/imagePayload";
import { ImportGLTFBlock } from "../../src/Blocks/importGLTFBlock";
import { ImportImageBlock } from "../../src/Blocks/importImageBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";

// The import/export blocks register the Draco encoder/decoder, so use the real module rather than the
// stub the global vitest setup installs for @dev/core.
vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

// Distinctive fake image bytes. The IMAGE lane is canvas-free, so the blocks never decode these; they
// only carry the bytes and mime type through to a Texture, so any buffer works.
const BaseColorBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 1, 1, 1]);
const NormalBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 2, 2, 2, 2]);
const EmissiveBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 3, 3, 3, 3]);

/**
 * Builds a tiny glb with a buffer and one bare (untextured) mesh, so a BuildPBRMaterial has a valid
 * SCENE to create its material in and the exported glb has a buffer for the texture bytes.
 * @returns The fixture glb bytes.
 */
async function CreateBareGlbAsync(): Promise<Uint8Array> {
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
 * Wires an ImportImage source carrying the given bytes into one of a BuildPBRMaterial's IMAGE inputs.
 * @param asset - The owning node asset.
 * @param build - The BuildPBRMaterial block to feed.
 * @param input - The IMAGE connection point to connect to.
 * @param bytes - The encoded image bytes to import.
 */
function ConnectImage(asset: NodeAsset, build: BuildPBRMaterial, input: BuildPBRMaterial["baseColor"], bytes: Uint8Array): void {
    const importImage = new ImportImageBlock("image", asset);
    importImage.data = bytes;
    importImage.mimeType = "image/png";
    importImage.output.connectTo(input);
}

/**
 * Builds an in-memory document with one bare (material-less) primitive in an explicit default scene,
 * so assignment behaviour can be asserted directly on the returned primitive.
 * @returns The document and its bare primitive.
 */
async function CreateBareDocumentWithPrimitiveAsync(): Promise<{ document: Document; primitive: Primitive }> {
    const { Document } = await import("@gltf-transform/core");
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
    const scene = document.createScene("scene0").addChild(node);
    document.getRoot().setDefaultScene(scene);
    return { document, primitive };
}

describe("BuildPBRMaterial", () => {
    it("registers a SCENE input, five optional IMAGE inputs, and a SCENE output", () => {
        const asset = new NodeAsset("shape");
        const build = new BuildPBRMaterial("build", asset);

        expect(build.inputs).toHaveLength(6);
        expect(build.outputs).toHaveLength(1);
        expect(build.scene.type).toBe(NodeAssetConnectionPointType.SCENE);
        expect(build.output.type).toBe(NodeAssetConnectionPointType.SCENE);

        for (const image of [build.baseColor, build.metallicRoughness, build.normal, build.occlusion, build.emissive]) {
            expect(image.type).toBe(NodeAssetConnectionPointType.IMAGE);
            expect(image.isOptional).toBe(true);
        }
        // The SCENE input is required (not optional), matching the operator blocks.
        expect(build.scene.isOptional).toBe(false);
    });

    it("creates a PBR material with the given factors and a base-colour texture from in-memory inputs", async () => {
        const { Document } = await import("@gltf-transform/core");
        const document = new Document();

        const build = new BuildPBRMaterial("build", new NodeAsset("in-memory"));
        build.scene.value = document;
        build.baseColor.value = { data: BaseColorBytes, mimeType: "image/png" } satisfies ImagePayload;
        build.baseColorFactor = [0.2, 0.4, 0.6, 1];
        build.metallicFactor = 0.25;
        build.roughnessFactor = 0.75;
        build.emissiveFactor = [0.1, 0, 0];
        await build._buildBlockAsync();

        const material = document.getRoot().listMaterials()[0];
        expect(material).toBeDefined();
        expect(material.getBaseColorFactor()).toEqual([0.2, 0.4, 0.6, 1]);
        expect(material.getMetallicFactor()).toBe(0.25);
        expect(material.getRoughnessFactor()).toBe(0.75);
        expect(material.getEmissiveFactor()).toEqual([0.1, 0, 0]);
        expect(material.getBaseColorTexture()).not.toBeNull();
        expect(material.getBaseColorTexture()!.getMimeType()).toBe("image/png");
        // Slots with no supplied IMAGE input are left unset.
        expect(material.getNormalTexture()).toBeNull();
        expect(material.getMetallicRoughnessTexture()).toBeNull();
    });

    it("builds a base-colour material end-to-end (import -> build -> export -> reparse)", async () => {
        const asset = new NodeAsset("build-e2e");
        const importer = new ImportGLTFBlock("import", asset);
        importer.data = await CreateBareGlbAsync();
        const build = new BuildPBRMaterial("build", asset);
        const exporter = new ExportGLTFBlock("export", asset);

        importer.output.connectTo(build.scene);
        ConnectImage(asset, build, build.baseColor, BaseColorBytes);
        build.output.connectTo(exporter.input);

        const reparsed = await ReparseAsync(await asset.buildAsync());
        const material = reparsed.getRoot().listMaterials()[0];
        expect(material).toBeDefined();
        // The material carries a base-colour texture that survived export + reparse.
        expect(material.getBaseColorTexture()).not.toBeNull();
    });

    it("produces a factor-only material with no textures when no IMAGE inputs are supplied", async () => {
        const asset = new NodeAsset("factor-only");
        const importer = new ImportGLTFBlock("import", asset);
        importer.data = await CreateBareGlbAsync();
        const build = new BuildPBRMaterial("build", asset);
        build.baseColorFactor = [1, 0, 0, 1];
        build.metallicFactor = 0;
        build.roughnessFactor = 0.5;
        const exporter = new ExportGLTFBlock("export", asset);

        importer.output.connectTo(build.scene);
        build.output.connectTo(exporter.input);

        const reparsed = await ReparseAsync(await asset.buildAsync());
        const material = reparsed.getRoot().listMaterials()[0];
        expect(material).toBeDefined();
        expect(material.getBaseColorFactor()).toEqual([1, 0, 0, 1]);
        expect(material.getMetallicFactor()).toBe(0);
        expect(material.getRoughnessFactor()).toBe(0.5);
        // No IMAGE inputs were connected, so the material has no textures at all.
        expect(material.getBaseColorTexture()).toBeNull();
        expect(material.getNormalTexture()).toBeNull();
        expect(material.getMetallicRoughnessTexture()).toBeNull();
        expect(material.getOcclusionTexture()).toBeNull();
        expect(material.getEmissiveTexture()).toBeNull();
    });

    it("creates one texture per supplied slot, wired to the correct slots", async () => {
        const asset = new NodeAsset("multi-slot");
        const importer = new ImportGLTFBlock("import", asset);
        importer.data = await CreateBareGlbAsync();
        const build = new BuildPBRMaterial("build", asset);
        const exporter = new ExportGLTFBlock("export", asset);

        importer.output.connectTo(build.scene);
        ConnectImage(asset, build, build.baseColor, BaseColorBytes);
        ConnectImage(asset, build, build.normal, NormalBytes);
        ConnectImage(asset, build, build.emissive, EmissiveBytes);
        build.output.connectTo(exporter.input);

        const reparsed = await ReparseAsync(await asset.buildAsync());
        const material = reparsed.getRoot().listMaterials()[0];
        // Exactly the three supplied slots are wired; the two unsupplied slots stay empty.
        expect(material.getBaseColorTexture()).not.toBeNull();
        expect(material.getNormalTexture()).not.toBeNull();
        expect(material.getEmissiveTexture()).not.toBeNull();
        expect(material.getMetallicRoughnessTexture()).toBeNull();
        expect(material.getOcclusionTexture()).toBeNull();
        expect(reparsed.getRoot().listTextures()).toHaveLength(3);
    });

    it("builds when optional IMAGE inputs are left unconnected (no 'not connected' error)", async () => {
        const asset = new NodeAsset("optional-fallback");
        const importer = new ImportGLTFBlock("import", asset);
        importer.data = await CreateBareGlbAsync();
        const build = new BuildPBRMaterial("build", asset);
        const exporter = new ExportGLTFBlock("export", asset);

        importer.output.connectTo(build.scene);
        // Only the base-colour slot is wired; the other four optional slots stay unconnected.
        ConnectImage(asset, build, build.baseColor, BaseColorBytes);
        build.output.connectTo(exporter.input);

        const reparsed = await ReparseAsync(await asset.buildAsync());
        const material = reparsed.getRoot().listMaterials()[0];
        expect(material.getBaseColorTexture()).not.toBeNull();
        expect(material.getNormalTexture()).toBeNull();
        expect(material.getMetallicRoughnessTexture()).toBeNull();
        expect(material.getOcclusionTexture()).toBeNull();
        expect(material.getEmissiveTexture()).toBeNull();
    });

    it("passes the SCENE through so it can be chained (two builds -> two materials)", async () => {
        const asset = new NodeAsset("chain-through");
        const importer = new ImportGLTFBlock("import", asset);
        importer.data = await CreateBareGlbAsync();
        const first = new BuildPBRMaterial("first", asset);
        first.baseColorFactor = [1, 0, 0, 1];
        const second = new BuildPBRMaterial("second", asset);
        second.baseColorFactor = [0, 1, 0, 1];
        const exporter = new ExportGLTFBlock("export", asset);

        importer.output.connectTo(first.scene);
        first.output.connectTo(second.scene);
        second.output.connectTo(exporter.input);

        const reparsed = await ReparseAsync(await asset.buildAsync());
        // Both materials survive: the SCENE flowed through the first build into the second.
        expect(reparsed.getRoot().listMaterials()).toHaveLength(2);
    });

    it("passes the same in-place-mutated Document reference through on its output", async () => {
        const { Document } = await import("@gltf-transform/core");
        const document = new Document();

        const build = new BuildPBRMaterial("build", new NodeAsset("passthrough"));
        build.scene.value = document;
        await build._buildBlockAsync();

        // Same reference, mutated in place (no clone / copy-on-fan-out here).
        expect(build.output.value).toBe(document);
        expect(build.output.type).toBe(NodeAssetConnectionPointType.SCENE);
        expect(document.getRoot().listMaterials()).toHaveLength(1);
    });

    it("throws when the input scene is missing", async () => {
        const build = new BuildPBRMaterial("build", new NodeAsset("missing"));
        expect(build.scene.value).toBeNull();
        await expect(build._buildBlockAsync()).rejects.toThrow(/no input scene/);
    });

    it("assigns the built material to a bare primitive in the default scene", async () => {
        const { document, primitive } = await CreateBareDocumentWithPrimitiveAsync();
        const build = new BuildPBRMaterial("build", new NodeAsset("assign"));
        build.scene.value = document;
        await build._buildBlockAsync();

        const material = document.getRoot().listMaterials()[0];
        expect(material).toBeDefined();
        // The bare primitive now references the built material, so a viewer renders it textured.
        expect(primitive.getMaterial()).toBe(material);
    });

    it("leaves a primitive that already references a material untouched", async () => {
        const { document, primitive } = await CreateBareDocumentWithPrimitiveAsync();
        const existing = document.createMaterial("existing");
        primitive.setMaterial(existing);

        const build = new BuildPBRMaterial("build", new NodeAsset("non-destructive"));
        build.scene.value = document;
        await build._buildBlockAsync();

        // The pre-materialed primitive keeps its original material; the built one is still created.
        expect(primitive.getMaterial()).toBe(existing);
        expect(document.getRoot().listMaterials()).toHaveLength(2);
    });

    it("builds without throwing when the default scene has no mesh primitives", async () => {
        const { Document } = await import("@gltf-transform/core");
        const document = new Document();
        const scene = document.createScene("scene0").addChild(document.createNode("empty"));
        document.getRoot().setDefaultScene(scene);

        const build = new BuildPBRMaterial("build", new NodeAsset("mesh-less"));
        build.scene.value = document;
        await expect(build._buildBlockAsync()).resolves.toBeUndefined();
        expect(document.getRoot().listMaterials()).toHaveLength(1);
    });

    it("round-trips its factors and identity through save/load (proving self-registration)", () => {
        const asset = new NodeAsset("roundtrip");
        const build = new BuildPBRMaterial("build", asset);
        build.baseColorFactor = [0.1, 0.2, 0.3, 0.4];
        build.metallicFactor = 0.6;
        build.roughnessFactor = 0.2;
        build.emissiveFactor = [0.5, 0.5, 0.5];

        const serialized = JSON.parse(JSON.stringify(asset.serialize()));
        const parsed = NodeAsset.Parse(serialized);

        expect(parsed.attachedBlocks).toHaveLength(1);
        const parsedBuild = parsed.attachedBlocks[0] as BuildPBRMaterial;
        expect(parsedBuild).toBeInstanceOf(BuildPBRMaterial);
        expect(parsedBuild.baseColorFactor).toEqual([0.1, 0.2, 0.3, 0.4]);
        expect(parsedBuild.metallicFactor).toBe(0.6);
        expect(parsedBuild.roughnessFactor).toBe(0.2);
        expect(parsedBuild.emissiveFactor).toEqual([0.5, 0.5, 0.5]);
    });
});
