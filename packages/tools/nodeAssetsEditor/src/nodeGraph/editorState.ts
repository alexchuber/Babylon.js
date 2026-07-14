/**
 * The mutable editor state at the heart of the node-graph framework. It owns the nodes, wires, and
 * frames, tracks selection, and provides snapshot/restore (for undo/redo) and clone (for copy/paste).
 *
 * The store is deliberately host-agnostic: it holds only the generic visual model and exposes plain
 * mutation methods plus two observables. Hosts render it reactively (e.g. via `useObservableState`)
 * and seed it with whatever data they like.
 */

import { type IReadonlyObservable } from "core/index";
import { Observable } from "core/Misc/observable";

import { type IGraphFrame, type IGraphNode, type IGraphSnapshot, type IGraphWire, type Vec2 } from "./graphModel";

/**
 * The data produced by copying a set of nodes: the nodes themselves plus any wires whose endpoints
 * both fall within the copied set. Ids are preserved as-is; fresh ids are assigned on paste.
 */
export type GraphClipboard = {
    /** The copied nodes, deep-cloned with their original ids. */
    readonly nodes: readonly IGraphNode[];
    /** The wires whose endpoints both fall within the copied nodes. */
    readonly wires: readonly IGraphWire[];
};

/** Host-specific editor-state behavior that remains opaque to the reusable node-graph framework. */
export type GraphEditorStateOptions = {
    /** Additional compatibility rule applied after the framework's generic wire checks pass. */
    readonly canConnectPorts?: (fromPortId: string, toPortId: string) => boolean;
};

/** Whether an editor-state change affects only presentation or the graph's authored content. */
export type GraphChangeKind = "visual" | "content";

type GraphHistoryEntry = {
    readonly snapshot: IGraphSnapshot;
    readonly kind: GraphChangeKind;
};

function CloneSnapshot(snapshot: IGraphSnapshot): IGraphSnapshot {
    return structuredClone(snapshot) as IGraphSnapshot;
}

/**
 * Owns and mutates the graph being edited.
 */
export class GraphEditorState {
    private _nodes: IGraphNode[];
    private _wires: IGraphWire[];
    private _frames: IGraphFrame[];

    private readonly _selectedNodeIds = new Set<string>();
    private _selectedWireId: string | null = null;
    private _primaryNodeId: string | null = null;

    private readonly _undoStack: GraphHistoryEntry[] = [];
    private readonly _redoStack: GraphHistoryEntry[] = [];
    private _interactionSnapshot: IGraphSnapshot | null = null;

    private _idCounter = 0;

    private _changeVersion = 0;
    private _selectionVersion = 0;

    private readonly _canConnectPorts: (fromPortId: string, toPortId: string) => boolean;
    private readonly _onChanged = new Observable<GraphChangeKind>();
    private readonly _onSelectionChanged = new Observable<void>();

    /**
     * Creates a new editor state seeded from the given snapshot.
     * @param initial The initial graph contents.
     * @param options Optional host-specific editor-state behavior.
     */
    public constructor(initial: IGraphSnapshot, options: GraphEditorStateOptions = {}) {
        const cloned = CloneSnapshot(initial);
        this._nodes = [...cloned.nodes];
        this._wires = [...cloned.wires];
        this._frames = [...cloned.frames];
        this._canConnectPorts = options.canConnectPorts ?? (() => true);
    }

    /** Fires whenever the graph contents (nodes, wires, frames) change. */
    public get onChanged(): IReadonlyObservable<GraphChangeKind> {
        return this._onChanged;
    }

    /** Fires whenever the selection changes. */
    public get onSelectionChanged(): IReadonlyObservable<void> {
        return this._onSelectionChanged;
    }

    /**
     * A monotonically increasing counter bumped on every graph change. Read it from an accessor so
     * `useObservableState` re-renders even when the underlying array references are mutated in place.
     */
    public get changeVersion(): number {
        return this._changeVersion;
    }

    /** A monotonically increasing counter bumped on every selection change. */
    public get selectionVersion(): number {
        return this._selectionVersion;
    }

    private _notifyChanged(kind: GraphChangeKind = "content"): void {
        this._changeVersion++;
        this._onChanged.notifyObservers(kind);
    }

    private _notifySelectionChanged(): void {
        this._selectionVersion++;
        this._onSelectionChanged.notifyObservers();
    }

    /** The current nodes. */
    public get nodes(): readonly IGraphNode[] {
        return this._nodes;
    }

    /** The current wires. */
    public get wires(): readonly IGraphWire[] {
        return this._wires;
    }

    /** The current frames. */
    public get frames(): readonly IGraphFrame[] {
        return this._frames;
    }

    /**
     * Notifies observers that the graph contents changed. Call this after mutating a node field in
     * place (e.g. from a property editor) without going through a dedicated mutation method.
     * @param kind Whether the mutation affects only presentation or authored graph content.
     */
    public notifyChanged(kind: GraphChangeKind = "content"): void {
        this._notifyChanged(kind);
    }

    // #region Lookups

    /**
     * Finds a node by id.
     * @param id The node id.
     * @returns The node, or undefined.
     */
    public getNode(id: string): IGraphNode | undefined {
        return this._nodes.find((node) => node.id === id);
    }

    /**
     * Finds the node that owns the given port.
     * @param portId The port id.
     * @returns The owning node, or undefined.
     */
    public getPortNode(portId: string): IGraphNode | undefined {
        return this._nodes.find((node) => node.ports.some((port) => port.id === portId));
    }

    /**
     * Returns the direction of a port.
     * @param portId The port id.
     * @returns "input", "output", or undefined if not found.
     */
    public getPortDirection(portId: string): "input" | "output" | undefined {
        for (const node of this._nodes) {
            const port = node.ports.find((candidate) => candidate.id === portId);
            if (port) {
                return port.direction;
            }
        }
        return undefined;
    }

    // #endregion

    // #region Selection

    /** The ids of the currently selected nodes. */
    public get selectedNodeIds(): ReadonlySet<string> {
        return this._selectedNodeIds;
    }

    /** The id of the currently selected wire, if any. */
    public get selectedWireId(): string | null {
        return this._selectedWireId;
    }

    /** The node that should drive the properties pane, if exactly one is the primary selection. */
    public get primarySelectedNode(): IGraphNode | null {
        return this._primaryNodeId ? (this.getNode(this._primaryNodeId) ?? null) : null;
    }

    /**
     * Whether a node is currently selected.
     * @param id The node id.
     * @returns True if selected.
     */
    public isNodeSelected(id: string): boolean {
        return this._selectedNodeIds.has(id);
    }

    /**
     * Replaces or extends the node selection.
     * @param ids The node ids to select.
     * @param additive When true, adds to the current selection instead of replacing it.
     */
    public selectNodes(ids: readonly string[], additive = false): void {
        if (!additive) {
            this._selectedNodeIds.clear();
        }
        this._selectedWireId = null;
        for (const id of ids) {
            this._selectedNodeIds.add(id);
        }
        this._primaryNodeId = ids.length > 0 ? ids[ids.length - 1] : (this._primaryNodeId ?? null);
        if (this._primaryNodeId && !this._selectedNodeIds.has(this._primaryNodeId)) {
            this._primaryNodeId = null;
        }
        this._notifySelectionChanged();
    }

    /**
     * Toggles a single node in the selection (used for shift-click).
     * @param id The node id to toggle.
     */
    public toggleNodeSelection(id: string): void {
        this._selectedWireId = null;
        if (this._selectedNodeIds.has(id)) {
            this._selectedNodeIds.delete(id);
            if (this._primaryNodeId === id) {
                this._primaryNodeId = null;
            }
        } else {
            this._selectedNodeIds.add(id);
            this._primaryNodeId = id;
        }
        this._notifySelectionChanged();
    }

    /**
     * Selects a single wire, clearing any node selection.
     * @param id The wire id, or null to clear the wire selection.
     */
    public selectWire(id: string | null): void {
        this._selectedNodeIds.clear();
        this._primaryNodeId = null;
        this._selectedWireId = id;
        this._notifySelectionChanged();
    }

    /** Clears the entire selection. */
    public clearSelection(): void {
        if (this._selectedNodeIds.size === 0 && this._selectedWireId === null) {
            return;
        }
        this._selectedNodeIds.clear();
        this._selectedWireId = null;
        this._primaryNodeId = null;
        this._notifySelectionChanged();
    }

    // #endregion

    // #region Structural mutations (each records an undo entry)

    /**
     * Adds a node to the graph.
     * @param node The node to add.
     */
    public addNode(node: IGraphNode): void {
        this._recordUndo();
        this._nodes.push(node);
        this._notifyChanged();
    }

    /**
     * Removes nodes and any wires attached to their ports, and drops them from any frames.
     * @param ids The node ids to remove.
     */
    public removeNodes(ids: readonly string[]): void {
        const idSet = new Set(ids);
        if (idSet.size === 0 || !this._nodes.some((node) => idSet.has(node.id))) {
            return;
        }
        this._recordUndo();

        const removedPortIds = new Set<string>();
        for (const node of this._nodes) {
            if (idSet.has(node.id)) {
                for (const port of node.ports) {
                    removedPortIds.add(port.id);
                }
            }
        }

        this._nodes = this._nodes.filter((node) => !idSet.has(node.id));
        this._wires = this._wires.filter((wire) => !removedPortIds.has(wire.fromPortId) && !removedPortIds.has(wire.toPortId));
        for (const frame of this._frames) {
            frame.nodeIds = frame.nodeIds.filter((nodeId) => !idSet.has(nodeId));
        }

        this._pruneSelection();
        this._notifyChanged();
    }

    /**
     * Connects an output port to an input port, if the pair is compatible and not already connected.
     * @param fromPortId The originating (output) port id.
     * @param toPortId The destination (input) port id.
     * @returns The new wire, or undefined if the connection was rejected.
     */
    public addWire(fromPortId: string, toPortId: string): IGraphWire | undefined {
        if (!this._canConnect(fromPortId, toPortId)) {
            return undefined;
        }
        this._recordUndo();
        const wire: IGraphWire = { id: this.generateId("wire"), fromPortId, toPortId };
        this._wires.push(wire);
        this._notifyChanged();
        return wire;
    }

    /**
     * Removes a wire.
     * @param id The wire id.
     */
    public removeWire(id: string): void {
        const index = this._wires.findIndex((wire) => wire.id === id);
        if (index < 0) {
            return;
        }
        this._recordUndo();
        this._wires.splice(index, 1);
        if (this._selectedWireId === id) {
            this._selectedWireId = null;
            this._notifySelectionChanged();
        }
        this._notifyChanged();
    }

    /**
     * Determines whether a directed connection from one port to another would be accepted by {@link addWire}.
     * @param fromPortId The candidate originating (output) port id.
     * @param toPortId The candidate destination (input) port id.
     * @returns True if the connection is valid and would create a wire.
     */
    public canConnect(fromPortId: string, toPortId: string): boolean {
        return this._canConnect(fromPortId, toPortId);
    }

    /**
     * Adds a frame to the graph.
     * @param frame The frame to add.
     */
    public addFrame(frame: IGraphFrame): void {
        this._recordUndo("visual");
        this._frames.push(frame);
        this._notifyChanged("visual");
    }

    /**
     * Sets the collapsed state of a node.
     * @param id The node id.
     * @param collapsed The new collapsed state.
     */
    public setNodeCollapsed(id: string, collapsed: boolean): void {
        const node = this.getNode(id);
        if (!node || node.collapsed === collapsed) {
            return;
        }
        this._recordUndo("visual");
        node.collapsed = collapsed;
        this._notifyChanged("visual");
    }

    /**
     * Sets the collapsed state of a frame.
     * @param id The frame id.
     * @param collapsed The new collapsed state.
     */
    public setFrameCollapsed(id: string, collapsed: boolean): void {
        const frame = this._frames.find((candidate) => candidate.id === id);
        if (!frame || frame.collapsed === collapsed) {
            return;
        }
        this._recordUndo("visual");
        frame.collapsed = collapsed;
        this._notifyChanged("visual");
    }

    // #endregion

    // #region Drag interactions (grouped into a single undo entry)

    /**
     * Begins a drag interaction, capturing a snapshot so the whole gesture becomes one undo entry.
     */
    public beginInteraction(): void {
        this._interactionSnapshot = this.snapshot();
    }

    /**
     * Ends a drag interaction.
     * @param commit When true, the gesture is pushed onto the undo stack; when false it is discarded.
     */
    public endInteraction(commit: boolean): void {
        if (commit && this._interactionSnapshot) {
            this._undoStack.push({ snapshot: this._interactionSnapshot, kind: "visual" });
            this._redoStack.length = 0;
            this._interactionSnapshot = null;
            // Notify so undo/redo availability (e.g. the toolbar buttons) refreshes now that this
            // gesture became an undo entry; the moves themselves already notified during the drag.
            this._notifyChanged("visual");
            return;
        }
        this._interactionSnapshot = null;
    }

    /**
     * Translates a set of nodes by a delta. Intended to be called repeatedly during a drag gesture
     * wrapped by beginInteraction/endInteraction; does not record undo on its own.
     * @param ids The node ids to move.
     * @param delta The movement in graph units.
     */
    public translateNodes(ids: readonly string[], delta: Vec2): void {
        if (ids.length === 0 || (delta.x === 0 && delta.y === 0)) {
            return;
        }
        const idSet = new Set(ids);
        let changed = false;
        for (const node of this._nodes) {
            if (idSet.has(node.id)) {
                node.position = { x: node.position.x + delta.x, y: node.position.y + delta.y };
                changed = true;
            }
        }
        if (changed) {
            this._notifyChanged("visual");
        }
    }

    /**
     * Translates a frame and all of its member nodes by a delta. Intended for use within a drag
     * gesture; does not record undo on its own.
     * @param frameId The frame id.
     * @param delta The movement in graph units.
     */
    public translateFrame(frameId: string, delta: Vec2): void {
        const frame = this._frames.find((candidate) => candidate.id === frameId);
        if (!frame || (delta.x === 0 && delta.y === 0)) {
            return;
        }
        const changeVersionBeforeTranslation = this._changeVersion;
        frame.position = { x: frame.position.x + delta.x, y: frame.position.y + delta.y };
        this.translateNodes(frame.nodeIds, delta);
        if (this._changeVersion === changeVersionBeforeTranslation) {
            this._notifyChanged("visual");
        }
    }

    // #endregion

    // #region Copy / paste

    /**
     * Copies a set of nodes and the wires strictly between them into a clipboard payload.
     * @param ids The node ids to copy.
     * @returns The clipboard payload, deep-cloned from current state.
     */
    public copyNodes(ids: readonly string[]): GraphClipboard {
        const idSet = new Set(ids);
        const nodes = this._nodes.filter((node) => idSet.has(node.id));
        const portIds = new Set<string>();
        for (const node of nodes) {
            for (const port of node.ports) {
                portIds.add(port.id);
            }
        }
        const wires = this._wires.filter((wire) => portIds.has(wire.fromPortId) && portIds.has(wire.toPortId));
        return CloneSnapshot({ nodes, wires, frames: [] });
    }

    /**
     * Pastes clipboard nodes with fresh ids, offset from their originals, and selects them.
     * @param clipboard The clipboard payload to paste.
     * @param offset The position offset to apply to pasted nodes.
     * @returns The ids of the newly created nodes.
     */
    public pasteNodes(clipboard: GraphClipboard, offset: Vec2): string[] {
        if (clipboard.nodes.length === 0) {
            return [];
        }
        this._recordUndo();

        const portIdMap = new Map<string, string>();
        const newNodes: IGraphNode[] = clipboard.nodes.map((source) => {
            const newPorts = source.ports.map((port) => {
                const newPortId = this.generateId("port");
                portIdMap.set(port.id, newPortId);
                return { ...port, id: newPortId };
            });
            return {
                ...source,
                id: this.generateId("node"),
                position: { x: source.position.x + offset.x, y: source.position.y + offset.y },
                ports: newPorts,
            };
        });

        const newWires: IGraphWire[] = [];
        for (const wire of clipboard.wires) {
            const from = portIdMap.get(wire.fromPortId);
            const to = portIdMap.get(wire.toPortId);
            if (from && to) {
                newWires.push({ id: this.generateId("wire"), fromPortId: from, toPortId: to });
            }
        }

        this._nodes.push(...newNodes);
        this._wires.push(...newWires);

        const newIds = newNodes.map((node) => node.id);
        this._selectedNodeIds.clear();
        this._selectedWireId = null;
        for (const id of newIds) {
            this._selectedNodeIds.add(id);
        }
        this._primaryNodeId = newIds[newIds.length - 1] ?? null;

        this._notifyChanged();
        this._notifySelectionChanged();
        return newIds;
    }

    // #endregion

    // #region Frames

    /**
     * Groups a set of nodes into a new frame sized to enclose them.
     * @param nodeIds The nodes to group.
     * @param label The frame title.
     * @param color The frame color.
     * @param bounds The frame position and size in graph space.
     * @returns The new frame.
     */
    public groupNodesIntoFrame(nodeIds: readonly string[], label: string, color: string, bounds: { position: Vec2; size: { width: number; height: number } }): IGraphFrame {
        const frame: IGraphFrame = {
            id: this.generateId("frame"),
            label,
            color,
            position: bounds.position,
            size: bounds.size,
            nodeIds: [...nodeIds],
            collapsed: false,
        };
        this.addFrame(frame);
        return frame;
    }

    // #endregion

    // #region Undo / redo

    /** Whether an undo is available. */
    public get canUndo(): boolean {
        return this._undoStack.length > 0;
    }

    /** Whether a redo is available. */
    public get canRedo(): boolean {
        return this._redoStack.length > 0;
    }

    /** Reverts the most recent change. */
    public undo(): void {
        const previous = this._undoStack.pop();
        if (!previous) {
            return;
        }
        this._redoStack.push({ snapshot: this.snapshot(), kind: previous.kind });
        this._applySnapshot(previous.snapshot, previous.kind);
    }

    /** Re-applies the most recently undone change. */
    public redo(): void {
        const next = this._redoStack.pop();
        if (!next) {
            return;
        }
        this._undoStack.push({ snapshot: this.snapshot(), kind: next.kind });
        this._applySnapshot(next.snapshot, next.kind);
    }

    // #endregion

    // #region Snapshot / restore

    /**
     * Produces a deep-cloned, serializable snapshot of the full graph.
     * @returns The snapshot.
     */
    public snapshot(): IGraphSnapshot {
        return CloneSnapshot({ nodes: this._nodes, wires: this._wires, frames: this._frames });
    }

    /**
     * Generates an id unique within this editor state.
     * @param prefix A human readable prefix for the id.
     * @returns A new unique id.
     */
    public generateId(prefix: string): string {
        return `${prefix}-${++this._idCounter}`;
    }

    /**
     * Replaces the entire graph with a new snapshot, clearing undo/redo history and selection. Used
     * by hosts to load a different graph. Generic: it carries no host/domain semantics.
     * @param snapshot The graph contents to load.
     */
    public reset(snapshot: IGraphSnapshot): void {
        this._undoStack.length = 0;
        this._redoStack.length = 0;
        this._interactionSnapshot = null;
        this._selectedNodeIds.clear();
        this._selectedWireId = null;
        this._primaryNodeId = null;
        this._applySnapshot(snapshot, "content");
        this._notifySelectionChanged();
    }

    private _applySnapshot(snapshot: IGraphSnapshot, kind: GraphChangeKind): void {
        const cloned = CloneSnapshot(snapshot);
        this._nodes = [...cloned.nodes];
        this._wires = [...cloned.wires];
        this._frames = [...cloned.frames];
        this._pruneSelection();
        this._notifyChanged(kind);
    }

    private _recordUndo(kind: GraphChangeKind = "content"): void {
        this._undoStack.push({ snapshot: this.snapshot(), kind });
        this._redoStack.length = 0;
    }

    private _pruneSelection(): void {
        let changed = false;
        for (const id of [...this._selectedNodeIds]) {
            if (!this.getNode(id)) {
                this._selectedNodeIds.delete(id);
                changed = true;
            }
        }
        if (this._primaryNodeId && !this.getNode(this._primaryNodeId)) {
            this._primaryNodeId = null;
            changed = true;
        }
        if (this._selectedWireId && !this._wires.some((wire) => wire.id === this._selectedWireId)) {
            this._selectedWireId = null;
            changed = true;
        }
        if (changed) {
            this._notifySelectionChanged();
        }
    }

    private _canConnect(fromPortId: string, toPortId: string): boolean {
        if (fromPortId === toPortId) {
            return false;
        }
        const fromDirection = this.getPortDirection(fromPortId);
        const toDirection = this.getPortDirection(toPortId);
        if (fromDirection !== "output" || toDirection !== "input") {
            return false;
        }
        const fromNode = this.getPortNode(fromPortId);
        const toNode = this.getPortNode(toPortId);
        if (!fromNode || !toNode || fromNode.id === toNode.id) {
            return false;
        }
        // Reject duplicates and any input that is already driven by a wire.
        if (this._wires.some((wire) => wire.toPortId === toPortId)) {
            return false;
        }
        return this._canConnectPorts(fromPortId, toPortId);
    }

    // #endregion
}
