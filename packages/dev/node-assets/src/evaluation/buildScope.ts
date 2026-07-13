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

/** Owns diagnostics and other per-build state for one {@link NodeAsset.buildAsync} call. */
export class BuildScope {
    private readonly _diagnostics: IBuildDiagnostic[] = [];
    private readonly _lossRecords: LossRecord[] = [];

    /** The diagnostics collected so far in deterministic production order. */
    public get diagnostics(): ReadonlyArray<IBuildDiagnostic> {
        return this._diagnostics;
    }

    /** The loss records collected so far in deterministic production order. */
    public get lossRecords(): ReadonlyArray<LossRecord> {
        return this._lossRecords;
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
