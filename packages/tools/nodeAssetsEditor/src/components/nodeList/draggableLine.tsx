import { type FunctionComponent } from "react";
import { Body1, Tooltip, makeStyles, tokens } from "@fluentui/react-components";

const useStyles = makeStyles({
    line: {
        display: "block",
        padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
        margin: "2px 0",
        background: tokens.colorNeutralBackground2,
        borderRadius: tokens.borderRadiusSmall,
        color: tokens.colorNeutralForeground1,
        cursor: "grab",
        userSelect: "none",
        ":hover": {
            background: tokens.colorNeutralBackground2Hover,
        },
        ":active": {
            cursor: "grabbing",
        },
    },
});

export interface IDraggableLineProps {
    /** The data string transferred via the drag MIME type. */
    data: string;
    /** Display label. */
    label: string;
    /** Tooltip shown on hover. */
    tooltip: string;
    /** Optional accent color shown as a left border strip. */
    color?: string;
}

/** The MIME type used for NAE palette drag-and-drop. */
export const NaeDragMime = "babylonjs-node-assets-node";

/**
 * A draggable palette line item that creates a node when dropped on the canvas.
 * @returns The rendered draggable line element.
 */
export const DraggableLine: FunctionComponent<IDraggableLineProps> = ({ data, label, tooltip, color }) => {
    const classes = useStyles();
    const borderStyle = color ? { borderLeft: `4px solid ${color}` } : undefined;

    return (
        <Tooltip content={tooltip} relationship="description">
            <div
                className={classes.line}
                style={borderStyle}
                draggable
                onDragStart={(event) => {
                    event.dataTransfer.setData(NaeDragMime, data);
                }}
            >
                <Body1>{label}</Body1>
            </div>
        </Tooltip>
    );
};
