import { type IResolvedDiagnostic, type ResolvedDiagnosticSeverity } from "loaders/USD/resolution/resolvedStage";

/** The producer category attached to a build diagnostic. */
export type BuildDiagnosticProducerKind = "block" | "transcoder";

/** Identifies the block or transcoder that produced a build diagnostic. */
export interface IBuildDiagnosticProducer {
    /** Whether the producer is a regular block or a transcoder. */
    readonly kind: BuildDiagnosticProducerKind;
    /** The producer block's stable graph id. */
    readonly blockId: number;
    /** The producer block's display name. */
    readonly blockName: string;
}

/** A structured, non-fatal message collected during one build. */
export interface IBuildDiagnostic {
    /** Stable machine-readable diagnostic code. */
    readonly code: string;
    /** Diagnostic severity. Fatal failures are thrown instead of collected. */
    readonly severity: ResolvedDiagnosticSeverity;
    /** Human-readable diagnostic message. */
    readonly message: string;
    /** Optional representation-specific path. */
    readonly path?: string;
    /** Optional block or transcoder that produced the diagnostic. */
    readonly producer?: IBuildDiagnosticProducer;
}

/** The fixed outcome applied to a feature at a representation boundary. */
export type LossDisposition = "preserve" | "bake" | "drop" | "extension";

/** A representation kind that can be the source or target of a lossy conversion. */
export type BuildRepresentationKind = "GLTF_DOCUMENT" | "USD_STAGE" | "BABYLON_SCENE";

/** A non-fatal record of representation semantics preserved, baked, dropped, or extended. */
export type LossRecord = IBuildDiagnostic & {
    /** How the source feature was handled. */
    readonly disposition: LossDisposition;
    /** Representation consumed by the producer. */
    readonly sourceRepresentation: BuildRepresentationKind;
    /** Representation emitted by the producer. */
    readonly targetRepresentation: BuildRepresentationKind;
    /** Block or transcoder that produced this record. */
    readonly producer: IBuildDiagnosticProducer;
};

/** Additional data needed to map a loader diagnostic to a {@link LossRecord}. */
export interface IResolvedDiagnosticLossContext {
    /** Stable machine-readable diagnostic code. */
    readonly code: string;
    /** How the source feature was handled. */
    readonly disposition: LossDisposition;
    /** Representation consumed by the producer. */
    readonly sourceRepresentation: BuildRepresentationKind;
    /** Representation emitted by the producer. */
    readonly targetRepresentation: BuildRepresentationKind;
    /** Block or transcoder that produced this record. */
    readonly producer: IBuildDiagnosticProducer;
}

/** A build-owned value that releases resources synchronously or asynchronously. */
export interface IBuildResource {
    /** Whether the resource was already disposed before registration. */
    readonly isDisposed?: boolean;
    /** Releases resources owned by this value. */
    dispose(): void | Promise<void>;
}

/** Machine-readable resource ownership failures. */
export type BuildResourceOwnershipErrorCode = "NODE_ASSET_RESOURCE_OWNED" | "NODE_ASSET_RESOURCE_STALE";

/** Raised when a disposable value crosses build-scope ownership rules. */
export class BuildResourceOwnershipError extends Error {
    /** Machine-readable ownership failure code. */
    public readonly code: BuildResourceOwnershipErrorCode;

    /**
     * Creates a resource ownership error.
     * @param code The machine-readable ownership failure code.
     * @param message The human-readable failure message.
     */
    public constructor(code: BuildResourceOwnershipErrorCode, message: string) {
        super(message);
        this.name = "BuildResourceOwnershipError";
        this.code = code;
    }
}

interface IResourceOwnership {
    readonly scope: BuildScope;
    disposed: boolean;
}

interface IBuildResourceEntry {
    readonly resource: IBuildResource & object;
    readonly producer?: IBuildDiagnosticProducer;
}

const ResourceOwnership = new WeakMap<object, IResourceOwnership>();

/** Raised when a caller or failed sibling cancels a build. */
export class BuildCancelledError extends Error {
    /** Stable machine-readable cancellation code. */
    public readonly code = "NODE_ASSET_BUILD_CANCELLED";
    /** The caller or internal reason that requested cancellation. */
    public readonly reason: unknown;

    /**
     * Creates a build cancellation error.
     * @param reason The caller or internal reason that requested cancellation.
     */
    public constructor(reason?: unknown) {
        super("The node asset build was cancelled.");
        this.name = "BuildCancelledError";
        this.reason = reason;
    }
}

/** Owns diagnostics and other per-build state for one {@link NodeAsset.buildAsync} call. */
export class BuildScope {
    private readonly _abortController = new AbortController();
    private readonly _diagnostics: IBuildDiagnostic[] = [];
    private readonly _lossRecords: LossRecord[] = [];
    private readonly _resources: IBuildResourceEntry[] = [];
    private readonly _registeredResources = new WeakSet<object>();
    private readonly _callerSignal: AbortSignal | undefined;
    private readonly _onCallerAbort: (() => void) | undefined;
    private _disposePromise: Promise<void> | undefined;
    private _hasPrimaryError = false;
    private _primaryError: unknown;

    /**
     * Creates one build scope and links an optional caller signal to its internal controller.
     * @param callerSignal The optional caller-owned cancellation signal.
     */
    public constructor(callerSignal?: AbortSignal) {
        this._callerSignal = callerSignal;
        if (callerSignal) {
            this._onCallerAbort = () => {
                this._cancel(callerSignal.reason);
            };
            if (callerSignal.aborted) {
                this._onCallerAbort();
            } else {
                callerSignal.addEventListener("abort", this._onCallerAbort, { once: true });
            }
        }
    }

    /** The build-owned signal blocks use for cooperative cancellation. */
    public get signal(): AbortSignal {
        return this._abortController.signal;
    }

    /** The diagnostics collected so far in deterministic production order. */
    public get diagnostics(): ReadonlyArray<IBuildDiagnostic> {
        return this._diagnostics;
    }

    /** The loss records collected so far in deterministic production order. */
    public get lossRecords(): ReadonlyArray<LossRecord> {
        return this._lossRecords;
    }

    /** Whether an internal fatal or limit failure requested sibling cancellation. */
    public get hasPrimaryError(): boolean {
        return this._hasPrimaryError;
    }

    /** The first observed internal fatal or limit error, preserved by identity. */
    public get primaryError(): unknown {
        return this._primaryError;
    }

    /**
     * Adds a non-fatal diagnostic to this build.
     * @param diagnostic The diagnostic to collect.
     */
    public addDiagnostic(diagnostic: IBuildDiagnostic): void {
        this._diagnostics.push(Object.freeze({ ...diagnostic }));
    }

    /**
     * Maps a USD loader diagnostic to a build diagnostic and canonical loss record.
     * @param diagnostic The resolved-stage diagnostic to map.
     * @param context Representation and producer facts for the loss.
     * @returns The collected loss record.
     */
    public addResolvedDiagnostic(diagnostic: IResolvedDiagnostic, context: IResolvedDiagnosticLossContext): LossRecord {
        const buildDiagnostic: IBuildDiagnostic = Object.freeze({
            code: context.code,
            severity: diagnostic.severity,
            message: diagnostic.message,
            path: diagnostic.path,
            producer: context.producer,
        });
        const lossRecord: LossRecord = Object.freeze({
            ...buildDiagnostic,
            disposition: context.disposition,
            sourceRepresentation: context.sourceRepresentation,
            targetRepresentation: context.targetRepresentation,
            producer: context.producer,
        });
        this._diagnostics.push(buildDiagnostic);
        this._lossRecords.push(lossRecord);
        return lossRecord;
    }

    /** Throws the build's cancellation error when cancellation was requested. */
    public throwIfAborted(): void {
        if (this.signal.aborted) {
            throw this.signal.reason;
        }
    }

    /**
     * Records the first observed fatal error and immediately requests cooperative sibling cancellation.
     * @param error The original fatal error.
     */
    public abortForFailure(error: unknown): void {
        if (this.isCancellationError(error)) {
            return;
        }
        if (!this._hasPrimaryError) {
            this._hasPrimaryError = true;
            this._primaryError = error;
        }
        this._cancel(error);
    }

    /**
     * Tests whether an error is a cooperative sibling-cancellation artifact.
     * @param error The thrown value to classify.
     * @returns Whether the value represents cancellation rather than a primary fatal failure.
     */
    public isCancellationError(error: unknown): boolean {
        return error instanceof BuildCancelledError || (error instanceof DOMException && error.name === "AbortError");
    }

    /**
     * Registers a non-null block output or fan-out copy with this build. Disposable object identity is
     * deduplicated and cannot be shared with another build or reused after disposal.
     * @param value The produced value to register.
     * @param producer The block or transcoder that produced the value.
     */
    public registerValue(value: unknown, producer?: IBuildDiagnosticProducer): void {
        if (!IsBuildResource(value)) {
            return;
        }

        if (this._registeredResources.has(value)) {
            return;
        }
        const ownership = ResourceOwnership.get(value);
        if (ownership || value.isDisposed) {
            const code = ownership?.disposed || value.isDisposed ? "NODE_ASSET_RESOURCE_STALE" : "NODE_ASSET_RESOURCE_OWNED";
            throw new BuildResourceOwnershipError(
                code,
                code === "NODE_ASSET_RESOURCE_STALE"
                    ? "A disposed build resource cannot be reused by a later build."
                    : "A build resource cannot be shared by concurrent build scopes."
            );
        }

        this._registeredResources.add(value);
        ResourceOwnership.set(value, { scope: this, disposed: false });
        this._resources.push({ resource: value, producer });
    }

    /**
     * Disposes registered resources once in reverse registration order. Cleanup errors are collected as
     * diagnostics and never reject this operation.
     * @returns A promise that resolves after all registered resources settle.
     */
    public async disposeAsync(): Promise<void> {
        this._disposePromise ??= this._disposeResourcesAsync();
        return await this._disposePromise;
    }

    private async _disposeResourcesAsync(): Promise<void> {
        try {
            await this._disposeResourceAtAsync(this._resources.length - 1);
        } finally {
            if (this._callerSignal && this._onCallerAbort) {
                this._callerSignal.removeEventListener("abort", this._onCallerAbort);
            }
        }
    }

    private async _disposeResourceAtAsync(index: number): Promise<void> {
        if (index < 0) {
            return;
        }

        const entry = this._resources[index];
        const ownership = ResourceOwnership.get(entry.resource);
        if (ownership) {
            ownership.disposed = true;
        }
        try {
            await entry.resource.dispose();
        } catch (error) {
            this.addDiagnostic({
                code: "NODE_ASSET_CLEANUP_FAILED",
                severity: "warning",
                message: GetErrorMessage(error),
                producer: entry.producer,
            });
        }
        await this._disposeResourceAtAsync(index - 1);
    }

    private _cancel(reason?: unknown): void {
        if (!this.signal.aborted) {
            this._abortController.abort(new BuildCancelledError(reason));
        }
    }
}

/** Exported bytes plus immutable diagnostics produced by the same build. */
export class NodeAssetBuildResult extends Uint8Array {
    /** Non-fatal diagnostics produced by the build. */
    public readonly diagnostics: ReadonlyArray<IBuildDiagnostic>;
    /** Canonical loss records produced by representation boundaries. */
    public readonly lossRecords: ReadonlyArray<LossRecord>;

    /**
     * Creates a Uint8Array-compatible build result.
     * @param bytes The terminal export bytes.
     * @param diagnostics Non-fatal build diagnostics.
     * @param lossRecords Representation loss records.
     */
    public constructor(bytes: Uint8Array, diagnostics: ReadonlyArray<IBuildDiagnostic>, lossRecords: ReadonlyArray<LossRecord>) {
        super(bytes);
        this.diagnostics = Object.freeze([...diagnostics]);
        this.lossRecords = Object.freeze([...lossRecords]);
    }
}

function IsBuildResource(value: unknown): value is IBuildResource & object {
    return typeof value === "object" && value !== null && "dispose" in value && typeof value.dispose === "function";
}

function GetErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
