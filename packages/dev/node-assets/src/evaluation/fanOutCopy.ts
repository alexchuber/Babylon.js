import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type BuildScope, type IBuildDiagnostic, type IBuildDiagnosticProducer } from "./buildScope";
import { IsBabylonAsset } from "../representations/babylonAsset";
import { GetGltfAsset } from "../representations/gltfAsset";
import { IsNodeGeometryAsset } from "../representations/nodeGeometryAsset";
import { IsNodeGeometrySource } from "../representations/nodeGeometrySource";
import { IsUsdAsset } from "../representations/usdAsset";

/** Raised when implicit fan-out violates a payload's representation policy. */
export class BuildFanOutError extends Error {
    /** Stable machine-readable affine fan-out code. */
    public readonly code = "NODE_ASSET_AFFINE_FAN_OUT";
    /** Structured diagnostic describing the rejected fan-out. */
    public readonly diagnostic: IBuildDiagnostic;

    /**
     * Creates an affine fan-out error.
     * @param diagnostic The structured fatal diagnostic.
     */
    public constructor(diagnostic: IBuildDiagnostic) {
        super("A BabylonAsset is affine and cannot be fanned out implicitly; use an explicit LossyFork.");
        this.name = "BuildFanOutError";
        this.diagnostic = diagnostic;
    }
}

/**
 * Returns the value a fanned-out consumer should receive for its input, cloning only mutable
 * payloads so branches cannot stomp each other's in-place edits.
 *
 * A GLTF_DOCUMENT payload is a mutable {@link GltfAsset}; when its producing output feeds more than
 * one consumer, each consumer needs its own deep copy so an in-place edit on
 * one branch stays local to that branch. USD wrappers share their frozen stage while copying the
 * overlay, Babylon wrappers reject implicit fan-out, NodeGeometry resources reconstruct without
 * building, and scalar/Image payloads share by reference.
 * @param type - The connection point type (payload kind) of the value being propagated.
 * @param value - The upstream output's resolved value.
 * @param scope - The optional build scope that collects affine diagnostics.
 * @param producer - The optional producer attached to an affine diagnostic.
 * @returns The value selected by the payload kind's fan-out policy.
 */
export async function CloneForFanOutAsync(type: NodeAssetConnectionPointType, value: unknown, scope?: BuildScope, producer?: IBuildDiagnosticProducer): Promise<unknown> {
    if (value == null) {
        return value;
    }

    switch (type) {
        case NodeAssetConnectionPointType.GLTF_DOCUMENT:
        case NodeAssetConnectionPointType.UNIVERSAL:
            return GetGltfAsset(value, "fan-out").clone();
        case NodeAssetConnectionPointType.USD_STAGE:
            if (!IsUsdAsset(value)) {
                throw new Error('The "fan-out" connection point did not receive a UsdAsset.');
            }
            return value.copyForFanOut();
        case NodeAssetConnectionPointType.BABYLON_SCENE: {
            if (!IsBabylonAsset(value)) {
                throw new Error('The "fan-out" connection point did not receive a BabylonAsset.');
            }
            const diagnostic: IBuildDiagnostic = {
                code: "NODE_ASSET_AFFINE_FAN_OUT",
                severity: "error",
                message: "A BabylonAsset is affine and requires an explicit LossyFork before fan-out.",
                producer,
            };
            scope?.addDiagnostic(diagnostic);
            throw new BuildFanOutError(diagnostic);
        }
        case NodeAssetConnectionPointType.NODE_GEOMETRY:
            if (IsNodeGeometrySource(value)) {
                return value.cloneForFanOut();
            }
            if (!IsNodeGeometryAsset(value)) {
                throw new Error('The "fan-out" connection point did not receive a Node Geometry source payload.');
            }
            return value.cloneForFanOut();
        default:
            return value;
    }
}
