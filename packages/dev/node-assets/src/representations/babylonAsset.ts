import { type NullEngine } from "core/Engines/nullEngine";
import { type Scene } from "core/scene";

import { type NodeAssetJsonObject } from "../connection/nodeAssetValueMap";
import { BuildResourceIdentities } from "../evaluation/buildScope";
import { ValidateAndFreezeAssetMetadata } from "./immutableMetadata";

/** Immutable caller-supplied metadata for a {@link BabylonAsset}. */
export interface IBabylonAssetMetadata {
    /** Stable identity for the represented asset. */
    readonly identity: string;
    /** Stable revision represented by the live scene. */
    readonly revision: number;
    /** Representation facts surfaced to later build and editor layers. */
    readonly manifest: NodeAssetJsonObject;
}

/** Owns a live build-scoped NullEngine and Scene and cannot be implicitly cloned. */
export class BabylonAsset {
    /** The owned build-scoped engine. */
    public readonly engine: NullEngine;
    /** The owned live scene. Its dynamic handedness remains authoritative. */
    public readonly scene: Scene;
    /** Stable caller-supplied asset identity. */
    public readonly identity: string;
    /** Caller-supplied scene revision. */
    public readonly revision: number;
    /** Deeply frozen representation facts. */
    public readonly manifest: Readonly<NodeAssetJsonObject>;
    /** Marks this live representation as affine: implicit fan-out is not permitted. */
    public readonly isAffine = true;
    /** The engine and scene identities exclusively owned by this wrapper during a build. */
    public readonly [BuildResourceIdentities]: ReadonlyArray<object>;

    private _isDisposed = false;

    /**
     * Creates a Babylon representation payload.
     * @param engine The build-scoped NullEngine owned by this payload.
     * @param scene The live Scene owned by this payload.
     * @param metadata Stable caller-supplied identity, revision, and manifest.
     */
    public constructor(engine: NullEngine, scene: Scene, metadata: IBabylonAssetMetadata) {
        const validatedMetadata = ValidateAndFreezeAssetMetadata(metadata);
        if (scene.getEngine() !== engine) {
            throw new Error("A BabylonAsset scene must belong to the supplied NullEngine.");
        }

        this.engine = engine;
        this.scene = scene;
        this.identity = validatedMetadata.identity;
        this.revision = validatedMetadata.revision;
        this.manifest = validatedMetadata.manifest;
        this[BuildResourceIdentities] = Object.freeze([engine, scene]);
    }

    /** Whether this affine representation was disposed by its build scope. */
    public get isDisposed(): boolean {
        return this._isDisposed;
    }

    /** Disposes the owned scene and engine once. */
    public dispose(): void {
        if (this._isDisposed) {
            return;
        }
        this._isDisposed = true;
        this.scene.dispose();
        this.engine.dispose();
    }
}

/**
 * Tests whether a runtime connection value is a Babylon representation payload.
 * @param value The value to test.
 * @returns Whether the value is a {@link BabylonAsset}.
 */
export function IsBabylonAsset(value: unknown): value is BabylonAsset {
    return value instanceof BabylonAsset;
}
