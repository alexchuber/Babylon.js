import { type FunctionComponent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

import { tokens } from "@fluentui/react-components";

import { type Vec2 } from "../graphModel";
import { BuildWirePath, GetPortAnchor } from "../geometry";
import { useCanvasContext } from "./canvasContext";
import { useObservableState } from "shared-ui-components/modularTool/hooks/observableHooks";

/**
 * A wire currently being dragged from a port but not yet committed. Rendered as a dashed preview.
 */
export type PendingWire = {
    /** World-space start anchor (the port the drag originated from). */
    readonly from: Vec2;
    /** World-space current pointer position. */
    readonly to: Vec2;
};

/**
 * Renders all committed wires (and an optional in-progress wire) as SVG bezier paths inside the
 * camera-transformed world layer. Strokes use `non-scaling-stroke` so they stay crisp at any zoom.
 * @param props - Component props.
 * @returns The rendered wires layer.
 */
export const GraphWiresLayer: FunctionComponent<{ pendingWire?: PendingWire | null }> = (props) => {
    const { pendingWire } = props;
    const canvas = useCanvasContext();
    const { state } = canvas.editor;

    useObservableState(() => state.changeVersion, state.onChanged);
    const selectedWireId = useObservableState(() => state.selectedWireId, state.onSelectionChanged);

    const onWirePointerDown = (wireId: string) => (event: ReactPointerEvent) => {
        if (event.button !== 0) {
            return;
        }
        event.stopPropagation();
        canvas.selectWire(wireId, event);
    };

    // Note: intentionally does not stop propagation so the event reaches the canvas ContextMenu
    // trigger, which opens the menu with this wire as the target.
    const onWireContextMenu = (wireId: string) => (event: ReactMouseEvent) => {
        canvas.openContextMenu({ kind: "wire", wireId }, event);
    };

    return (
        <svg style={{ position: "absolute", left: 0, top: 0, width: 1, height: 1, overflow: "visible", pointerEvents: "none" }}>
            {state.wires.map((wire) => {
                const fromNode = state.getPortNode(wire.fromPortId);
                const toNode = state.getPortNode(wire.toPortId);
                if (!fromNode || !toNode) {
                    return null;
                }
                const from = GetPortAnchor(fromNode, wire.fromPortId);
                const to = GetPortAnchor(toNode, wire.toPortId);
                if (!from || !to) {
                    return null;
                }
                const path = BuildWirePath(from, to);
                const isSelected = wire.id === selectedWireId;
                return (
                    <g key={wire.id}>
                        <path
                            d={path}
                            fill="none"
                            stroke="transparent"
                            strokeWidth={12}
                            vectorEffect="non-scaling-stroke"
                            style={{ pointerEvents: "stroke", cursor: "pointer" }}
                            onPointerDown={onWirePointerDown(wire.id)}
                            onContextMenu={onWireContextMenu(wire.id)}
                        />
                        <path
                            d={path}
                            fill="none"
                            stroke={isSelected ? tokens.colorBrandStroke1 : tokens.colorNeutralStroke1}
                            strokeWidth={isSelected ? 3 : 2}
                            vectorEffect="non-scaling-stroke"
                            style={{ pointerEvents: "none" }}
                        />
                    </g>
                );
            })}

            {pendingWire && (
                <path
                    d={BuildWirePath(pendingWire.from, pendingWire.to)}
                    fill="none"
                    stroke={tokens.colorBrandStroke1}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    vectorEffect="non-scaling-stroke"
                    style={{ pointerEvents: "none" }}
                />
            )}
        </svg>
    );
};
