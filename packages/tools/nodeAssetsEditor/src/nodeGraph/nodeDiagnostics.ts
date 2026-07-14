import { type IReadonlyObservable, Observable } from "core/Misc/observable";

/** A diagnostic attached to one visual graph node. */
export interface IGraphNodeDiagnostic {
    /** Diagnostic severity. */
    readonly severity: "error";
    /** Human-readable diagnostic message. */
    readonly message: string;
}

/**
 * Stores ephemeral diagnostics outside graph snapshots and persistence.
 */
export class GraphNodeDiagnostics {
    private readonly _diagnostics = new Map<string, IGraphNodeDiagnostic>();
    private readonly _onChanged = new Observable<void>();

    /** Fires whenever the diagnostics change. */
    public get onChanged(): IReadonlyObservable<void> {
        return this._onChanged;
    }

    /**
     * Gets the diagnostic for one node.
     * @param nodeId - Visual node id.
     * @returns The current diagnostic, or null.
     */
    public get(nodeId: string): IGraphNodeDiagnostic | null {
        return this._diagnostics.get(nodeId) ?? null;
    }

    /**
     * Sets the diagnostic for one node.
     * @param nodeId - Visual node id.
     * @param diagnostic - Diagnostic to show.
     */
    public set(nodeId: string, diagnostic: IGraphNodeDiagnostic): void {
        this._diagnostics.set(nodeId, diagnostic);
        this._onChanged.notifyObservers();
    }

    /** Clears all diagnostics. */
    public clear(): void {
        if (this._diagnostics.size === 0) {
            return;
        }
        this._diagnostics.clear();
        this._onChanged.notifyObservers();
    }
}
