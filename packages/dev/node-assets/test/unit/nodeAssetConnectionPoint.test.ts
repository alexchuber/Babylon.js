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

    it("fans one output out to multiple inputs; each input keeps its single source", () => {
        const asset = new NodeAsset("test");
        const source = new TestBlock("source", asset);
        const first = new TestBlock("first", asset);
        const second = new TestBlock("second", asset);

        source.output.connectTo(first.input);
        source.output.connectTo(second.input);

        expect(source.output.isConnected).toBe(true);
        expect(source.output.connectedPoints).toEqual([first.input, second.input]);
        expect(first.input.connectedPoint).toBe(source.output);
        expect(second.input.connectedPoint).toBe(source.output);
    });

    it("disconnecting a fanned-out output clears every input it fed", () => {
        const asset = new NodeAsset("test");
        const source = new TestBlock("source", asset);
        const first = new TestBlock("first", asset);
        const second = new TestBlock("second", asset);
        source.output.connectTo(first.input);
        source.output.connectTo(second.input);

        source.output.disconnect();

        expect(source.output.connectedPoints).toHaveLength(0);
        expect(first.input.isConnected).toBe(false);
        expect(second.input.isConnected).toBe(false);
    });

    it("reconnecting an input to a new output replaces its single source", () => {
        const asset = new NodeAsset("test");
        const first = new TestBlock("first", asset);
        const second = new TestBlock("second", asset);
        const consumer = new TestBlock("consumer", asset);

        first.output.connectTo(consumer.input);
        second.output.connectTo(consumer.input);

        expect(consumer.input.connectedPoint).toBe(second.output);
        expect(second.output.connectedPoints).toEqual([consumer.input]);
        expect(first.output.connectedPoints).toHaveLength(0);
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
