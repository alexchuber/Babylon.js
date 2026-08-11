import { type FunctionComponent } from "react";

import {
    AppsListRegular,
    ArrowRedoRegular,
    ArrowUndoRegular,
    CheckmarkCircleRegular,
    FolderOpenRegular,
    ImageRegular,
    OptionsRegular,
    SaveRegular,
    ScaleFitRegular,
} from "@fluentui/react-icons";

import { type ServiceDefinition } from "shared-ui-components/modularTool/modularity/serviceDefinition";
import { type IShellService, ShellServiceIdentity } from "shared-ui-components/modularTool/services/shellService";
import { type IToastService, ToastServiceIdentity } from "shared-ui-components/modularTool/services/toastService";
import { Button } from "shared-ui-components/fluent/primitives/button";
import { useObservableState } from "shared-ui-components/modularTool/hooks/observableHooks";

import { Logger } from "core/Misc/logger";

import { GlobalState } from "../globalState";
import { GraphEditor } from "../graphEditor";
import { NodeListComponent } from "../components/nodeList/nodeListComponent";
import { PropertyTabComponent } from "../components/propertyTab/propertyTabComponent";

import { BuildOrchestrator } from "../nodeAssets/buildOrchestrator";
import { NodeAssetGraphController } from "../nodeAssets/nodeAssetGraphController";
import { SharedGraphBridge } from "../nodeAssets/sharedGraphBridge";
import { PreviewController } from "../nodeAssets/previewController";
import { PreviewPane } from "../nodeAssets/components/PreviewPane";
import { GLTFValidationController } from "../nodeAssets/gltfValidationController";
import { GLTFValidationPane } from "../nodeAssets/components/GLTFValidationPane";
import { DownloadBlob, PromptForFileAsync } from "../nodeAssets/browserFiles";

// Toolbar button that reflects the store's undo availability (uses controller's state).
const UndoButton: FunctionComponent<{ controller: NodeAssetGraphController }> = (props) => {
    const { controller } = props;
    const canUndo = useObservableState(() => controller.state.canUndo, controller.state.onChanged);
    return <Button appearance="transparent" icon={ArrowUndoRegular} title="Undo" ariaLabel="Undo" disabled={!canUndo} onClick={() => controller.state.undo()} />;
};

// Toolbar button that reflects the store's redo availability.
const RedoButton: FunctionComponent<{ controller: NodeAssetGraphController }> = (props) => {
    const { controller } = props;
    const canRedo = useObservableState(() => controller.state.canRedo, controller.state.onChanged);
    return <Button appearance="transparent" icon={ArrowRedoRegular} title="Redo" ariaLabel="Redo" disabled={!canRedo} onClick={() => controller.state.redo()} />;
};

interface INodeAssetEditorTextFile {
    text(): Promise<string>;
}

/**
 * Loads one selected save file, surfacing parse failures without replacing the current graph.
 * @param controller - Graph controller to load into.
 * @param file - Selected JSON file.
 * @param showError - Presents a user-visible load failure.
 * @returns Whether the file loaded successfully.
 */
export async function LoadNodeAssetEditorFileAsync(controller: NodeAssetGraphController, file: INodeAssetEditorTextFile, showError: (message: string) => void): Promise<boolean> {
    try {
        controller.load(await file.text());
        return true;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Logger.Error(`[NodeAssetsEditor] Load failed: ${message}`);
        showError(`Could not load the NodeAsset file: ${message}`);
        return false;
    }
}

/**
 * The editor's root service. It creates the NodeAssets graph controller and preview, assembles the
 * editor context from them, and registers the canvas, palette, preview, properties pane, and toolbar
 * (including the export/save/load actions) with the shell.
 */
export const NodeAssetsEditorServiceDefinition: ServiceDefinition<[], [IShellService, IToastService]> = {
    friendlyName: "Node Assets Editor Service",
    consumes: [ShellServiceIdentity, ToastServiceIdentity],
    factory: (shellService, toastService) => {
        const globalState = new GlobalState();
        const controller = new NodeAssetGraphController();
        const bridge = new SharedGraphBridge(controller, globalState);
        const preview = new PreviewController();
        const validation = new GLTFValidationController();

        const orchestrator = new BuildOrchestrator({ controller, preview, validation });
        orchestrator.start();

        // Serializes the graph and downloads it as JSON.
        const save = (): void => {
            DownloadBlob(controller.serialize(), "nodeAsset.json", "application/json");
        };

        // Prompts for a saved JSON file and loads it into the editor.
        const loadAsync = async (): Promise<void> => {
            const file = await PromptForFileAsync("application/json,.json");
            if (!file) {
                return;
            }
            await LoadNodeAssetEditorFileAsync(controller, file, (message) => toastService.showToast(message, { intent: "error" }));
        };

        const exportObserver = controller.onExportRequested.add((fileName) => orchestrator.exportLastSuccessfulBuild(fileName));

        const registrations = [
            shellService.addCentralContent({
                key: "Graph Canvas",
                component: () => <GraphEditor globalState={globalState} bridge={bridge} />,
            }),
            shellService.addSidePane({
                key: "Palette",
                title: "Nodes",
                icon: AppsListRegular,
                horizontalLocation: "left",
                verticalLocation: "top",
                teachingMoment: false,
                content: () => <NodeListComponent globalState={globalState} />,
            }),
            shellService.addSidePane({
                key: "Preview",
                title: "Preview",
                icon: ImageRegular,
                horizontalLocation: "right",
                verticalLocation: "bottom",
                teachingMoment: false,
                keepMounted: true,
                content: () => <PreviewPane controller={preview} />,
            }),
            shellService.addSidePane({
                key: "Validation",
                title: "Validation",
                icon: CheckmarkCircleRegular,
                horizontalLocation: "right",
                verticalLocation: "bottom",
                order: 1,
                teachingMoment: false,
                content: () => <GLTFValidationPane controller={validation} />,
            }),
            shellService.addSidePane({
                key: "Properties",
                title: "Properties",
                icon: OptionsRegular,
                horizontalLocation: "right",
                verticalLocation: "top",
                teachingMoment: false,
                content: () => <PropertyTabComponent globalState={globalState} />,
            }),
            shellService.addToolbarItem({
                key: "Undo",
                horizontalLocation: "left",
                verticalLocation: "top",
                order: 0,
                teachingMoment: false,
                component: () => <UndoButton controller={controller} />,
            }),
            shellService.addToolbarItem({
                key: "Redo",
                horizontalLocation: "left",
                verticalLocation: "top",
                order: 1,
                teachingMoment: false,
                component: () => <RedoButton controller={controller} />,
            }),
            shellService.addToolbarItem({
                key: "ZoomToFit",
                horizontalLocation: "left",
                verticalLocation: "top",
                order: 2,
                teachingMoment: false,
                component: () => (
                    <Button
                        appearance="transparent"
                        icon={ScaleFitRegular}
                        title="Zoom to fit"
                        ariaLabel="Zoom to fit"
                        onClick={() => globalState.onZoomToFitRequiredObservable.notifyObservers()}
                    />
                ),
            }),
            shellService.addToolbarItem({
                key: "Save",
                horizontalLocation: "right",
                verticalLocation: "top",
                order: 1,
                teachingMoment: false,
                component: () => <Button appearance="transparent" icon={SaveRegular} title="Save" ariaLabel="Save" onClick={() => save()} />,
            }),
            shellService.addToolbarItem({
                key: "Load",
                horizontalLocation: "right",
                verticalLocation: "top",
                order: 2,
                teachingMoment: false,
                component: () => <Button appearance="transparent" icon={FolderOpenRegular} title="Load" ariaLabel="Load" onClick={() => void loadAsync()} />,
            }),
        ];

        return {
            dispose: () => {
                orchestrator.dispose();
                bridge.detach();
                globalState.dispose();
                controller.onExportRequested.remove(exportObserver);
                for (const registration of registrations) {
                    registration.dispose();
                }
                controller.dispose();
                preview.detach();
            },
        };
    },
};
