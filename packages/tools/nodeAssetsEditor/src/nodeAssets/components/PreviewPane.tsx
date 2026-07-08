import { useEffect, useRef, type FunctionComponent } from "react";

import { makeStyles, tokens } from "@fluentui/react-components";

import { type PreviewController } from "../previewController";

const useStyles = makeStyles({
    root: {
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    },
    surface: {
        backgroundColor: tokens.colorNeutralBackground3,
        border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
        borderRadius: tokens.borderRadiusMedium,
        boxSizing: "border-box",
        flexGrow: 1,
        minHeight: "160px",
        overflow: "hidden",
    },
    canvas: {
        display: "block",
        height: "100%",
        outline: "none",
        width: "100%",
    },
});

/**
 * Renders the asset preview surface, hosting the Babylon canvas driven by the {@link PreviewController}.
 * @param props - The component props.
 * @param props.controller - The preview controller to bind to the canvas.
 * @returns The rendered preview pane.
 */
export const PreviewPane: FunctionComponent<{ controller: PreviewController }> = ({ controller }) => {
    const classes = useStyles();
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            controller.attach(canvas);
        }
        return () => controller.detach();
    }, [controller]);

    return (
        <div className={classes.root}>
            <div className={classes.surface}>
                <canvas ref={canvasRef} className={classes.canvas} data-testid="preview-canvas" />
            </div>
        </div>
    );
};
