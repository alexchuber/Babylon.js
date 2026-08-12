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
    TextExpandRegular,
} from "@fluentui/react-icons";

import { type ServiceDefinition } from "shared-ui-components/modularTool/modularity/serviceDefinition";
import { type IShellService, ShellServiceIdentity } from "shared-ui-components/modularTool/services/shellService";
import { type IToastService, ToastServiceIdentity } from "shared-ui-components/modularTool/services/toastService";
import { Button } from "shared-ui-components/fluent/primitives/button";
import { useObservableState } from "shared-ui-components/modularTool/hooks/observableHooks";

import { Logger } from "core/Misc/logger";

import { type GraphEditorState } from "../nodeGraph/editorState";
import { CanvasViewController, type EditorContextValue } from "../nodeGraph/editorContext";
import { PaletteView } from "../nodeGraph/components/PaletteView";
import { PropertiesView } from "../nodeGraph/components/PropertiesView";

import { BuildOrchestrator } from "../nodeAssets/buildOrchestrator";
import { NodeAssetGraphController } from "../nodeAssets/nodeAssetGraphController";
import { PreviewController } from "../nodeAssets/previewController";
import { CreateBuiltInNodeAssetLibraryEntries } from "../nodeAssets/builtInLibraryEntries";
import { LibraryControls } from "../nodeAssets/components/LibraryControls";
import { PreviewPane } from "../nodeAssets/components/PreviewPane";
import { GLTFValidationController } from "../nodeAssets/gltfValidationController";
import { GLTFValidationPane } from "../nodeAssets/components/GLTFValidationPane";
import { DownloadBlob, PromptForFileAsync } from "../nodeAssets/browserFiles";
import { type INodeAssetLibraryEntry, type INodeAssetLibraryStorage, NodeAssetLibrary } from "../nodeAssets/nodeAssetLibrary";

const BrowserNodeAssetStorage: INodeAssetLibraryStorage = {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
};

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
        const controller = new NodeAssetGraphController();
        const preview = new PreviewController();
        const library = new NodeAssetLibrary({ builtInEntries: CreateBuiltInNodeAssetLibraryEntries(), storage: BrowserNodeAssetStorage });
        const validation = new GLTFValidationController();
        const state = controller.state;
        const view = new CanvasViewController();
        let currentLibraryBaseName: string | undefined;

        const context: EditorContextValue = {
            state,
            diagnostics: controller.diagnostics,
            getPaletteCategories: (options) => controller.getPaletteCategories(options),
            buildPropertySections: (node) => controller.buildPropertySections(node),
            view,
            createNodeFromPaletteItem: (paletteItemId, position) => controller.createNodeFromPaletteItem(paletteItemId, position),
            aggregatePresentation: {
                isAggregateNode: (nodeId) => controller.isAggregateNode(nodeId),
                setExpanded: (nodeId, expanded) => controller.setAggregateExpanded(nodeId, expanded),
            },
        };

        const orchestrator = new BuildOrchestrator({ controller, preview, validation });
        orchestrator.start();

        // Serializes the graph and downloads it as JSON.
        const save = (): void => {
            DownloadBlob(controller.serialize(), "nodeAsset.json", "application/json");
        };

        const load = (json: string, libraryBaseName?: string): void => {
            controller.load(json);
            currentLibraryBaseName = libraryBaseName;
        };

        const saveToLibrary = (): INodeAssetLibraryEntry => {
            const entry = library.save(controller.serialize(), currentLibraryBaseName);
            toastService.showToast(`Saved "${entry.name}" to the library.`, { intent: "success" });
            return entry;
        };

        const loadFromLibrary = (entry: INodeAssetLibraryEntry): void => {
            load(entry.serializedGraph, entry.baseName);
        };

        // Prompts for a saved JSON file and loads it into the editor.
        const loadAsync = async (): Promise<void> => {
            const file = await PromptForFileAsync("application/json,.json");
            if (!file) {
                return;
            }
            if (await LoadNodeAssetEditorFileAsync(controller, file, (message) => toastService.showToast(message, { intent: "error" }))) {
                currentLibraryBaseName = undefined;
            }
        };

        const exportObserver = controller.onExportRequested.add((fileName) => orchestrator.exportLastSuccessfulBuild(fileName));

        const registrations = [
            shellService.addCentralContent({
                key: "Graph Canvas",
                component: () => <LibraryControls context={context} library={library} onSave={saveToLibrary} onLoad={loadFromLibrary} />,
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
                component: () => (
                    <Button
                        appearance="transparent"
                        icon={TextExpandRegular}
                        title="Reorganize"
                        ariaLabel="Reorganize"
                        onClick={() => {
                            state.reorganize();
                            view.zoomToFit();
                        }}
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
