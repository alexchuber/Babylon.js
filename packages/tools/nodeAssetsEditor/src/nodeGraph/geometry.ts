/**
 * Pure geometry helpers and layout constants for the node-graph framework. Node and port positions
 * follow a fixed layout convention so wire endpoints can be computed deterministically without
 * measuring the DOM — this keeps rendering predictable and Playwright-friendly.
 */

import { type IGraphNode, type IGraphPort, type Vec2 } from "./graphModel";

/** Fixed node width in graph units. */
export const NodeWidth = 200;
/** Height of a node header row in graph units. */
export const NodeHeaderHeight = 32;
/** Height of a single port row in graph units. */
export const PortRowHeight = 24;
/** Vertical padding between the header and the first port row. */
export const NodeBodyPaddingTop = 6;
/** Vertical padding below the last port row. */
export const NodeBodyPaddingBottom = 6;

/** Fixed frame header height in graph units. */
export const FrameHeaderHeight = 28;

/**
 * Returns the input and output ports of a node as separate ordered lists.
 * @param node The node whose ports to partition.
 * @returns The node's input ports and output ports.
 */
export function PartitionPorts(node: IGraphNode): { inputs: IGraphPort[]; outputs: IGraphPort[] } {
    const inputs: IGraphPort[] = [];
    const outputs: IGraphPort[] = [];
    for (const port of node.ports) {
        (port.direction === "input" ? inputs : outputs).push(port);
    }
    return { inputs, outputs };
}

/**
 * Computes the rendered size of a node in graph units, accounting for its collapsed state and the
 * number of port rows.
 * @param node The node to measure.
 * @returns The node width and height in graph units.
 */
export function GetNodeSize(node: IGraphNode): { width: number; height: number } {
    if (node.collapsed) {
        return { width: NodeWidth, height: NodeHeaderHeight };
    }
    const { inputs, outputs } = PartitionPorts(node);
    const rows = Math.max(inputs.length, outputs.length, 1);
    return { width: NodeWidth, height: NodeHeaderHeight + NodeBodyPaddingTop + rows * PortRowHeight + NodeBodyPaddingBottom };
}

/**
 * Computes the graph-space anchor point where a wire attaches to the given port.
 * @param node The node that owns the port.
 * @param portId The id of the port to locate.
 * @returns The anchor position in graph space, or undefined if the port is not on the node.
 */
export function GetPortAnchor(node: IGraphNode, portId: string): Vec2 | undefined {
    const { inputs, outputs } = PartitionPorts(node);
    const isInput = inputs.some((port) => port.id === portId);
    const list = isInput ? inputs : outputs;
    const index = list.findIndex((port) => port.id === portId);
    if (index < 0) {
        return undefined;
    }

    const x = isInput ? node.position.x : node.position.x + NodeWidth;
    if (node.collapsed) {
        return { x, y: node.position.y + NodeHeaderHeight / 2 };
    }
    const y = node.position.y + NodeHeaderHeight + NodeBodyPaddingTop + index * PortRowHeight + PortRowHeight / 2;
    return { x, y };
}

/**
 * Builds an SVG cubic-bezier path string connecting two anchor points, curving horizontally like a
 * typical node-editor wire.
 * @param from The starting anchor (usually an output port on the right of a node).
 * @param to The ending anchor (usually an input port on the left of a node).
 * @returns An SVG path `d` string.
 */
export function BuildWirePath(from: Vec2, to: Vec2): string {
    const horizontalDistance = Math.abs(to.x - from.x);
    const curvature = Math.max(40, horizontalDistance / 2);
    const c1x = from.x + curvature;
    const c2x = to.x - curvature;
    return `M ${from.x} ${from.y} C ${c1x} ${from.y} ${c2x} ${to.y} ${to.x} ${to.y}`;
}

/**
 * An axis-aligned bounding box in graph space.
 */
export type Bounds = {
    /** Minimum x (left edge). */
    minX: number;
    /** Minimum y (top edge). */
    minY: number;
    /** Maximum x (right edge). */
    maxX: number;
    /** Maximum y (bottom edge). */
    maxY: number;
};

/**
 * Computes the combined bounding box of a set of nodes, including their full rendered size.
 * @param nodes The nodes to bound.
 * @returns The bounding box, or undefined if there are no nodes.
 */
export function GetNodesBounds(nodes: readonly IGraphNode[]): Bounds | undefined {
    if (nodes.length === 0) {
        return undefined;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of nodes) {
        const size = GetNodeSize(node);
        minX = Math.min(minX, node.position.x);
        minY = Math.min(minY, node.position.y);
        maxX = Math.max(maxX, node.position.x + size.width);
        maxY = Math.max(maxY, node.position.y + size.height);
    }
    return { minX, minY, maxX, maxY };
}

/**
 * Determines whether two axis-aligned rectangles intersect.
 * @param a The first rectangle.
 * @param b The second rectangle.
 * @returns True if the rectangles overlap.
 */
export function RectsIntersect(a: Bounds, b: Bounds): boolean {
    return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}
