/**
 * The pure gesture state machine for the node-graph canvas. It maps pointer input plus the current
 * gesture to the next gesture and a list of discrete {@link GestureAction}s to perform, with no DOM,
 * React, or editor-state access. All coordinates are pre-converted by the caller into world space (graph
 * units) and viewport-local space (client pixels minus the viewport origin), so the interpreter never
 * touches the camera or the DOM. The caller executes the returned actions against its React state and
 * editor store, which keeps every interaction decision here and unit-testable.
 */

import { type Vec2 } from "./graphModel";
import { type Bounds } from "./geometry";

/**
 * The world-space endpoints of a wire being dragged from a port but not yet committed.
 */
export type PendingWire = {
    /** World-space start anchor (the port the drag originated from). */
    readonly from: Vec2;
    /** World-space current pointer position. */
    readonly to: Vec2;
};

/**
 * A selection marquee rectangle in viewport-local pixels.
 */
export type MarqueeRect = {
    /** Left edge in viewport-local pixels. */
    readonly x: number;
    /** Top edge in viewport-local pixels. */
    readonly y: number;
    /** Width in pixels. */
    readonly width: number;
    /** Height in pixels. */
    readonly height: number;
};

/**
 * The active pointer gesture. All interaction sequencing is centralized here so the canvas component and
 * its child views stay free of gesture logic.
 */
export type Gesture =
    | { readonly kind: "none" }
    | { readonly kind: "pan"; readonly lastLocal: Vec2 }
    | { readonly kind: "marquee"; readonly startWorld: Vec2; readonly startLocal: Vec2; readonly additive: boolean }
    | { readonly kind: "moveNodes"; readonly lastWorld: Vec2; readonly moved: boolean }
    | { readonly kind: "moveFrame"; readonly frameId: string; readonly lastWorld: Vec2; readonly moved: boolean }
    | { readonly kind: "wire"; readonly fromPortId: string; readonly fromAnchor: Vec2 };

/**
 * A discrete side effect the canvas component performs in response to a gesture transition. The
 * interpreter decides *what* should happen; the component decides *how* (which React setter or editor
 * method to call).
 */
export type GestureAction =
    | { readonly kind: "clearSelection" }
    | { readonly kind: "selectNodes"; readonly nodeIds: readonly string[] }
    | { readonly kind: "toggleNodeSelection"; readonly nodeId: string }
    | { readonly kind: "selectNodesInRegion"; readonly region: Bounds; readonly additive: boolean }
    | { readonly kind: "beginInteraction" }
    | { readonly kind: "endInteraction"; readonly moved: boolean }
    | { readonly kind: "translateSelectedNodes"; readonly delta: Vec2 }
    | { readonly kind: "translateFrame"; readonly frameId: string; readonly delta: Vec2 }
    | { readonly kind: "panBy"; readonly dx: number; readonly dy: number }
    | { readonly kind: "setMarquee"; readonly rect: MarqueeRect | null }
    | { readonly kind: "setPendingWire"; readonly wire: PendingWire | null }
    | { readonly kind: "connect"; readonly fromPortId: string; readonly toPortId: string };

/**
 * The result of a gesture transition: the next gesture and the actions to perform.
 */
export type GestureResult = {
    /** The gesture after the transition. */
    readonly gesture: Gesture;
    /** The side effects to perform, in order. */
    readonly actions: readonly GestureAction[];
};

const None: Gesture = { kind: "none" };

/**
 * Begins a gesture from a pointer-down on the empty canvas background: middle-button or space+left starts
 * a pan; a plain left press starts a marquee (clearing the selection first unless it is additive).
 * @param input The pressed button, modifier state, and pointer position in world and viewport-local space.
 * @returns The started gesture and its initial actions.
 */
export function BeginBackgroundGesture(input: {
    readonly button: number;
    readonly spaceHeld: boolean;
    readonly additive: boolean;
    readonly world: Vec2;
    readonly local: Vec2;
}): GestureResult {
    const { button, spaceHeld, additive, world, local } = input;
    const isPan = button === 1 || (button === 0 && spaceHeld);
    if (isPan) {
        return { gesture: { kind: "pan", lastLocal: local }, actions: [] };
    }
    if (button === 0) {
        const actions: GestureAction[] = [];
        if (!additive) {
            actions.push({ kind: "clearSelection" });
        }
        actions.push({ kind: "setMarquee", rect: { x: local.x, y: local.y, width: 0, height: 0 } });
        return { gesture: { kind: "marquee", startWorld: world, startLocal: local, additive }, actions };
    }
    return { gesture: None, actions: [] };
}

/**
 * Begins dragging one or more nodes from a pointer-down on a node. Selects the node (or toggles it when
 * additive) unless it is already selected, then brackets the drag with an interaction for undo.
 * @param input The node id, whether the press is additive, whether the node is already selected, and the
 * pointer position in world space.
 * @returns The move-nodes gesture and its selection/interaction actions.
 */
export function BeginNodeGesture(input: { readonly nodeId: string; readonly additive: boolean; readonly isSelected: boolean; readonly world: Vec2 }): GestureResult {
    const { nodeId, additive, isSelected, world } = input;
    const actions: GestureAction[] = [];
    if (additive) {
        actions.push({ kind: "toggleNodeSelection", nodeId });
    } else if (!isSelected) {
        actions.push({ kind: "selectNodes", nodeIds: [nodeId] });
    }
    actions.push({ kind: "beginInteraction" });
    return { gesture: { kind: "moveNodes", lastWorld: world, moved: false }, actions };
}

/**
 * Begins dragging a frame (and the nodes it groups) from a pointer-down on the frame.
 * @param input The frame id and the pointer position in world space.
 * @returns The move-frame gesture and its interaction action.
 */
export function BeginFrameGesture(input: { readonly frameId: string; readonly world: Vec2 }): GestureResult {
    const { frameId, world } = input;
    return { gesture: { kind: "moveFrame", frameId, lastWorld: world, moved: false }, actions: [{ kind: "beginInteraction" }] };
}

/**
 * Begins dragging a new wire out of a port.
 * @param input The origin port id, its world-space anchor, and the pointer position in world space.
 * @returns The wire gesture and the initial pending-wire preview.
 */
export function BeginPortGesture(input: { readonly portId: string; readonly anchor: Vec2; readonly world: Vec2 }): GestureResult {
    const { portId, anchor, world } = input;
    return { gesture: { kind: "wire", fromPortId: portId, fromAnchor: anchor }, actions: [{ kind: "setPendingWire", wire: { from: anchor, to: world } }] };
}

/**
 * Advances the active gesture on pointer-move, producing the incremental actions for the current frame.
 * Node and frame moves ignore zero-length deltas and latch a `moved` flag so a click is distinguished
 * from a drag when the interaction is later committed.
 * @param gesture The active gesture.
 * @param input The pointer position in world and viewport-local space.
 * @returns The updated gesture and the actions for this move.
 */
export function AdvanceGesture(gesture: Gesture, input: { readonly world: Vec2; readonly local: Vec2 }): GestureResult {
    const { world, local } = input;
    switch (gesture.kind) {
        case "pan": {
            const dx = local.x - gesture.lastLocal.x;
            const dy = local.y - gesture.lastLocal.y;
            return { gesture: { kind: "pan", lastLocal: local }, actions: [{ kind: "panBy", dx, dy }] };
        }
        case "marquee": {
            const rect: MarqueeRect = {
                x: Math.min(gesture.startLocal.x, local.x),
                y: Math.min(gesture.startLocal.y, local.y),
                width: Math.abs(local.x - gesture.startLocal.x),
                height: Math.abs(local.y - gesture.startLocal.y),
            };
            return { gesture, actions: [{ kind: "setMarquee", rect }] };
        }
        case "moveNodes": {
            const delta = { x: world.x - gesture.lastWorld.x, y: world.y - gesture.lastWorld.y };
            if (delta.x === 0 && delta.y === 0) {
                return { gesture, actions: [] };
            }
            return { gesture: { kind: "moveNodes", lastWorld: world, moved: true }, actions: [{ kind: "translateSelectedNodes", delta }] };
        }
        case "moveFrame": {
            const delta = { x: world.x - gesture.lastWorld.x, y: world.y - gesture.lastWorld.y };
            if (delta.x === 0 && delta.y === 0) {
                return { gesture, actions: [] };
            }
            return {
                gesture: { kind: "moveFrame", frameId: gesture.frameId, lastWorld: world, moved: true },
                actions: [{ kind: "translateFrame", frameId: gesture.frameId, delta }],
            };
        }
        case "wire": {
            return { gesture, actions: [{ kind: "setPendingWire", wire: { from: gesture.fromAnchor, to: world } }] };
        }
        default:
            return { gesture, actions: [] };
    }
}

/**
 * Completes the active gesture on pointer-up and resets to no gesture. A marquee selects the nodes in its
 * region; a node/frame move ends its interaction (passing whether it actually moved); a wire connects to
 * the resolved target port when there is one and it differs from the origin.
 * @param gesture The active gesture.
 * @param input The pointer position in world space and, for wire gestures, the target port the caller
 * resolved from the drop position (a direct hit or the nearest connectable port), if any.
 * @returns The reset gesture and the actions that commit the gesture.
 */
export function CompleteGesture(gesture: Gesture, input: { readonly world: Vec2; readonly resolvedTargetPortId?: string }): GestureResult {
    const { world, resolvedTargetPortId } = input;
    switch (gesture.kind) {
        case "marquee": {
            const region: Bounds = {
                minX: Math.min(gesture.startWorld.x, world.x),
                minY: Math.min(gesture.startWorld.y, world.y),
                maxX: Math.max(gesture.startWorld.x, world.x),
                maxY: Math.max(gesture.startWorld.y, world.y),
            };
            return {
                gesture: None,
                actions: [
                    { kind: "selectNodesInRegion", region, additive: gesture.additive },
                    { kind: "setMarquee", rect: null },
                ],
            };
        }
        case "moveNodes":
        case "moveFrame":
            return { gesture: None, actions: [{ kind: "endInteraction", moved: gesture.moved }] };
        case "wire": {
            const actions: GestureAction[] = [];
            if (resolvedTargetPortId && resolvedTargetPortId !== gesture.fromPortId) {
                actions.push({ kind: "connect", fromPortId: gesture.fromPortId, toPortId: resolvedTargetPortId });
            }
            actions.push({ kind: "setPendingWire", wire: null });
            return { gesture: None, actions };
        }
        default:
            return { gesture: None, actions: [] };
    }
}
