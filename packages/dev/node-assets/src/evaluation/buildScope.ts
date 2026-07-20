import { type IResolvedDiagnostic, type ResolvedDiagnosticSeverity } from "loaders/USD/resolution/resolvedStage";

import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";

/** Configurable ceilings enforced by one build scope. Equality is allowed; only exceeding fails. */
export interface INodeAssetBuildLimits {
    /** Maximum bytes accepted from any one source block. */
    readonly maxSourceAssetBytes: number;
    /** Maximum aggregate bytes accepted from all source blocks. */
    readonly maxTotalSourceBytes: number;
    /** Maximum number of block evaluations. */
    readonly maxEvaluations: number;
    /** Maximum wall-clock duration in milliseconds. */
    readonly maxWallClockMs: number;
}

/** Optional cancellation and partial limit overrides for one build. */
export interface INodeAssetBuildOptions {
    /** Caller-owned cancellation signal linked to the build scope. */
    readonly signal?: AbortSignal;
    /** Partial ceilings; omitted values use behavior-safe defaults. */
    readonly limits?: Partial<INodeAssetBuildLimits>;
}

/**
 * Immutable diagnostics retained for a settled build that rejected.
 */
export interface INodeAssetBuildReport {
    /** Non-fatal diagnostics produced before the build rejected, including cleanup failures. */
    readonly diagnostics: ReadonlyArray<IBuildDiagnostic>;
    /** Canonical loss records produced before the build rejected. */
    readonly lossRecords: ReadonlyArray<LossRecord>;
}

/** Raised when a configured build limit is not finite, non-negative, or count-safe. */
export class BuildConfigurationError extends TypeError {
    /** Stable machine-readable configuration error code. */
    public readonly code = "NODE_ASSET_BUILD_INVALID_LIMIT";
    /** The invalid limit field. */
    public readonly limitName: keyof INodeAssetBuildLimits;

    /**
     * Creates a build-limit configuration error.
     * @param limitName The invalid limit field.
     */
    public constructor(limitName: keyof INodeAssetBuildLimits) {
        super(`The "${limitName}" build limit is invalid.`);
        this.name = "BuildConfigurationError";
        this.limitName = limitName;
    }
}

/** Machine-readable build-limit failures. */
export type BuildLimitErrorCode = "NODE_ASSET_LIMIT_SOURCE_BYTES" | "NODE_ASSET_LIMIT_TOTAL_SOURCE_BYTES" | "NODE_ASSET_LIMIT_EVALUATIONS" | "NODE_ASSET_LIMIT_WALL_CLOCK";

/** Raised when a build exceeds a configured resource or time ceiling. */
export class BuildLimitError extends Error {
    /** Stable machine-readable limit failure code. */
    public readonly code: BuildLimitErrorCode;
    /** Configured inclusive ceiling. */
    public readonly limit: number;
    /** Observed value that exceeded the ceiling. */
    public readonly actual: number;

    /**
     * Creates a build-limit failure.
     * @param code Stable machine-readable limit failure code.
     * @param limit Configured inclusive ceiling.
     * @param actual Observed value that exceeded the ceiling.
     */
    public constructor(code: BuildLimitErrorCode, limit: number, actual: number) {
        super(`The node asset build exceeded ${code}: ${actual} > ${limit}.`);
        this.name = "BuildLimitError";
        this.code = code;
        this.limit = limit;
        this.actual = actual;
    }
}

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
export type BuildRepresentationKind = "GLTF_DOCUMENT" | "UNIVERSAL" | "USD_STAGE" | "BABYLON_SCENE";

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
    /** Stable refinement tags propagated by later representation boundaries. */
    readonly tags?: ReadonlyArray<string>;
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
    /** Optional stable refinement tags. */
    readonly tags?: ReadonlyArray<string>;
}

/** Identifies additional object identities exclusively owned by a build-resource wrapper. */
export const BuildResourceIdentities = Symbol("NodeAssetBuildResourceIdentities");

/** A build-owned value that releases resources synchronously or asynchronously. */
export interface IBuildResource {
    /** Whether the resource was already disposed before registration. */
    readonly isDisposed?: boolean;
    /** Additional underlying object identities that this wrapper exclusively owns. */
    readonly [BuildResourceIdentities]?: ReadonlyArray<object>;
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
    disposed: boolean;
}

interface IBuildResourceEntry {
    readonly resource: IBuildResource & object;
    readonly identities: ReadonlyArray<object>;
    readonly producer?: IBuildDiagnosticProducer;
}

const ResourceOwnership = new WeakMap<object, IResourceOwnership>();
const BuildReports = new WeakMap<object, INodeAssetBuildReport>();
const DefaultBuildLimits: INodeAssetBuildLimits = Object.freeze({
    maxSourceAssetBytes: Number.MAX_SAFE_INTEGER,
    maxTotalSourceBytes: Number.MAX_SAFE_INTEGER,
    maxEvaluations: Number.MAX_SAFE_INTEGER,
    maxWallClockMs: Number.MAX_SAFE_INTEGER,
});

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
    private readonly _connectionPoints = new Set<NodeAssetConnectionPoint>();
    private readonly _diagnostics: IBuildDiagnostic[] = [];
    private readonly _limits: INodeAssetBuildLimits;
    private readonly _lossRecords: LossRecord[] = [];
    private readonly _resources: IBuildResourceEntry[] = [];
    private readonly _registeredResources = new WeakSet<object>();
    private readonly _startedAt = globalThis.performance.now();
    private readonly _callerSignal: AbortSignal | undefined;
    private readonly _onCallerAbort: (() => void) | undefined;
    private _disposePromise: Promise<void> | undefined;
    private _hasPrimaryError = false;
    private _primaryError: unknown;
    private _evaluationCount = 0;
    private _totalSourceBytes = 0;
    private _wallClockTimer: ReturnType<typeof setTimeout> | undefined;

    /**
     * Creates one build scope and links an optional caller signal to its internal controller.
     * @param options Optional caller cancellation and partial build limits.
     */
    public constructor(options: INodeAssetBuildOptions = {}) {
        ValidateBuildLimits(options.limits);
        this._limits = { ...DefaultBuildLimits, ...options.limits };
        if (options.limits?.maxWallClockMs !== undefined) {
            this._scheduleWallClockTimeout();
        }
        const callerSignal = options.signal;
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
        this._diagnostics.push(FreezeBuildDiagnostic(diagnostic));
    }

    /**
     * Maps a USD loader diagnostic to a build diagnostic and canonical loss record.
     * @param diagnostic The resolved-stage diagnostic to map.
     * @param context Representation and producer facts for the loss.
     * @returns The collected loss record.
     */
    public addResolvedDiagnostic(diagnostic: IResolvedDiagnostic, context: IResolvedDiagnosticLossContext): LossRecord {
        const producer = FreezeBuildDiagnosticProducer(context.producer);
        const buildDiagnostic: IBuildDiagnostic = Object.freeze({
            code: context.code,
            severity: diagnostic.severity,
            message: diagnostic.message,
            path: diagnostic.path,
            producer,
        });
        const lossRecord: LossRecord = Object.freeze({
            ...buildDiagnostic,
            disposition: context.disposition,
            sourceRepresentation: context.sourceRepresentation,
            targetRepresentation: context.targetRepresentation,
            producer,
            tags: context.tags ? Object.freeze([...context.tags]) : undefined,
        });
        this._diagnostics.push(buildDiagnostic);
        this._lossRecords.push(lossRecord);
        return lossRecord;
    }

    /** Throws the build's cancellation error when cancellation was requested. */
    public throwIfAborted(): void {
        if (!this.signal.aborted) {
            const elapsed = globalThis.performance.now() - this._startedAt;
            if (elapsed > this._limits.maxWallClockMs) {
                this._throwLimit("NODE_ASSET_LIMIT_WALL_CLOCK", this._limits.maxWallClockMs, elapsed);
            }
        }
        if (this.signal.aborted) {
            throw this.signal.reason;
        }
    }

    /**
     * Runs an operation that cooperatively uses this scope's signal. The scope's abort listener is
     * installed before the operation starts, so a scope-caused abort is branded without inferring
     * causality from an error name after the fact. All started operation work is still awaited.
     * @param operation The abortable operation to run.
     * @returns The operation result.
     */
    public async runAbortableAsync<T>(operation: () => Promise<T>): Promise<T> {
        this.throwIfAborted();
        let markAborted = () => {};
        const abortRequested = new Promise<void>((resolve) => {
            markAborted = resolve;
            this.signal.addEventListener("abort", markAborted, { once: true });
        });
        // Give operation settlement and abort notification equivalent promise depth so their actual
        // ordering, rather than an extra reaction hop, decides the race.
        // eslint-disable-next-line github/no-then
        const aborted = abortRequested.then(() => "aborted" as const);
        let operationPromise: Promise<T>;
        try {
            operationPromise = operation();
        } catch (error) {
            this.signal.removeEventListener("abort", markAborted);
            throw error;
        }
        // eslint-disable-next-line github/no-then
        const settled = operationPromise.then(
            (value) => ({ status: "fulfilled" as const, value }),
            (reason: unknown) => ({ status: "rejected" as const, reason })
        );
        try {
            const first = await Promise.race([settled, aborted]);
            if (first !== "aborted") {
                if (first.status === "rejected") {
                    throw first.reason;
                }
                return first.value;
            }

            const final = await settled;
            if (final.status === "rejected" && !IsAbortError(final.reason)) {
                throw final.reason;
            }
            throw this.signal.reason;
        } finally {
            this.signal.removeEventListener("abort", markAborted);
        }
    }

    /** Counts one evaluate-once block execution and fails only when the configured ceiling is exceeded. */
    public beginEvaluation(): void {
        this._evaluationCount++;
        if (this._evaluationCount > this._limits.maxEvaluations) {
            this._throwLimit("NODE_ASSET_LIMIT_EVALUATIONS", this._limits.maxEvaluations, this._evaluationCount);
        }
    }

    /**
     * Accounts one source block's actual input bytes before parsing.
     * @param byteLength The source payload's actual byte length.
     */
    public accountSourceBytes(byteLength: number): void {
        if (byteLength > this._limits.maxSourceAssetBytes) {
            this._throwLimit("NODE_ASSET_LIMIT_SOURCE_BYTES", this._limits.maxSourceAssetBytes, byteLength);
        }
        this._totalSourceBytes += byteLength;
        if (this._totalSourceBytes > this._limits.maxTotalSourceBytes) {
            this._throwLimit("NODE_ASSET_LIMIT_TOTAL_SOURCE_BYTES", this._limits.maxTotalSourceBytes, this._totalSourceBytes);
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
        if (!this.signal.aborted) {
            return false;
        }
        if (error === this.signal.reason || error instanceof BuildCancelledError) {
            return true;
        }
        return false;
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

        const ownership = ResourceOwnership.get(value);
        if (ownership?.disposed || value.isDisposed) {
            throw new BuildResourceOwnershipError("NODE_ASSET_RESOURCE_STALE", "A disposed build resource cannot be reused by the same or a later build.");
        }
        if (this._registeredResources.has(value)) {
            return;
        }
        const identities = [...new Set<object>([value, ...(value[BuildResourceIdentities] ?? [])])];
        for (const identity of identities) {
            const identityOwnership = ResourceOwnership.get(identity);
            if (identityOwnership?.disposed) {
                throw new BuildResourceOwnershipError("NODE_ASSET_RESOURCE_STALE", "A disposed underlying build resource cannot be reused by the same or a later build.");
            }
            if (identityOwnership) {
                throw new BuildResourceOwnershipError("NODE_ASSET_RESOURCE_OWNED", "An underlying build resource cannot be shared by concurrent build scopes.");
            }
        }

        this._registeredResources.add(value);
        for (const identity of identities) {
            ResourceOwnership.set(identity, { disposed: false });
        }
        this._resources.push({ resource: value, identities, producer });
    }

    /**
     * Tracks a connection point whose transient value belongs to this build.
     * @param point The connection point used while evaluating the graph.
     * @internal
     */
    public _registerConnectionPoint(point: NodeAssetConnectionPoint): void {
        this._connectionPoints.add(point);
    }

    /**
     * Retains this build's immutable post-cleanup report for an object thrown to the caller.
     * Primitive thrown values intentionally remain unchanged and cannot carry a report.
     * @param error The exact value that will be thrown.
     * @internal
     */
    public _attachReport(error: unknown): void {
        if (!IsObject(error)) {
            return;
        }
        BuildReports.set(
            error,
            Object.freeze({
                diagnostics: Object.freeze([...this._diagnostics]),
                lossRecords: Object.freeze([...this._lossRecords]),
            })
        );
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
            for (let index = this._resources.length - 1; index >= 0; index--) {
                const entry = this._resources[index];
                const ownership = ResourceOwnership.get(entry.resource);
                if (ownership) {
                    ownership.disposed = true;
                }
                if (entry.resource.isDisposed) {
                    continue;
                }
                try {
                    // eslint-disable-next-line no-await-in-loop -- resources must dispose sequentially in reverse registration order
                    await entry.resource.dispose();
                } catch (error) {
                    this.addDiagnostic({
                        code: "NODE_ASSET_CLEANUP_FAILED",
                        severity: "warning",
                        message: GetErrorMessage(error),
                        producer: entry.producer,
                    });
                }
            }
        } finally {
            if (this._callerSignal && this._onCallerAbort) {
                this._callerSignal.removeEventListener("abort", this._onCallerAbort);
            }
            if (this._wallClockTimer !== undefined) {
                clearTimeout(this._wallClockTimer);
                this._wallClockTimer = undefined;
            }
            this._resources.length = 0;
            for (const point of this._connectionPoints) {
                point.value = null;
            }
            this._connectionPoints.clear();
        }
    }

    private _cancel(reason?: unknown): void {
        if (!this.signal.aborted) {
            this._abortController.abort(new BuildCancelledError(reason));
        }
    }

    private _throwLimit(code: BuildLimitErrorCode, limit: number, actual: number): never {
        const error = new BuildLimitError(code, limit, actual);
        this.abortForFailure(error);
        throw error;
    }

    private _scheduleWallClockTimeout(): void {
        const elapsed = globalThis.performance.now() - this._startedAt;
        const remaining = this._limits.maxWallClockMs - elapsed;
        const delay = Math.min(Math.max(remaining + 1, 0), 2_147_483_647);
        this._wallClockTimer = setTimeout(() => {
            const currentElapsed = globalThis.performance.now() - this._startedAt;
            if (currentElapsed > this._limits.maxWallClockMs) {
                this.abortForFailure(new BuildLimitError("NODE_ASSET_LIMIT_WALL_CLOCK", this._limits.maxWallClockMs, currentElapsed));
            } else {
                this._scheduleWallClockTimeout();
            }
        }, delay);
    }
}

/** Export bytes augmented with immutable, non-enumerable build metadata. */
export type NodeAssetBuildResult = Uint8Array & {
    /** Non-fatal diagnostics produced by the build. */
    readonly diagnostics: ReadonlyArray<IBuildDiagnostic>;
    /** Canonical loss records produced by representation boundaries. */
    readonly lossRecords: ReadonlyArray<LossRecord>;
};

/**
 * Attaches build metadata without copying fresh extensible terminal bytes. Non-extensible bytes and
 * bytes that already carry metadata are copied with a base typed-array constructor so Buffer-like
 * slice semantics cannot retain shared storage.
 * @param bytes The terminal export bytes.
 * @param diagnostics Non-fatal build diagnostics.
 * @param lossRecords Representation loss records.
 * @returns The original fresh extensible bytes, or an independent copy, with readonly build metadata.
 */
export function CreateNodeAssetBuildResult(bytes: Uint8Array, diagnostics: ReadonlyArray<IBuildDiagnostic>, lossRecords: ReadonlyArray<LossRecord>): NodeAssetBuildResult {
    const hasBuildMetadata = Object.prototype.hasOwnProperty.call(bytes, "diagnostics") || Object.prototype.hasOwnProperty.call(bytes, "lossRecords");
    const result = hasBuildMetadata || !Object.isExtensible(bytes) ? new Uint8Array(bytes) : bytes;
    Object.defineProperties(result, {
        diagnostics: {
            configurable: false,
            enumerable: false,
            value: Object.freeze([...diagnostics]),
            writable: false,
        },
        lossRecords: {
            configurable: false,
            enumerable: false,
            value: Object.freeze([...lossRecords]),
            writable: false,
        },
    });
    return result as NodeAssetBuildResult;
}

/**
 * Gets the immutable diagnostics retained for a failed build without modifying or replacing its
 * primary thrown object.
 * @param error The value rejected by {@link NodeAsset.buildAsync}.
 * @returns The build report for an object error, or `undefined` for unrelated or primitive values.
 */
export function GetNodeAssetBuildReport(error: unknown): INodeAssetBuildReport | undefined {
    return IsObject(error) ? BuildReports.get(error) : undefined;
}

function IsBuildResource(value: unknown): value is IBuildResource & object {
    return typeof value === "object" && value !== null && "dispose" in value && typeof value.dispose === "function";
}

function IsObject(value: unknown): value is object {
    return (typeof value === "object" && value !== null) || typeof value === "function";
}

function IsAbortError(value: unknown): value is Error {
    return (value instanceof Error || value instanceof DOMException) && value.name === "AbortError";
}

function FreezeBuildDiagnostic(diagnostic: IBuildDiagnostic): IBuildDiagnostic {
    return diagnostic.producer ? Object.freeze({ ...diagnostic, producer: FreezeBuildDiagnosticProducer(diagnostic.producer) }) : Object.freeze({ ...diagnostic });
}

function FreezeBuildDiagnosticProducer(producer: IBuildDiagnosticProducer): IBuildDiagnosticProducer {
    return Object.freeze({ ...producer });
}

function GetErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function ValidateBuildLimits(limits: Partial<INodeAssetBuildLimits> | undefined): void {
    if (!limits) {
        return;
    }

    ValidateCountLimit(limits, "maxSourceAssetBytes");
    ValidateCountLimit(limits, "maxTotalSourceBytes");
    ValidateCountLimit(limits, "maxEvaluations");
    const wallClock = limits.maxWallClockMs;
    if (wallClock !== undefined && (!Number.isFinite(wallClock) || wallClock < 0)) {
        throw new BuildConfigurationError("maxWallClockMs");
    }
}

function ValidateCountLimit(limits: Partial<INodeAssetBuildLimits>, name: "maxSourceAssetBytes" | "maxTotalSourceBytes" | "maxEvaluations"): void {
    const value = limits[name];
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
        throw new BuildConfigurationError(name);
    }
}
