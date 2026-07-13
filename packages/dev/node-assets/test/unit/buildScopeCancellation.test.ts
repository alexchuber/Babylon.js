import { describe, expect, it } from "vitest";

import { NodeAssetBlock } from "../../src/blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../../src/connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { BuildCancelledError, type BuildScope } from "../../src/evaluation/buildScope";
import { NodeAsset } from "../../src/nodeAsset";

class CountingSourceBlock extends NodeAssetBlock {
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.IMAGE);
    public evaluations = 0;

    public override async _buildBlockAsync(): Promise<void> {
        this.evaluations++;
        this.output.value = { data: new Uint8Array([1]), mimeType: "image/png" };
    }
}

class BytesExportBlock extends NodeAssetBlock {
    public readonly isExportTerminal = true;
    public readonly input: NodeAssetConnectionPoint;
    public result: Uint8Array | null = null;
    public evaluations = 0;

    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.IMAGE);
    }

    public override async _buildBlockAsync(): Promise<void> {
        this.evaluations++;
        this.result = (this.input.value as { data: Uint8Array }).data;
    }
}

class CancelledResource {
    public disposeCalls = 0;
    public isDisposed = false;

    public dispose(): void {
        this.disposeCalls++;
        this.isDisposed = true;
    }
}

class WaitingResourceSourceBlock extends NodeAssetBlock {
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.NODE_GEOMETRY);
    public readonly resource = new CancelledResource();
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
        await WaitForAbortAsync(scope!.signal);
        scope!.throwIfAborted();
    }
}

class ResourceExportBlock extends NodeAssetBlock {
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

class ControlledResourceExportBlock extends ResourceExportBlock {
    public readonly entered: Promise<void>;
    public release: () => void = () => {};

    private readonly _markEntered: () => void;

    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        let markEntered = () => {};
        this.entered = new Promise<void>((resolve) => {
            markEntered = resolve;
        });
        this._markEntered = markEntered;
    }

    public override async _buildBlockAsync(): Promise<void> {
        const resource = this.input.value as CancelledResource;
        this._markEntered();
        await new Promise<void>((resolve) => {
            this.release = resolve;
        });
        if (resource.isDisposed) {
            throw new Error("The terminal resource was disposed before export settled.");
        }
        this.result = new Uint8Array([1]);
    }
}

class ImmediateResourceSourceBlock extends NodeAssetBlock {
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.NODE_GEOMETRY);
    public readonly resource = new CancelledResource();

    public override async _buildBlockAsync(): Promise<void> {
        this.output.value = this.resource;
    }
}

class FatalSourceBlock extends NodeAssetBlock {
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.NODE_GEOMETRY);
    public error = new Error("fatal");
    public siblingStarted: Promise<void> = Promise.resolve();

    public override async _buildBlockAsync(): Promise<void> {
        await this.siblingStarted;
        throw this.error;
    }
}

class AbortableResourceSourceBlock extends NodeAssetBlock {
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.NODE_GEOMETRY);
    public readonly resource = new CancelledResource();
    public readonly started: Promise<void>;
    public settled = false;

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
        await WaitForAbortAsync(scope!.signal);
        this.settled = true;
        scope!.throwIfAborted();
    }
}

class ResourcePairExportBlock extends NodeAssetBlock {
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
        this.result = new Uint8Array([1]);
    }
}

class ControlledFatalSourceBlock extends NodeAssetBlock {
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.NODE_GEOMETRY);
    public readonly started: Promise<void>;
    public error = new Error("controlled fatal");
    public settled = false;

    private _markStarted: () => void = () => {};
    private readonly _release: Promise<void>;
    private _releaseBuild: () => void = () => {};

    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.started = new Promise<void>((resolve) => {
            this._markStarted = resolve;
        });
        this._release = new Promise<void>((resolve) => {
            this._releaseBuild = resolve;
        });
    }

    public fail(): void {
        this._releaseBuild();
    }

    public override async _buildBlockAsync(): Promise<void> {
        this._markStarted();
        await this._release;
        this.settled = true;
        throw this.error;
    }
}

async function WaitForAbortAsync(signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
        return;
    }
    await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true });
    });
}

describe("build scope cancellation", () => {
    it("evaluates zero blocks when the caller signal is already aborted", async () => {
        const asset = new NodeAsset("pre-aborted");
        const source = new CountingSourceBlock("source", asset);
        const exporter = new BytesExportBlock("export", asset);
        source.output.connectTo(exporter.input);
        const controller = new AbortController();
        controller.abort("caller stopped");

        await expect(asset.buildAsync(controller.signal)).rejects.toMatchObject<BuildCancelledError>({
            code: "NODE_ASSET_BUILD_CANCELLED",
        });
        expect(source.evaluations).toBe(0);
        expect(exporter.evaluations).toBe(0);
    });

    it("cancels in-flight work and disposes a resource produced before cancellation", async () => {
        const asset = new NodeAsset("cancel during build");
        const source = new WaitingResourceSourceBlock("waiting source", asset);
        const exporter = new ResourceExportBlock("export", asset);
        source.output.connectTo(exporter.input);
        const controller = new AbortController();

        const build = asset.buildAsync(controller.signal).catch((error: unknown) => error);
        await source.started;
        controller.abort("caller stopped");
        const outcome = await Promise.race([
            build,
            new Promise<"timed out">((resolve) => {
                setTimeout(() => resolve("timed out"), 25);
            }),
        ]);

        expect(outcome).toBeInstanceOf(BuildCancelledError);
        expect(source.resource.disposeCalls).toBe(1);
    });

    it("awaits a non-cooperative terminal export, then rejects caller cancellation and cleans up", async () => {
        const asset = new NodeAsset("cancel during terminal export");
        const source = new ImmediateResourceSourceBlock("resource source", asset);
        const exporter = new ControlledResourceExportBlock("controlled export", asset);
        source.output.connectTo(exporter.input);
        const controller = new AbortController();

        const build = asset.buildAsync(controller.signal);
        await exporter.entered;
        controller.abort("caller stopped");
        let settled = false;
        void build.then(
            () => {
                settled = true;
            },
            () => {
                settled = true;
            }
        );
        await Promise.resolve();
        expect(settled).toBe(false);
        expect(source.resource.disposeCalls).toBe(0);

        exporter.release();
        await expect(build).rejects.toMatchObject<BuildCancelledError>({
            code: "NODE_ASSET_BUILD_CANCELLED",
        });
        expect(source.resource.disposeCalls).toBe(1);
    });

    it("aborts siblings on the first fatal error and awaits their settlement before cleanup", async () => {
        const asset = new NodeAsset("fatal sibling");
        const fatal = new FatalSourceBlock("fatal", asset);
        const sibling = new AbortableResourceSourceBlock("abortable sibling", asset);
        fatal.siblingStarted = sibling.started;
        const exporter = new ResourcePairExportBlock("export", asset);
        fatal.output.connectTo(exporter.inputA);
        sibling.output.connectTo(exporter.inputB);
        const primary = new Error("primary fatal");
        fatal.error = primary;

        await expect(asset.buildAsync()).rejects.toBe(primary);
        expect(sibling.settled).toBe(true);
        expect(sibling.resource.disposeCalls).toBe(1);
    });

    it("selects the stable input-order primary when concurrent siblings both fail", async () => {
        const asset = new NodeAsset("deterministic primary");
        const first = new ControlledFatalSourceBlock("first", asset);
        const second = new ControlledFatalSourceBlock("second", asset);
        const exporter = new ResourcePairExportBlock("export", asset);
        first.output.connectTo(exporter.inputA);
        second.output.connectTo(exporter.inputB);
        const firstError = new Error("first input failure");
        const secondError = new Error("second input failure");
        first.error = firstError;
        second.error = secondError;

        const build = asset.buildAsync();
        await Promise.all([first.started, second.started]);
        second.fail();
        await Promise.resolve();
        first.fail();

        await expect(build).rejects.toBe(firstError);
        expect(first.settled).toBe(true);
        expect(second.settled).toBe(true);
    });
});
