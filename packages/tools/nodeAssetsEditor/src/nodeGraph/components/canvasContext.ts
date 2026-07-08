/**
 * Internal React context shared between the canvas orchestrator (GraphCanvas) and its child views
 * (nodes, ports, wires, frames). It exposes the current camera, a screen-to-graph converter, and the
 * gesture initiators the children call on pointer-down so all interaction math stays centralized in
 * GraphCanvas.
 */

import { createContext, useContext, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

import { type EditorContextValue } from "../editorContext";

/**
 * The canvas camera: a pan offset (in screen pixels) plus a zoom scale. A graph-space point p maps to
 * the screen as `p * zoom + {x, y}`.
 */
export type Camera = {
    /** Horizontal pan offset in screen pixels. */
    x: number;
    /** Vertical pan offset in screen pixels. */
    y: number;
    /** Zoom scale (1 = 100%). */
    zoom: number;
};

/**
 * The kind of element a context menu was opened on.
 */
export type ContextMenuTarget = { kind: "canvas" } | { kind: "node"; nodeId: string } | { kind: "wire"; wireId: string };

/**
 * The value provided by the canvas to its child views. It deliberately omits the camera so that
 * panning and zooming (which change the camera very frequently) only re-render the canvas world-layer
 * transform, not every node/wire/frame consumer.
 */
export type CanvasContextValue = {
    /** The host editor context (store, palette, property builder, view controller). */
    readonly editor: EditorContextValue;
    /** Begins a node interaction (select and/or drag) from a pointer-down on a node header/body. */
    readonly beginNodeInteraction: (nodeId: string, event: ReactPointerEvent) => void;
    /** Begins a frame interaction (select and drag the frame with its members). */
    readonly beginFrameInteraction: (frameId: string, event: ReactPointerEvent) => void;
    /** Begins dragging a new wire out of a port. */
    readonly beginPortInteraction: (portId: string, event: ReactPointerEvent) => void;
    /** Selects a wire (typically on click). */
    readonly selectWire: (wireId: string, event: ReactPointerEvent) => void;
    /** Opens a context menu for the given target at the pointer position. */
    readonly openContextMenu: (target: ContextMenuTarget, event: ReactMouseEvent) => void;
};

const CanvasContext = createContext<CanvasContextValue | undefined>(undefined);

/**
 * Provider for the internal canvas context.
 */
export const CanvasContextProvider = CanvasContext.Provider;

/**
 * Reads the internal canvas context. Throws if used outside a GraphCanvas.
 * @returns The current canvas context value.
 */
export function useCanvasContext(): CanvasContextValue {
    const value = useContext(CanvasContext);
    if (!value) {
        throw new Error("useCanvasContext must be used within a GraphCanvas.");
    }
    return value;
}
