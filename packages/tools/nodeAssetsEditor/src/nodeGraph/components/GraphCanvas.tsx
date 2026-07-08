import {
    type CSSProperties,
    type DragEvent as ReactDragEvent,
    type FunctionComponent,
    type PointerEvent as ReactPointerEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import { makeStyles, shorthands, tokens } from "@fluentui/react-components";

import { type EditorContextValue } from "../editorContext";
import { type GraphClipboard } from "../editorState";
import { type Vec2 } from "../graphModel";
import { type Bounds, GetNodeSize, GetNodesBounds, GetPortAnchor, RectsIntersect } from "../geometry";
import { type Camera, type ContextMenuTarget, type CanvasContextValue, CanvasContextProvider } from "./canvasContext";
import { type PendingWire, GraphWiresLayer } from "./GraphWiresLayer";

import { PaletteDragFormat } from "../paletteModel";
import { GraphFrameView } from "./GraphFrameView";
import { GraphMinimap } from "./GraphMinimap";
import { GraphNodeView } from "./GraphNodeView";
import { ContextMenu, type ContextMenuItem } from "shared-ui-components/fluent/primitives/contextMenu";
import { useObservableState } from "shared-ui-components/modularTool/hooks/observableHooks";

const MinZoom = 0.2;
const MaxZoom = 3;
const GridSpacing = 24;
const PasteOffset = 24;
// Screen-space radius (px) within which a released wire snaps to the nearest compatible port.
const ConnectSnapRadius = 28;

const Clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// The active pointer gesture. All interaction math is centralized here so child views stay simple.
type Gesture =
    | { kind: "none" }
    | { kind: "pan"; lastX: number; lastY: number }
    | { kind: "marquee"; startWorld: Vec2; startClientX: number; startClientY: number; additive: boolean }
    | { kind: "moveNodes"; lastWorld: Vec2; moved: boolean }
    | { kind: "moveFrame"; frameId: string; lastWorld: Vec2; moved: boolean }
    | { kind: "wire"; fromPortId: string; fromAnchor: Vec2 };

const useStyles = makeStyles({
    root: {
        position: "absolute",
        inset: "0",
        overflow: "hidden",
        backgroundColor: tokens.colorNeutralBackground3,
        outlineStyle: "none",
        touchAction: "none",
    },
    trigger: {
        position: "absolute",
        inset: "0",
    },
    world: {
        position: "absolute",
        top: "0",
        left: "0",
        width: "0",
        height: "0",
        transformOrigin: "0 0",
    },
    marquee: {
        position: "absolute",
        ...shorthands.border(tokens.strokeWidthThin, "solid", tokens.colorBrandStroke1),
        backgroundColor: tokens.colorBrandBackground2,
        opacity: 0.3,
        pointerEvents: "none",
    },
});

const GetNodeBounds = (position: Vec2, size: { width: number; height: number }): Bounds => {
    return { minX: position.x, minY: position.y, maxX: position.x + size.width, maxY: position.y + size.height };
};

/**
 * The interactive node-graph canvas: renders frames, wires, and nodes in a pan/zoom world layer and
 * owns all pointer, keyboard, and drag-and-drop interactions (select, marquee, move, connect, delete,
 * copy/paste, context menu, zoom-to-fit, minimap). It is fed a host {@link EditorContextValue} and
 * stays agnostic about what the graph represents.
 * @param props - Component props.
 * @returns The rendered canvas.
 */
export const GraphCanvas: FunctionComponent<{ context: EditorContextValue }> = (props) => {
    const { context } = props;
    const classes = useStyles();
    const { state } = context;

    // Re-render the canvas whenever graph contents change (adds/removes/moves).
    useObservableState(() => state.changeVersion, state.onChanged);

    const containerRef = useRef<HTMLDivElement>(null);
    const gestureRef = useRef<Gesture>({ kind: "none" });
    const clipboardRef = useRef<GraphClipboard | null>(null);
    const spaceHeldRef = useRef(false);
    const didInitialFitRef = useRef(false);

    const [camera, setCameraState] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
    const cameraRef = useRef(camera);
    const [size, setSize] = useState({ width: 0, height: 0 });
    const [pendingWire, setPendingWire] = useState<PendingWire | null>(null);
    const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const [contextTarget, setContextTarget] = useState<ContextMenuTarget>({ kind: "canvas" });

    const setCamera = useCallback((next: Camera | ((current: Camera) => Camera)) => {
        const value = typeof next === "function" ? (next as (current: Camera) => Camera)(cameraRef.current) : next;
        cameraRef.current = value;
        setCameraState(value);
    }, []);

    const screenToWorld = useCallback((clientX: number, clientY: number): Vec2 => {
        const rect = containerRef.current?.getBoundingClientRect();
        const cam = cameraRef.current;
        const left = rect?.left ?? 0;
        const top = rect?.top ?? 0;
        return { x: (clientX - left - cam.x) / cam.zoom, y: (clientY - top - cam.y) / cam.zoom };
    }, []);

    // Frames all node content in the viewport. Stored in a ref so the registered command always runs
    // against the latest camera/size without re-registering.
    const fitRef = useRef<() => void>(() => {});
    fitRef.current = () => {
        const bounds = GetNodesBounds(state.nodes);
        if (!bounds || size.width === 0 || size.height === 0) {
            setCamera({ x: 0, y: 0, zoom: 1 });
            return;
        }
        const padding = 48;
        const contentWidth = Math.max(bounds.maxX - bounds.minX, 1);
        const contentHeight = Math.max(bounds.maxY - bounds.minY, 1);
        const zoom = Clamp(Math.min((size.width - padding * 2) / contentWidth, (size.height - padding * 2) / contentHeight), MinZoom, MaxZoom);
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerY = (bounds.minY + bounds.maxY) / 2;
        setCamera({ x: size.width / 2 - centerX * zoom, y: size.height / 2 - centerY * zoom, zoom });
    };

    // Measure the container and keep the minimap/zoom-to-fit in sync with its size.
    useEffect(() => {
        const element = containerRef.current;
        if (!element) {
            return undefined;
        }
        const observer = new ResizeObserver((entries) => {
            const rect = entries[0].contentRect;
            setSize({ width: rect.width, height: rect.height });
        });
        observer.observe(element);
        setSize({ width: element.clientWidth, height: element.clientHeight });
        return () => observer.disconnect();
    }, []);

    // Register the zoom-to-fit command with the host view controller (used by the toolbar).
    useEffect(() => {
        context.view.registerZoomToFit(() => fitRef.current());
        return () => context.view.registerZoomToFit(null);
    }, [context.view]);

    // Frame the seed graph on first layout.
    useEffect(() => {
        if (!didInitialFitRef.current && size.width > 0 && size.height > 0) {
            didInitialFitRef.current = true;
            fitRef.current();
        }
    }, [size]);

    const attemptConnect = useCallback(
        (portA: string, portB: string) => {
            const directionA = state.getPortDirection(portA);
            const directionB = state.getPortDirection(portB);
            if (directionA === "output" && directionB === "input") {
                state.addWire(portA, portB);
            } else if (directionA === "input" && directionB === "output") {
                state.addWire(portB, portA);
            }
        },
        [state]
    );

    // Finds the closest port (in screen space) that could legally connect to the dragged port, so a wire
    // released near a port still connects instead of requiring a pixel-perfect drop on the port dot.
    const findNearestConnectablePort = useCallback(
        (fromPortId: string, clientX: number, clientY: number): string | undefined => {
            const rect = containerRef.current?.getBoundingClientRect();
            const left = rect?.left ?? 0;
            const top = rect?.top ?? 0;
            const cam = cameraRef.current;
            let bestPortId: string | undefined;
            let bestDistance = ConnectSnapRadius;
            for (const node of state.nodes) {
                // Collapsed nodes do not render individual ports, so they are not valid snap targets.
                if (node.collapsed) {
                    continue;
                }
                for (const port of node.ports) {
                    if (port.id === fromPortId) {
                        continue;
                    }
                    if (!state.canConnect(fromPortId, port.id) && !state.canConnect(port.id, fromPortId)) {
                        continue;
                    }
                    const anchor = GetPortAnchor(node, port.id);
                    if (!anchor) {
                        continue;
                    }
                    const screenX = left + cam.x + anchor.x * cam.zoom;
                    const screenY = top + cam.y + anchor.y * cam.zoom;
                    const distance = Math.hypot(clientX - screenX, clientY - screenY);
                    if (distance < bestDistance) {
                        bestDistance = distance;
                        bestPortId = port.id;
                    }
                }
            }
            return bestPortId;
        },
        [state]
    );

    // Persistent window listeners drive the active gesture so dragging continues outside the canvas.
    useEffect(() => {
        const onPointerMove = (event: PointerEvent) => {
            const gesture = gestureRef.current;
            switch (gesture.kind) {
                case "pan": {
                    const dx = event.clientX - gesture.lastX;
                    const dy = event.clientY - gesture.lastY;
                    gesture.lastX = event.clientX;
                    gesture.lastY = event.clientY;
                    setCamera((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
                    break;
                }
                case "marquee": {
                    const rect = containerRef.current?.getBoundingClientRect();
                    const left = rect?.left ?? 0;
                    const top = rect?.top ?? 0;
                    const x0 = gesture.startClientX - left;
                    const y0 = gesture.startClientY - top;
                    const x1 = event.clientX - left;
                    const y1 = event.clientY - top;
                    setMarquee({ x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) });
                    break;
                }
                case "moveNodes": {
                    const world = screenToWorld(event.clientX, event.clientY);
                    const delta = { x: world.x - gesture.lastWorld.x, y: world.y - gesture.lastWorld.y };
                    if (delta.x !== 0 || delta.y !== 0) {
                        state.translateNodes([...state.selectedNodeIds], delta);
                        gesture.lastWorld = world;
                        gesture.moved = true;
                    }
                    break;
                }
                case "moveFrame": {
                    const world = screenToWorld(event.clientX, event.clientY);
                    const delta = { x: world.x - gesture.lastWorld.x, y: world.y - gesture.lastWorld.y };
                    if (delta.x !== 0 || delta.y !== 0) {
                        state.translateFrame(gesture.frameId, delta);
                        gesture.lastWorld = world;
                        gesture.moved = true;
                    }
                    break;
                }
                case "wire": {
                    setPendingWire({ from: gesture.fromAnchor, to: screenToWorld(event.clientX, event.clientY) });
                    break;
                }
                default:
                    break;
            }
        };

        const onPointerUp = (event: PointerEvent) => {
            const gesture = gestureRef.current;
            switch (gesture.kind) {
                case "marquee": {
                    const end = screenToWorld(event.clientX, event.clientY);
                    const region: Bounds = {
                        minX: Math.min(gesture.startWorld.x, end.x),
                        minY: Math.min(gesture.startWorld.y, end.y),
                        maxX: Math.max(gesture.startWorld.x, end.x),
                        maxY: Math.max(gesture.startWorld.y, end.y),
                    };
                    const ids = state.nodes.filter((node) => RectsIntersect(GetNodeBounds(node.position, GetNodeSize(node)), region)).map((node) => node.id);
                    state.selectNodes(ids, gesture.additive);
                    setMarquee(null);
                    break;
                }
                case "moveNodes":
                case "moveFrame": {
                    state.endInteraction(gesture.moved);
                    break;
                }
                case "wire": {
                    const element = document.elementFromPoint(event.clientX, event.clientY);
                    const directPortId = element?.closest("[data-port-id]")?.getAttribute("data-port-id") ?? undefined;
                    const targetPortId = directPortId ?? findNearestConnectablePort(gesture.fromPortId, event.clientX, event.clientY);
                    if (targetPortId && targetPortId !== gesture.fromPortId) {
                        attemptConnect(gesture.fromPortId, targetPortId);
                    }
                    setPendingWire(null);
                    break;
                }
                default:
                    break;
            }
            gestureRef.current = { kind: "none" };
        };

        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        return () => {
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
        };
    }, [state, screenToWorld, setCamera, attemptConnect, findNearestConnectablePort]);

    // Keyboard shortcuts (ignored while typing in a form control so the panes keep working).
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('input, textarea, [contenteditable="true"]')) {
                return;
            }
            const primary = event.ctrlKey || event.metaKey;

            if (event.code === "Space") {
                spaceHeldRef.current = true;
                return;
            }

            if (event.key === "Delete" || event.key === "Backspace") {
                if (state.selectedWireId) {
                    state.removeWire(state.selectedWireId);
                } else if (state.selectedNodeIds.size > 0) {
                    state.removeNodes([...state.selectedNodeIds]);
                }
                event.preventDefault();
                return;
            }

            if (primary && (event.key === "c" || event.key === "C")) {
                if (state.selectedNodeIds.size > 0) {
                    clipboardRef.current = state.copyNodes([...state.selectedNodeIds]);
                }
                return;
            }
            if (primary && (event.key === "x" || event.key === "X")) {
                if (state.selectedNodeIds.size > 0) {
                    clipboardRef.current = state.copyNodes([...state.selectedNodeIds]);
                    state.removeNodes([...state.selectedNodeIds]);
                }
                return;
            }
            if (primary && (event.key === "v" || event.key === "V")) {
                if (clipboardRef.current) {
                    state.pasteNodes(clipboardRef.current, { x: PasteOffset, y: PasteOffset });
                }
                return;
            }
            if (primary && (event.key === "z" || event.key === "Z")) {
                if (event.shiftKey) {
                    state.redo();
                } else {
                    state.undo();
                }
                event.preventDefault();
                return;
            }
            if (primary && (event.key === "y" || event.key === "Y")) {
                state.redo();
                event.preventDefault();
            }
        };
        const onKeyUp = (event: KeyboardEvent) => {
            if (event.code === "Space") {
                spaceHeldRef.current = false;
            }
        };
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
        };
    }, [state]);

    // Native, non-passive wheel handler so we can preventDefault and zoom toward the cursor.
    useEffect(() => {
        const element = containerRef.current;
        if (!element) {
            return undefined;
        }
        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            const cam = cameraRef.current;
            const factor = Math.exp(-event.deltaY * 0.0015);
            const newZoom = Clamp(cam.zoom * factor, MinZoom, MaxZoom);
            const rect = element.getBoundingClientRect();
            const localX = event.clientX - rect.left;
            const localY = event.clientY - rect.top;
            const worldX = (localX - cam.x) / cam.zoom;
            const worldY = (localY - cam.y) / cam.zoom;
            setCamera({ x: localX - worldX * newZoom, y: localY - worldY * newZoom, zoom: newZoom });
        };
        element.addEventListener("wheel", onWheel, { passive: false });
        return () => element.removeEventListener("wheel", onWheel);
    }, [setCamera]);

    const canvasContextValue = useMemo<CanvasContextValue>(
        () => ({
            editor: context,
            beginNodeInteraction: (nodeId, event) => {
                if (event.shiftKey) {
                    state.toggleNodeSelection(nodeId);
                } else if (!state.isNodeSelected(nodeId)) {
                    state.selectNodes([nodeId]);
                }
                state.beginInteraction();
                gestureRef.current = { kind: "moveNodes", lastWorld: screenToWorld(event.clientX, event.clientY), moved: false };
            },
            beginFrameInteraction: (frameId, event) => {
                state.beginInteraction();
                gestureRef.current = { kind: "moveFrame", frameId, lastWorld: screenToWorld(event.clientX, event.clientY), moved: false };
            },
            beginPortInteraction: (portId, event) => {
                const node = state.getPortNode(portId);
                const anchor = node ? GetPortAnchor(node, portId) : undefined;
                if (!anchor) {
                    return;
                }
                gestureRef.current = { kind: "wire", fromPortId: portId, fromAnchor: anchor };
                setPendingWire({ from: anchor, to: screenToWorld(event.clientX, event.clientY) });
            },
            selectWire: (wireId) => state.selectWire(wireId),
            openContextMenu: (target) => {
                if (target.kind === "node" && !state.isNodeSelected(target.nodeId)) {
                    state.selectNodes([target.nodeId]);
                }
                setContextTarget(target);
            },
        }),
        [context, state, screenToWorld]
    );

    const onBackgroundPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        // A child view (node/port/frame) already claimed this gesture.
        if (gestureRef.current.kind !== "none") {
            return;
        }
        containerRef.current?.focus();

        const isPan = event.button === 1 || (event.button === 0 && spaceHeldRef.current);
        if (isPan) {
            gestureRef.current = { kind: "pan", lastX: event.clientX, lastY: event.clientY };
            event.preventDefault();
            return;
        }
        if (event.button === 0) {
            const additive = event.shiftKey;
            if (!additive) {
                state.clearSelection();
            }
            gestureRef.current = { kind: "marquee", startWorld: screenToWorld(event.clientX, event.clientY), startClientX: event.clientX, startClientY: event.clientY, additive };
            setMarquee({ x: event.clientX, y: event.clientY, width: 0, height: 0 });
        }
    };

    const onDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
        if (event.dataTransfer.types.includes(PaletteDragFormat)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
        }
    };

    const onDrop = (event: ReactDragEvent<HTMLDivElement>) => {
        const paletteItemId = event.dataTransfer.getData(PaletteDragFormat);
        if (!paletteItemId) {
            return;
        }
        event.preventDefault();
        const position = screenToWorld(event.clientX, event.clientY);
        const node = context.createNodeFromPaletteItem(paletteItemId, position);
        state.addNode(node);
        state.selectNodes([node.id]);
    };

    const contextItems = useMemo<ContextMenuItem[]>(() => {
        if (contextTarget.kind === "wire") {
            const wireId = contextTarget.wireId;
            return [{ key: "delete-wire", label: "Delete wire", onClick: () => state.removeWire(wireId) }];
        }
        if (contextTarget.kind === "node") {
            const primary = state.primarySelectedNode;
            return [
                { key: "copy", label: "Copy", onClick: () => (clipboardRef.current = state.copyNodes([...state.selectedNodeIds])) },
                {
                    key: "cut",
                    label: "Cut",
                    onClick: () => {
                        clipboardRef.current = state.copyNodes([...state.selectedNodeIds]);
                        state.removeNodes([...state.selectedNodeIds]);
                    },
                },
                { key: "delete", label: "Delete", onClick: () => state.removeNodes([...state.selectedNodeIds]) },
                { key: "divider-1", type: "divider" },
                {
                    key: "collapse",
                    label: primary?.collapsed ? "Expand" : "Collapse",
                    disabled: !primary,
                    onClick: () => primary && state.setNodeCollapsed(primary.id, !primary.collapsed),
                },
            ];
        }
        return [
            {
                key: "paste",
                label: "Paste",
                disabled: !clipboardRef.current,
                onClick: () => clipboardRef.current && state.pasteNodes(clipboardRef.current, { x: PasteOffset, y: PasteOffset }),
            },
            { key: "fit", label: "Zoom to fit", onClick: () => fitRef.current() },
        ];
    }, [contextTarget, state]);

    const worldStyle: CSSProperties = { transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` };
    // The grid is rendered in screen space: the dot radius and the spacing between dots stay a constant
    // pixel size at every zoom level. Only the pattern origin tracks the camera so the grid still pans.
    const gridStyle: CSSProperties = {
        backgroundImage: `radial-gradient(circle, ${tokens.colorNeutralStroke2} 1px, transparent 1.5px)`,
        backgroundSize: `${GridSpacing}px ${GridSpacing}px`,
        backgroundPosition: `${camera.x}px ${camera.y}px`,
    };

    return (
        <div
            ref={containerRef}
            className={classes.root}
            style={gridStyle}
            tabIndex={0}
            role="application"
            aria-label="Node graph canvas"
            onPointerDown={onBackgroundPointerDown}
            onDragOver={onDragOver}
            onDrop={onDrop}
        >
            <CanvasContextProvider value={canvasContextValue}>
                <ContextMenu
                    items={contextItems}
                    trigger={
                        <div className={classes.trigger} onContextMenuCapture={() => setContextTarget({ kind: "canvas" })}>
                            <div className={classes.world} style={worldStyle}>
                                {state.frames.map((frame) => (
                                    <GraphFrameView key={frame.id} frame={frame} />
                                ))}
                                <GraphWiresLayer pendingWire={pendingWire} />
                                {state.nodes.map((node) => (
                                    <GraphNodeView key={node.id} node={node} />
                                ))}
                            </div>
                            {marquee && <div className={classes.marquee} style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }} />}
                        </div>
                    }
                />
                <GraphMinimap
                    camera={camera}
                    viewport={size}
                    onNavigate={(world) => setCamera((current) => ({ ...current, x: size.width / 2 - world.x * current.zoom, y: size.height / 2 - world.y * current.zoom }))}
                />
            </CanvasContextProvider>
        </div>
    );
};
