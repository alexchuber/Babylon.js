import { type CSSProperties, type FunctionComponent, type PointerEvent as ReactPointerEvent } from "react";

import { makeStyles, shorthands, tokens } from "@fluentui/react-components";

import { type Camera, useCanvasContext } from "./canvasContext";
import { type Vec2 } from "../graphModel";
import { GetNodeSize, GetNodesBounds } from "../geometry";
import { useObservableState } from "shared-ui-components/modularTool/hooks/observableHooks";

const MinimapWidth = 180;
const MinimapHeight = 120;
const MinimapPadding = 8;

const useStyles = makeStyles({
    minimap: {
        position: "absolute",
        right: tokens.spacingHorizontalM,
        bottom: tokens.spacingVerticalM,
        width: `${MinimapWidth}px`,
        height: `${MinimapHeight}px`,
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
        ...shorthands.border(tokens.strokeWidthThin, "solid", tokens.colorNeutralStroke1),
        backgroundColor: tokens.colorNeutralBackground1,
        boxShadow: tokens.shadow8,
        overflow: "hidden",
        cursor: "pointer",
    },
    node: {
        position: "absolute",
        ...shorthands.borderRadius(tokens.borderRadiusSmall),
    },
    viewport: {
        position: "absolute",
        ...shorthands.border(tokens.strokeWidthThin, "solid", tokens.colorBrandStroke1),
        backgroundColor: tokens.colorBrandBackground2,
        opacity: 0.4,
        pointerEvents: "none",
    },
});

/**
 * A small overview map pinned to the bottom-right of the canvas. Shows every node as a dot and the
 * current viewport as a rectangle. Clicking recenters the camera on the picked world position.
 * @param props - Component props.
 * @returns The rendered minimap.
 */
export const GraphMinimap: FunctionComponent<{ camera: Camera; viewport: { width: number; height: number }; onNavigate: (world: Vec2) => void }> = (props) => {
    const { camera, viewport, onNavigate } = props;
    const classes = useStyles();
    const canvas = useCanvasContext();
    const { state } = canvas.editor;

    useObservableState(() => state.changeVersion, state.onChanged);

    // World region currently visible in the canvas.
    const viewMinX = -camera.x / camera.zoom;
    const viewMinY = -camera.y / camera.zoom;
    const viewW = viewport.width / camera.zoom;
    const viewH = viewport.height / camera.zoom;

    const nodesBounds = GetNodesBounds(state.nodes);
    // Union of node bounds and the visible region so the viewport rect is always in view.
    const minX = Math.min(nodesBounds?.minX ?? viewMinX, viewMinX);
    const minY = Math.min(nodesBounds?.minY ?? viewMinY, viewMinY);
    const maxX = Math.max(nodesBounds?.maxX ?? viewMinX + viewW, viewMinX + viewW);
    const maxY = Math.max(nodesBounds?.maxY ?? viewMinY + viewH, viewMinY + viewH);

    const contentW = Math.max(maxX - minX, 1);
    const contentH = Math.max(maxY - minY, 1);
    const scale = Math.min((MinimapWidth - MinimapPadding * 2) / contentW, (MinimapHeight - MinimapPadding * 2) / contentH);

    const toMiniX = (worldX: number) => MinimapPadding + (worldX - minX) * scale;
    const toMiniY = (worldY: number) => MinimapPadding + (worldY - minY) * scale;

    const onPointerDown = (event: ReactPointerEvent) => {
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        const localX = event.clientX - rect.left;
        const localY = event.clientY - rect.top;
        const worldX = minX + (localX - MinimapPadding) / scale;
        const worldY = minY + (localY - MinimapPadding) / scale;
        onNavigate({ x: worldX, y: worldY });
    };

    return (
        <div className={classes.minimap} onPointerDown={onPointerDown} role="presentation">
            {state.nodes.map((node) => {
                const size = GetNodeSize(node);
                const style: CSSProperties = {
                    left: toMiniX(node.position.x),
                    top: toMiniY(node.position.y),
                    width: Math.max(size.width * scale, 2),
                    height: Math.max(size.height * scale, 2),
                    backgroundColor: node.headerColor,
                };
                return <div key={node.id} className={classes.node} style={style} />;
            })}
            <div className={classes.viewport} style={{ left: toMiniX(viewMinX), top: toMiniY(viewMinY), width: viewW * scale, height: viewH * scale }} />
        </div>
    );
};
