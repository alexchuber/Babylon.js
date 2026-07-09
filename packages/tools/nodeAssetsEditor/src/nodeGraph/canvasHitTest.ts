/**
 * Pure spatial queries over graph nodes for the node-graph framework: finding the nearest port a
 * dragged wire could legally connect to, and finding the nodes inside a marquee region. These take
 * plain data plus an injected {@link NearestConnectablePortQuery.canConnect} predicate rather than the
 * editor state, so the framework stays runtime-agnostic and the hit-testing stays unit-testable.
 */

import { type IGraphNode, type Vec2 } from "./graphModel";
import { type Bounds, GetNodeBounds, GetPortAnchor, RectsIntersect } from "./geometry";

/**
 * The inputs to {@link FindNearestConnectablePort}.
 */
export type NearestConnectablePortQuery = {
    /** All nodes in the graph. */
    readonly nodes: readonly IGraphNode[];
    /** The port the wire is being dragged from. */
    readonly fromPortId: string;
    /** The current pointer position in graph (world) space. */
    readonly pointerWorld: Vec2;
    /** The current zoom scale, used to convert the world-space distance back into screen pixels. */
    readonly zoom: number;
    /** The maximum screen-space distance (in pixels) at which a port is considered a snap target. */
    readonly snapRadius: number;
    /** Predicate returning whether a wire from the first port to the second would be legal. */
    readonly canConnect: (fromPortId: string, toPortId: string) => boolean;
};

/**
 * Finds the closest port (in screen space) that could legally connect to the dragged port, so a wire
 * released near a port still connects instead of requiring a pixel-perfect drop on the port dot.
 *
 * The comparison is done in world space and scaled by `zoom`, which is exactly equivalent to comparing
 * screen-space distances (`client - screen = zoom * (world - anchor)` on each axis, with `zoom > 0`),
 * so the {@link NearestConnectablePortQuery.snapRadius} stays a screen-pixel radius without needing the
 * viewport origin.
 * @param query The nodes, dragged port, pointer position, zoom, snap radius, and connectivity predicate.
 * @returns The id of the nearest connectable port within the snap radius, or undefined if there is none.
 */
export function FindNearestConnectablePort(query: NearestConnectablePortQuery): string | undefined {
    const { nodes, fromPortId, pointerWorld, zoom, snapRadius, canConnect } = query;
    let bestPortId: string | undefined;
    let bestDistance = snapRadius;
    for (const node of nodes) {
        // Collapsed nodes do not render individual ports, so they are not valid snap targets.
        if (node.collapsed) {
            continue;
        }
        for (const port of node.ports) {
            if (port.id === fromPortId) {
                continue;
            }
            if (!canConnect(fromPortId, port.id) && !canConnect(port.id, fromPortId)) {
                continue;
            }
            const anchor = GetPortAnchor(node, port.id);
            if (!anchor) {
                continue;
            }
            const distance = zoom * Math.hypot(pointerWorld.x - anchor.x, pointerWorld.y - anchor.y);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestPortId = port.id;
            }
        }
    }
    return bestPortId;
}

/**
 * Returns the ids of all nodes whose rendered bounds intersect the given region, used to resolve a
 * marquee selection.
 * @param nodes The nodes to test.
 * @param region The selection region in graph space.
 * @returns The ids of the intersecting nodes.
 */
export function FindNodesInRegion(nodes: readonly IGraphNode[], region: Bounds): string[] {
    return nodes.filter((node) => RectsIntersect(GetNodeBounds(node), region)).map((node) => node.id);
}
