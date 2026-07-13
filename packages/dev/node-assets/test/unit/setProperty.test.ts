import { type Document } from "@gltf-transform/core";
import { describe, expect, it, vi } from "vitest";

import { ExportGLTFBlock } from "../../src/Blocks/exportGLTFBlock";
import { ImportGLTFBlock } from "../../src/Blocks/importGLTFBlock";
import { JsonLiteral } from "../../src/Blocks/jsonLiteral";
import { Selector } from "../../src/Blocks/selector";
import { SetProperty } from "../../src/Blocks/setProperty";
import { StringLiteral } from "../../src/Blocks/stringLiteral";
import { NodeAsset } from "../../src/nodeAsset";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { CreateTestGltfAsset } from "./testGltfAsset";

// The import/export blocks register the Draco encoder/decoder, so use the real module rather than the
// stub the global vitest setup installs for @dev/core.
vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

const FixtureTranslation: [number, number, number] = [1, 2, 3];

/**
 * Builds a tiny glb with one material and one translated node, so a SetProperty has a
 * `/materials/0/...` and a `/nodes/0/...` target to write.
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
    const material = document.createMaterial("mat0").setEmissiveFactor([0, 0, 0]).setBaseColorFactor([1, 1, 1, 1]);
    const primitive = document.createPrimitive().setAttribute("POSITION", position).setMaterial(material);
    const mesh = document.createMesh("mesh0").addPrimitive(primitive);
    const node = document.createNode("node0").setTranslation(FixtureTranslation).setMesh(mesh);
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
 * Runs ImportGLTF → SetProperty(pointer, value) → ExportGLTF over the fixture and re-parses the
 * result, so a write can be asserted purely through export + reparse (never block internals).
 * @param pointer - The glTF Object Model JSON Pointer to write.
 * @param value - The JSON value to write at the pointer.
 * @returns The re-parsed output document.
 */
async function RunSetPropertyGraphAsync(pointer: string, value: unknown): Promise<Document> {
    const asset = new NodeAsset("set-graph");
    const importer = new ImportGLTFBlock("import", asset);
    importer.data = await CreateFixtureGlbAsync();
    const pointerLiteral = new StringLiteral("ptr", asset);
    pointerLiteral.value = pointer;
    const valueLiteral = new JsonLiteral("val", asset);
    valueLiteral.value = value;
    const setter = new SetProperty("set", asset);
    const exporter = new ExportGLTFBlock("export", asset);

    importer.output.connectTo(setter.scene);
    pointerLiteral.output.connectTo(setter.pointer);
    valueLiteral.output.connectTo(setter.value);
    setter.output.connectTo(exporter.input);

    const glb = await asset.buildAsync();
    return await ReparseAsync(glb);
}

describe("SetProperty", () => {
    it("registers GLTF_DOCUMENT + STRING + JSON inputs and a GLTF_DOCUMENT output", () => {
        const asset = new NodeAsset("shape");
        const setter = new SetProperty("set", asset);

        expect(setter.inputs).toHaveLength(3);
        expect(setter.outputs).toHaveLength(1);
        expect(setter.scene.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
        expect(setter.pointer.type).toBe(NodeAssetConnectionPointType.STRING);
        expect(setter.value.type).toBe(NodeAssetConnectionPointType.JSON);
        expect(setter.output.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
    });

    it("recolours a material factor end-to-end (import -> set -> export -> reparse)", async () => {
        const reparsed = await RunSetPropertyGraphAsync("/materials/0/emissiveFactor", [1, 0, 0]);
        expect(reparsed.getRoot().listMaterials()[0].getEmissiveFactor()).toEqual([1, 0, 0]);
    });

    it("moves a node transform end-to-end", async () => {
        const reparsed = await RunSetPropertyGraphAsync("/nodes/0/translation", [5, 6, 7]);
        expect(reparsed.getRoot().listNodes()[0].getTranslation()).toEqual([5, 6, 7]);
    });

    it("writes an arbitrary extras key end-to-end (the set-extras use case)", async () => {
        const reparsed = await RunSetPropertyGraphAsync("/materials/0/extras/reviewedBy", { name: "nae", pass: true });
        expect(reparsed.getRoot().listMaterials()[0].getExtras().reviewedBy).toEqual({ name: "nae", pass: true });
    });

    it("passes the same in-place-mutated Document reference through on its output", async () => {
        const { Document } = await import("@gltf-transform/core");
        const document = new Document();
        document.createMaterial("mat0").setEmissiveFactor([0, 0, 0]);

        const setter = new SetProperty("set", new NodeAsset("passthrough"));
        const gltf = CreateTestGltfAsset(document);
        setter.scene.value = gltf;
        setter.pointer.value = "/materials/0/emissiveFactor";
        setter.value.value = [1, 0, 0];
        await setter._buildBlockAsync();

        // Same reference, mutated in place (no clone / copy-on-fan-out yet).
        expect(setter.output.value).toBe(gltf);
        expect(setter.output.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
        expect(document.getRoot().listMaterials()[0].getEmissiveFactor()).toEqual([1, 0, 0]);
    });

    it("can be chained after another SetProperty (both writes survive to export)", async () => {
        const asset = new NodeAsset("chain");
        const importer = new ImportGLTFBlock("import", asset);
        importer.data = await CreateFixtureGlbAsync();

        const movePointer = new StringLiteral("movePtr", asset);
        movePointer.value = "/nodes/0/translation";
        const moveValue = new JsonLiteral("moveVal", asset);
        moveValue.value = [5, 6, 7];
        const move = new SetProperty("move", asset);

        const colorPointer = new StringLiteral("colorPtr", asset);
        colorPointer.value = "/materials/0/emissiveFactor";
        const colorValue = new JsonLiteral("colorVal", asset);
        colorValue.value = [1, 0, 0];
        const color = new SetProperty("color", asset);

        const exporter = new ExportGLTFBlock("export", asset);

        importer.output.connectTo(move.scene);
        movePointer.output.connectTo(move.pointer);
        moveValue.output.connectTo(move.value);
        move.output.connectTo(color.scene);
        colorPointer.output.connectTo(color.pointer);
        colorValue.output.connectTo(color.value);
        color.output.connectTo(exporter.input);

        const reparsed = await ReparseAsync(await asset.buildAsync());
        expect(reparsed.getRoot().listNodes()[0].getTranslation()).toEqual([5, 6, 7]);
        expect(reparsed.getRoot().listMaterials()[0].getEmissiveFactor()).toEqual([1, 0, 0]);
    });

    it("uses a Selector's override pointer over its stored pointer end-to-end", async () => {
        const asset = new NodeAsset("override-e2e");
        const importer = new ImportGLTFBlock("import", asset);
        importer.data = await CreateFixtureGlbAsync();

        const override = new StringLiteral("override", asset);
        override.value = "/materials/0/emissiveFactor";
        const selector = new Selector("selector", asset);
        selector.pointer = "/nodes/0/translation"; // stored pointer, should lose to the override
        override.output.connectTo(selector.pointerOverride);

        const value = new JsonLiteral("value", asset);
        value.value = [1, 0, 0];
        const setter = new SetProperty("set", asset);
        const exporter = new ExportGLTFBlock("export", asset);

        importer.output.connectTo(setter.scene);
        selector.output.connectTo(setter.pointer);
        value.output.connectTo(setter.value);
        setter.output.connectTo(exporter.input);

        const reparsed = await ReparseAsync(await asset.buildAsync());
        // The override pointer recoloured the material...
        expect(reparsed.getRoot().listMaterials()[0].getEmissiveFactor()).toEqual([1, 0, 0]);
        // ...and the stored pointer's target (the node translation) is untouched.
        expect(reparsed.getRoot().listNodes()[0].getTranslation()).toEqual(FixtureTranslation);
    });

    it("builds when a Selector's optional override is left unconnected, using the stored pointer", async () => {
        const asset = new NodeAsset("optional-e2e");
        const importer = new ImportGLTFBlock("import", asset);
        importer.data = await CreateFixtureGlbAsync();

        const selector = new Selector("selector", asset);
        selector.pointer = "/materials/0/emissiveFactor"; // stored pointer; override intentionally unconnected

        const value = new JsonLiteral("value", asset);
        value.value = [1, 0, 0];
        const setter = new SetProperty("set", asset);
        const exporter = new ExportGLTFBlock("export", asset);

        importer.output.connectTo(setter.scene);
        selector.output.connectTo(setter.pointer);
        value.output.connectTo(setter.value);
        setter.output.connectTo(exporter.input);

        // The unconnected optional override must not make the graph build throw "not connected".
        const reparsed = await ReparseAsync(await asset.buildAsync());
        expect(reparsed.getRoot().listMaterials()[0].getEmissiveFactor()).toEqual([1, 0, 0]);
    });

    it("fails the build with the converter's clear error on a bad pointer", async () => {
        const { Document } = await import("@gltf-transform/core");
        const document = new Document();
        document.createNode("node0");

        const setter = new SetProperty("set", new NodeAsset("bad-pointer"));
        setter.scene.value = CreateTestGltfAsset(document);
        setter.pointer.value = "/nodes/99/translation";
        setter.value.value = [1, 2, 3];

        await expect(setter._buildBlockAsync()).rejects.toThrow("/nodes/99/translation");
        await expect(setter._buildBlockAsync()).rejects.toThrow(/out of range/);
    });

    it("rejects texture accessors and non-JSON runtime values", async () => {
        const { Document } = await import("@gltf-transform/core");
        const document = new Document();
        document.createMaterial("mat0");

        const setter = new SetProperty("set", new NodeAsset("non-json"));
        setter.scene.value = CreateTestGltfAsset(document);
        setter.pointer.value = "/materials/0/pbrMetallicRoughness/baseColorTexture";
        setter.value.value = null;
        await expect(setter._buildBlockAsync()).rejects.toThrow(/JSON-compatible/);

        setter.pointer.value = "/materials/0/extras/value";
        setter.value.value = undefined;
        await expect(setter._buildBlockAsync()).rejects.toThrow(/JSON-compatible/);
    });

    it("throws when the input document is missing", async () => {
        const setter = new SetProperty("set", new NodeAsset("missing"));
        setter.pointer.value = "/materials/0/emissiveFactor";
        setter.value.value = [1, 0, 0];

        expect(setter.scene.value).toBeNull();
        await expect(setter._buildBlockAsync()).rejects.toThrow();
    });

    it("round-trips its identity through save/load", () => {
        const asset = new NodeAsset("roundtrip");
        new SetProperty("set", asset);

        const serialized = JSON.parse(JSON.stringify(asset.serialize()));
        const parsed = NodeAsset.Parse(serialized);

        expect(parsed.attachedBlocks).toHaveLength(1);
        expect(parsed.attachedBlocks[0].getClassName()).toBe(SetProperty.ClassName);
    });
});
