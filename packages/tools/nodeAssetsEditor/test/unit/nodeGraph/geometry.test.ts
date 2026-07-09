import { describe, expect, it } from "vitest";

import { GetNodeBounds } from "../../../src/nodeGraph/geometry";
import { type IGraphNode, type IGraphPort, type PortDirection } from "../../../src/nodeGraph/graphModel";

function Port(id: string, direction: PortDirection): IGraphPort {
    return { id, name: id, direction, color: "#ffffff" };
}

function MakeNode(id: string, x: number, y: number, ports: IGraphPort[], collapsed = false): IGraphNode {
    return { id, title: id, headerColor: "#000000", ports, position: { x, y }, collapsed };
}

describe("geometry.GetNodeBounds", () => {
    it("bounds an expanded node using its port-row height", () => {
        const node = MakeNode("n", 10, 20, [Port("i1", "input"), Port("i2", "input"), Port("o1", "output")]);
        // Header (32) + top padding (6) + 2 rows * 24 + bottom padding (6) = 92 tall, 200 wide.
        expect(GetNodeBounds(node)).toEqual({ minX: 10, minY: 20, maxX: 210, maxY: 112 });
    });

    it("bounds a collapsed node to just its header", () => {
        const node = MakeNode("n", 10, 20, [Port("i1", "input"), Port("o1", "output")], true);
        expect(GetNodeBounds(node)).toEqual({ minX: 10, minY: 20, maxX: 210, maxY: 52 });
    });
});
