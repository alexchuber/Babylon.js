import { type IResolvedPrim } from "loaders/USD/resolution/resolvedStage";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAssetJsonObject } from "../connection/nodeAssetValueMap";
import { type NodeAsset } from "../nodeAsset";
import { GetUsdAssetFromInput } from "./usd2GLTFBlock";

/**
 * Retrieves a prim from a {@link UsdAsset} (USD_STAGE) by path and exposes its properties
 * as a JSON object.
 *
 * The prim path must be absolute (starting with `/`). The root prim itself can be selected
 * with `/`. The output includes the prim's metadata (path, name, kind, visibility), its
 * transform, and any role-specific payload (light, camera, mesh index, etc.). Direct child
 * paths are listed under `childPaths` for easy hierarchy traversal.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class GetUSDPrimBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "GetUSDPrimBlock";

    /** The USD stage to query. */
    public readonly input: NodeAssetConnectionPoint;

    /** The prim path to retrieve. */
    public readonly primPath: NodeAssetConnectionPoint;

    /** The prim properties as a JSON object. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new get USD prim block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.USD_STAGE);
        this.primPath = this._registerInput("primPath", NodeAssetConnectionPointType.STRING);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.JSON);
    }

    /**
     * Navigates the resolved stage's prim hierarchy to the requested path and serializes the
     * prim's authored properties as a JSON object on the output.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const usdAsset = GetUsdAssetFromInput(this.input.value, this.name);
        const primPath = this.primPath.value as string;
        if (!primPath.startsWith("/")) {
            throw new Error(`The "${this.name}" GetUSDPrimBlock received an invalid prim path "${primPath}": paths must start with "/".`);
        }

        const prim = FindPrimByPath(usdAsset.stage.root, primPath);
        if (!prim) {
            throw new Error(`Prim not found at path "${primPath}" in the USD stage.`);
        }

        this.output.value = SerializePrim(prim);
    }
}

RegisterBlock(GetUSDPrimBlock.ClassName, (name, nodeAsset) => new GetUSDPrimBlock(name, nodeAsset));

/**
 * Finds a prim by absolute path in the resolved prim tree.
 * @param root - The root prim of the stage.
 * @param path - The absolute prim path to find.
 * @returns The prim if found, or undefined.
 */
export function FindPrimByPath(root: IResolvedPrim, path: string): IResolvedPrim | undefined {
    if (root.path === path) {
        return root;
    }
    for (const child of root.children) {
        const found = FindPrimByPath(child, path);
        if (found) {
            return found;
        }
    }
    return undefined;
}

/**
 * Serializes a resolved prim's authored properties to a JSON-safe object.
 * @param prim - The resolved prim to serialize.
 * @returns A plain JSON object representing the prim.
 */
export function SerializePrim(prim: IResolvedPrim): NodeAssetJsonObject {
    const result: NodeAssetJsonObject = {
        path: prim.path,
        name: prim.name,
        kind: prim.kind,
        visible: prim.visible,
        transform: {
            translation: Array.from(prim.transform.translation),
            rotation: Array.from(prim.transform.rotation),
            scale: Array.from(prim.transform.scale),
        },
        childPaths: prim.children.map((c) => c.path),
    };

    if (prim.meshIndex !== undefined) {
        result.meshIndex = prim.meshIndex;
    }
    if (prim.materialBinding) {
        result.materialBinding = { materialIndex: prim.materialBinding.materialIndex ?? null };
    }
    if (prim.light) {
        result.light = {
            kind: prim.light.kind,
            color: Array.from(prim.light.color),
            intensity: prim.light.intensity,
            exposure: prim.light.exposure,
        };
    }
    if (prim.camera) {
        result.camera = {
            projection: prim.camera.projection,
            focalLength: prim.camera.focalLength,
            horizontalAperture: prim.camera.horizontalAperture,
            verticalAperture: prim.camera.verticalAperture,
            clippingRange: Array.from(prim.camera.clippingRange),
        };
    }

    return result;
}
