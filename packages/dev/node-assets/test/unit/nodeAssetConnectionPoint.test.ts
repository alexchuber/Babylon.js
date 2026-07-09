import { describe, expect, it } from "vitest";

import { NodeAsset } from "../../src/nodeAsset";
import { NodeAssetBlock } from "../../src/blockFoundation/nodeAssetBlock";
import { NodeAssetConnectionPoint } from "../../src/connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointDirection } from "../../src/connection/nodeAssetConnectionPointDirection";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";

/**
 * A minimal concrete block used to exercise the connection-point and block-foundation
 * behavior without depending on the glTF blocks.
 */
class TestBlock extends NodeAssetBlock {
    public static override ClassName = "TestBlock";

    public readonly input = this._registerInput("input", NodeAssetConnectionPointType.SCENE);
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.SCENE);

    public override async _buildBlockAsync(): Promise<void> {}
}

describe("NodeAssetConnectionPoint", () => {
    it("connects an output to an input", () => {
        const asset = new NodeAsset("test");
        const a = new TestBlock("a", asset);
        const b = new TestBlock("b", asset);

        a.output.connectTo(b.input);

        expect(a.output.isConnected).toBe(true);
        expect(b.input.isConnected).toBe(true);
        expect(b.input.connectedPoint).toBe(a.output);
    });

    it("normalizes input.connectTo(output) to an output -> input connection", () => {
        const asset = new NodeAsset("test");
        const a = new TestBlock("a", asset);
        const b = new TestBlock("b", asset);

        b.input.connectTo(a.output);

        expect(b.input.connectedPoint).toBe(a.output);
        expect(a.output.isConnected).toBe(true);
    });

    it("rejects connecting two outputs (same direction)", () => {
        const asset = new NodeAsset("test");
        const a = new TestBlock("a", asset);
        const b = new TestBlock("b", asset);

        expect(() => a.output.connectTo(b.output)).toThrow();
    });

    it("rejects connecting two inputs (same direction)", () => {
        const asset = new NodeAsset("test");
        const a = new TestBlock("a", asset);
        const b = new TestBlock("b", asset);

        expect(() => a.input.connectTo(b.input)).toThrow();
    });

    it("rejects connecting incompatible types", () => {
        const asset = new NodeAsset("test");
        const owner = new TestBlock("owner", asset);
        const output = new NodeAssetConnectionPoint("out", owner, NodeAssetConnectionPointType.SCENE, NodeAssetConnectionPointDirection.Output);
        const incompatibleType = (NodeAssetConnectionPointType.SCENE + 1) as NodeAssetConnectionPointType;
        const input = new NodeAssetConnectionPoint("in", owner, incompatibleType, NodeAssetConnectionPointDirection.Input);

        expect(() => output.connectTo(input)).toThrow();
    });

    it("reports isConnected as false before any connection", () => {
        const asset = new NodeAsset("test");
        const a = new TestBlock("a", asset);

        expect(a.input.isConnected).toBe(false);
        expect(a.output.isConnected).toBe(false);
    });
});
