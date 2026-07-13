import { type IResolvedStage } from "loaders/USD/resolution/resolvedStage";

import { type NodeAssetJsonObject } from "../connection/nodeAssetValueMap";
import { ValidateAndFreezeAssetMetadata, ValidateAndFreezeJsonObject } from "./immutableMetadata";

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

    private _isDisposed = false;

    /**
     * Creates a USD representation payload.
     * @param stage The resolved plain-data stage owned by this payload.
     * @param metadata Stable caller-supplied identity, revision, manifest, and overlay.
     */
    public constructor(stage: IResolvedStage, metadata: IUsdAssetMetadata) {
        const validatedMetadata = ValidateAndFreezeAssetMetadata(metadata);
        this.stage = CloneImmutableStage(stage);
        this.identity = validatedMetadata.identity;
        this.revision = validatedMetadata.revision;
        this.manifest = validatedMetadata.manifest;
        this.overlay = ValidateAndFreezeJsonObject(metadata.overlay, "overlay");
    }

    /** Whether this representation was released by its build scope. */
    public get isDisposed(): boolean {
        return this._isDisposed;
    }

    /**
     * Copies the value-like USD wrapper for fan-out without cloning the already-frozen stage.
     * @returns A wrapper sharing the exact stage with an independent immutable overlay.
     */
    public copyForFanOut(): UsdAsset {
        const copy = Object.create(UsdAsset.prototype) as UsdAsset;
        Object.assign(copy, {
            stage: this.stage,
            identity: this.identity,
            revision: this.revision,
            manifest: this.manifest,
            overlay: ValidateAndFreezeJsonObject(structuredClone(this.overlay), "overlay"),
            _isDisposed: false,
        });
        return copy;
    }

    /** Releases this wrapper's build ownership once. */
    public dispose(): void {
        this._isDisposed = true;
    }
}

function CloneImmutableStage(stage: IResolvedStage): IResolvedStage {
    const clone = structuredClone(stage);
    FreezeWithDefensiveViews(clone, new Set<object>());
    return clone;
}

function FreezeWithDefensiveViews(value: unknown, visited: Set<object>): void {
    if (typeof value !== "object" || value === null || ArrayBuffer.isView(value) || visited.has(value)) {
        return;
    }

    visited.add(value);
    for (const [key, child] of Object.entries(value)) {
        if (ArrayBuffer.isView(child)) {
            const snapshot = structuredClone(child);
            Object.defineProperty(value, key, {
                configurable: false,
                enumerable: true,
                get: () => structuredClone(snapshot),
            });
        } else {
            FreezeWithDefensiveViews(child, visited);
        }
    }
    Object.freeze(value);
}

/**
 * Tests whether a runtime connection value is a USD representation payload.
 * @param value The value to test.
 * @returns Whether the value is a {@link UsdAsset}.
 */
export function IsUsdAsset(value: unknown): value is UsdAsset {
    return value instanceof UsdAsset;
}
