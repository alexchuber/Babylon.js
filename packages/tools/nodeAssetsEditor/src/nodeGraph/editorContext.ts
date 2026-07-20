/**
 * The contract between the reusable node-graph framework and its host application.
 *
 * The framework declares what it needs from a host (a seeded editor state, the palette contents, and
 * a way to build property UI for a node); the host fills these in. This dependency inversion is what
 * keeps the framework promotable: it never imports host/demo data directly.
 */

import { createContext, useContext } from "react";

import { type IGraphNode } from "./graphModel";
import { type IPaletteCategory } from "./paletteModel";
import { type IPropertySection } from "./propertyModel";
import { type GraphEditorState } from "./editorState";
import { type GraphNodeDiagnostics } from "./nodeDiagnostics";

/**
 * Bridges imperative canvas view commands (which live inside the canvas component) to other parts of
 * the UI such as the toolbar and properties pane. The canvas registers implementations on mount.
 */
export class CanvasViewController {
    private _zoomToFit: (() => void) | null = null;

    /**
     * Called by the canvas to provide its zoom-to-fit implementation.
     * @param implementation The function that frames all content in the viewport.
     */
    public registerZoomToFit(implementation: (() => void) | null): void {
        this._zoomToFit = implementation;
    }

    /** Frames all graph content in the viewport, if a canvas is mounted. */
    public zoomToFit(): void {
        this._zoomToFit?.();
    }
}

/**
 * Everything the framework's UI components need from the host, shared across the canvas and panes.
 */
export type EditorContextValue = {
    /** The mutable editor state being edited. */
    readonly state: GraphEditorState;
    /** Optional ephemeral diagnostics rendered on nodes without entering graph snapshots. */
    readonly diagnostics?: GraphNodeDiagnostics;
    /** The categorized palette contents shown in the left pane. */
    readonly paletteCategories: readonly IPaletteCategory[];
    /** Builds the property sections shown for a selected node. */
    readonly buildPropertySections: (node: IGraphNode) => readonly IPropertySection[];
    /** Bridges imperative canvas view commands (e.g. zoom-to-fit) to the toolbar and panes. */
    readonly view: CanvasViewController;
    /**
     * Creates a new node for a palette item dropped on the canvas at the given graph-space position.
     * Supplied by the host so the framework stays agnostic about what a dropped item becomes.
     */
    readonly createNodeFromPaletteItem: (paletteItemId: string, position: { x: number; y: number }) => IGraphNode;
    /** Optional host support for compact nodes that project an expandable owned subgraph. */
    readonly aggregatePresentation?: {
        readonly isAggregateNode: (nodeId: string) => boolean;
        readonly setExpanded: (nodeId: string, expanded: boolean) => void;
    };
};

const EditorContext = createContext<EditorContextValue | undefined>(undefined);

/**
 * Provider for the editor context.
 */
export const EditorContextProvider = EditorContext.Provider;

/**
 * Reads the editor context. Throws if used outside a provider.
 * @returns The current editor context value.
 */
export function useEditorContext(): EditorContextValue {
    const value = useContext(EditorContext);
    if (!value) {
        throw new Error("useEditorContext must be used within an EditorContextProvider.");
    }
    return value;
}
