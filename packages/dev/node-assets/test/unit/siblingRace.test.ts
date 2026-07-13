import { describe, expect, it } from "vitest";

import { NodeAssetBlock } from "../../src/blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../../src/connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";

class RaceResource {
    public disposeCalls = 0;

    public dispose(): void {
        this.disposeCalls++;
    }
}

class DelayedResourceSourceBlock extends NodeAssetBlock {
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.NODE_GEOMETRY);
    public readonly resource = new RaceResource();
    public readonly started: Promise<void>;

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

    public finish(): void {
        this._releaseBuild();
    }

    public override async _buildBlockAsync(): Promise<void> {
        this.output.value = this.resource;
        this._markStarted();
        await this._release;
    }
}

class FatalAfterSiblingStartsBlock extends NodeAssetBlock {
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.NODE_GEOMETRY);
    public siblingStarted: Promise<void> = Promise.resolve();
    public readonly thrown: Promise<void>;
    public error = new Error("fatal");

    private _markThrown: () => void = () => {};

    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.thrown = new Promise<void>((resolve) => {
            this._markThrown = resolve;
        });
    }

    public override async _buildBlockAsync(): Promise<void> {
        await this.siblingStarted;
        this._markThrown();
        throw this.error;
    }
}

class PairExportBlock extends NodeAssetBlock {
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

describe("all-settled sibling cleanup", () => {
    it("does not reject or clean up until every started sibling settles", async () => {
        const asset = new NodeAsset("sibling race");
        const fatal = new FatalAfterSiblingStartsBlock("fatal", asset);
        const delayed = new DelayedResourceSourceBlock("delayed resource", asset);
        fatal.siblingStarted = delayed.started;
        const exporter = new PairExportBlock("export", asset);
        fatal.output.connectTo(exporter.inputA);
        delayed.output.connectTo(exporter.inputB);
        const primary = new Error("primary");
        fatal.error = primary;

        let buildSettled = false;
        const build = asset.buildAsync();
        void build.then(
            () => {
                buildSettled = true;
            },
            () => {
                buildSettled = true;
            }
        );
        await fatal.thrown;
        await Promise.resolve();
        expect(buildSettled).toBe(false);
        expect(delayed.resource.disposeCalls).toBe(0);

        delayed.finish();
        await expect(build).rejects.toBe(primary);
        expect(delayed.resource.disposeCalls).toBe(1);
    });
});
