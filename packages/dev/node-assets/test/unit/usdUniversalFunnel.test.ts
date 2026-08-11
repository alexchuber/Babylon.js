import { WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { describe, expect, it, vi } from "vitest";

import { ExportGLTFAggregateBlock } from "../../src/Blocks/exportGLTFAggregateBlock";
import { ImportUSDAggregateBlock } from "../../src/Blocks/importUSDAggregateBlock";
import { USDInputBlock } from "../../src/Blocks/usdInputBlock";
import { UniversalToGLTFBlock } from "../../src/Blocks/universalToGLTFBlock";
import { USD2BabylonBlock } from "../../src/Blocks/usd2BabylonBlock";
import { USD2GLTFBlock } from "../../src/Blocks/usd2GLTFBlock";
import { USDToUniversalBlock } from "../../src/Blocks/usdToUniversalBlock";
import { GLTFOutputBlock } from "../../src/Blocks/gltfOutputBlock";
import { NodeAssetBlock } from "../../src/blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../../src/connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";

const TriangleUsda = `#usda 1.0
(
    defaultPrim = "World"
    upAxis = "Y"
    metersPerUnit = 1
)

def Xform "World"
{
    def Mesh "Triangle"
    {
        int[] faceVertexCounts = [3]
        int[] faceVertexIndices = [0, 1, 2]
        point3f[] points = [(0, 0, 0), (2, 0, 0), (0, 2, 0)]
    }
}
`;

const TriangleUsdBytes = new TextEncoder().encode(TriangleUsda);

vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

class RepresentativeUniversalOperator extends NodeAssetBlock {
    public static override ClassName = "RepresentativeUniversalOperator";

    public readonly input: NodeAssetConnectionPoint;
    public readonly output: NodeAssetConnectionPoint;

    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.UNIVERSAL);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    public override async _buildBlockAsync(): Promise<void> {
        this.output.value = this.input.value;
    }
}

async function ReadAssetFactsAsync(glb: Uint8Array): Promise<{ scenes: string[]; nodes: string[]; meshes: number; indices: number }> {
    const document = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(glb);
    const root = document.getRoot();
    return {
        scenes: root.listScenes().map((scene) => scene.getName()),
        nodes: root.listNodes().map((node) => node.getName()),
        meshes: root.listMeshes().length,
        indices: root.listMeshes()[0].listPrimitives()[0].getIndices()?.getCount() ?? 0,
    };
}

describe("USD Universal funnel", () => {
    it("rejects a build before parsing when the USD input block has no active source", async () => {
        const asset = new NodeAsset("missing-usd-source");
        const read = new USDInputBlock("USD", asset);
        const toUniversal = new USDToUniversalBlock("USD → Universal", asset);
        const exporter = new ExportGLTFAggregateBlock("Export glTF", asset);
        read.output.connectTo(toUniversal.input);
        toUniversal.output.connectTo(exporter.input);

        await expect(asset.buildAsync()).rejects.toThrow(/has no USD source/);
    });

    it("keeps the lightweight USD source kind isolated from legacy USD, glTF, Babylon, and Universal inputs", () => {
        const asset = new NodeAsset("typed-usd-source");
        const read = new USDInputBlock("USD", asset);
        const toUniversal = new USDToUniversalBlock("USD → Universal", asset);

        expect(read.output.type).toBe(NodeAssetConnectionPointType.USD_SOURCE);
        expect(toUniversal.input.type).toBe(NodeAssetConnectionPointType.USD_SOURCE);
        expect(toUniversal.output.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
        expect(() => read.output.connectTo(new USD2GLTFBlock("legacy USD to glTF", asset).input)).toThrow(/incompatible connection point types/);
        expect(() => read.output.connectTo(new USD2BabylonBlock("legacy USD to Babylon", asset).input)).toThrow(/incompatible connection point types/);
        expect(() => read.output.connectTo(new UniversalToGLTFBlock("Universal → glTF", asset).input)).toThrow(/incompatible connection point types/);
        expect(() => read.output.connectTo(new GLTFOutputBlock("glTF", asset).input)).toThrow(/incompatible connection point types/);
        expect(() => read.output.connectTo(toUniversal.input)).not.toThrow();
    });

    it("builds a valid GLB through the USD input block and USD → Universal and matches the Import USD aggregate", async () => {
        const primitiveAsset = new NodeAsset("primitive-usd-funnel");
        const read = new USDInputBlock("USD", primitiveAsset);
        read.setUploadedSource(TriangleUsdBytes, "triangle.usda");
        const toUniversal = new USDToUniversalBlock("USD → Universal", primitiveAsset);
        const primitiveOperator = new RepresentativeUniversalOperator("Universal operator", primitiveAsset);
        const primitiveExport = new ExportGLTFAggregateBlock("Export glTF", primitiveAsset);
        read.output.connectTo(toUniversal.input);
        toUniversal.output.connectTo(primitiveOperator.input);
        primitiveOperator.output.connectTo(primitiveExport.input);

        const aggregateAsset = new NodeAsset("aggregate-usd-funnel");
        const importer = new ImportUSDAggregateBlock("Import USD", aggregateAsset);
        importer.setUploadedSource(TriangleUsdBytes, "triangle.usda");
        const aggregateOperator = new RepresentativeUniversalOperator("Universal operator", aggregateAsset);
        const aggregateExport = new ExportGLTFAggregateBlock("Export glTF", aggregateAsset);
        importer.output.connectTo(aggregateOperator.input);
        aggregateOperator.output.connectTo(aggregateExport.input);

        const primitiveResult = await primitiveAsset.buildAsync();
        const aggregateResult = await aggregateAsset.buildAsync();
        const expectedFacts = {
            scenes: ["USD"],
            nodes: ["Triangle", "World"],
            meshes: 1,
            indices: 3,
        };

        expect(primitiveResult.subarray(0, 4)).toEqual(new TextEncoder().encode("glTF"));
        expect(await ReadAssetFactsAsync(primitiveResult)).toEqual(expectedFacts);
        expect(await ReadAssetFactsAsync(aggregateResult)).toEqual(expectedFacts);
    });

    it("round-trips the aggregate source and typed subgraph through graph serialization", async () => {
        const asset = new NodeAsset("serialized-usd-funnel");
        const importer = new ImportUSDAggregateBlock("Import USD", asset);
        importer.setUploadedSource(TriangleUsdBytes, "triangle.usda");
        const exporter = new ExportGLTFAggregateBlock("Export glTF", asset);
        importer.output.connectTo(exporter.input);

        const serialized = JSON.parse(JSON.stringify(asset.serialize()));
        expect(serialized.blocks[0]).toMatchObject({
            customType: ImportUSDAggregateBlock.ClassName,
            aggregateVersion: 1,
            subgraph: {
                blocks: [
                    {
                        customType: USDInputBlock.ClassName,
                        source: "triangle.usda",
                        sourceKind: "upload",
                    },
                    { customType: USDToUniversalBlock.ClassName },
                ],
            },
        });

        const parsed = NodeAsset.Parse(serialized);
        const parsedImporter = parsed.attachedBlocks[0] as ImportUSDAggregateBlock;
        expect(parsedImporter.source).toBe("triangle.usda");
        expect(parsedImporter.sourceKind).toBe("upload");
        expect(parsedImporter.data).toEqual(TriangleUsdBytes);
        expect(await ReadAssetFactsAsync(await parsed.buildAsync())).toMatchObject({ meshes: 1, indices: 3 });
    });

    it("keeps the last successful URL or upload active and ignores stale URL completions", async () => {
        const asset = new NodeAsset("usd-source-choice");
        const read = new USDInputBlock("USD", asset);
        let resolveResponse: ((response: { ok: boolean; status: number; statusText: string; arrayBuffer: () => Promise<ArrayBuffer> }) => void) | undefined;

        read.setUploadedSource(new Uint8Array([1]), "first.usda");
        await expect(
            read.setUrlAsync("https://example.invalid/missing.usda", async () => ({
                ok: false,
                status: 404,
                statusText: "Not Found",
                arrayBuffer: async () => new ArrayBuffer(0),
            }))
        ).rejects.toThrow(/404 Not Found/);
        expect(read.source).toBe("first.usda");
        expect(read.sourceKind).toBe("upload");

        const pendingUrl = read.setUrlAsync(
            "https://example.com/older.usda",
            async () =>
                await new Promise((resolve) => {
                    resolveResponse = resolve;
                })
        );
        read.setUploadedSource(TriangleUsdBytes, "latest.usda");
        resolveResponse?.({
            ok: true,
            status: 200,
            statusText: "OK",
            arrayBuffer: async () => new Uint8Array([2]).buffer,
        });
        await pendingUrl;

        expect(read.source).toBe("latest.usda");
        expect(read.sourceKind).toBe("upload");
        expect(read.data).toEqual(TriangleUsdBytes);

        await read.setUrlAsync("https://example.com/final.usda", async () => ({
            ok: true,
            status: 200,
            statusText: "OK",
            arrayBuffer: async () => TriangleUsdBytes.slice().buffer,
        }));
        const parsed = NodeAsset.Parse(JSON.parse(JSON.stringify(asset.serialize())));
        const parsedRead = parsed.attachedBlocks[0] as USDInputBlock;
        expect(parsedRead.source).toBe("https://example.com/final.usda");
        expect(parsedRead.sourceKind).toBe("url");
        expect(parsedRead.data).toEqual(TriangleUsdBytes);
    });

    it("keeps the source cleared when an earlier URL request succeeds later", async () => {
        const asset = new NodeAsset("cleared-usd-source");
        const read = new USDInputBlock("USD", asset);
        let resolveResponse: ((response: { ok: boolean; status: number; statusText: string; arrayBuffer: () => Promise<ArrayBuffer> }) => void) | undefined;
        const pendingUrl = read.setUrlAsync(
            "https://example.com/delayed.usda",
            async () =>
                await new Promise((resolve) => {
                    resolveResponse = resolve;
                })
        );

        read.clearSource();
        resolveResponse?.({
            ok: true,
            status: 200,
            statusText: "OK",
            arrayBuffer: async () => TriangleUsdBytes.slice().buffer,
        });
        await pendingUrl;

        expect(read.data).toBeNull();
        expect(read.source).toBeNull();
        expect(read.sourceKind).toBeNull();
    });

    it.each(["URL", "upload", "clear"] as const)("does not let a delayed upload overwrite a newer successful %s action", async (replacement) => {
        const asset = new NodeAsset(`delayed-upload-${replacement}`);
        const read = new USDInputBlock("USD", asset);
        let resolveUpload: ((data: ArrayBuffer) => void) | undefined;
        const pendingUpload = read.setUploadedSourceAsync(
            async () =>
                await new Promise<ArrayBuffer>((resolve) => {
                    resolveUpload = resolve;
                }),
            "stale.usda"
        );

        if (replacement === "URL") {
            await read.setUrlAsync("https://example.com/current.usda", async () => ({
                ok: true,
                status: 200,
                statusText: "OK",
                arrayBuffer: async () => TriangleUsdBytes.slice().buffer,
            }));
        } else if (replacement === "upload") {
            read.setUploadedSource(TriangleUsdBytes, "current.usda");
        } else {
            read.clearSource();
        }
        resolveUpload?.(new Uint8Array([99]).buffer);
        await pendingUpload;

        expect(read.source).toBe(replacement === "URL" ? "https://example.com/current.usda" : replacement === "upload" ? "current.usda" : null);
        expect(read.data).toEqual(replacement === "clear" ? null : TriangleUsdBytes);
    });

    it("allows an earlier pending upload to become active after a newer URL fails", async () => {
        const read = new USDInputBlock("USD", new NodeAsset("failed-newer-url"));
        let resolveUpload: ((data: ArrayBuffer) => void) | undefined;
        const pendingUpload = read.setUploadedSourceAsync(
            async () =>
                await new Promise<ArrayBuffer>((resolve) => {
                    resolveUpload = resolve;
                }),
            "eventual.usda"
        );

        await expect(
            read.setUrlAsync("https://example.invalid/missing.usda", async () => ({
                ok: false,
                status: 404,
                statusText: "Not Found",
                arrayBuffer: async () => new ArrayBuffer(0),
            }))
        ).rejects.toThrow(/404 Not Found/);
        resolveUpload?.(TriangleUsdBytes.slice().buffer);
        await pendingUpload;

        expect(read.source).toBe("eventual.usda");
        expect(read.data).toEqual(TriangleUsdBytes);
    });
});
