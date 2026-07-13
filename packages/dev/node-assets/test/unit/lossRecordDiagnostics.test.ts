import { describe, expect, expectTypeOf, it } from "vitest";

import { NodeAssetBlock } from "../../src/blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../../src/connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { GetNodeAssetBuildReport, type BuildScope, type NodeAssetBuildResult } from "../../src/evaluation/buildScope";
import { NodeAsset } from "../../src/nodeAsset";

class DiagnosticSourceBlock extends NodeAssetBlock {
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.IMAGE);

    public override async _buildBlockAsync(scope?: BuildScope): Promise<void> {
        scope?.addDiagnostic({
            code: "SOURCE_NOTE",
            severity: "info",
            message: "Source metadata was preserved.",
            path: "/source",
            producer: { kind: "block", blockId: this.uniqueId, blockName: this.name },
        });
        scope?.addResolvedDiagnostic(
            {
                severity: "warning",
                message: "A USD transform was baked.",
                path: "/World/Cube",
            },
            {
                code: "USD_XFORM_BAKED",
                disposition: "bake",
                sourceRepresentation: "USD_STAGE",
                targetRepresentation: "GLTF_DOCUMENT",
                producer: { kind: "transcoder", blockId: this.uniqueId, blockName: this.name },
                tags: ["usd", "xform"],
            }
        );
        this.output.value = { data: new Uint8Array([4, 5, 6]), mimeType: "image/png" };
    }
}

class BytesExportBlock extends NodeAssetBlock {
    public readonly isExportTerminal = true;
    public readonly input: NodeAssetConnectionPoint;
    public result: Uint8Array | null = null;

    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.IMAGE);
    }

    public override async _buildBlockAsync(): Promise<void> {
        this.result = (this.input.value as { data: Uint8Array }).data;
    }
}

class FatalSourceBlock extends NodeAssetBlock {
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.IMAGE);
    public error: unknown = new Error("fatal");

    public override async _buildBlockAsync(): Promise<void> {
        throw this.error;
    }
}

class ReusedBytesSourceBlock extends NodeAssetBlock {
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.IMAGE);
    public readonly bytes = new Uint8Array([8]);
    private _buildCount = 0;

    public override async _buildBlockAsync(scope?: BuildScope): Promise<void> {
        this._buildCount++;
        scope?.addDiagnostic({
            code: `BUILD_${this._buildCount}`,
            severity: "info",
            message: `Build ${this._buildCount}`,
        });
        this.output.value = { data: this.bytes, mimeType: "image/png" };
    }
}

function CreateDiagnosticAsset(): NodeAsset {
    const asset = new NodeAsset("diagnostics");
    const source = new DiagnosticSourceBlock("diagnostic source", asset);
    const exporter = new BytesExportBlock("export", asset);
    source.output.connectTo(exporter.input);
    return asset;
}

describe("build diagnostics and loss records", () => {
    it("accepts an optional caller signal while preserving result and legacy byte promise types", async () => {
        const asset = CreateDiagnosticAsset();
        const optionalSignal = undefined as AbortSignal | undefined;

        const optionalSignalBuild = asset.buildAsync(optionalSignal);
        const explicitUndefinedBuild = asset.buildAsync(undefined);
        const optionsBuild = asset.buildAsync({ signal: optionalSignal });
        const legacyBuild: Promise<Uint8Array> = optionalSignalBuild;

        expectTypeOf(optionalSignalBuild).toEqualTypeOf<Promise<NodeAssetBuildResult>>();
        expectTypeOf(explicitUndefinedBuild).toEqualTypeOf<Promise<NodeAssetBuildResult>>();
        expectTypeOf(optionsBuild).toEqualTypeOf<Promise<NodeAssetBuildResult>>();
        await expect(Promise.all([optionalSignalBuild, explicitUndefinedBuild, optionsBuild, legacyBuild])).resolves.toHaveLength(4);
    });

    it("returns Uint8Array-compatible bytes with build diagnostics and canonical lossRecords", async () => {
        const asset = CreateDiagnosticAsset();

        const buildPromise = asset.buildAsync();
        const legacyPromise: Promise<Uint8Array> = buildPromise;
        expectTypeOf(asset.buildAsync()).toEqualTypeOf<Promise<NodeAssetBuildResult>>();
        const result = await buildPromise;
        await expect(legacyPromise).resolves.toBe(result);

        expect(result).toBeInstanceOf(Uint8Array);
        expect(Array.from(result)).toEqual([4, 5, 6]);
        expect(result.slice(1)).toEqual(new Uint8Array([5, 6]));
        expect(result.diagnostics).toEqual([
            {
                code: "SOURCE_NOTE",
                severity: "info",
                message: "Source metadata was preserved.",
                path: "/source",
                producer: { kind: "block", blockId: expect.any(Number), blockName: "diagnostic source" },
            },
            {
                code: "USD_XFORM_BAKED",
                severity: "warning",
                message: "A USD transform was baked.",
                path: "/World/Cube",
                producer: { kind: "transcoder", blockId: expect.any(Number), blockName: "diagnostic source" },
            },
        ]);
        expect(result.lossRecords).toEqual([
            {
                code: "USD_XFORM_BAKED",
                severity: "warning",
                message: "A USD transform was baked.",
                path: "/World/Cube",
                disposition: "bake",
                sourceRepresentation: "USD_STAGE",
                targetRepresentation: "GLTF_DOCUMENT",
                producer: { kind: "transcoder", blockId: expect.any(Number), blockName: "diagnostic source" },
                tags: ["usd", "xform"],
            },
        ]);
        expect("losses" in result).toBe(false);
    });

    it("keeps non-fatal resolved diagnostics successful and preserves the exact fatal object", async () => {
        await expect(CreateDiagnosticAsset().buildAsync()).resolves.toBeInstanceOf(Uint8Array);

        const asset = new NodeAsset("fatal diagnostics");
        const source = new FatalSourceBlock("fatal source", asset);
        const exporter = new BytesExportBlock("export", asset);
        source.output.connectTo(exporter.input);
        const primary = new Error("unsupported document version");
        source.error = primary;

        await expect(asset.buildAsync()).rejects.toBe(primary);
    });

    it("preserves a primitive thrown value without manufacturing a build report", async () => {
        const asset = new NodeAsset("primitive failure");
        const source = new FatalSourceBlock("fatal source", asset);
        const exporter = new BytesExportBlock("export", asset);
        source.output.connectTo(exporter.input);
        source.error = "primitive failure";

        const thrown = await asset.buildAsync().catch((error: unknown) => error);

        expect(thrown).toBe("primitive failure");
        expect(GetNodeAssetBuildReport(thrown)).toBeUndefined();
    });

    it("keeps prior result metadata immutable when a later build reuses the same export bytes", async () => {
        const asset = new NodeAsset("reused export bytes");
        const source = new ReusedBytesSourceBlock("source", asset);
        const exporter = new BytesExportBlock("export", asset);
        source.output.connectTo(exporter.input);

        const first = await asset.buildAsync();
        const second = await asset.buildAsync();

        expect(first).not.toBe(second);
        expect(first.diagnostics).toMatchObject([{ code: "BUILD_1" }]);
        expect(second.diagnostics).toMatchObject([{ code: "BUILD_2" }]);
    });
});
