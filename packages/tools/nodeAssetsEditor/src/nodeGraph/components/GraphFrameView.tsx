import { type FunctionComponent, type PointerEvent as ReactPointerEvent } from "react";

import { Caption1, makeStyles, shorthands, tokens } from "@fluentui/react-components";

import { type IGraphFrame } from "../graphModel";
import { FrameHeaderHeight } from "../geometry";
import { useCanvasContext } from "./canvasContext";

const useStyles = makeStyles({
    frame: {
        position: "absolute",
        boxSizing: "border-box",
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
        ...shorthands.border(tokens.strokeWidthThin, "solid", tokens.colorNeutralStroke1),
        cursor: "grab",
        userSelect: "none",
        overflow: "hidden",
    },
    fill: {
        position: "absolute",
        top: "0",
        left: "0",
        right: "0",
        bottom: "0",
        opacity: 0.12,
    },
    header: {
        position: "absolute",
        top: "0",
        left: "0",
        right: "0",
        height: `${FrameHeaderHeight}px`,
        display: "flex",
        alignItems: "center",
        paddingLeft: tokens.spacingHorizontalS,
        paddingRight: tokens.spacingHorizontalS,
    },
    headerLabel: {
        color: tokens.colorNeutralForegroundOnBrand,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
});

/**
 * Renders a frame: a titled, translucent, colored rectangle drawn behind the nodes it groups.
 * Dragging anywhere on the frame moves the frame and its member nodes together. The frame color is
 * data-driven (applied inline); all other chrome uses theme tokens.
 * @param props - Component props.
 * @returns The rendered frame.
 */
export const GraphFrameView: FunctionComponent<{ frame: IGraphFrame }> = (props) => {
    const { frame } = props;
    const classes = useStyles();
    const canvas = useCanvasContext();

    const onPointerDown = (event: ReactPointerEvent) => {
        if (event.button !== 0) {
            return;
        }
        canvas.beginFrameInteraction(frame.id, event);
    };

    return (
        <div
            className={classes.frame}
            style={{ left: frame.position.x, top: frame.position.y, width: frame.size.width, height: frame.size.height, borderColor: frame.color }}
            onPointerDown={onPointerDown}
            data-testid="graph-frame"
        >
            <div className={classes.fill} style={{ backgroundColor: frame.color }} />
            <div className={classes.header} style={{ backgroundColor: frame.color }}>
                <Caption1 className={classes.headerLabel}>{frame.label}</Caption1>
            </div>
        </div>
    );
};
