import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { ExportGLTFBlock } from "../../src/Blocks/exportGLTFBlock";
import { ExportImageBlock } from "../../src/Blocks/exportImageBlock";
import { ImportGLTFBlock } from "../../src/Blocks/importGLTFBlock";
import { ImportImageBlock } from "../../src/Blocks/importImageBlock";
import { NodeAssetBlock } from "../../src/blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../../src/connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { BuildConfigurationError, BuildLimitError, type BuildScope, type INodeAssetBuildOptions, type NodeAssetBuildResult } from "../../src/evaluation/buildScope";
import { NodeAsset } from "../../src/nodeAsset";

function CreateImageAsset(bytes = new Uint8Array([1, 2, 3])): NodeAsset {
    const asset = new NodeAsset("image limits");
    const importer = new ImportImageBlock("image source", asset);
    importer.data = bytes;
    const exporter = new ExportImageBlock("export", asset);
    importer.output.connectTo(exporter.input);
    return asset;
}

class ImagePairExportBlock extends NodeAssetBlock {
    public readonly isExportTerminal = true;
    public readonly inputA: NodeAssetConnectionPoint;
    public readonly inputB: NodeAssetConnectionPoint;
    public result: Uint8Array | null = null;

    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.inputA = this._registerInput("inputA", NodeAssetConnectionPointType.IMAGE);
        this.inputB = this._registerInput("inputB", NodeAssetConnectionPointType.IMAGE);
    }

    public override async _buildBlockAsync(): Promise<void> {
        const first = (this.inputA.value as { data: Uint8Array }).data;
        const second = (this.inputB.value as { data: Uint8Array }).data;
        this.result = new Uint8Array(first.byteLength + second.byteLength);
    }
}

function CreateTwoSourceImageAsset(): NodeAsset {
    const asset = new NodeAsset("two image sources");
    const first = new ImportImageBlock("first source", asset);
    first.data = new Uint8Array([1, 2]);
    const second = new ImportImageBlock("second source", asset);
    second.data = new Uint8Array([3, 4]);
    const exporter = new ImagePairExportBlock("export", asset);
    first.output.connectTo(exporter.inputA);
    second.output.connectTo(exporter.inputB);
    return asset;
}

class TimedResource {
    public disposeCalls = 0;

    public dispose(): void {
        this.disposeCalls++;
    }
}

class TimedResourceSourceBlock extends NodeAssetBlock {
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.NODE_GEOMETRY);
    public readonly resource = new TimedResource();
    public elapsedMs = 0;

    public override async _buildBlockAsync(): Promise<void> {
        this.output.value = this.resource;
        vi.setSystemTime(Date.now() + this.elapsedMs);
    }
}

class TimedResourceExportBlock extends NodeAssetBlock {
    public readonly isExportTerminal = true;
    public readonly input: NodeAssetConnectionPoint;
    public result: Uint8Array | null = null;

    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.NODE_GEOMETRY);
    }

    public override async _buildBlockAsync(): Promise<void> {
        this.result = new Uint8Array([1]);
    }
}

class HangingTimedResourceSourceBlock extends NodeAssetBlock {
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.NODE_GEOMETRY);
    public readonly resource = new TimedResource();
    public readonly started: Promise<void>;

    private _markStarted: () => void = () => {};

    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.started = new Promise<void>((resolve) => {
            this._markStarted = resolve;
        });
    }

    public override async _buildBlockAsync(scope?: BuildScope): Promise<void> {
        this.output.value = this.resource;
        this._markStarted();
        if (!scope!.signal.aborted) {
            await new Promise<void>((resolve) => {
                scope!.signal.addEventListener("abort", () => resolve(), { once: true });
            });
        }
        scope!.throwIfAborted();
    }
}

function CreateTimedAsset(elapsedMs: number): { asset: NodeAsset; source: TimedResourceSourceBlock } {
    const asset = new NodeAsset("wall clock");
    const source = new TimedResourceSourceBlock("timed source", asset);
    source.elapsedMs = elapsedMs;
    const exporter = new TimedResourceExportBlock("export", asset);
    source.output.connectTo(exporter.input);
    return { asset, source };
}

describe("build limits", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it.each<INodeAssetBuildOptions["limits"]>([
        { maxSourceAssetBytes: Number.NaN },
        { maxSourceAssetBytes: -1 },
        { maxSourceAssetBytes: 1.5 },
        { maxSourceAssetBytes: Number.POSITIVE_INFINITY },
        { maxTotalSourceBytes: Number.NaN },
        { maxTotalSourceBytes: -1 },
        { maxTotalSourceBytes: 1.5 },
        { maxTotalSourceBytes: Number.POSITIVE_INFINITY },
        { maxEvaluations: Number.NaN },
        { maxEvaluations: -1 },
        { maxEvaluations: 1.5 },
        { maxEvaluations: Number.POSITIVE_INFINITY },
        { maxWallClockMs: Number.NaN },
        { maxWallClockMs: -1 },
        { maxWallClockMs: Number.POSITIVE_INFINITY },
    ])("rejects invalid configured limits instead of silently distorting them: %j", async (limits) => {
        const build = CreateImageAsset().buildAsync({ limits });
        expectTypeOf(build).toEqualTypeOf<Promise<NodeAssetBuildResult>>();

        await expect(build).rejects.toMatchObject<BuildConfigurationError>({
            code: "NODE_ASSET_BUILD_INVALID_LIMIT",
        });
    });

    it.each([
        [4, "below"],
        [3, "equal"],
    ] as const)("allows a 3-byte source with per-source limit %i (%s boundary)", async (limit) => {
        await expect(CreateImageAsset().buildAsync({ limits: { maxSourceAssetBytes: limit } })).resolves.toBeInstanceOf(Uint8Array);
    });

    it("fails with a typed error only when source bytes exceed the per-source limit", async () => {
        await expect(CreateImageAsset().buildAsync({ limits: { maxSourceAssetBytes: 2 } })).rejects.toMatchObject<BuildLimitError>({
            code: "NODE_ASSET_LIMIT_SOURCE_BYTES",
            limit: 2,
            actual: 3,
        });
    });

    it.each([
        [5, "below"],
        [4, "equal"],
    ] as const)("allows 4 aggregate source bytes with total limit %i (%s boundary)", async (limit) => {
        await expect(CreateTwoSourceImageAsset().buildAsync({ limits: { maxTotalSourceBytes: limit } })).resolves.toBeInstanceOf(Uint8Array);
    });

    it("fails with a typed error only when aggregate source bytes exceed the total limit", async () => {
        await expect(CreateTwoSourceImageAsset().buildAsync({ limits: { maxTotalSourceBytes: 3 } })).rejects.toMatchObject<BuildLimitError>({
            code: "NODE_ASSET_LIMIT_TOTAL_SOURCE_BYTES",
            limit: 3,
            actual: 4,
        });
    });

    it.each([
        [3, "below"],
        [2, "equal"],
    ] as const)("allows a 2-block graph with evaluation limit %i (%s boundary)", async (limit) => {
        await expect(CreateImageAsset().buildAsync({ limits: { maxEvaluations: limit } })).resolves.toBeInstanceOf(Uint8Array);
    });

    it("fails with a typed error only when block evaluations exceed the configured limit", async () => {
        await expect(CreateImageAsset().buildAsync({ limits: { maxEvaluations: 1 } })).rejects.toMatchObject<BuildLimitError>({
            code: "NODE_ASSET_LIMIT_EVALUATIONS",
            limit: 1,
            actual: 2,
        });
    });

    it("accounts actual source bytes before attempting to parse malformed source data", async () => {
        const asset = new NodeAsset("source accounting before parse");
        const importer = new ImportGLTFBlock("malformed glTF", asset);
        importer.data = new Uint8Array([0]);
        const exporter = new ExportGLTFBlock("export", asset);
        importer.output.connectTo(exporter.input);

        await expect(asset.buildAsync({ limits: { maxSourceAssetBytes: 0 } })).rejects.toMatchObject<BuildLimitError>({
            code: "NODE_ASSET_LIMIT_SOURCE_BYTES",
            actual: 1,
        });
    });

    it("keeps the existing unconfigured source/export fixture behavior-safe by default", async () => {
        const result = await CreateImageAsset().buildAsync();
        expect(Array.from(result)).toEqual([1, 2, 3]);
    });

    it.each([
        [6, "below"],
        [5, "equal"],
    ] as const)("allows 5ms elapsed with wall-clock limit %i (%s boundary)", async (limit) => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        const { asset } = CreateTimedAsset(5);

        await expect(asset.buildAsync({ limits: { maxWallClockMs: limit } })).resolves.toBeInstanceOf(Uint8Array);
    });

    it("fails with a typed error only when elapsed wall-clock time exceeds the limit", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        const { asset, source } = CreateTimedAsset(5);

        await expect(asset.buildAsync({ limits: { maxWallClockMs: 4 } })).rejects.toMatchObject<BuildLimitError>({
            code: "NODE_ASSET_LIMIT_WALL_CLOCK",
            limit: 4,
            actual: 5,
        });
        expect(source.resource.disposeCalls).toBe(1);
    });

    it("times out in-flight work and awaits resource cleanup", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        const asset = new NodeAsset("wall-clock timeout");
        const source = new HangingTimedResourceSourceBlock("hanging source", asset);
        const exporter = new TimedResourceExportBlock("export", asset);
        source.output.connectTo(exporter.input);

        const build = asset.buildAsync({ limits: { maxWallClockMs: 5 } });
        let outcome: unknown;
        void build.then(
            () => {
                outcome = "resolved";
            },
            (error: unknown) => {
                outcome = error;
            }
        );
        await source.started;
        await vi.advanceTimersByTimeAsync(5);
        expect(source.resource.disposeCalls).toBe(0);
        await vi.advanceTimersByTimeAsync(1);

        expect(outcome).toMatchObject<BuildLimitError>({
            code: "NODE_ASSET_LIMIT_WALL_CLOCK",
            limit: 5,
        });
        expect(source.resource.disposeCalls).toBe(1);
    });
});
