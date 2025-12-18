import { useState, useCallback } from "react";
import type { FunctionComponent } from "react";
import { GLTFLoaderCoordinateSystemMode, GLTFLoaderAnimationStartMode } from "loaders/glTF/glTFFileLoader";
import type { DropdownOption } from "shared-ui-components/fluent/primitives/dropdown";
import { SwitchPropertyLine } from "shared-ui-components/fluent/hoc/propertyLines/switchPropertyLine";
import { NumberDropdownPropertyLine } from "shared-ui-components/fluent/hoc/propertyLines/dropdownPropertyLine";
import { SyncedSliderPropertyLine } from "shared-ui-components/fluent/hoc/propertyLines/syncedSliderPropertyLine";
import { Collapse } from "shared-ui-components/fluent/primitives/collapse";
import type { IGLTFLoaderService } from "../../../services/panes/tools/gltfLoaderService";
import { useObservableState } from "../../../hooks/observableHooks";

// Animation start mode options
const AnimationStartModeOptions: DropdownOption<number>[] = [
    { label: "None", value: GLTFLoaderAnimationStartMode.NONE },
    { label: "First", value: GLTFLoaderAnimationStartMode.FIRST },
    { label: "All", value: GLTFLoaderAnimationStartMode.ALL },
];

// Coordinate system mode options
const CoordinateSystemModeOptions: DropdownOption<number>[] = [
    { label: "Auto", value: GLTFLoaderCoordinateSystemMode.AUTO },
    { label: "Right Handed", value: GLTFLoaderCoordinateSystemMode.FORCE_RIGHT_HANDED },
];

export const GLTFLoaderOptions: FunctionComponent<{ gltfLoaderService: IGLTFLoaderService }> = ({ gltfLoaderService }) => {
    const [overrideLoaderOptions, setOverrideLoaderOptions] = useState(gltfLoaderService.isLoaderConfigOverrideEnabled());
    // TODO: make loaderConfig state easier to use and configure from here
    const loaderConfig = useObservableState(
        useCallback(() => gltfLoaderService.getLoaderConfig(), [gltfLoaderService]),
        gltfLoaderService.onLoaderConfigChangedObservable
    );

    const handleOverrideChange = (value: boolean) => {
        setOverrideLoaderOptions(value);
        gltfLoaderService.setLoaderConfigOverrideEnabled(value);
    };

    return (
        <>
            <SwitchPropertyLine label="Override glTF loader options" value={overrideLoaderOptions} onChange={handleOverrideChange} />
            <Collapse visible={overrideLoaderOptions}>
                <SwitchPropertyLine
                    label="Always compute bounding box"
                    value={loaderConfig.alwaysComputeBoundingBox}
                    onChange={(value) => gltfLoaderService.updateLoaderConfig("alwaysComputeBoundingBox", value)}
                />
                <SwitchPropertyLine
                    label="Always compute skeleton root node"
                    value={loaderConfig.alwaysComputeSkeletonRootNode}
                    onChange={(value) => gltfLoaderService.updateLoaderConfig("alwaysComputeSkeletonRootNode", value)}
                />
                <NumberDropdownPropertyLine
                    label="Animation start mode"
                    options={AnimationStartModeOptions}
                    value={loaderConfig.animationStartMode}
                    onChange={(value) => gltfLoaderService.updateLoaderConfig("animationStartMode", value)}
                />
                <SwitchPropertyLine
                    label="Capture performance counters"
                    value={loaderConfig.capturePerformanceCounters}
                    onChange={(value) => gltfLoaderService.updateLoaderConfig("capturePerformanceCounters", value)}
                />
                <SwitchPropertyLine
                    label="Compile materials"
                    value={loaderConfig.compileMaterials}
                    onChange={(value) => gltfLoaderService.updateLoaderConfig("compileMaterials", value)}
                />
                <SwitchPropertyLine
                    label="Compile shadow generators"
                    value={loaderConfig.compileShadowGenerators}
                    onChange={(value) => gltfLoaderService.updateLoaderConfig("compileShadowGenerators", value)}
                />
                <NumberDropdownPropertyLine
                    label="Coordinate system"
                    options={CoordinateSystemModeOptions}
                    value={loaderConfig.coordinateSystemMode}
                    onChange={(value) => gltfLoaderService.updateLoaderConfig("coordinateSystemMode", value)}
                />
                <SwitchPropertyLine
                    label="Create instances"
                    value={loaderConfig.createInstances}
                    onChange={(value) => gltfLoaderService.updateLoaderConfig("createInstances", value)}
                />
                <SwitchPropertyLine
                    label="Enable logging"
                    value={loaderConfig.loggingEnabled}
                    onChange={(value) => gltfLoaderService.updateLoaderConfig("loggingEnabled", value)}
                />
                <SwitchPropertyLine
                    label="Load all materials"
                    value={loaderConfig.loadAllMaterials}
                    onChange={(value) => gltfLoaderService.updateLoaderConfig("loadAllMaterials", value)}
                />
                <SyncedSliderPropertyLine
                    label="Target FPS"
                    value={loaderConfig.targetFps}
                    onChange={(value) => gltfLoaderService.updateLoaderConfig("targetFps", value)}
                    min={1}
                    max={120}
                    step={1}
                />
                <SwitchPropertyLine
                    label="Transparency as coverage"
                    value={loaderConfig.transparencyAsCoverage}
                    onChange={(value) => gltfLoaderService.updateLoaderConfig("transparencyAsCoverage", value)}
                />
                <SwitchPropertyLine label="Use clip plane" value={loaderConfig.useClipPlane} onChange={(value) => gltfLoaderService.updateLoaderConfig("useClipPlane", value)} />
                <SwitchPropertyLine
                    label="Use sRGB buffers"
                    value={loaderConfig.useSRGBBuffers}
                    onChange={(value) => gltfLoaderService.updateLoaderConfig("useSRGBBuffers", value)}
                />
                <div style={{ padding: "8px", color: "#999", fontSize: "12px" }}>You need to reload your file to see these changes</div>
            </Collapse>
        </>
    );
};
