import { EncodeArrayBufferToBase64 } from "core/Misc/stringTools";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { ExportGLTFBlock } from "../../src/Blocks/exportGLTFBlock";
import { ImportGLTFBlock } from "../../src/Blocks/importGLTFBlock";
import { MergeScenes } from "../../src/Blocks/mergeScenes";
import { NodeAsset } from "../../src/nodeAsset";
import { type NodeAssetSerializedGraph } from "../../src/serialization/nodeAssetSerialization";

vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

async function CreateFixtureGlbAsync(): Promise<Uint8Array> {
    const { Document, WebIO } = await import("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");

    const document = new Document();
    const node = document.createNode("legacy-node");
    document.createScene("legacy-scene").addChild(node);

    const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
    return await io.writeBinary(document);
}

describe("serialized graph schema", () => {
    it("exposes a named JSON graph result and accepts unknown input", () => {
        expectTypeOf<NodeAsset["serialize"]>().returns.toEqualTypeOf<NodeAssetSerializedGraph>();
        expectTypeOf(NodeAsset.Parse).parameter(0).toEqualTypeOf<unknown>();
    });

    it("loads, builds, and roundtrips a legacy raw graph without transforming the input", async () => {
        const glb = await CreateFixtureGlbAsync();
        const rawGraph = {
            name: "legacy-raw",
            blocks: [
                {
                    customType: ImportGLTFBlock.ClassName,
                    id: 100,
                    name: "import",
                    data: EncodeArrayBufferToBase64(glb),
                    source: "legacy.glb",
                },
                {
                    customType: ExportGLTFBlock.ClassName,
                    id: 101,
                    name: "export",
                },
            ],
            connections: [
                {
                    fromBlock: 100,
                    fromPoint: "output",
                    toBlock: 101,
                    toPoint: "input",
                },
            ],
        } satisfies NodeAssetSerializedGraph;
        const originalJson = JSON.stringify(rawGraph);

        const parsed = NodeAsset.Parse(JSON.parse(originalJson) as unknown);

        expect(JSON.stringify(rawGraph)).toBe(originalJson);
        expect(parsed.serialize()).toEqual(rawGraph);
        expect(NodeAsset.Parse(parsed.serialize()).serialize()).toEqual(rawGraph);
        expect(JSON.stringify(parsed.serialize())).not.toContain("SCENE");

        const result = await parsed.buildAsync();
        expect(result.length).toBeGreaterThan(0);
    });

    it.each([
        null,
        [],
        { name: "invalid", blocks: {}, connections: [] },
        { name: "invalid", blocks: [{ customType: "ImportGLTFBlock", id: "1", name: "import" }], connections: [] },
        { name: "invalid", blocks: [], connections: [{ fromBlock: 1 }] },
    ])("rejects invalid raw input safely", (rawGraph) => {
        expect(() => NodeAsset.Parse(rawGraph)).toThrow("Invalid NodeAsset serialized graph");
    });

    it.each([-1, 1.5, 257])("rejects unsafe MergeScenes input counts", (inputCount) => {
        expect(() =>
            NodeAsset.Parse({
                name: "invalid-merge",
                blocks: [{ customType: MergeScenes.ClassName, id: 1, name: "merge", inputCount }],
                connections: [],
            })
        ).toThrow("Invalid serialized block property");
    });

    it.each([
        {
            name: "duplicate-ids",
            blocks: [
                { customType: ImportGLTFBlock.ClassName, id: 1, name: "a", data: null, source: null },
                { customType: ExportGLTFBlock.ClassName, id: 1, name: "b" },
            ],
            connections: [],
        },
        {
            name: "missing-block",
            blocks: [{ customType: ImportGLTFBlock.ClassName, id: 1, name: "a", data: null, source: null }],
            connections: [{ fromBlock: 1, fromPoint: "output", toBlock: 2, toPoint: "input" }],
        },
        {
            name: "missing-point",
            blocks: [
                { customType: ImportGLTFBlock.ClassName, id: 1, name: "a", data: null, source: null },
                { customType: ExportGLTFBlock.ClassName, id: 2, name: "b" },
            ],
            connections: [{ fromBlock: 1, fromPoint: "not-output", toBlock: 2, toPoint: "input" }],
        },
        {
            name: "multiple-sources",
            blocks: [
                { customType: ImportGLTFBlock.ClassName, id: 1, name: "a", data: null, source: null },
                { customType: ImportGLTFBlock.ClassName, id: 2, name: "b", data: null, source: null },
                { customType: ExportGLTFBlock.ClassName, id: 3, name: "out" },
            ],
            connections: [
                { fromBlock: 1, fromPoint: "output", toBlock: 3, toPoint: "input" },
                { fromBlock: 2, fromPoint: "output", toBlock: 3, toPoint: "input" },
            ],
        },
    ])("rejects structurally lossy graph relationships", (rawGraph) => {
        expect(() => NodeAsset.Parse(rawGraph)).toThrow("Invalid NodeAsset serialized graph");
    });

    it("rejects cyclic unknown input without recursing indefinitely", () => {
        const cyclicBlock: { customType: string; id: number; name: string; cycle?: unknown } = {
            customType: ImportGLTFBlock.ClassName,
            id: 1,
            name: "import",
        };
        cyclicBlock.cycle = cyclicBlock;
        const rawGraph = {
            name: "cyclic",
            blocks: [cyclicBlock],
            connections: [],
        };

        expect(() => NodeAsset.Parse(rawGraph)).toThrow("Invalid NodeAsset serialized graph");
    });
});
