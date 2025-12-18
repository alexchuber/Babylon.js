import { ButtonLine } from "shared-ui-components/fluent/hoc/buttonLine";
import { useState, useRef, useCallback, useMemo } from "react";
import type { FunctionComponent } from "react";
import type { Scene } from "core/scene";
import { SyncedSliderPropertyLine } from "shared-ui-components/fluent/hoc/propertyLines/syncedSliderPropertyLine";
import type { IScreenshotSize } from "core/Misc/interfaces/screenshotSize";
import { SwitchPropertyLine } from "shared-ui-components/fluent/hoc/propertyLines/switchPropertyLine";
import { captureEquirectangularFromScene } from "core/Misc/equirectangularCapture";
import { Collapse } from "shared-ui-components/fluent/primitives/collapse";
import { CameraRegular, RecordRegular, SaveRegular, ArrowDownloadRegular } from "@fluentui/react-icons";
import { FrameGraphUtils } from "core/FrameGraph/frameGraphUtils";
import { CreateScreenshotAsync } from "core/Misc/screenshotTools";
import { SceneRecorder } from "core/Misc/sceneRecorder";
import { Tools } from "core/Misc/tools";
import { FileUploadLine } from "shared-ui-components/fluent/hoc/fileUploadLine";
import { Label } from "@fluentui/react-components";
import { BoundProperty } from "../../properties/boundProperty";

export const CaptureScreenshotTools: FunctionComponent<{ scene: Scene }> = ({ scene }) => {
    const [useWidthHeight, setUseWidthHeight] = useState(false);
    const [screenshotSize, setScreenshotSize] = useState<IScreenshotSize>({ precision: 1, width: scene.getEngine().getRenderWidth(), height: scene.getEngine().getRenderHeight() });

    // Create a proxy object that triggers state updates when properties are set
    const screenshotSizeProxy = useMemo(() => {
        return new Proxy(screenshotSize, {
            set(target, prop: keyof IScreenshotSize, value) {
                setScreenshotSize({ ...target, [prop]: value });
                return true;
            },
        });
    }, [screenshotSize]);

    const captureScreenshot = useCallback(async () => {
        const camera = scene.frameGraph ? FrameGraphUtils.FindMainCamera(scene.frameGraph) : scene.activeCamera;
        const sizeToUse: IScreenshotSize = { ...screenshotSize };
        if (!useWidthHeight) {
            sizeToUse.width = undefined;
            sizeToUse.height = undefined;
        }

        if (camera) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            CreateScreenshotAsync(scene.getEngine(), camera, sizeToUse, undefined, undefined, undefined, undefined, true);
        }
    }, [scene, screenshotSize, useWidthHeight]);

    const captureEquirectangularAsync = useCallback(async () => {
        const currentActiveCamera = scene.activeCamera;
        if (!currentActiveCamera && scene.frameGraph) {
            scene.activeCamera = FrameGraphUtils.FindMainCamera(scene.frameGraph);
        }
        if (scene.activeCamera) {
            await captureEquirectangularFromScene(scene, { size: 1024, filename: "equirectangular_capture.png" });
        }
        // eslint-disable-next-line require-atomic-updates
        scene.activeCamera = currentActiveCamera;
    }, [scene]);

    return (
        <>
            <ButtonLine label="Capture" icon={CameraRegular} onClick={captureScreenshot} />
            <ButtonLine label="Capture Equirectangular" icon={CameraRegular} onClick={captureEquirectangularAsync} />
            <SwitchPropertyLine label="Use Custom Size" value={useWidthHeight} onChange={(value) => setUseWidthHeight(value)} />
            <Collapse visible={useWidthHeight}>
                <BoundProperty
                    label="Precision"
                    description="A scale factor for the resolution. Multiplies the width and height of the screenshot."
                    component={SyncedSliderPropertyLine}
                    target={screenshotSizeProxy}
                    propertyKey="precision"
                    nullable
                    defaultValue={1}
                    min={0.1}
                    max={10}
                    step={0.1}
                />
                <BoundProperty
                    label="Width"
                    description="The width of the screenshot in pixels."
                    component={SyncedSliderPropertyLine}
                    target={screenshotSizeProxy}
                    propertyKey="width"
                    nullable
                    defaultValue={512}
                    min={1}
                    step={1}
                />
                <BoundProperty
                    label="Height"
                    description="The height of the screenshot in pixels."
                    component={SyncedSliderPropertyLine}
                    target={screenshotSizeProxy}
                    propertyKey="height"
                    nullable
                    defaultValue={512}
                    min={1}
                    step={1}
                />
            </Collapse>
        </>
    );
};

export const ReplayTools: FunctionComponent<{ scene: Scene }> = ({ scene }) => {
    const [isRecording, setIsRecording] = useState(false);
    const sceneRecorder = useRef<SceneRecorder>();

    const startRecording = useCallback(() => {
        if (!sceneRecorder.current) {
            sceneRecorder.current = new SceneRecorder();
        }
        sceneRecorder.current.track(scene);
        setIsRecording(true);
    }, [scene]);

    const exportReplay = useCallback(() => {
        if (!sceneRecorder.current) {
            return;
        }
        const content = JSON.stringify(sceneRecorder.current.getDelta());
        const blob = new Blob([content], { type: "application/json" });
        Tools.Download(blob, "replay_delta.json");
        setIsRecording(false);
    }, []);

    const applyDelta = useCallback(
        (files: FileList) => {
            const file = files[0];
            if (!file) {
                return;
            }

            Tools.ReadFile(
                file,
                (data) => {
                    try {
                        const json = JSON.parse(data);
                        SceneRecorder.ApplyDelta(json, scene);
                    } catch (error) {
                        // eslint-disable-next-line no-console
                        console.error("Failed to apply replay delta:", error);
                    }
                },
                undefined,
                false
            );
        },
        [scene]
    );

    return (
        <>
            {!isRecording && <ButtonLine label="Start Recording" icon={RecordRegular} onClick={startRecording} />}
            {isRecording && (
                <>
                    <Label>Recording in progress...</Label>
                    <ButtonLine label="Generate Delta File" icon={SaveRegular} onClick={exportReplay} />
                </>
            )}
            <FileUploadLine label="Apply Delta File" icon={ArrowDownloadRegular} onClick={applyDelta} accept=".json" />
        </>
    );
};
