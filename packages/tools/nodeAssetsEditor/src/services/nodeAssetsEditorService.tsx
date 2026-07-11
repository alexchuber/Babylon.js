import { type FunctionComponent } from "react";

import {
    AppsListRegular,
    ArrowRedoRegular,
    ArrowUndoRegular,
    FolderOpenRegular,
    ImageRegular,
    OptionsRegular,
    SaveRegular,
    ScaleFitRegular,
    TextExpandRegular,
} from "@fluentui/react-icons";

import { type ServiceDefinition } from "shared-ui-components/modularTool/modularity/serviceDefinition";
import { type IShellService, ShellServiceIdentity } from "shared-ui-components/modularTool/services/shellService";
import { Button } from "shared-ui-components/fluent/primitives/button";
import { useObservableState } from "shared-ui-components/modularTool/hooks/observableHooks";

import { Logger } from "core/Misc/logger";

import { type GraphEditorState } from "../nodeGraph/editorState";
import { CanvasViewController, type EditorContextValue } from "../nodeGraph/editorContext";
import { GraphCanvas } from "../nodeGraph/components/GraphCanvas";
import { PaletteView } from "../nodeGraph/components/PaletteView";
import { PropertiesView } from "../nodeGraph/components/PropertiesView";

import { BuildOrchestrator } from "../nodeAssets/buildOrchestrator";
import { NodeAssetGraphController } from "../nodeAssets/nodeAssetGraphController";
import { PreviewController } from "../nodeAssets/previewController";
import { PreviewPane } from "../nodeAssets/components/PreviewPane";
import { DownloadBlob, PromptForFileAsync } from "../nodeAssets/browserFiles";

// Toolbar button that reflects the store's undo availability.
const UndoButton: FunctionComponent<{ state: GraphEditorState }> = (props) => {
    const { state } = props;
    const canUndo = useObservableState(() => state.canUndo, state.onChanged);
    return <Button appearance="transparent" icon={ArrowUndoRegular} title="Undo" ariaLabel="Undo" disabled={!canUndo} onClick={() => state.undo()} />;
};

// Toolbar button that reflects the store's redo availability.
const RedoButton: FunctionComponent<{ state: GraphEditorState }> = (props) => {
    const { state } = props;
    const canRedo = useObservableState(() => state.canRedo, state.onChanged);
    return <Button appearance="transparent" icon={ArrowRedoRegular} title="Redo" ariaLabel="Redo" disabled={!canRedo} onClick={() => state.redo()} />;
};

/**
 * The editor's root service. It creates the NodeAssets graph controller and preview, assembles the
 * editor context from them, and registers the canvas, palette, preview, properties pane, and toolbar
 * (including the export/save/load actions) with the shell.
 */
export const NodeAssetsEditorServiceDefinition: ServiceDefinition<[], [IShellService]> = {
    friendlyName: "Node Assets Editor Service",
    consumes: [ShellServiceIdentity],
    factory: (shellService) => {
        const controller = new NodeAssetGraphController();
        const preview = new PreviewController();
        const state = controller.state;
        const view = new CanvasViewController();

        const context: EditorContextValue = {
            state,
            paletteCategories: controller.paletteCategories,
            buildPropertySections: (node) => controller.buildPropertySections(node),
            view,
            createNodeFromPaletteItem: (paletteItemId, position) => controller.createNodeFromPaletteItem(paletteItemId, position),
        };

        const orchestrator = new BuildOrchestrator({ controller, preview });
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
            try {
                controller.load(await file.text());
            } catch (error) {
                Logger.Error(`[NodeAssetsEditor] Load failed: ${(error as Error).message}`);
            }
        };

        const exportObserver = controller.onExportRequested.add((fileName) => orchestrator.exportLastSuccessfulBuild(fileName));

        const registrations = [
            shellService.addCentralContent({
                key: "Graph Canvas",
                component: () => <GraphCanvas context={context} />,
            }),
            shellService.addSidePane({
                key: "Palette",
                title: "Nodes",
                icon: AppsListRegular,
                horizontalLocation: "left",
                verticalLocation: "top",
                teachingMoment: false,
                content: () => <PaletteView context={context} />,
            }),
            shellService.addSidePane({
                key: "Preview",
                title: "Preview",
                icon: ImageRegular,
                horizontalLocation: "right",
                verticalLocation: "bottom",
                teachingMoment: false,
                content: () => <PreviewPane controller={preview} />,
            }),
            shellService.addSidePane({
                key: "Properties",
                title: "Properties",
                icon: OptionsRegular,
                horizontalLocation: "right",
                verticalLocation: "top",
                teachingMoment: false,
                content: () => <PropertiesView context={context} />,
            }),
            shellService.addToolbarItem({
                key: "Undo",
                horizontalLocation: "left",
                verticalLocation: "top",
                order: 0,
                teachingMoment: false,
                component: () => <UndoButton state={state} />,
            }),
            shellService.addToolbarItem({
                key: "Redo",
                horizontalLocation: "left",
                verticalLocation: "top",
                order: 1,
                teachingMoment: false,
                component: () => <RedoButton state={state} />,
            }),
            shellService.addToolbarItem({
                key: "ZoomToFit",
                horizontalLocation: "left",
                verticalLocation: "top",
                order: 2,
                teachingMoment: false,
                component: () => <Button appearance="transparent" icon={ScaleFitRegular} title="Zoom to fit" ariaLabel="Zoom to fit" onClick={() => view.zoomToFit()} />,
            }),
            shellService.addToolbarItem({
                key: "Reorganize",
                horizontalLocation: "left",
                verticalLocation: "top",
                order: 3,
                teachingMoment: false,
                // Auto-layout is intentionally the one hollow control in this skeleton.
                component: () => <Button appearance="transparent" icon={TextExpandRegular} title="Reorganize (not implemented)" ariaLabel="Reorganize" onClick={() => undefined} />,
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
