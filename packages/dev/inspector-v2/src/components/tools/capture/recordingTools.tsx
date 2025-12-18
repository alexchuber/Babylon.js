import { ButtonLine } from "shared-ui-components/fluent/hoc/buttonLine";
import type { FunctionComponent } from "react";
import { useState, useRef, useCallback } from "react";
import type { Scene } from "core/scene";
import { SyncedSliderPropertyLine } from "shared-ui-components/fluent/hoc/propertyLines/syncedSliderPropertyLine";
import { Collapse } from "shared-ui-components/fluent/primitives/collapse";
import { RecordRegular, RecordStopRegular } from "@fluentui/react-icons";
import { Tools } from "core/Misc/tools";
import { Label } from "@fluentui/react-components";
import { MakeLazyComponent } from "shared-ui-components/fluent/primitives/lazyComponent";
import type { Nullable } from "core/types";
import { VideoRecorder } from "core/Misc/videoRecorder";

export const VideoTools: FunctionComponent<{ scene: Scene }> = ({ scene }) => {
    const [isRecording, setIsRecording] = useState(false);
    const videoRecorder = useRef<VideoRecorder>();

    const recordVideoAsync = useCallback(async () => {
        if (videoRecorder.current && videoRecorder.current.isRecording) {
            videoRecorder.current.stopRecording();
            setIsRecording(false);
            return;
        }

        if (!videoRecorder.current) {
            videoRecorder.current = new VideoRecorder(scene.getEngine());
        }

        void videoRecorder.current.startRecording();
        setIsRecording(true);
    }, [scene]);

    return (
        <>
            <ButtonLine label={isRecording ? "Stop Recording" : "Record Video"} icon={isRecording ? RecordStopRegular : RecordRegular} onClick={recordVideoAsync} />
        </>
    );
};

export const GIFTools = MakeLazyComponent(
    async () => {
        const gif = (await import("gif.js.optimized")).default;

        // TODO: Figure out how to use `gif.js.optimized/dist/gif.worker.js` instead of fetching from CDN
        const workerContent = await Tools.LoadFileAsync("https://cdn.jsdelivr.net/gh//terikon/gif.js.optimized@0.1.6/dist/gif.worker.js");
        const workerBlob = new Blob([workerContent], { type: "application/javascript" });
        const workerUrl = URL.createObjectURL(workerBlob);

        return ({ scene }: { scene: Scene }) => {
            const [isRecording, setIsRecording] = useState(false);
            const [isRendering, setIsRendering] = useState(false);
            const [targetWidth, setTargetWidth] = useState(512);
            const [frequency, setFrequency] = useState(200);
            const gifRef = useRef<Nullable<InstanceType<typeof gif>>>(null);
            const captureObserverRef = useRef<any>(null);
            const previousRenderingScaleRef = useRef<number>(1);

            const startRecording = useCallback(() => {
                setIsRecording(true);

                const engine = scene.getEngine();
                const canvas = engine.getRenderingCanvas();
                if (!canvas) {
                    return;
                }

                gifRef.current = new gif({
                    workers: 2,
                    quality: 10,
                    workerScript: workerUrl,
                });

                // Adjust hardware scaling to match desired width
                previousRenderingScaleRef.current = engine.getHardwareScalingLevel();
                engine.setHardwareScalingLevel(engine.getRenderWidth() / (targetWidth * globalThis.devicePixelRatio) || 1);

                // Capture frames after each render using onEndFrameObservable (TODO: better method for this)
                let lastCaptureTime = 0;
                const captureObserver = scene.onAfterRenderObservable.add(() => {
                    const now = Date.now();
                    if (now - lastCaptureTime >= frequency && gifRef.current) {
                        lastCaptureTime = now;
                        gifRef.current.addFrame(canvas, { delay: 1, copy: true });
                    }
                });

                gifRef.current.on("finished", (blob: Blob) => {
                    Tools.Download(blob, "record.gif");
                    setIsRendering(false);
                    gifRef.current = null;
                });

                captureObserverRef.current = captureObserver;
            }, [scene, targetWidth, frequency]);

            const stopRecording = useCallback(() => {
                if (captureObserverRef.current !== null) {
                    scene.onAfterRenderObservable.remove(captureObserverRef.current);
                    captureObserverRef.current = null;
                }

                setIsRecording(false);
                setIsRendering(true);

                if (gifRef.current) {
                    gifRef.current.render();
                    scene.getEngine().setHardwareScalingLevel(previousRenderingScaleRef.current);
                }
            }, []);

            const handleButtonClick = useCallback(() => {
                if (isRecording) {
                    stopRecording();
                } else {
                    startRecording();
                }
            }, [isRecording, startRecording, stopRecording]);

            return (
                <>
                    {isRendering && <Label>Creating the GIF file...</Label>}
                    {!isRendering && <ButtonLine label={isRecording ? "Stop" : "Record"} icon={isRecording ? RecordStopRegular : RecordRegular} onClick={handleButtonClick} />}
                    <Collapse visible={!isRendering && !isRecording}>
                        <SyncedSliderPropertyLine
                            label="Resolution"
                            value={targetWidth}
                            onChange={(value) => setTargetWidth(Math.floor(value ?? 512))}
                            min={128}
                            max={2048}
                            step={128}
                        />
                        <SyncedSliderPropertyLine
                            label="Frequency (ms)"
                            value={frequency}
                            onChange={(value) => setFrequency(Math.floor(value ?? 200))}
                            min={50}
                            max={1000}
                            step={50}
                        />
                    </Collapse>
                </>
            );
        };
    },
    { spinnerSize: "extra-tiny", spinnerLabel: "Loading..." }
);
