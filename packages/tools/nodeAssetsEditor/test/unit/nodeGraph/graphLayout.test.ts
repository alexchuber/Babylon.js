import { describe, expect, it } from "vitest";

import { ComputeGraphLayout } from "../../../src/nodeGraph/graphLayout";
import { type IGraphNode } from "../../../src/nodeGraph/graphModel";

function CreateNode(id: string): IGraphNode {
    return {
        id,
        title: id,
        headerColor: "#000000",
        position: { x: 0, y: 0 },
        collapsed: false,
        ports: [
            { id: `${id}-input`, name: "input", direction: "input", color: "#000000" },
            { id: `${id}-output`, name: "output", direction: "output", color: "#000000" },
        ],
    };
}

describe("ComputeGraphLayout", () => {
    it("places nodes downstream of a cycle in a later column", () => {
        const nodes = [CreateNode("cycle-a"), CreateNode("cycle-b"), CreateNode("downstream")];
        const layout = ComputeGraphLayout(
            nodes,
            [
                { id: "a-to-b", fromPortId: "cycle-a-output", toPortId: "cycle-b-input" },
                { id: "b-to-a", fromPortId: "cycle-b-output", toPortId: "cycle-a-input" },
                { id: "b-to-downstream", fromPortId: "cycle-b-output", toPortId: "downstream-input" },
            ],
            []
        );

        const cycleX = Math.max(layout.nodePositions.get("cycle-a")!.x, layout.nodePositions.get("cycle-b")!.x);
        expect(layout.nodePositions.get("downstream")!.x).toBeGreaterThan(cycleX);
    });
});
