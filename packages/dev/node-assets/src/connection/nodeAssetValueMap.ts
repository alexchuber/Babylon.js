import { type ImagePayload } from "../Blocks/imagePayload";
import { type BabylonAsset } from "../representations/babylonAsset";
import { type BabylonSource } from "../representations/babylonSource";
import { type GltfAsset } from "../representations/gltfAsset";
import { type NodeGeometryAsset } from "../representations/nodeGeometryAsset";
import { type NodeGeometrySource } from "../representations/nodeGeometrySource";
import { type OBJSourceAsset } from "../representations/objSourceAsset";
import { type UsdAsset } from "../representations/usdAsset";
import { type UsdSourceAsset } from "../representations/usdSourceAsset";
import { type NodeAssetConnectionPointType } from "./nodeAssetConnectionPointType";

/** A JSON primitive supported by the JSON connection point kind. */
export type NodeAssetJsonPrimitive = null | boolean | number | string;

/** A recursive JSON array supported by the JSON connection point kind. */
export type NodeAssetJsonArray = NodeAssetJsonValue[];

/** A recursive JSON object supported by the JSON connection point kind. */
export type NodeAssetJsonObject = {
    [key: string]: NodeAssetJsonValue;
};

/** A JSON-serializable payload value. */
export type NodeAssetJsonValue = NodeAssetJsonPrimitive | NodeAssetJsonArray | NodeAssetJsonObject;

/**
 * Tests whether an unknown runtime value is a finite, acyclic JSON value.
 * @param value The value to test.
 * @returns Whether the value can travel on a JSON connection point.
 */
export function IsNodeAssetJsonValue(value: unknown): value is NodeAssetJsonValue {
    return IsJsonValue(value, new Set<object>());
}

function IsJsonValue(value: unknown, ancestors: Set<object>): value is NodeAssetJsonValue {
    if (value === null || typeof value === "boolean" || typeof value === "string") {
        return true;
    }
    if (typeof value === "number") {
        return Number.isFinite(value);
    }
    if (typeof value !== "object") {
        return false;
    }

    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
        return false;
    }
    if (ancestors.has(value)) {
        return false;
    }

    ancestors.add(value);
    const isJson = (Array.isArray(value) ? value : Object.values(value)).every((entry) => IsJsonValue(entry, ancestors));
    ancestors.delete(value);
    return isJson;
}

/**
 * Correlates each concrete connection point kind with its runtime payload.
 *
 * Connection points keep their storage as `unknown`; blocks narrow at their representation seam with
 * the exported wrapper guards instead of widening graph storage to `any`.
 */
export type NodeAssetValueMap = {
    [NodeAssetConnectionPointType.GLTF_DOCUMENT]: GltfAsset;
    [NodeAssetConnectionPointType.NUMBER]: number;
    [NodeAssetConnectionPointType.STRING]: string;
    [NodeAssetConnectionPointType.JSON]: NodeAssetJsonValue;
    [NodeAssetConnectionPointType.IMAGE]: ImagePayload;
    [NodeAssetConnectionPointType.USD_STAGE]: UsdAsset;
    [NodeAssetConnectionPointType.BABYLON_SCENE]: BabylonAsset;
    [NodeAssetConnectionPointType.NODE_GEOMETRY]: NodeGeometrySource | NodeGeometryAsset;
    [NodeAssetConnectionPointType.UNIVERSAL]: GltfAsset;
    [NodeAssetConnectionPointType.BABYLON_SOURCE]: BabylonSource;
    [NodeAssetConnectionPointType.USD_SOURCE]: UsdSourceAsset;
    [NodeAssetConnectionPointType.OBJ_SOURCE]: OBJSourceAsset;
};
