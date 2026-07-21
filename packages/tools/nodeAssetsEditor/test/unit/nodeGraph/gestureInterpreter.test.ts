import { describe, expect, it } from "vitest";

import {
    AdvanceGesture,
    BeginBackgroundGesture,
    BeginFrameGesture,
    BeginNodeGesture,
    BeginPortGesture,
    CancelGesture,
    CompleteGesture,
    type Gesture,
    type GestureAction,
} from "../../../src/nodeGraph/gestureInterpreter";

function Kinds(actions: readonly GestureAction[]): string[] {
    return actions.map((action) => action.kind);
}

describe("gestureInterpreter.BeginBackgroundGesture", () => {
    it("starts a pan on the middle button", () => {
        const { gesture, actions } = BeginBackgroundGesture({ pointerId: 7, button: 1, spaceHeld: false, additive: false, world: { x: 5, y: 6 }, local: { x: 7, y: 8 } });
        expect(gesture).toEqual({ kind: "pan", pointerId: 7, lastLocal: { x: 7, y: 8 }, moved: false, clearSelectionOnClick: false });
        expect(actions).toEqual([]);
    });

    it("starts a pan on space + left button", () => {
        const { gesture } = BeginBackgroundGesture({ pointerId: 7, button: 0, spaceHeld: true, additive: false, world: { x: 5, y: 6 }, local: { x: 7, y: 8 } });
        expect(gesture.kind).toBe("pan");
    });

    it("starts a pan on a plain left press", () => {
        const { gesture, actions } = BeginBackgroundGesture({ pointerId: 7, button: 0, spaceHeld: false, additive: false, world: { x: 5, y: 6 }, local: { x: 7, y: 8 } });
        expect(gesture.kind).toBe("pan");
        expect(actions).toEqual([]);
    });

    it("does not clear the selection on an additive (shift) left press", () => {
        const { gesture, actions } = BeginBackgroundGesture({ pointerId: 7, button: 0, spaceHeld: false, additive: true, world: { x: 5, y: 6 }, local: { x: 7, y: 8 } });
        expect(gesture.kind).toBe("marquee");
        expect(Kinds(actions)).toEqual(["setMarquee"]);
    });

    it("keeps additive marquee priority when Space is also held", () => {
        const { gesture } = BeginBackgroundGesture({ pointerId: 7, button: 0, spaceHeld: true, additive: true, world: { x: 5, y: 6 }, local: { x: 7, y: 8 } });
        expect(gesture.kind).toBe("marquee");
    });

    it("does nothing for other buttons", () => {
        const { gesture, actions } = BeginBackgroundGesture({ pointerId: 7, button: 2, spaceHeld: false, additive: false, world: { x: 0, y: 0 }, local: { x: 0, y: 0 } });
        expect(gesture).toEqual({ kind: "none" });
        expect(actions).toEqual([]);
    });
});

describe("gestureInterpreter.BeginNodeGesture", () => {
    it("selects an unselected node and brackets the interaction", () => {
        const { gesture, actions } = BeginNodeGesture({ pointerId: 7, nodeId: "n1", additive: false, isSelected: false, world: { x: 3, y: 4 } });
        expect(gesture).toEqual({ kind: "moveNodes", pointerId: 7, lastWorld: { x: 3, y: 4 }, moved: false });
        expect(actions).toEqual([{ kind: "selectNodes", nodeIds: ["n1"] }, { kind: "beginInteraction" }]);
    });

    it("toggles selection on an additive press", () => {
        const { actions } = BeginNodeGesture({ pointerId: 7, nodeId: "n1", additive: true, isSelected: true, world: { x: 0, y: 0 } });
        expect(actions).toEqual([{ kind: "toggleNodeSelection", nodeId: "n1" }, { kind: "beginInteraction" }]);
    });

    it("keeps an existing selection when the node is already selected", () => {
        const { actions } = BeginNodeGesture({ pointerId: 7, nodeId: "n1", additive: false, isSelected: true, world: { x: 0, y: 0 } });
        expect(actions).toEqual([{ kind: "beginInteraction" }]);
    });
});

describe("gestureInterpreter.BeginFrameGesture", () => {
    it("brackets the interaction and tracks the frame", () => {
        const { gesture, actions } = BeginFrameGesture({ pointerId: 7, frameId: "f1", world: { x: 9, y: 10 } });
        expect(gesture).toEqual({ kind: "moveFrame", pointerId: 7, frameId: "f1", lastWorld: { x: 9, y: 10 }, moved: false });
        expect(actions).toEqual([{ kind: "beginInteraction" }]);
    });
});

describe("gestureInterpreter.BeginPortGesture", () => {
    it("starts a wire and previews it from the anchor to the pointer", () => {
        const { gesture, actions } = BeginPortGesture({ pointerId: 7, portId: "p1", anchor: { x: 100, y: 50 }, world: { x: 120, y: 60 } });
        expect(gesture).toEqual({ kind: "wire", pointerId: 7, fromPortId: "p1", fromAnchor: { x: 100, y: 50 } });
        expect(actions).toEqual([{ kind: "setPendingWire", wire: { from: { x: 100, y: 50 }, to: { x: 120, y: 60 } } }]);
    });
});

describe("gestureInterpreter.AdvanceGesture", () => {
    it("ignores move and completion events from a pointer that does not own the gesture", () => {
        const gesture = BeginBackgroundGesture({
            pointerId: 7,
            button: 0,
            spaceHeld: false,
            additive: false,
            world: { x: 0, y: 0 },
            local: { x: 10, y: 10 },
        }).gesture;
        const moved = AdvanceGesture(gesture, { pointerId: 8, world: { x: 50, y: 50 }, local: { x: 60, y: 60 } });
        expect(moved.gesture).toBe(gesture);
        expect(moved.actions).toEqual([]);

        const completed = CompleteGesture(gesture, { pointerId: 8, world: { x: 50, y: 50 } });
        expect(completed.gesture).toBe(gesture);
        expect(completed.actions).toEqual([]);
    });

    it("pans by the viewport-local delta", () => {
        const gesture: Gesture = { kind: "pan", pointerId: 7, lastLocal: { x: 10, y: 10 }, moved: false, clearSelectionOnClick: true };
        const { gesture: next, actions } = AdvanceGesture(gesture, { pointerId: 7, world: { x: 0, y: 0 }, local: { x: 25, y: 4 } });
        expect(actions).toEqual([{ kind: "panBy", dx: 15, dy: -6 }]);
        expect(next).toEqual({ kind: "pan", pointerId: 7, lastLocal: { x: 25, y: 4 }, moved: true, clearSelectionOnClick: true });
    });

    it("ignores a zero-delta pan move without latching movement", () => {
        const gesture: Gesture = { kind: "pan", pointerId: 7, lastLocal: { x: 10, y: 10 }, moved: false, clearSelectionOnClick: true };
        const { gesture: next, actions } = AdvanceGesture(gesture, { pointerId: 7, world: { x: 0, y: 0 }, local: { x: 10, y: 10 } });
        expect(actions).toEqual([]);
        expect(next).toBe(gesture);
    });

    it("normalizes the marquee rectangle regardless of drag direction", () => {
        const gesture: Gesture = { kind: "marquee", pointerId: 7, startWorld: { x: 0, y: 0 }, startLocal: { x: 30, y: 40 }, additive: false };
        const { actions } = AdvanceGesture(gesture, { pointerId: 7, world: { x: 0, y: 0 }, local: { x: 10, y: 100 } });
        expect(actions).toEqual([{ kind: "setMarquee", rect: { x: 10, y: 40, width: 20, height: 60 } }]);
    });

    it("translates selected nodes and latches moved on a non-zero delta", () => {
        const gesture: Gesture = { kind: "moveNodes", pointerId: 7, lastWorld: { x: 0, y: 0 }, moved: false };
        const { gesture: next, actions } = AdvanceGesture(gesture, { pointerId: 7, world: { x: 5, y: -3 }, local: { x: 0, y: 0 } });
        expect(actions).toEqual([{ kind: "translateSelectedNodes", delta: { x: 5, y: -3 } }]);
        expect(next).toEqual({ kind: "moveNodes", pointerId: 7, lastWorld: { x: 5, y: -3 }, moved: true });
    });

    it("ignores a zero-delta node move and keeps the moved latch", () => {
        const moved: Gesture = { kind: "moveNodes", pointerId: 7, lastWorld: { x: 5, y: 5 }, moved: true };
        const { gesture: next, actions } = AdvanceGesture(moved, { pointerId: 7, world: { x: 5, y: 5 }, local: { x: 0, y: 0 } });
        expect(actions).toEqual([]);
        expect(next).toBe(moved);
    });

    it("translates a frame on a non-zero delta", () => {
        const gesture: Gesture = { kind: "moveFrame", pointerId: 7, frameId: "f1", lastWorld: { x: 0, y: 0 }, moved: false };
        const { gesture: next, actions } = AdvanceGesture(gesture, { pointerId: 7, world: { x: 2, y: 2 }, local: { x: 0, y: 0 } });
        expect(actions).toEqual([{ kind: "translateFrame", frameId: "f1", delta: { x: 2, y: 2 } }]);
        expect(next).toEqual({ kind: "moveFrame", pointerId: 7, frameId: "f1", lastWorld: { x: 2, y: 2 }, moved: true });
    });

    it("updates the pending wire endpoint while dragging a wire", () => {
        const gesture: Gesture = { kind: "wire", pointerId: 7, fromPortId: "p1", fromAnchor: { x: 100, y: 50 } };
        const { actions } = AdvanceGesture(gesture, { pointerId: 7, world: { x: 130, y: 70 }, local: { x: 0, y: 0 } });
        expect(actions).toEqual([{ kind: "setPendingWire", wire: { from: { x: 100, y: 50 }, to: { x: 130, y: 70 } } }]);
    });
});

describe("gestureInterpreter.CompleteGesture", () => {
    it("clears the selection when a primary background pan completes without movement", () => {
        const { gesture } = BeginBackgroundGesture({ pointerId: 7, button: 0, spaceHeld: false, additive: false, world: { x: 10, y: 20 }, local: { x: 30, y: 40 } });
        const { gesture: next, actions } = CompleteGesture(gesture, { pointerId: 7, world: { x: 10, y: 20 } });
        expect(next).toEqual({ kind: "none" });
        expect(actions).toEqual([{ kind: "clearSelection" }]);
    });

    it("preserves the selection when a primary background pan moved", () => {
        const started = BeginBackgroundGesture({ pointerId: 7, button: 0, spaceHeld: false, additive: false, world: { x: 10, y: 20 }, local: { x: 30, y: 40 } }).gesture;
        const advanced = AdvanceGesture(started, { pointerId: 7, world: { x: 10, y: 20 }, local: { x: 31, y: 40 } }).gesture;
        const { actions } = CompleteGesture(advanced, { pointerId: 7, world: { x: 10, y: 20 } });
        expect(actions).toEqual([]);
    });

    it.each([
        ["middle-button", { button: 1, spaceHeld: false }],
        ["Space + primary", { button: 0, spaceHeld: true }],
    ])("does not clear selection when an unmoved %s pan alias completes", (_name, input) => {
        const gesture = BeginBackgroundGesture({
            pointerId: 7,
            ...input,
            additive: false,
            world: { x: 10, y: 20 },
            local: { x: 30, y: 40 },
        }).gesture;
        const { actions } = CompleteGesture(gesture, { pointerId: 7, world: { x: 10, y: 20 } });
        expect(actions).toEqual([]);
    });

    it("selects nodes inside the marquee region and clears the overlay", () => {
        const gesture: Gesture = { kind: "marquee", pointerId: 7, startWorld: { x: 10, y: 80 }, startLocal: { x: 0, y: 0 }, additive: true };
        const { gesture: next, actions } = CompleteGesture(gesture, { pointerId: 7, world: { x: 40, y: 20 } });
        expect(actions).toEqual([
            { kind: "selectNodesInRegion", region: { minX: 10, minY: 20, maxX: 40, maxY: 80 }, additive: true },
            { kind: "setMarquee", rect: null },
        ]);
        expect(next).toEqual({ kind: "none" });
    });

    it("ends a node move interaction with the moved flag", () => {
        const gesture: Gesture = { kind: "moveNodes", pointerId: 7, lastWorld: { x: 0, y: 0 }, moved: true };
        const { actions } = CompleteGesture(gesture, { pointerId: 7, world: { x: 0, y: 0 } });
        expect(actions).toEqual([{ kind: "endInteraction", moved: true }]);
    });

    it("connects a wire to the resolved target port", () => {
        const gesture: Gesture = { kind: "wire", pointerId: 7, fromPortId: "p1", fromAnchor: { x: 0, y: 0 } };
        const { actions } = CompleteGesture(gesture, { pointerId: 7, world: { x: 0, y: 0 }, resolvedTargetPortId: "p2" });
        expect(actions).toEqual([
            { kind: "connect", fromPortId: "p1", toPortId: "p2" },
            { kind: "setPendingWire", wire: null },
        ]);
    });

    it("does not connect a wire to its own origin port", () => {
        const gesture: Gesture = { kind: "wire", pointerId: 7, fromPortId: "p1", fromAnchor: { x: 0, y: 0 } };
        const { actions } = CompleteGesture(gesture, { pointerId: 7, world: { x: 0, y: 0 }, resolvedTargetPortId: "p1" });
        expect(actions).toEqual([{ kind: "setPendingWire", wire: null }]);
    });

    it("clears the pending wire when there is no target", () => {
        const gesture: Gesture = { kind: "wire", pointerId: 7, fromPortId: "p1", fromAnchor: { x: 0, y: 0 } };
        const { actions } = CompleteGesture(gesture, { pointerId: 7, world: { x: 0, y: 0 } });
        expect(actions).toEqual([{ kind: "setPendingWire", wire: null }]);
    });

    it("resets to no gesture when idle", () => {
        const { gesture, actions } = CompleteGesture({ kind: "none" }, { pointerId: 7, world: { x: 0, y: 0 } });
        expect(gesture).toEqual({ kind: "none" });
        expect(actions).toEqual([]);
    });
});

describe("gestureInterpreter.CancelGesture", () => {
    it("cancels an unmoved primary pan without clearing selection", () => {
        const gesture = BeginBackgroundGesture({
            pointerId: 7,
            button: 0,
            spaceHeld: false,
            additive: false,
            world: { x: 10, y: 20 },
            local: { x: 30, y: 40 },
        }).gesture;
        const { gesture: next, actions } = CancelGesture(gesture, { pointerId: 7 });
        expect(next).toEqual({ kind: "none" });
        expect(actions).toEqual([]);
    });

    it("clears an active marquee without committing its selection", () => {
        const gesture: Gesture = {
            kind: "marquee",
            pointerId: 7,
            startWorld: { x: 10, y: 20 },
            startLocal: { x: 30, y: 40 },
            additive: true,
        };
        const { gesture: next, actions } = CancelGesture(gesture, { pointerId: 7 });
        expect(next).toEqual({ kind: "none" });
        expect(actions).toEqual([{ kind: "setMarquee", rect: null }]);
    });

    it("clears a pending wire without connecting it", () => {
        const gesture: Gesture = { kind: "wire", pointerId: 7, fromPortId: "p1", fromAnchor: { x: 10, y: 20 } };
        const { gesture: next, actions } = CancelGesture(gesture, { pointerId: 7 });
        expect(next).toEqual({ kind: "none" });
        expect(actions).toEqual([{ kind: "setPendingWire", wire: null }]);
    });

    it("closes a bracketed node move using its movement latch", () => {
        const gesture: Gesture = { kind: "moveNodes", pointerId: 7, lastWorld: { x: 10, y: 20 }, moved: true };
        const { gesture: next, actions } = CancelGesture(gesture, { pointerId: 7 });
        expect(next).toEqual({ kind: "none" });
        expect(actions).toEqual([{ kind: "endInteraction", moved: true }]);
    });

    it("closes a bracketed frame move without inventing movement", () => {
        const gesture: Gesture = { kind: "moveFrame", pointerId: 7, frameId: "f1", lastWorld: { x: 10, y: 20 }, moved: false };
        const { actions } = CancelGesture(gesture, { pointerId: 7 });
        expect(actions).toEqual([{ kind: "endInteraction", moved: false }]);
    });

    it("ignores cancellation from a pointer that does not own the gesture", () => {
        const gesture: Gesture = { kind: "pan", pointerId: 7, lastLocal: { x: 10, y: 20 }, moved: true, clearSelectionOnClick: true };
        const { gesture: next, actions } = CancelGesture(gesture, { pointerId: 8 });
        expect(next).toBe(gesture);
        expect(actions).toEqual([]);
    });
});
