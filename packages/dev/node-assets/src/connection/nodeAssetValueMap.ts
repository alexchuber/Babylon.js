import { type ImagePayload } from "../Blocks/imagePayload";
import { type BabylonAsset } from "../representations/babylonAsset";
import { type GltfAsset } from "../representations/gltfAsset";
import { type NodeGeometryAsset } from "../representations/nodeGeometryAsset";
import { type UsdAsset } from "../representations/usdAsset";
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
    [NodeAssetConnectionPointType.NODE_GEOMETRY]: NodeGeometryAsset;
};
