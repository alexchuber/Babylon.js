import { type FunctionComponent, type PointerEvent as ReactPointerEvent } from "react";

import { Caption1, makeStyles, shorthands, tokens } from "@fluentui/react-components";

import { type IGraphFrame } from "../graphModel";
import { FrameHeaderHeight } from "../geometry";
import { useCanvasContext } from "./canvasContext";
import { Button } from "shared-ui-components/fluent/primitives/button";
import { ChevronUpRegular } from "@fluentui/react-icons";

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
        justifyContent: "space-between",
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
    const aggregateNodeId = frame.aggregateNodeId;

    const onPointerDown = (event: ReactPointerEvent) => {
        if (event.button !== 0) {
            return;
        }
        canvas.beginFrameInteraction(frame.id, event);
    };

    const onCollapsePointerDown = (event: ReactPointerEvent) => {
        event.stopPropagation();
    };

    return (
        <div
            className={classes.frame}
            style={{ left: frame.position.x, top: frame.position.y, width: frame.size.width, height: frame.size.height, borderColor: frame.color }}
            onPointerDown={onPointerDown}
            data-testid={frame.kind === "aggregate" ? "aggregate-frame" : "graph-frame"}
        >
            <div className={classes.fill} style={{ backgroundColor: frame.color }} />
            <div className={classes.header} style={{ backgroundColor: frame.color }}>
                <Caption1 className={classes.headerLabel}>{frame.label}</Caption1>
                {frame.kind === "aggregate" && aggregateNodeId && (
                    <Button
                        appearance="transparent"
                        icon={ChevronUpRegular}
                        title="Collapse aggregate"
                        ariaLabel="Collapse aggregate"
                        onPointerDown={onCollapsePointerDown}
                        onClick={() => canvas.runWhenIdle(() => canvas.editor.aggregatePresentation?.setExpanded(aggregateNodeId, false))}
                    />
                )}
            </div>
        </div>
    );
};
