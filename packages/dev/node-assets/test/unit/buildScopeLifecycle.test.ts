import { NullEngine } from "core/Engines/nullEngine";
import { NodeGeometry } from "core/Meshes/Node/nodeGeometry";
import { Scene } from "core/scene";
import { describe, expect, it, vi } from "vitest";

import { NodeAssetBlock } from "../../src/blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../../src/connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { BuildLimitError, BuildResourceOwnershipError, GetNodeAssetBuildReport, type BuildScope } from "../../src/evaluation/buildScope";
import { NodeAsset } from "../../src/nodeAsset";
import { BabylonAsset } from "../../src/representations/babylonAsset";
import { NodeGeometryAsset } from "../../src/representations/nodeGeometryAsset";

class TrackedResource {
    public disposeCalls = 0;
    public isDisposed = false;

    public constructor(
        public readonly events: string[],
        private readonly _asynchronous = false,
        private readonly _cleanupError?: Error
    ) {}

    public async dispose(): Promise<void> {
        this.disposeCalls++;
        if (this._asynchronous) {
            await Promise.resolve();
        }
        this.events.push("dispose");
        this.isDisposed = true;
        if (this._cleanupError) {
            throw this._cleanupError;
        }
    }
}

class BlockingCleanupResource extends TrackedResource {
    public readonly cleanupStarted: Promise<void>;
    private _markCleanupStarted: () => void = () => {};
    private readonly _releaseCleanup: Promise<void>;
    private _release: () => void = () => {};

    public constructor(events: string[]) {
        super(events);
        this.cleanupStarted = new Promise<void>((resolve) => {
            this._markCleanupStarted = resolve;
        });
        this._releaseCleanup = new Promise<void>((resolve) => {
            this._release = resolve;
        });
    }

    public finishCleanup(): void {
        this._release();
    }

    public override async dispose(): Promise<void> {
        this.disposeCalls++;
        this._markCleanupStarted();
        await this._releaseCleanup;
        this.events.push("dispose");
        this.isDisposed = true;
    }
}

class SequencedResource extends TrackedResource {
    public constructor(
        public readonly id: number,
        events: string[]
    ) {
        super(events);
    }
}

class SequencedResourceSourceBlock extends NodeAssetBlock {
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.NODE_GEOMETRY);
    public readonly resources: SequencedResource[] = [];

    public override async _buildBlockAsync(): Promise<void> {
        const resource = new SequencedResource(this.resources.length + 1, []);
        this.resources.push(resource);
        this.output.value = resource;
    }
}

class OverlappingResourceExportBlock extends NodeAssetBlock {
    public readonly isExportTerminal = true;
    public readonly input: NodeAssetConnectionPoint;
    public readonly firstBuildEntered: Promise<void>;
    public result: Uint8Array | null = null;

    private _evaluations = 0;
    private readonly _markFirstBuildEntered: () => void;
    private readonly _releaseFirstBuild: Promise<void>;
    private _release: () => void = () => {};

    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.NODE_GEOMETRY);
        let markFirstBuildEntered = () => {};
        this.firstBuildEntered = new Promise<void>((resolve) => {
            markFirstBuildEntered = resolve;
        });
        this._markFirstBuildEntered = markFirstBuildEntered;
        this._releaseFirstBuild = new Promise<void>((resolve) => {
            this._release = resolve;
        });
    }

    public releaseFirstBuild(): void {
        this._release();
    }

    public override async _buildBlockAsync(): Promise<void> {
        this._evaluations++;
        if (this._evaluations === 1) {
            this._markFirstBuildEntered();
            await this._releaseFirstBuild;
        } else {
            this._release();
            await Promise.resolve();
        }
        const resource = this.input.value as SequencedResource;
        this.result = new Uint8Array([resource.id]);
    }
}

class ResourceSourceBlock extends NodeAssetBlock {
    public readonly outputA = this._registerOutput("outputA", NodeAssetConnectionPointType.NODE_GEOMETRY);
    public readonly outputB = this._registerOutput("outputB", NodeAssetConnectionPointType.NODE_GEOMETRY);
    public resource: TrackedResource = new TrackedResource([]);
    public scope: BuildScope | undefined;

    public override async _buildBlockAsync(scope?: BuildScope): Promise<void> {
        this.scope = scope;
        this.resource.events.push("produce");
        this.outputA.value = this.resource;
        this.outputB.value = this.resource;
    }
}

class ResourceExportBlock extends NodeAssetBlock {
    public readonly isExportTerminal = true;
    public readonly inputA: NodeAssetConnectionPoint;
    public readonly inputB: NodeAssetConnectionPoint;
    public result: Uint8Array | null = null;

    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.inputA = this._registerInput("inputA", NodeAssetConnectionPointType.NODE_GEOMETRY);
        this.inputB = this._registerInput("inputB", NodeAssetConnectionPointType.NODE_GEOMETRY);
    }

    public override async _buildBlockAsync(): Promise<void> {
        const resource = this.inputA.value as TrackedResource;
        if (resource.isDisposed || this.inputB.value !== resource) {
            throw new Error("The resource must stay live and shared until terminal export completes.");
        }
        resource.events.push("export");
        this.result = new Uint8Array([9]);
    }
}

class FailingResourceConsumerBlock extends NodeAssetBlock {
    public readonly input = this._registerInput("input", NodeAssetConnectionPointType.NODE_GEOMETRY);
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.NODE_GEOMETRY);
    public error = new Error("fatal consumer");

    public override async _buildBlockAsync(): Promise<void> {
        throw this.error;
    }
}

class LimitFailingResourceSourceBlock extends NodeAssetBlock {
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.NODE_GEOMETRY);
    public readonly resource = new TrackedResource([]);
    public sourceBytes = 1;

    public override async _buildBlockAsync(scope?: BuildScope): Promise<void> {
        this.output.value = this.resource;
        scope!.accountSourceBytes(this.sourceBytes);
    }
}

class DisposingPassThroughBlock extends NodeAssetBlock {
    public readonly input = this._registerInput("input", NodeAssetConnectionPointType.NODE_GEOMETRY);
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.NODE_GEOMETRY);

    public override async _buildBlockAsync(): Promise<void> {
        const resource = this.input.value as TrackedResource;
        await resource.dispose();
        this.output.value = resource;
    }
}

class OwnedWrapperSourceBlock extends NodeAssetBlock {
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.NODE_GEOMETRY);
    public value: unknown = null;

    public override async _buildBlockAsync(): Promise<void> {
        this.output.value = this.value;
    }
}

class OwnedWrapperExportBlock extends NodeAssetBlock {
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

class BlockingOwnedWrapperExportBlock extends OwnedWrapperExportBlock {
    public readonly entered: Promise<void>;
    public isUnderlyingLive: () => boolean = () => true;
    public release: () => void = () => {};

    private readonly _markEntered: () => void;
    private readonly _releaseBuild: Promise<void>;

    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        let markEntered = () => {};
        this.entered = new Promise<void>((resolve) => {
            markEntered = resolve;
        });
        this._markEntered = markEntered;
        this._releaseBuild = new Promise<void>((resolve) => {
            this.release = resolve;
        });
    }

    public override async _buildBlockAsync(): Promise<void> {
        this._markEntered();
        await this._releaseBuild;
        if (!this.isUnderlyingLive()) {
            throw new Error("The shared underlying resource was disposed by another build scope.");
        }
        this.result = new Uint8Array([1]);
    }
}

class UncheckedResourceExportBlock extends NodeAssetBlock {
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

class EvaluationLimitResourceSourceBlock extends NodeAssetBlock {
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.NODE_GEOMETRY);
    public readonly resource = new TrackedResource([]);

    public override async _buildBlockAsync(scope?: BuildScope): Promise<void> {
        this.output.value = this.resource;
        scope!.beginEvaluation();
    }
}

class BlockingResourceExportBlock extends ResourceExportBlock {
    public readonly entered: Promise<void>;
    public release: () => void = () => {};

    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        let markEntered = () => {};
        this.entered = new Promise<void>((resolve) => {
            markEntered = resolve;
        });
        this._markEntered = markEntered;
    }

    private readonly _markEntered: () => void;

    public override async _buildBlockAsync(): Promise<void> {
        const resource = this.inputA.value as TrackedResource;
        if (resource.isDisposed) {
            throw new Error("The resource was disposed before terminal export completed.");
        }
        this._markEntered();
        await new Promise<void>((resolve) => {
            this.release = resolve;
        });
        resource.events.push("export");
        this.result = new Uint8Array([9]);
    }
}

function CreateSuccessfulResourceBuild(resource: TrackedResource): NodeAsset {
    const asset = new NodeAsset("resource success");
    const source = new ResourceSourceBlock("resource source", asset);
    source.resource = resource;
    const exporter = new ResourceExportBlock("export", asset);
    source.outputA.connectTo(exporter.inputA);
    source.outputB.connectTo(exporter.inputB);
    return asset;
}

function ExpectConnectionValuesCleared(asset: NodeAsset): void {
    for (const block of asset.attachedBlocks) {
        for (const point of [...block.inputs, ...block.outputs]) {
            expect(point.value).toBeNull();
        }
    }
}

describe("build scope resource lifecycle", () => {
    it("serializes overlapping builds of one asset and clears their transient connection values", async () => {
        const asset = new NodeAsset("serialized builds");
        const source = new SequencedResourceSourceBlock("source", asset);
        const exporter = new OverlappingResourceExportBlock("export", asset);
        source.output.connectTo(exporter.input);

        const firstBuild = asset.buildAsync();
        await exporter.firstBuildEntered;
        const secondBuild = asset.buildAsync();
        const fallbackRelease = setTimeout(() => exporter.releaseFirstBuild(), 10);

        const [first, second] = await Promise.all([firstBuild, secondBuild]);
        clearTimeout(fallbackRelease);

        expect(Array.from(first)).toEqual([1]);
        expect(Array.from(second)).toEqual([2]);
        expect(source.resources).toHaveLength(2);
        expect(source.resources.map((resource) => resource.disposeCalls)).toEqual([1, 1]);
        ExpectConnectionValuesCleared(asset);
    });

    it.each([
        ["synchronous", false],
        ["asynchronous", true],
    ])("disposes a %s resource once after the terminal export consumes it", async (_name, asynchronous) => {
        const events: string[] = [];
        const resource = new TrackedResource(events, asynchronous);

        const result = await CreateSuccessfulResourceBuild(resource).buildAsync();

        expect(Array.from(result)).toEqual([9]);
        expect(events).toEqual(["produce", "export", "dispose"]);
        expect(resource.disposeCalls).toBe(1);
    });

    it("disposes produced resources on fatal failure and preserves the exact primary error object", async () => {
        const events: string[] = [];
        const resource = new TrackedResource(events);
        const asset = new NodeAsset("resource failure");
        const source = new ResourceSourceBlock("resource source", asset);
        source.resource = resource;
        const consumer = new FailingResourceConsumerBlock("failing consumer", asset);
        const exporter = new ResourceExportBlock("export", asset);
        source.outputA.connectTo(consumer.input);
        consumer.output.connectTo(exporter.inputA);
        source.outputB.connectTo(exporter.inputB);
        const primary = new Error("primary failure");
        consumer.error = primary;

        await expect(asset.buildAsync()).rejects.toBe(primary);
        expect(events).toEqual(["produce", "dispose"]);
        expect(resource.disposeCalls).toBe(1);
        ExpectConnectionValuesCleared(asset);
    });

    it("keeps cleanup idempotent after the build already disposed its ledger", async () => {
        const resource = new TrackedResource([]);
        const asset = new NodeAsset("idempotent cleanup");
        const source = new ResourceSourceBlock("resource source", asset);
        source.resource = resource;
        const exporter = new ResourceExportBlock("export", asset);
        source.outputA.connectTo(exporter.inputA);
        source.outputB.connectTo(exporter.inputB);

        await asset.buildAsync();
        await source.scope!.disposeAsync();
        await source.scope!.disposeAsync();

        expect(resource.disposeCalls).toBe(1);
    });

    it("records cleanup failures without failing a successful build or replacing a fatal error", async () => {
        const cleanupError = new Error("cleanup failed");
        const successfulResource = new TrackedResource([], false, cleanupError);

        const result = await CreateSuccessfulResourceBuild(successfulResource).buildAsync();

        expect(result.diagnostics).toMatchObject([
            {
                code: "NODE_ASSET_CLEANUP_FAILED",
                severity: "warning",
                message: "cleanup failed",
                producer: { kind: "block", blockName: "resource source" },
            },
        ]);

        const fatalResource = new TrackedResource([], false, cleanupError);
        const asset = new NodeAsset("fatal cleanup");
        const source = new ResourceSourceBlock("resource source", asset);
        source.resource = fatalResource;
        const consumer = new FailingResourceConsumerBlock("consumer", asset);
        const exporter = new ResourceExportBlock("export", asset);
        source.outputA.connectTo(consumer.input);
        consumer.output.connectTo(exporter.inputA);
        source.outputB.connectTo(exporter.inputB);
        const primary = new Error("primary");
        consumer.error = primary;

        const thrown = await asset.buildAsync().catch((error: unknown) => error);

        expect(thrown).toBe(primary);
        expect(fatalResource.disposeCalls).toBe(1);
        const report = GetNodeAssetBuildReport(thrown);
        expect(report?.diagnostics).toMatchObject([
            {
                code: "NODE_ASSET_CLEANUP_FAILED",
                severity: "warning",
                message: "cleanup failed",
            },
        ]);
        expect(report?.lossRecords).toEqual([]);
        expect(Object.isFrozen(report)).toBe(true);
        expect(Object.isFrozen(report?.diagnostics)).toBe(true);
    });

    it("rejects a resource shared by concurrent build scopes without disposing the owner's resource", async () => {
        const resource = new TrackedResource([]);
        const firstAsset = new NodeAsset("first owner");
        const firstSource = new ResourceSourceBlock("first source", firstAsset);
        firstSource.resource = resource;
        const firstExporter = new BlockingResourceExportBlock("first export", firstAsset);
        firstSource.outputA.connectTo(firstExporter.inputA);
        firstSource.outputB.connectTo(firstExporter.inputB);

        const firstBuild = firstAsset.buildAsync();
        await firstExporter.entered;

        const secondBuild = CreateSuccessfulResourceBuild(resource).buildAsync();
        await expect(secondBuild).rejects.toMatchObject<BuildResourceOwnershipError>({
            code: "NODE_ASSET_RESOURCE_OWNED",
        });
        expect(resource.disposeCalls).toBe(0);

        firstExporter.release();
        await expect(firstBuild).resolves.toBeInstanceOf(Uint8Array);
        expect(resource.disposeCalls).toBe(1);
    });

    it("rejects distinct BabylonAsset wrappers that share one live engine and scene", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const firstWrapper = new BabylonAsset(engine, scene, { identity: "first", revision: 0, manifest: {} });
        const secondWrapper = new BabylonAsset(engine, scene, { identity: "second", revision: 0, manifest: {} });
        const firstAsset = new NodeAsset("first Babylon owner");
        const firstSource = new OwnedWrapperSourceBlock("first source", firstAsset);
        firstSource.value = firstWrapper;
        const firstExporter = new BlockingOwnedWrapperExportBlock("first export", firstAsset);
        firstExporter.isUnderlyingLive = () => !scene.isDisposed;
        firstSource.output.connectTo(firstExporter.input);
        const firstBuild = firstAsset.buildAsync();
        await firstExporter.entered;

        const secondAsset = new NodeAsset("second Babylon owner");
        const secondSource = new OwnedWrapperSourceBlock("second source", secondAsset);
        secondSource.value = secondWrapper;
        const secondExporter = new OwnedWrapperExportBlock("second export", secondAsset);
        secondSource.output.connectTo(secondExporter.input);
        const secondOutcome = await secondAsset.buildAsync().catch((error: unknown) => error);
        const wasLiveBeforeRelease = !scene.isDisposed;
        firstExporter.release();
        const firstOutcome = await firstBuild.catch((error: unknown) => error);

        expect(secondOutcome).toMatchObject<BuildResourceOwnershipError>({ code: "NODE_ASSET_RESOURCE_OWNED" });
        expect(wasLiveBeforeRelease).toBe(true);
        expect(firstOutcome).toBeInstanceOf(Uint8Array);
        expect(scene.isDisposed).toBe(true);
    });

    it("rejects distinct NodeGeometryAsset wrappers that share one live graph", async () => {
        const graph = new NodeGeometry("shared graph");
        graph.setToDefault();
        const disposeSpy = vi.spyOn(graph, "dispose");
        const firstWrapper = new NodeGeometryAsset(graph, { identity: "first", revision: 0, manifest: {} });
        const secondWrapper = new NodeGeometryAsset(graph, { identity: "second", revision: 0, manifest: {} });
        const firstAsset = new NodeAsset("first NodeGeometry owner");
        const firstSource = new OwnedWrapperSourceBlock("first source", firstAsset);
        firstSource.value = firstWrapper;
        const firstExporter = new BlockingOwnedWrapperExportBlock("first export", firstAsset);
        firstExporter.isUnderlyingLive = () => disposeSpy.mock.calls.length === 0;
        firstSource.output.connectTo(firstExporter.input);
        const firstBuild = firstAsset.buildAsync();
        await firstExporter.entered;

        const secondAsset = new NodeAsset("second NodeGeometry owner");
        const secondSource = new OwnedWrapperSourceBlock("second source", secondAsset);
        secondSource.value = secondWrapper;
        const secondExporter = new OwnedWrapperExportBlock("second export", secondAsset);
        secondSource.output.connectTo(secondExporter.input);
        const secondOutcome = await secondAsset.buildAsync().catch((error: unknown) => error);
        const wasLiveBeforeRelease = disposeSpy.mock.calls.length === 0;
        firstExporter.release();
        const firstOutcome = await firstBuild.catch((error: unknown) => error);

        expect(secondOutcome).toMatchObject<BuildResourceOwnershipError>({ code: "NODE_ASSET_RESOURCE_OWNED" });
        expect(wasLiveBeforeRelease).toBe(true);
        expect(firstOutcome).toBeInstanceOf(Uint8Array);
        expect(disposeSpy).toHaveBeenCalledTimes(1);
    });

    it("rejects a disposed resource reused by a later build", async () => {
        const resource = new TrackedResource([]);
        await CreateSuccessfulResourceBuild(resource).buildAsync();

        await expect(CreateSuccessfulResourceBuild(resource).buildAsync()).rejects.toMatchObject<BuildResourceOwnershipError>({
            code: "NODE_ASSET_RESOURCE_STALE",
        });
        expect(resource.disposeCalls).toBe(1);
    });

    it("disposes a resource exactly once when a configured limit aborts its producer", async () => {
        const asset = new NodeAsset("limit cleanup");
        const source = new LimitFailingResourceSourceBlock("limited source", asset);
        const exporter = new ResourceExportBlock("export", asset);
        source.output.connectTo(exporter.inputA);
        source.output.connectTo(exporter.inputB);

        const error = await asset.buildAsync({ limits: { maxSourceAssetBytes: 0 } }).catch((reason: unknown) => reason);

        expect(error).toMatchObject<BuildLimitError>({
            code: "NODE_ASSET_LIMIT_SOURCE_BYTES",
        });
        expect(GetNodeAssetBuildReport(error)).toEqual({
            diagnostics: [],
            lossRecords: [],
        });
        expect(source.resource.disposeCalls).toBe(1);
        ExpectConnectionValuesCleared(asset);
    });

    it("disposes all started resources exactly once when aggregate source bytes exceed the limit", async () => {
        const asset = new NodeAsset("total source cleanup");
        const first = new LimitFailingResourceSourceBlock("first source", asset);
        const second = new LimitFailingResourceSourceBlock("second source", asset);
        const exporter = new ResourceExportBlock("export", asset);
        first.output.connectTo(exporter.inputA);
        second.output.connectTo(exporter.inputB);

        await expect(asset.buildAsync({ limits: { maxTotalSourceBytes: 1 } })).rejects.toMatchObject<BuildLimitError>({
            code: "NODE_ASSET_LIMIT_TOTAL_SOURCE_BYTES",
        });
        expect(first.resource.disposeCalls).toBe(1);
        expect(second.resource.disposeCalls).toBe(1);
    });

    it("disposes an already-produced resource exactly once when evaluation count exceeds the limit", async () => {
        const asset = new NodeAsset("evaluation cleanup");
        const source = new EvaluationLimitResourceSourceBlock("resource source", asset);
        const exporter = new ResourceExportBlock("export", asset);
        source.output.connectTo(exporter.inputA);
        source.output.connectTo(exporter.inputB);

        await expect(asset.buildAsync({ limits: { maxEvaluations: 2 } })).rejects.toMatchObject<BuildLimitError>({
            code: "NODE_ASSET_LIMIT_EVALUATIONS",
        });
        expect(source.resource.disposeCalls).toBe(1);
    });

    it("rejects a resource disposed and forwarded within the same build scope", async () => {
        const asset = new NodeAsset("same-scope stale resource");
        const source = new ResourceSourceBlock("source", asset);
        const disposer = new DisposingPassThroughBlock("disposer", asset);
        const exporter = new UncheckedResourceExportBlock("export", asset);
        source.outputA.connectTo(disposer.input);
        disposer.output.connectTo(exporter.input);

        await expect(asset.buildAsync()).rejects.toMatchObject<BuildResourceOwnershipError>({
            code: "NODE_ASSET_RESOURCE_STALE",
        });
        expect(source.resource.disposeCalls).toBe(1);
    });

    it("honors caller cancellation requested while asynchronous cleanup is in flight", async () => {
        const controller = new AbortController();
        const resource = new BlockingCleanupResource([]);
        const build = CreateSuccessfulResourceBuild(resource).buildAsync(controller.signal);
        await resource.cleanupStarted;

        controller.abort("cancel during cleanup");
        resource.finishCleanup();

        await expect(build).rejects.toMatchObject({
            code: "NODE_ASSET_BUILD_CANCELLED",
        });
        expect(resource.disposeCalls).toBe(1);
    });

    it("leaves values assigned by direct block callers unchanged", async () => {
        const asset = new NodeAsset("direct block build");
        const source = new ResourceSourceBlock("source", asset);

        await source._buildBlockAsync();

        expect(source.outputA.value).toBe(source.resource);
        expect(source.outputB.value).toBe(source.resource);
        expect(source.resource.disposeCalls).toBe(0);
        await source.resource.dispose();
    });
});
