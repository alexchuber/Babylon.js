import { describe, expect, it } from "vitest";

import { NodeAsset } from "node-assets/nodeAsset";
import { NodeAssetBlock } from "node-assets/blockFoundation/nodeAssetBlock";
import { NodeAssetConnectionPointType } from "node-assets/connection/nodeAssetConnectionPointType";

import { NumberPortColor, ScenePortColor, type IBlockDescriptor } from "../../src/nodeAssets/blockCatalog";
import { BlockToNode, NodeIdForBlock, PointToPort, PortIdForPoint } from "../../src/nodeAssets/blockNodeMapping";

class MappingTestBlock extends NodeAssetBlock {
    public static override ClassName = "MappingTestBlock";

    public readonly scene = this._registerInput("scene", NodeAssetConnectionPointType.SCENE);
    public readonly count = this._registerInput("count", NodeAssetConnectionPointType.NUMBER);
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.SCENE);

    public override async _buildBlockAsync(): Promise<void> {}
}

const FakeDescriptor = { headerColor: "#abcdef" } as unknown as IBlockDescriptor;

describe("blockNodeMapping", () => {
    it("derives a stable node id from the block's unique id", () => {
        const asset = new NodeAsset("test");
        const block = new MappingTestBlock("block", asset);

        expect(NodeIdForBlock(block)).toBe(`node-${block.uniqueId}`);
        expect(NodeIdForBlock(block)).toBe(NodeIdForBlock(block));
    });

    it("encodes owner, direction, and name in a port id", () => {
        const asset = new NodeAsset("test");
        const block = new MappingTestBlock("block", asset);

        expect(PortIdForPoint(block, block.scene)).toBe(`port-${block.uniqueId}-in-scene`);
        expect(PortIdForPoint(block, block.output)).toBe(`port-${block.uniqueId}-out-output`);
    });

    it("maps a connection point to a typed, colored port", () => {
        const asset = new NodeAsset("test");
        const block = new MappingTestBlock("block", asset);

        expect(PointToPort(block, block.scene)).toEqual({
            id: PortIdForPoint(block, block.scene),
            name: "Scene",
            direction: "input",
            color: ScenePortColor,
        });
        expect(PointToPort(block, block.count)).toEqual({
            id: PortIdForPoint(block, block.count),
            name: "Number",
            direction: "input",
            color: NumberPortColor,
        });
        expect(PointToPort(block, block.output).direction).toBe("output");
    });

    it("builds a node with input ports before output ports", () => {
        const asset = new NodeAsset("test");
        const block = new MappingTestBlock("block", asset);

        const node = BlockToNode(block, FakeDescriptor, { x: 12, y: 34 }, "Title", true);

        expect(node).toEqual({
            id: NodeIdForBlock(block),
            title: "Title",
            headerColor: "#abcdef",
            position: { x: 12, y: 34 },
            collapsed: true,
            ports: [PointToPort(block, block.scene), PointToPort(block, block.count), PointToPort(block, block.output)],
        });
        expect(node.ports.map((port) => port.direction)).toEqual(["input", "input", "output"]);
    });
});
