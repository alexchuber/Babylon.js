/**
 * The reusable, editor-agnostic visual model consumed by the node-graph framework.
 *
 * These types describe *only* what the canvas needs to render and edit a graph. They intentionally
 * carry no domain semantics (no operations, no runtime, no asset concepts) so the framework can later
 * be promoted into a shared node editor and fed real data by any host application.
 */

/**
 * A 2D point in graph (world) space, before pan/zoom are applied.
 */
export type Vec2 = {
    /** Horizontal coordinate in graph space. */
    x: number;
    /** Vertical coordinate in graph space. */
    y: number;
};

/**
 * The direction of a port: inputs are drawn on the left of a node, outputs on the right.
 */
export type PortDirection = "input" | "output";

/**
 * A single connection point on a node.
 */
export interface IGraphPort {
    /** Stable unique identifier, unique across the whole graph. */
    readonly id: string;
    /** Human readable label shown next to the port dot. */
    readonly name: string;
    /** Whether this port accepts incoming wires (input) or originates them (output). */
    readonly direction: PortDirection;
    /** Data-driven dot color (e.g. a type color). Applied inline as visual data, not theme chrome. */
    readonly color: string;
}

/**
 * A node in the graph: a titled, colored box exposing a set of typed ports.
 */
export interface IGraphNode {
    /** Stable unique identifier. */
    readonly id: string;
    /** Title shown in the node header. */
    title: string;
    /** Data-driven header color. Applied inline as visual data, not theme chrome. */
    headerColor: string;
    /** The ports exposed by this node. */
    readonly ports: readonly IGraphPort[];
    /** Top-left position of the node in graph space. */
    position: Vec2;
    /** When true, the node body (ports) is hidden and only the header is shown. */
    collapsed: boolean;
    /** Host-owned expanded-subgraph presentation state, when this node represents an aggregate. */
    aggregateExpanded?: boolean;
}

/**
 * A directed connection between an output port and an input port.
 */
export interface IGraphWire {
    /** Stable unique identifier. */
    readonly id: string;
    /** The id of the originating (output) port. */
    readonly fromPortId: string;
    /** The id of the destination (input) port. */
    readonly toPortId: string;
}

/**
 * A titled, colored rectangle that groups a set of nodes and moves them together.
 */
export interface IGraphFrame {
    /** Stable unique identifier. */
    readonly id: string;
    /** Title shown in the frame header. */
    label: string;
    /** Data-driven frame color. Applied inline as visual data, not theme chrome. */
    color: string;
    /** Top-left position of the frame in graph space. */
    position: Vec2;
    /** Frame size in graph space. */
    size: { width: number; height: number };
    /** The ids of the nodes grouped by this frame. */
    nodeIds: readonly string[];
    /** When true, the frame is drawn collapsed. */
    collapsed: boolean;
    /** Identifies a host-projected aggregate frame rather than an authored layout frame. */
    kind?: "aggregate";
    /** The compact aggregate node whose projected children this frame contains. */
    aggregateNodeId?: string;
}

/**
 * An immutable, serializable snapshot of the full graph state, used for undo/redo and copy/paste.
 */
export interface IGraphSnapshot {
    /** All nodes in the graph. */
    readonly nodes: readonly IGraphNode[];
    /** All wires connecting node ports. */
    readonly wires: readonly IGraphWire[];
    /** All frames grouping nodes. */
    readonly frames: readonly IGraphFrame[];
}
