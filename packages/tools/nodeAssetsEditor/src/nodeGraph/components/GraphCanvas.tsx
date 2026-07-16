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
import { GetNodesBounds, GetPortAnchor } from "../geometry";
import { type Camera, MinZoom, MaxZoom, ScreenToWorld, ZoomTowardPoint, ComputeFitCamera, CenterCameraOn } from "../canvasCamera";
import { FindNearestConnectablePort, FindNodesInRegion } from "../canvasHitTest";
import {
    type Gesture,
    type GestureAction,
    type MarqueeRect,
    type PendingWire,
    BeginBackgroundGesture,
    BeginNodeGesture,
    BeginFrameGesture,
    BeginPortGesture,
    AdvanceGesture,
    CompleteGesture,
} from "../gestureInterpreter";
import { type ContextMenuTarget, type CanvasContextValue, CanvasContextProvider } from "./canvasContext";
import { GraphWiresLayer } from "./GraphWiresLayer";

import { PaletteDragFormat } from "../paletteModel";
import { GraphFrameView } from "./GraphFrameView";
import { GraphMinimap } from "./GraphMinimap";
import { GraphNodeView } from "./GraphNodeView";
import { ContextMenu, type ContextMenuItem } from "shared-ui-components/fluent/primitives/contextMenu";
import { useObservableState } from "shared-ui-components/modularTool/hooks/observableHooks";

const GridSpacing = 24;
const PasteOffset = 24;
// Screen-space radius (px) within which a released wire snaps to the nearest compatible port.
const ConnectSnapRadius = 28;

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
    const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
    const [contextTarget, setContextTarget] = useState<ContextMenuTarget>({ kind: "canvas" });

    const setCamera = useCallback((next: Camera | ((current: Camera) => Camera)) => {
        const value = typeof next === "function" ? (next as (current: Camera) => Camera)(cameraRef.current) : next;
        cameraRef.current = value;
        setCameraState(value);
    }, []);

    const screenToWorld = useCallback((clientX: number, clientY: number): Vec2 => {
        const rect = containerRef.current?.getBoundingClientRect();
        return ScreenToWorld(cameraRef.current, { x: rect?.left ?? 0, y: rect?.top ?? 0 }, { x: clientX, y: clientY });
    }, []);

    // Converts a client-space pointer into both world (graph) and viewport-local (client minus origin)
    // coordinates from a single bounding-rect read, feeding the gesture interpreter.
    const pointerCoords = useCallback((clientX: number, clientY: number): { world: Vec2; local: Vec2 } => {
        const rect = containerRef.current?.getBoundingClientRect();
        const origin = { x: rect?.left ?? 0, y: rect?.top ?? 0 };
        return { world: ScreenToWorld(cameraRef.current, origin, { x: clientX, y: clientY }), local: { x: clientX - origin.x, y: clientY - origin.y } };
    }, []);

    // Frames all node content in the viewport. Stored in a ref so the registered command always runs
    // against the latest camera/size without re-registering.
    const fitRef = useRef<() => void>(() => {});
    fitRef.current = () => {
        setCamera(ComputeFitCamera(GetNodesBounds(state.nodes), size, MinZoom, MaxZoom));
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

    // Executes the discrete actions produced by the gesture interpreter against the editor store and
    // canvas React state. The interpreter decides what happens; this decides how.
    const executeActions = useCallback(
        (actions: readonly GestureAction[]) => {
            for (const action of actions) {
                switch (action.kind) {
                    case "clearSelection":
                        state.clearSelection();
                        break;
                    case "selectNodes":
                        state.selectNodes(action.nodeIds);
                        break;
                    case "toggleNodeSelection":
                        state.toggleNodeSelection(action.nodeId);
                        break;
                    case "selectNodesInRegion":
                        state.selectNodes(FindNodesInRegion(state.nodes, action.region), action.additive);
                        break;
                    case "beginInteraction":
                        state.beginInteraction();
                        break;
                    case "endInteraction":
                        state.endInteraction(action.moved);
                        break;
                    case "translateSelectedNodes":
                        state.translateNodes([...state.selectedNodeIds], action.delta);
                        break;
                    case "translateFrame":
                        state.translateFrame(action.frameId, action.delta);
                        break;
                    case "panBy":
                        setCamera((current) => ({ ...current, x: current.x + action.dx, y: current.y + action.dy }));
                        break;
                    case "setMarquee":
                        setMarquee(action.rect);
                        break;
                    case "setPendingWire":
                        setPendingWire(action.wire);
                        break;
                    case "connect":
                        attemptConnect(action.fromPortId, action.toPortId);
                        break;
                }
            }
        },
        [state, setCamera, attemptConnect]
    );

    // Persistent window listeners drive the active gesture so dragging continues outside the canvas.
    useEffect(() => {
        const onPointerMove = (event: PointerEvent) => {
            const { world, local } = pointerCoords(event.clientX, event.clientY);
            const { gesture, actions } = AdvanceGesture(gestureRef.current, { world, local });
            gestureRef.current = gesture;
            executeActions(actions);
        };

        const onPointerUp = (event: PointerEvent) => {
            const current = gestureRef.current;
            const world = screenToWorld(event.clientX, event.clientY);
            let resolvedTargetPortId: string | undefined;
            if (current.kind === "wire") {
                // A direct drop on a port dot wins; otherwise fall back to the nearest connectable port.
                const element = document.elementFromPoint(event.clientX, event.clientY);
                const directPortId = element?.closest("[data-port-id]")?.getAttribute("data-port-id") ?? undefined;
                resolvedTargetPortId =
                    directPortId ??
                    FindNearestConnectablePort({
                        nodes: state.nodes,
                        fromPortId: current.fromPortId,
                        pointerWorld: world,
                        zoom: cameraRef.current.zoom,
                        snapRadius: ConnectSnapRadius,
                        canConnect: (from, to) => state.canConnect(from, to),
                    });
            }
            const { gesture, actions } = CompleteGesture(current, { world, resolvedTargetPortId });
            gestureRef.current = gesture;
            executeActions(actions);
        };

        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        return () => {
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
        };
    }, [state, screenToWorld, pointerCoords, executeActions]);

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
            const rect = element.getBoundingClientRect();
            const localPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
            setCamera(ZoomTowardPoint(cameraRef.current, localPoint, event.deltaY, MinZoom, MaxZoom));
        };
        element.addEventListener("wheel", onWheel, { passive: false });
        return () => element.removeEventListener("wheel", onWheel);
    }, [setCamera]);

    const canvasContextValue = useMemo<CanvasContextValue>(
        () => ({
            editor: context,
            beginNodeInteraction: (nodeId, event) => {
                const { gesture, actions } = BeginNodeGesture({
                    nodeId,
                    additive: event.shiftKey || event.ctrlKey || event.metaKey,
                    isSelected: state.isNodeSelected(nodeId),
                    world: screenToWorld(event.clientX, event.clientY),
                });
                executeActions(actions);
                gestureRef.current = gesture;
            },
            beginFrameInteraction: (frameId, event) => {
                const { gesture, actions } = BeginFrameGesture({ frameId, world: screenToWorld(event.clientX, event.clientY) });
                executeActions(actions);
                gestureRef.current = gesture;
            },
            beginPortInteraction: (portId, event) => {
                const node = state.getPortNode(portId);
                const anchor = node ? GetPortAnchor(node, portId) : undefined;
                if (!anchor) {
                    return;
                }
                const { gesture, actions } = BeginPortGesture({ portId, anchor, world: screenToWorld(event.clientX, event.clientY) });
                executeActions(actions);
                gestureRef.current = gesture;
            },
            selectWire: (wireId) => state.selectWire(wireId),
            openContextMenu: (target) => {
                if (target.kind === "node" && !state.isNodeSelected(target.nodeId)) {
                    state.selectNodes([target.nodeId]);
                }
                setContextTarget(target);
            },
        }),
        [context, state, screenToWorld, executeActions]
    );

    const onBackgroundPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        // A child view (node/port/frame) already claimed this gesture.
        if (gestureRef.current.kind !== "none") {
            return;
        }
        containerRef.current?.focus();

        const { world, local } = pointerCoords(event.clientX, event.clientY);
        const { gesture, actions } = BeginBackgroundGesture({
            button: event.button,
            spaceHeld: spaceHeldRef.current,
            additive: event.shiftKey || event.ctrlKey || event.metaKey,
            world,
            local,
        });
        if (gesture.kind === "pan") {
            event.preventDefault();
        }
        executeActions(actions);
        gestureRef.current = gesture;
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
    // The grid is locked to world space: both the dot spacing and the dot radius scale with zoom, so the
    // dots grow and spread apart as you zoom in and shrink as you zoom out (keeping the canvas from being
    // littered with dots at low zoom). The pattern origin tracks the camera so the grid pans and zooms
    // together with the content.
    const gridSpacing = GridSpacing * camera.zoom;
    const dotRadius = camera.zoom;
    const gridStyle: CSSProperties = {
        backgroundImage: `radial-gradient(circle, ${tokens.colorNeutralStroke2} ${dotRadius}px, transparent ${dotRadius * 1.5}px)`,
        backgroundSize: `${gridSpacing}px ${gridSpacing}px`,
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
                <GraphMinimap camera={camera} viewport={size} onNavigate={(world) => setCamera((current) => CenterCameraOn(world, size, current.zoom))} />
            </CanvasContextProvider>
        </div>
    );
};
