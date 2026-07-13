import { describe, expect, it } from "vitest";

import { NodeAssetBlock } from "../../src/blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../../src/connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";

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

class ResourceSourceBlock extends NodeAssetBlock {
    public readonly outputA = this._registerOutput("outputA", NodeAssetConnectionPointType.NODE_GEOMETRY);
    public readonly outputB = this._registerOutput("outputB", NodeAssetConnectionPointType.NODE_GEOMETRY);
    public resource: TrackedResource = new TrackedResource([]);

    public override async _buildBlockAsync(): Promise<void> {
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
        expect(resource.isDisposed).toBe(false);
        expect(this.inputB.value).toBe(resource);
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

function CreateSuccessfulResourceBuild(resource: TrackedResource): NodeAsset {
    const asset = new NodeAsset("resource success");
    const source = new ResourceSourceBlock("resource source", asset);
    source.resource = resource;
    const exporter = new ResourceExportBlock("export", asset);
    source.outputA.connectTo(exporter.inputA);
    source.outputB.connectTo(exporter.inputB);
    return asset;
}

describe("build scope resource lifecycle", () => {
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

        await expect(asset.buildAsync()).rejects.toBe(primary);
        expect(fatalResource.disposeCalls).toBe(1);
    });
});
