import { type FunctionComponent } from "react";

import {
    AppsListRegular,
    ArrowRedoRegular,
    ArrowUndoRegular,
    FolderOpenRegular,
    OptionsRegular,
    PlayRegular,
    SaveRegular,
    ScaleFitRegular,
    TextExpandRegular,
} from "@fluentui/react-icons";

import { type ServiceDefinition } from "shared-ui-components/modularTool/modularity/serviceDefinition";
import { type IShellService, ShellServiceIdentity } from "shared-ui-components/modularTool/services/shellService";
import { Button } from "shared-ui-components/fluent/primitives/button";
import { useObservableState } from "shared-ui-components/modularTool/hooks/observableHooks";

import { Logger } from "core/Misc/logger";

import { GraphEditorState } from "../nodeGraph/editorState";
import { CanvasViewController, type EditorContextValue } from "../nodeGraph/editorContext";
import { GraphCanvas } from "../nodeGraph/components/GraphCanvas";
import { PaletteView } from "../nodeGraph/components/PaletteView";
import { PropertiesView } from "../nodeGraph/components/PropertiesView";
import { CreateBuildPropertySections } from "../demo/dummyProperties";
import { CreateDummyGraph, CreateNodeFromPaletteItem, DummyPaletteCategories } from "../demo/dummyData";

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
 * The demo application's root service. It seeds the store with dummy data, assembles the editor
 * context, and registers the canvas, palette, properties pane, and toolbar with the shell.
 */
export const NodeAssetsEditorServiceDefinition: ServiceDefinition<[], [IShellService]> = {
    friendlyName: "Node Assets Editor Service",
    consumes: [ShellServiceIdentity],
    factory: (shellService) => {
        const state = new GraphEditorState(CreateDummyGraph());
        const view = new CanvasViewController();
        const context: EditorContextValue = {
            state,
            paletteCategories: DummyPaletteCategories,
            buildPropertySections: CreateBuildPropertySections(state),
            view,
            createNodeFromPaletteItem: (paletteItemId, position) => CreateNodeFromPaletteItem(paletteItemId, position, (prefix) => state.generateId(prefix)),
        };

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
                key: "Run",
                horizontalLocation: "right",
                verticalLocation: "top",
                order: 0,
                teachingMoment: false,
                component: () => <Button appearance="transparent" icon={PlayRegular} title="Run" ariaLabel="Run" onClick={() => Logger.Log("[NodeAssetsEditor] Run")} />,
            }),
            shellService.addToolbarItem({
                key: "Save",
                horizontalLocation: "right",
                verticalLocation: "top",
                order: 1,
                teachingMoment: false,
                component: () => (
                    <Button
                        appearance="transparent"
                        icon={SaveRegular}
                        title="Save"
                        ariaLabel="Save"
                        onClick={() => Logger.Log(`[NodeAssetsEditor] Save ${JSON.stringify(state.snapshot())}`)}
                    />
                ),
            }),
            shellService.addToolbarItem({
                key: "Load",
                horizontalLocation: "right",
                verticalLocation: "top",
                order: 2,
                teachingMoment: false,
                component: () => <Button appearance="transparent" icon={FolderOpenRegular} title="Load" ariaLabel="Load" onClick={() => Logger.Log("[NodeAssetsEditor] Load")} />,
            }),
        ];

        return {
            dispose: () => {
                for (const registration of registrations) {
                    registration.dispose();
                }
            },
        };
    },
};
