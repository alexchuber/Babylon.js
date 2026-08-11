import { Observable } from "core/Misc/observable";
import { type Nullable } from "core/types";
import { LockObject } from "shared-ui-components/tabs/propertyGrids/lockObject";
import { StateManager } from "shared-ui-components/nodeGraphSystem/stateManager";
import { type GraphNode } from "shared-ui-components/nodeGraphSystem/graphNode";
import { type NodeAsset } from "node-assets/nodeAsset";

import { RegisterToDisplayManagers } from "./graphSystem/registerToDisplayLedger";
import { RegisterToPropertyTabManagers } from "./graphSystem/registerToPropertyLedger";
import { RegisterTypeLedger } from "./graphSystem/registerToTypeLedger";
import { RegisterNodePortDesign } from "./graphSystem/registerNodePortDesign";
import { RegisterExportData } from "./graphSystem/registerExportData";

// Import block descriptors for their registration side effects
import "./nodeAssets/blockDescriptors";

/**
 * Global state for the Node Assets Editor, following the FGE/NME pattern.
 * Owns a StateManager and editor-wide observables.
 */
export class GlobalState {
    /** Host element for the editor */
    hostElement: HTMLElement;
    /** Host document */
    hostDocument: Document;
    /** Host window */
    hostWindow: Window;

    /** State manager for graph UI (shared node graph system) */
    stateManager: StateManager;

    /** Lock object for property grid */
    lockObject = new LockObject();

    /** Observable for clearing undo stack */
    onClearUndoStack = new Observable<void>();
    /** Observable triggered when graph reset is required */
    onResetRequiredObservable = new Observable<boolean>();
    /** Observable triggered when zoom to fit is required */
    onZoomToFitRequiredObservable = new Observable<void>();
    /** Observable triggered when reorganization is required */
    onReOrganizedRequiredObservable = new Observable<void>();
    /** Observable triggered when loading state changes */
    onIsLoadingChanged = new Observable<boolean>();
    /** Observable triggered when a frame is imported */
    onImportFrameObservable = new Observable<any>();
    /** Observable triggered when popup is closed */
    onPopupClosedObservable = new Observable<void>();
    /** Observable triggered when a drop event is received */
    onDropEventReceivedObservable = new Observable<DragEvent>();
    /** Whether the pointer is over the canvas */
    pointerOverCanvas: boolean = false;
    /** Callback to get a graph node from a block. Set by GraphEditor after mount. */
    onGetNodeFromBlock: Nullable<(block: any) => GraphNode> = null;

    /** The current NodeAsset being edited. Set by the controller. */
    nodeAsset: Nullable<NodeAsset> = null;

    public constructor() {
        this.hostElement = document.body;
        this.hostDocument = document;
        this.hostWindow = window;

        this.stateManager = new StateManager();
        this.stateManager.data = this;
        this.stateManager.lockObject = this.lockObject;
        this.stateManager.hostDocument = document;

        // Register all ledgers and designs
        RegisterToDisplayManagers();
        RegisterToPropertyTabManagers();
        RegisterTypeLedger();
        RegisterNodePortDesign(this.stateManager);
        RegisterExportData(this.stateManager);
    }

    public dispose() {
        this.onClearUndoStack.clear();
        this.onResetRequiredObservable.clear();
        this.onZoomToFitRequiredObservable.clear();
        this.onReOrganizedRequiredObservable.clear();
        this.onIsLoadingChanged.clear();
        this.onImportFrameObservable.clear();
        this.onPopupClosedObservable.clear();
        this.onDropEventReceivedObservable.clear();
    }
}
