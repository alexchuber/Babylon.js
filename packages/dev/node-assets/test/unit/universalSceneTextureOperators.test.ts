import { Document, getBounds, ImageUtils, WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { DecodeBase64ToBinary } from "core/Misc/stringTools";
import { describe, expect, it, vi } from "vitest";

import { ExportGLTFAggregateBlock } from "../../src/Blocks/exportGLTFAggregateBlock";
import { CenterSceneBlock } from "../../src/Blocks/centerSceneBlock";
import { ImportGLTFAggregateBlock } from "../../src/Blocks/importGLTFAggregateBlock";
import { ResizeTexturesBlock } from "../../src/Blocks/resizeTexturesBlock";
import { TransformSceneBlock } from "../../src/Blocks/transformSceneBlock";
import { NodeAsset } from "../../src/nodeAsset";

vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

const FourByTwoPng = new Uint8Array(DecodeBase64ToBinary("iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAAB/qH1jAAAAEklEQVR4nGP4z8DwHxkzoAsAAA8hD/EEN8afAAAAAElFTkSuQmCC"));

async function CreateTransformFixtureGlbAsync(): Promise<Uint8Array> {
    const document = new Document();
    const buffer = document.createBuffer();
    const positions = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 100, 0, 0, 0, 0, 100]))
        .setBuffer(buffer);
    const primitive = document.createPrimitive().setAttribute("POSITION", positions);
    const mesh = document.createMesh("triangle").addPrimitive(primitive);
    document.createScene("scene").addChild(document.createNode("triangle").setMesh(mesh));
    return await new WebIO().registerExtensions(ALL_EXTENSIONS).writeBinary(document);
}

async function CreateCenterFixtureGlbAsync(): Promise<Uint8Array> {
    const document = new Document();
    const buffer = document.createBuffer();
    const positions = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([10, 2, 0, 14, 2, 0, 10, 8, 0]))
        .setBuffer(buffer);
    const primitive = document.createPrimitive().setAttribute("POSITION", positions);
    const mesh = document.createMesh("triangle").addPrimitive(primitive);
    document.createScene("scene").addChild(document.createNode("triangle").setMesh(mesh));
    return await new WebIO().registerExtensions(ALL_EXTENSIONS).writeBinary(document);
}

async function CreateGeometrylessFixtureGlbAsync(): Promise<Uint8Array> {
    const document = new Document();
    document.createScene("scene").addChild(document.createNode("empty"));
    return await new WebIO().registerExtensions(ALL_EXTENSIONS).writeBinary(document);
}

async function CreateTexturedFixtureGlbAsync(): Promise<Uint8Array> {
    const document = new Document();
    const buffer = document.createBuffer();
    const positions = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
        .setBuffer(buffer);
    const texture = document.createTexture("four-by-two").setImage(FourByTwoPng).setMimeType("image/png");
    const material = document.createMaterial("material").setBaseColorTexture(texture);
    const primitive = document.createPrimitive().setAttribute("POSITION", positions).setMaterial(material);
    const mesh = document.createMesh("triangle").addPrimitive(primitive);
    document.createScene("scene").addChild(document.createNode("triangle").setMesh(mesh));
    return await new WebIO().registerExtensions(ALL_EXTENSIONS).writeBinary(document);
}

describe("Universal scene and texture operators", () => {
    it("normalizes source units and up axis before applying authored scale and rotation", async () => {
        const nodeAsset = new NodeAsset("transform-scene");
        const input = new ImportGLTFAggregateBlock("Import glTF", nodeAsset);
        input.data = await CreateTransformFixtureGlbAsync();
        input.source = "fixture.glb";
        const transform = new TransformSceneBlock("Transform Scene", nodeAsset);
        transform.units = "centimeters";
        transform.upAxis = "Z";
        transform.scale = [2, 3, 4];
        transform.rotation = [0, 0, 90];
        const output = new ExportGLTFAggregateBlock("Export glTF", nodeAsset);
        input.output.connectTo(transform.input);
        transform.output.connectTo(output.input);

        const result = await nodeAsset.buildAsync();
        const built = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(result);
        const bounds = getBounds(built.getRoot().listScenes()[0]);

        expect(bounds.min.map((value) => Math.round(value * 1000) / 1000)).toEqual([-3, 0, 0]);
        expect(bounds.max.map((value) => Math.round(value * 1000) / 1000)).toEqual([0, 2, 0]);
    });

    it("round-trips Transform Scene properties and rejects malformed serialized transforms", () => {
        const nodeAsset = new NodeAsset("transform-serialization");
        const transform = new TransformSceneBlock("Transform Scene", nodeAsset);
        transform.units = "feet";
        transform.scale = [2, 3, 4];
        transform.rotation = [10, 20, 30];
        transform.upAxis = "X";

        const serialized = nodeAsset.serialize();
        const parsed = NodeAsset.Parse(JSON.parse(JSON.stringify(serialized)));
        const parsedTransform = parsed.attachedBlocks[0] as TransformSceneBlock;

        expect(parsedTransform.units).toBe("feet");
        expect(parsedTransform.scale).toEqual([2, 3, 4]);
        expect(parsedTransform.rotation).toEqual([10, 20, 30]);
        expect(parsedTransform.upAxis).toBe("X");

        expect(() =>
            NodeAsset.Parse({
                ...serialized,
                blocks: [{ ...serialized.blocks[0], scale: [1, 2] }],
            })
        ).toThrow("Invalid serialized block property");
    });

    it("does not add hierarchy nodes when Transform Scene uses its identity defaults", async () => {
        const nodeAsset = new NodeAsset("identity-transform");
        const input = new ImportGLTFAggregateBlock("Import glTF", nodeAsset);
        input.data = await CreateTransformFixtureGlbAsync();
        input.source = "fixture.glb";
        const transform = new TransformSceneBlock("Transform Scene", nodeAsset);
        const output = new ExportGLTFAggregateBlock("Export glTF", nodeAsset);
        input.output.connectTo(transform.input);
        transform.output.connectTo(output.input);

        const result = await nodeAsset.buildAsync();
        const built = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(result);

        expect(
            built
                .getRoot()
                .listNodes()
                .map((node) => node.getName())
        ).toEqual(["triangle"]);
    });

    it.each([
        { pivot: "center", customPoint: [0, 0, 0], expectedMin: [-2, -3, 0], expectedMax: [2, 3, 0] },
        { pivot: "above", customPoint: [0, 0, 0], expectedMin: [-2, -6, 0], expectedMax: [2, 0, 0] },
        { pivot: "below", customPoint: [0, 0, 0], expectedMin: [-2, 0, 0], expectedMax: [2, 6, 0] },
        { pivot: "custom-point", customPoint: [10, 2, 0], expectedMin: [0, 0, 0], expectedMax: [4, 6, 0] },
    ] as const)("places the $pivot pivot at the origin without mutating its authored settings", async ({ pivot, customPoint, expectedMin, expectedMax }) => {
        const nodeAsset = new NodeAsset(`center-${pivot}`);
        const input = new ImportGLTFAggregateBlock("Import glTF", nodeAsset);
        input.data = await CreateCenterFixtureGlbAsync();
        input.source = "fixture.glb";
        const center = new CenterSceneBlock("Center Scene", nodeAsset);
        center.pivot = pivot;
        center.customPoint = [...customPoint];
        const output = new ExportGLTFAggregateBlock("Export glTF", nodeAsset);
        input.output.connectTo(center.input);
        center.output.connectTo(output.input);

        const result = await nodeAsset.buildAsync();
        const built = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(result);
        const bounds = getBounds(built.getRoot().listScenes()[0]);

        expect(bounds.min).toEqual(expectedMin);
        expect(bounds.max).toEqual(expectedMax);
        expect(center.pivot).toBe(pivot);
        expect(center.customPoint).toEqual(customPoint);
    });

    it("round-trips Center Scene properties and rejects unknown pivot modes", () => {
        const nodeAsset = new NodeAsset("center-serialization");
        const center = new CenterSceneBlock("Center Scene", nodeAsset);
        center.pivot = "custom-point";
        center.customPoint = [1, 2, 3];

        const serialized = nodeAsset.serialize();
        const parsed = NodeAsset.Parse(JSON.parse(JSON.stringify(serialized)));
        const parsedCenter = parsed.attachedBlocks[0] as CenterSceneBlock;

        expect(parsedCenter.pivot).toBe("custom-point");
        expect(parsedCenter.customPoint).toEqual([1, 2, 3]);
        expect(() =>
            NodeAsset.Parse({
                ...serialized,
                blocks: [{ ...serialized.blocks[0], pivot: "bounds" }],
            })
        ).toThrow("Invalid serialized block property");
    });

    it("does not add a non-finite bounds-derived offset to geometryless scenes", async () => {
        const nodeAsset = new NodeAsset("center-geometryless");
        const input = new ImportGLTFAggregateBlock("Import glTF", nodeAsset);
        input.data = await CreateGeometrylessFixtureGlbAsync();
        input.source = "fixture.glb";
        const center = new CenterSceneBlock("Center Scene", nodeAsset);
        const output = new ExportGLTFAggregateBlock("Export glTF", nodeAsset);
        input.output.connectTo(center.input);
        center.output.connectTo(output.input);

        const result = await nodeAsset.buildAsync();
        const built = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(result);

        expect(
            built
                .getRoot()
                .listNodes()
                .map((node) => node.getName())
        ).toEqual(["empty"]);
        expect(built.getRoot().listNodes()[0].getTranslation().every(Number.isFinite)).toBe(true);
    });

    it("reduces in-document texture dimensions through Universal without exposing an Image connection", async () => {
        const nodeAsset = new NodeAsset("resize-textures");
        const input = new ImportGLTFAggregateBlock("Import glTF", nodeAsset);
        input.data = await CreateTexturedFixtureGlbAsync();
        input.source = "fixture.glb";
        const resize = new ResizeTexturesBlock("Resize Textures", nodeAsset);
        resize.maximumWidth = 2;
        resize.maximumHeight = 2;
        resize.resizeMode = "smooth";
        const output = new ExportGLTFAggregateBlock("Export glTF", nodeAsset);
        input.output.connectTo(resize.input);
        resize.output.connectTo(output.input);

        const result = await nodeAsset.buildAsync();
        const built = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(result);
        const builtTexture = built.getRoot().listTextures()[0];

        expect(ImageUtils.getSize(builtTexture.getImage()!, builtTexture.getMimeType())).toEqual([2, 1]);
        expect(resize.input.type).toBe(resize.output.type);
        expect(resize.inputs).toHaveLength(1);
        expect(resize.outputs).toHaveLength(1);
    });

    it("round-trips Resize Textures properties and rejects invalid dimensions and modes", () => {
        const nodeAsset = new NodeAsset("resize-serialization");
        const resize = new ResizeTexturesBlock("Resize Textures", nodeAsset);
        resize.maximumWidth = 1024;
        resize.maximumHeight = 512;
        resize.resizeMode = "smooth";

        const serialized = nodeAsset.serialize();
        const parsed = NodeAsset.Parse(JSON.parse(JSON.stringify(serialized)));
        const parsedResize = parsed.attachedBlocks[0] as ResizeTexturesBlock;

        expect(parsedResize.maximumWidth).toBe(1024);
        expect(parsedResize.maximumHeight).toBe(512);
        expect(parsedResize.resizeMode).toBe("smooth");
        expect(() =>
            NodeAsset.Parse({
                ...serialized,
                blocks: [{ ...serialized.blocks[0], maximumWidth: 0 }],
            })
        ).toThrow("Invalid serialized block property");
        expect(() =>
            NodeAsset.Parse({
                ...serialized,
                blocks: [{ ...serialized.blocks[0], resizeMode: "nearest" }],
            })
        ).toThrow("Invalid serialized block property");
    });

    it("leaves textures already within the maximum dimensions byte-identical", async () => {
        const nodeAsset = new NodeAsset("preserve-small-textures");
        const input = new ImportGLTFAggregateBlock("Import glTF", nodeAsset);
        input.data = await CreateTexturedFixtureGlbAsync();
        input.source = "fixture.glb";
        const resize = new ResizeTexturesBlock("Resize Textures", nodeAsset);
        resize.maximumWidth = 8;
        resize.maximumHeight = 8;
        const output = new ExportGLTFAggregateBlock("Export glTF", nodeAsset);
        input.output.connectTo(resize.input);
        resize.output.connectTo(output.input);

        const result = await nodeAsset.buildAsync();
        const built = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(result);

        expect(built.getRoot().listTextures()[0].getImage()).toEqual(FourByTwoPng);
    });

    it("composes the three ordered Universal decisions between aggregate import and export", async () => {
        const nodeAsset = new NodeAsset("ordered-universal-operators");
        const input = new ImportGLTFAggregateBlock("Import glTF", nodeAsset);
        input.data = await CreateTexturedFixtureGlbAsync();
        input.source = "fixture.glb";
        const transform = new TransformSceneBlock("Transform Scene", nodeAsset);
        transform.scale = [2, 1, 1];
        const center = new CenterSceneBlock("Center Scene", nodeAsset);
        center.pivot = "below";
        const resize = new ResizeTexturesBlock("Resize Textures", nodeAsset);
        resize.maximumWidth = 2;
        resize.maximumHeight = 2;
        const output = new ExportGLTFAggregateBlock("Export glTF", nodeAsset);
        input.output.connectTo(transform.input);
        transform.output.connectTo(center.input);
        center.output.connectTo(resize.input);
        resize.output.connectTo(output.input);

        const result = await nodeAsset.buildAsync();
        const built = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(result);
        const bounds = getBounds(built.getRoot().listScenes()[0]);
        const texture = built.getRoot().listTextures()[0];
        const authoredTransform = built
            .getRoot()
            .listNodes()
            .find((node) => node.getName() === "Authored transform");
        const boundsDerivedCentering = built
            .getRoot()
            .listNodes()
            .find((node) => node.getName() === "Bounds-derived centering");

        expect(result.byteLength).toBeGreaterThan(0);
        expect(bounds.min).toEqual([-1, 0, 0]);
        expect(bounds.max).toEqual([1, 1, 0]);
        expect(ImageUtils.getSize(texture.getImage()!, texture.getMimeType())).toEqual([2, 1]);
        expect(authoredTransform).toBeDefined();
        expect(boundsDerivedCentering).toBeDefined();
        expect(authoredTransform!.listParents()).toContain(boundsDerivedCentering);
    });
});
