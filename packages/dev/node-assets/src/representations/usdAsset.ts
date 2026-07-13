import { FreezeResolvedStage, type IResolvedStage } from "loaders/USD/resolution/resolvedStage";

import { type NodeAssetJsonObject } from "../connection/nodeAssetValueMap";
import { DeepFreeze } from "./immutableMetadata";

/** Immutable caller-supplied metadata for a {@link UsdAsset}. */
export interface IUsdAssetMetadata {
    /** Stable identity for the represented asset. */
    readonly identity: string;
    /** Stable revision represented by the stage and overlay. */
    readonly revision: number;
    /** Representation facts surfaced to later build and editor layers. */
    readonly manifest: NodeAssetJsonObject;
    /** Additive USD edits layered over the frozen resolved stage. */
    readonly overlay: NodeAssetJsonObject;
}

/** Owns a frozen resolved USD stage and immutable overlay. */
export class UsdAsset {
    /** The deeply frozen resolved stage. */
    public readonly stage: IResolvedStage;
    /** Stable caller-supplied asset identity. */
    public readonly identity: string;
    /** Caller-supplied stage/overlay revision. */
    public readonly revision: number;
    /** Deeply frozen representation facts. */
    public readonly manifest: Readonly<NodeAssetJsonObject>;
    /** Deeply frozen additive USD edits. */
    public readonly overlay: Readonly<NodeAssetJsonObject>;

    /**
     * Creates a USD representation payload.
     * @param stage The resolved plain-data stage owned by this payload.
     * @param metadata Stable caller-supplied identity, revision, manifest, and overlay.
     */
    public constructor(stage: IResolvedStage, metadata: IUsdAssetMetadata) {
        this.stage = FreezeResolvedStage(stage);
        this.identity = metadata.identity;
        this.revision = metadata.revision;
        this.manifest = DeepFreeze(metadata.manifest);
        this.overlay = DeepFreeze(metadata.overlay);
    }
}

/**
 * Tests whether a runtime connection value is a USD representation payload.
 * @param value The value to test.
 * @returns Whether the value is a {@link UsdAsset}.
 */
export function IsUsdAsset(value: unknown): value is UsdAsset {
    return value instanceof UsdAsset;
}
