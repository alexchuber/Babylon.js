import { useCallback, useEffect, useRef, useState, type FunctionComponent } from "react";

import { Body1, Body1Strong, Caption1, makeStyles, Spinner, tokens } from "@fluentui/react-components";
import { useObservableState } from "shared-ui-components/modularTool/hooks/observableHooks";

import { type IPreviewImageResult, type PreviewController } from "../previewController";

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
        position: "relative",
    },
    canvas: {
        display: "block",
        height: "100%",
        outline: "none",
        width: "100%",
    },
    imageSurface: {
        alignItems: "center",
        backgroundColor: tokens.colorNeutralBackground3,
        boxSizing: "border-box",
        display: "flex",
        inset: 0,
        justifyContent: "center",
        padding: tokens.spacingVerticalM,
        position: "absolute",
    },
    image: {
        display: "block",
        maxHeight: "100%",
        maxWidth: "100%",
        objectFit: "contain",
    },
    imageInfo: {
        backgroundColor: "rgba(0, 0, 0, 0.55)",
        borderRadius: tokens.borderRadiusMedium,
        bottom: tokens.spacingVerticalS,
        color: tokens.colorNeutralForegroundStaticInverted,
        left: "50%",
        padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
        position: "absolute",
        transform: "translateX(-50%)",
    },
    statusOverlay: {
        alignItems: "center",
        backgroundColor: "rgba(0, 0, 0, 0.38)",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalS,
        inset: 0,
        justifyContent: "center",
        padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
        position: "absolute",
        zIndex: 1,
    },
    errorCard: {
        backgroundColor: tokens.colorNeutralBackground1,
        border: `${tokens.strokeWidthThin} solid ${tokens.colorPaletteRedBorder2}`,
        borderRadius: tokens.borderRadiusMedium,
        boxShadow: tokens.shadow16,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalXS,
        maxWidth: "80%",
        padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    },
});

/**
 * Renders the produced image of an IMAGE pipeline as the preview's reported result: the image itself
 * plus a caption of its mime type and (once loaded) its pixel dimensions. Remounted per object URL by
 * its `key` in {@link PreviewPane}, so dimension state resets for each new result.
 * @param props - The component props, including the image `result` to display.
 * @returns The rendered image surface.
 */
const PreviewImageSurface: FunctionComponent<{ result: IPreviewImageResult }> = (props) => {
    const { result } = props;
    const classes = useStyles();
    const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

    return (
        <div className={classes.imageSurface}>
            <img
                className={classes.image}
                src={result.objectUrl}
                alt="Produced image preview"
                data-testid="preview-image"
                onLoad={(event) => setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            />
            <Caption1 className={classes.imageInfo} data-testid="preview-image-info">
                {dimensions ? `${result.mimeType} · ${dimensions.width}×${dimensions.height}` : result.mimeType}
            </Caption1>
        </div>
    );
};

/**
 * Renders the asset preview surface, hosting the Babylon canvas driven by the {@link PreviewController}.
 * @param props - The component props.
 * @param props.controller - The preview controller to bind to the canvas.
 * @returns The rendered preview pane.
 */
export const PreviewPane: FunctionComponent<{ controller: PreviewController }> = (props) => {
    const { controller } = props;
    const classes = useStyles();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const getStatus = useCallback(() => ({ isBuilding: controller.isBuilding, errorMessage: controller.errorMessage, imageResult: controller.imageResult }), [controller]);
    const status = useObservableState(getStatus, controller.onStatusChanged);

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
                {status.imageResult && <PreviewImageSurface key={status.imageResult.objectUrl} result={status.imageResult} />}
                {status.isBuilding && (
                    <div className={classes.statusOverlay} role="status" aria-live="polite" data-testid="preview-building-overlay">
                        <Spinner label="Building preview" />
                    </div>
                )}
                {!status.isBuilding && status.errorMessage && (
                    <div className={classes.statusOverlay} role="alert" data-testid="preview-error-overlay">
                        <div className={classes.errorCard}>
                            <Body1Strong>Preview build failed</Body1Strong>
                            <Body1>{status.errorMessage}</Body1>
                            <Caption1>Fix the graph to rebuild the preview.</Caption1>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
