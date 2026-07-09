import { describe, expect, it } from "vitest";

import { FindNearestConnectablePort, FindNodesInRegion } from "../../../src/nodeGraph/canvasHitTest";
import { type Bounds } from "../../../src/nodeGraph/geometry";
import { type IGraphNode, type IGraphPort, type PortDirection } from "../../../src/nodeGraph/graphModel";

function Port(id: string, direction: PortDirection): IGraphPort {
    return { id, name: id, direction, color: "#ffffff" };
}

function MakeNode(id: string, x: number, y: number, ports: IGraphPort[], collapsed = false): IGraphNode {
    return { id, title: id, headerColor: "#000000", ports, position: { x, y }, collapsed };
}

// output -> input is connectable, matching the editor's real direction rule.
function DirectionCanConnect(nodes: readonly IGraphNode[]): (from: string, to: string) => boolean {
    const directions = new Map<string, PortDirection>();
    for (const node of nodes) {
        for (const port of node.ports) {
            directions.set(port.id, port.direction);
        }
    }
    return (from, to) => directions.get(from) === "output" && directions.get(to) === "input";
}

describe("canvasHitTest.FindNearestConnectablePort", () => {
    it("picks the closest compatible port", () => {
        const nodes = [MakeNode("a", 0, 0, [Port("a-out", "output")]), MakeNode("b", 300, 0, [Port("b-in", "input")]), MakeNode("c", 300, 100, [Port("c-in", "input")])];
        const result = FindNearestConnectablePort({
            nodes,
            fromPortId: "a-out",
            pointerWorld: { x: 305, y: 55 },
            zoom: 1,
            snapRadius: 28,
            canConnect: DirectionCanConnect(nodes),
        });
        expect(result).toBe("b-in");
    });

    it("returns undefined when nothing is connectable", () => {
        const nodes = [MakeNode("a", 0, 0, [Port("a-out", "output")]), MakeNode("b", 300, 0, [Port("b-in", "input")])];
        const result = FindNearestConnectablePort({
            nodes,
            fromPortId: "a-out",
            pointerWorld: { x: 300, y: 50 },
            zoom: 1,
            snapRadius: 28,
            canConnect: () => false,
        });
        expect(result).toBeUndefined();
    });

    it("never returns the port the wire started from", () => {
        const nodes = [MakeNode("a", 0, 0, [Port("a-out", "output")])];
        const result = FindNearestConnectablePort({
            nodes,
            fromPortId: "a-out",
            pointerWorld: { x: 200, y: 50 },
            zoom: 1,
            snapRadius: 28,
            canConnect: () => true,
        });
        expect(result).toBeUndefined();
    });

    it("skips ports on collapsed nodes", () => {
        const nodes = [MakeNode("a", 0, 0, [Port("a-out", "output")]), MakeNode("b", 300, 0, [Port("b-in", "input")], true)];
        const result = FindNearestConnectablePort({
            nodes,
            fromPortId: "a-out",
            pointerWorld: { x: 300, y: 16 },
            zoom: 1,
            snapRadius: 28,
            canConnect: DirectionCanConnect(nodes),
        });
        expect(result).toBeUndefined();
    });

    it("respects the snap radius in screen pixels", () => {
        const nodes = [MakeNode("a", 0, 0, [Port("a-out", "output")]), MakeNode("b", 300, 0, [Port("b-in", "input")])];
        const query = { nodes, fromPortId: "a-out", zoom: 1, snapRadius: 28, canConnect: DirectionCanConnect(nodes) };
        expect(FindNearestConnectablePort({ ...query, pointerWorld: { x: 327, y: 50 } })).toBe("b-in");
        expect(FindNearestConnectablePort({ ...query, pointerWorld: { x: 329, y: 50 } })).toBeUndefined();
    });

    it("scales the snap radius with zoom", () => {
        const nodes = [MakeNode("a", 0, 0, [Port("a-out", "output")]), MakeNode("b", 300, 0, [Port("b-in", "input")])];
        // The pointer is 20 world units from b-in; at zoom 1 that is 20 screen px (inside the 28 px radius),
        // at zoom 2 it is 40 screen px (outside).
        const query = { nodes, fromPortId: "a-out", pointerWorld: { x: 320, y: 50 }, snapRadius: 28, canConnect: DirectionCanConnect(nodes) };
        expect(FindNearestConnectablePort({ ...query, zoom: 1 })).toBe("b-in");
        expect(FindNearestConnectablePort({ ...query, zoom: 2 })).toBeUndefined();
    });

    it("deterministically picks the first of two ports sharing a world position (overlapping-ports bug class)", () => {
        // Two nodes dropped at the same world coordinate produce ports at the same anchor. Only the first is
        // reachable; the second ("c-in") is unhittable. Extracting this makes that regression unit-testable.
        const nodes = [MakeNode("a", 0, 0, [Port("a-out", "output")]), MakeNode("b", 300, 0, [Port("b-in", "input")]), MakeNode("c", 300, 0, [Port("c-in", "input")])];
        const result = FindNearestConnectablePort({
            nodes,
            fromPortId: "a-out",
            pointerWorld: { x: 300, y: 50 },
            zoom: 1,
            snapRadius: 28,
            canConnect: DirectionCanConnect(nodes),
        });
        expect(result).toBe("b-in");
    });
});

describe("canvasHitTest.FindNodesInRegion", () => {
    const node = MakeNode("n", 0, 0, [Port("n-in", "input"), Port("n-out", "output")]);

    it("includes nodes that partially overlap the region", () => {
        const region: Bounds = { minX: -10, minY: -10, maxX: 10, maxY: 10 };
        expect(FindNodesInRegion([node], region)).toEqual(["n"]);
    });

    it("excludes nodes entirely outside the region", () => {
        const region: Bounds = { minX: 1000, minY: 1000, maxX: 1100, maxY: 1100 };
        expect(FindNodesInRegion([node], region)).toEqual([]);
    });

    it("treats a region touching a node edge as intersecting (inclusive)", () => {
        // The node's rendered bounds are (0,0)-(200,68); a region starting exactly at maxX=200 still counts.
        const region: Bounds = { minX: 200, minY: 0, maxX: 250, maxY: 68 };
        expect(FindNodesInRegion([node], region)).toEqual(["n"]);
    });

    it("returns an empty list when there are no nodes", () => {
        expect(FindNodesInRegion([], { minX: 0, minY: 0, maxX: 100, maxY: 100 })).toEqual([]);
    });
});
