import { type Document } from "@gltf-transform/core";
import { describe, expect, it, vi } from "vitest";

import { ExportGLTFBlock } from "../../src/Blocks/exportGLTFBlock";
import { GetProperty } from "../../src/Blocks/getProperty";
import { ImportGLTFBlock } from "../../src/Blocks/importGLTFBlock";
import { SetProperty } from "../../src/Blocks/setProperty";
import { NodeAsset } from "../../src/nodeAsset";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { type GltfAsset } from "../../src/representations/gltfAsset";
import { GetTestGltfDocument } from "./testGltfAsset";

// The import/export blocks register the Draco encoder/decoder, so use the real module rather than the
// stub the global vitest setup installs for @dev/core.
vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

const FixtureEmissive: [number, number, number] = [0.25, 0.5, 0.75];
const FixtureTranslation: [number, number, number] = [1, 2, 3];

/**
 * Builds a tiny glb with one material (a non-trivial emissive factor) and one node (a non-trivial
 * translation), so a GetProperty has meaningful values to read at `/materials/0/...` and `/nodes/0/...`.
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
    const material = document.createMaterial("mat0").setEmissiveFactor(FixtureEmissive).setBaseColorFactor([1, 1, 1, 1]);
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
 * Imports the fixture glb into a live `Document` through the real import block.
 * @param asset - The owning node asset.
 * @returns The imported document.
 */
async function ImportFixtureAsync(asset: NodeAsset): Promise<GltfAsset> {
    const importer = new ImportGLTFBlock("import", asset);
    importer.data = await CreateFixtureGlbAsync();
    await importer._buildBlockAsync();
    return importer.output.value as GltfAsset;
}

describe("GetProperty", () => {
    it("registers GLTF_DOCUMENT + STRING inputs and a JSON output", () => {
        const asset = new NodeAsset("shape");
        const getter = new GetProperty("get", asset);

        expect(getter.inputs).toHaveLength(2);
        expect(getter.outputs).toHaveLength(1);
        expect(getter.scene.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
        expect(getter.pointer.type).toBe(NodeAssetConnectionPointType.STRING);
        expect(getter.output.type).toBe(NodeAssetConnectionPointType.JSON);
    });

    it("reads the value at the pointer and neither mutates nor outputs the SCENE", async () => {
        const asset = new NodeAsset("read");
        const gltf = await ImportFixtureAsync(asset);

        const getter = new GetProperty("get", asset);
        getter.scene.value = gltf;
        getter.pointer.value = "/materials/0/emissiveFactor";
        await getter._buildBlockAsync();

        expect(getter.output.value).toEqual(FixtureEmissive);
        // It reads: the SCENE is untouched and is not re-emitted on the (JSON) output.
        expect(getter.output.type).toBe(NodeAssetConnectionPointType.JSON);
        expect(gltf.document.getRoot().listMaterials()[0].getEmissiveFactor()).toEqual(FixtureEmissive);
    });

    it("observes a material-factor read through the SCENE seam (get -> set-into-extras -> export -> reparse)", async () => {
        const asset = new NodeAsset("read-through-material");
        const gltf = await ImportFixtureAsync(asset);

        const getter = new GetProperty("get", asset);
        getter.scene.value = gltf;
        getter.pointer.value = "/materials/0/emissiveFactor";
        await getter._buildBlockAsync();

        const setter = new SetProperty("set", asset);
        setter.scene.value = gltf;
        setter.pointer.value = "/materials/0/extras/copiedEmissive";
        setter.value.value = getter.output.value;
        await setter._buildBlockAsync();

        const exporter = new ExportGLTFBlock("export", asset);
        exporter.input.value = setter.output.value;
        await exporter._buildBlockAsync();

        const reparsed = await ReparseAsync(exporter.result!);
        const material = reparsed.getRoot().listMaterials()[0];
        expect(material.getExtras().copiedEmissive).toEqual(FixtureEmissive);
        // The copy equals the property still living on the SCENE, proving the read came from the seam.
        expect(material.getExtras().copiedEmissive).toEqual(material.getEmissiveFactor());
    });

    it("generalises the read past materials to a node transform", async () => {
        const asset = new NodeAsset("read-through-node");
        const gltf = await ImportFixtureAsync(asset);

        const getter = new GetProperty("get", asset);
        getter.scene.value = gltf;
        getter.pointer.value = "/nodes/0/translation";
        await getter._buildBlockAsync();

        const setter = new SetProperty("set", asset);
        setter.scene.value = gltf;
        setter.pointer.value = "/nodes/0/extras/copiedTranslation";
        setter.value.value = getter.output.value;
        await setter._buildBlockAsync();

        const exporter = new ExportGLTFBlock("export", asset);
        exporter.input.value = setter.output.value;
        await exporter._buildBlockAsync();

        const reparsed = await ReparseAsync(exporter.result!);
        expect(reparsed.getRoot().listNodes()[0].getExtras().copiedTranslation).toEqual(FixtureTranslation);
    });

    it("fails the build with the converter's clear error on a bad pointer", async () => {
        const asset = new NodeAsset("bad-pointer");
        const gltf = await ImportFixtureAsync(asset);

        const getter = new GetProperty("get", asset);
        getter.scene.value = gltf;
        getter.pointer.value = "/nodes/99/translation";

        await expect(getter._buildBlockAsync()).rejects.toThrow("/nodes/99/translation");
        await expect(getter._buildBlockAsync()).rejects.toThrow(/out of range/);
    });

    it("rejects texture handles and missing extras values that cannot travel on a JSON port", async () => {
        const asset = new NodeAsset("non-json");
        const gltf = await ImportFixtureAsync(asset);
        const getter = new GetProperty("get", asset);
        getter.scene.value = gltf;

        getter.pointer.value = "/materials/0/pbrMetallicRoughness/baseColorTexture";
        await expect(getter._buildBlockAsync()).rejects.toThrow(/JSON-compatible/);

        getter.pointer.value = "/materials/0/extras/missing";
        await expect(getter._buildBlockAsync()).rejects.toThrow(/JSON-compatible/);
    });

    it("throws when the input document is missing", async () => {
        const asset = new NodeAsset("missing");
        const getter = new GetProperty("get", asset);
        getter.pointer.value = "/materials/0/emissiveFactor";

        expect(getter.scene.value).toBeNull();
        await expect(getter._buildBlockAsync()).rejects.toThrow();
    });

    it("round-trips its identity through save/load", () => {
        const asset = new NodeAsset("roundtrip");
        new GetProperty("get", asset);

        const serialized = JSON.parse(JSON.stringify(asset.serialize()));
        const parsed = NodeAsset.Parse(serialized);

        expect(parsed.attachedBlocks).toHaveLength(1);
        expect(parsed.attachedBlocks[0].getClassName()).toBe(GetProperty.ClassName);
    });
});
