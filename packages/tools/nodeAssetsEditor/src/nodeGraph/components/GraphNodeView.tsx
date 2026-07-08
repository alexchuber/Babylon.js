import { type FunctionComponent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

import { Caption1, makeStyles, mergeClasses, shorthands, tokens } from "@fluentui/react-components";
import { ChevronDownRegular, ChevronRightRegular } from "@fluentui/react-icons";

import { type IGraphNode } from "../graphModel";
import { GetNodeSize, NodeHeaderHeight, NodeBodyPaddingTop, PortRowHeight, PartitionPorts } from "../geometry";
import { useCanvasContext } from "./canvasContext";
import { useObservableState } from "shared-ui-components/modularTool/hooks/observableHooks";

const PortDotSize = 12;
// Transparent hit target around each port dot. Larger than the visual dot so wires are easy to grab;
// sized to the row height so vertically adjacent ports tile without overlapping.
const PortHitSize = 24;

const useStyles = makeStyles({
    node: {
        position: "absolute",
        boxSizing: "border-box",
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
        ...shorthands.border(tokens.strokeWidthThin, "solid", tokens.colorNeutralStroke1),
        backgroundColor: tokens.colorNeutralBackground1,
        boxShadow: tokens.shadow4,
        userSelect: "none",
        overflow: "visible",
    },
    nodeSelected: {
        ...shorthands.border(tokens.strokeWidthThick, "solid", tokens.colorBrandStroke1),
        boxShadow: tokens.shadow8,
    },
    header: {
        position: "absolute",
        top: "0",
        left: "0",
        right: "0",
        height: `${NodeHeaderHeight}px`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: tokens.spacingHorizontalS,
        paddingRight: tokens.spacingHorizontalXS,
        ...shorthands.borderRadius(tokens.borderRadiusMedium, tokens.borderRadiusMedium, "0", "0"),
        cursor: "grab",
    },
    headerCollapsed: {
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
    },
    headerTitle: {
        color: tokens.colorNeutralForegroundOnBrand,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    chevron: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: tokens.colorNeutralForegroundOnBrand,
        cursor: "pointer",
        ...shorthands.borderRadius(tokens.borderRadiusSmall),
    },
    portRow: {
        position: "absolute",
        height: `${PortRowHeight}px`,
        display: "flex",
        alignItems: "center",
    },
    portRowInput: {
        left: "0",
        justifyContent: "flex-start",
        paddingLeft: tokens.spacingHorizontalM,
    },
    portRowOutput: {
        right: "0",
        justifyContent: "flex-end",
        paddingRight: tokens.spacingHorizontalM,
    },
    portHit: {
        position: "absolute",
        width: `${PortHitSize}px`,
        height: `${PortHitSize}px`,
        top: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "crosshair",
    },
    portHitInput: {
        left: "0",
        transform: "translate(-50%, -50%)",
    },
    portHitOutput: {
        right: "0",
        transform: "translate(50%, -50%)",
    },
    portDot: {
        width: `${PortDotSize}px`,
        height: `${PortDotSize}px`,
        boxSizing: "border-box",
        ...shorthands.borderRadius("50%"),
        ...shorthands.border(tokens.strokeWidthThin, "solid", tokens.colorNeutralStroke1),
        pointerEvents: "none",
    },
    portLabel: {
        color: tokens.colorNeutralForeground2,
        whiteSpace: "nowrap",
    },
});

/**
 * Renders a single graph node (header, collapse chevron, and input/output port rows) inside the
 * canvas world layer. Position and colors are data-driven (applied inline); all chrome uses tokens.
 * @param props - Component props.
 * @returns The rendered node.
 */
export const GraphNodeView: FunctionComponent<{ node: IGraphNode }> = (props) => {
    const { node } = props;
    const classes = useStyles();
    const canvas = useCanvasContext();
    const { state } = canvas.editor;

    const isSelected = useObservableState(() => state.isNodeSelected(node.id), state.onSelectionChanged);
    const size = GetNodeSize(node);
    const { inputs, outputs } = PartitionPorts(node);

    const onHeaderPointerDown = (event: ReactPointerEvent) => {
        if (event.button !== 0) {
            return;
        }
        canvas.beginNodeInteraction(node.id, event);
    };

    const onChevronPointerDown = (event: ReactPointerEvent) => {
        event.stopPropagation();
    };

    const onChevronClick = (event: ReactMouseEvent) => {
        event.stopPropagation();
        state.setNodeCollapsed(node.id, !node.collapsed);
    };

    // Note: intentionally does not stop propagation so the event reaches the canvas ContextMenu
    // trigger, which opens the menu. openContextMenu selects the node and sets the menu target.
    const onContextMenu = (event: ReactMouseEvent) => {
        canvas.openContextMenu({ kind: "node", nodeId: node.id }, event);
    };

    const onPortPointerDown = (portId: string) => (event: ReactPointerEvent) => {
        if (event.button !== 0) {
            return;
        }
        event.stopPropagation();
        canvas.beginPortInteraction(portId, event);
    };

    const rowTop = (index: number) => NodeHeaderHeight + NodeBodyPaddingTop + index * PortRowHeight;

    return (
        <div
            className={mergeClasses(classes.node, isSelected && classes.nodeSelected)}
            style={{ left: node.position.x, top: node.position.y, width: size.width, height: size.height }}
            data-testid="graph-node"
            data-node-id={node.id}
            onPointerDown={onHeaderPointerDown}
            onContextMenu={onContextMenu}
        >
            <div className={mergeClasses(classes.header, node.collapsed && classes.headerCollapsed)} style={{ backgroundColor: node.headerColor }}>
                <Caption1 className={classes.headerTitle}>{node.title}</Caption1>
                <div
                    className={classes.chevron}
                    onPointerDown={onChevronPointerDown}
                    onClick={onChevronClick}
                    role="button"
                    aria-label={node.collapsed ? "Expand node" : "Collapse node"}
                >
                    {node.collapsed ? <ChevronRightRegular /> : <ChevronDownRegular />}
                </div>
            </div>

            {!node.collapsed &&
                inputs.map((port, index) => (
                    <div key={port.id} className={mergeClasses(classes.portRow, classes.portRowInput)} style={{ top: rowTop(index), width: "50%" }}>
                        <span className={mergeClasses(classes.portHit, classes.portHitInput)} data-port-id={port.id} onPointerDown={onPortPointerDown(port.id)}>
                            <span className={classes.portDot} style={{ backgroundColor: port.color }} />
                        </span>
                        <Caption1 className={classes.portLabel}>{port.name}</Caption1>
                    </div>
                ))}

            {!node.collapsed &&
                outputs.map((port, index) => (
                    <div key={port.id} className={mergeClasses(classes.portRow, classes.portRowOutput)} style={{ top: rowTop(index), width: "50%" }}>
                        <Caption1 className={classes.portLabel}>{port.name}</Caption1>
                        <span className={mergeClasses(classes.portHit, classes.portHitOutput)} data-port-id={port.id} onPointerDown={onPortPointerDown(port.id)}>
                            <span className={classes.portDot} style={{ backgroundColor: port.color }} />
                        </span>
                    </div>
                ))}
        </div>
    );
};
