import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";

import { AdaptResolvedStageToScene } from "loaders/USD/adapter/usdAdapter";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAssetJsonObject } from "../connection/nodeAssetValueMap";
import { type NodeAsset } from "../nodeAsset";
import { BabylonAsset } from "../representations/babylonAsset";
import { GetUsdAssetFromInput } from "./usd2GLTFBlock";

/**
 * Transcodes a {@link UsdAsset} (USD_STAGE) into a {@link BabylonAsset} (BABYLON_SCENE).
 *
 * The block creates a build-scoped {@link NullEngine} and {@link Scene}, then uses the USD
 * adapter layer ({@link AdaptResolvedStageToScene}) to map the resolved stage's geometry,
 * materials, hierarchy, and animations directly onto Babylon objects. Resolution diagnostics
 * from the stage are carried into the resulting {@link BabylonAsset}'s manifest.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class USD2BabylonBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "USD2BabylonBlock";

    /** The USD stage to transcode. */
    public readonly input: NodeAssetConnectionPoint;

    /** The resulting Babylon scene. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new USD-to-Babylon transcoder block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.USD_STAGE);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.BABYLON_SCENE);
    }

    /**
     * Reads the resolved stage from the USD_STAGE input, creates a build-scoped NullEngine and
     * Scene, adapts the resolved stage onto Babylon objects, and wraps the result in a
     * {@link BabylonAsset} on the output.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const usdAsset = GetUsdAssetFromInput(this.input.value, this.name);
        const stage = usdAsset.stage;

        const engine = new NullEngine();
        const scene = new Scene(engine);

        AdaptResolvedStageToScene(stage, scene, null, {});

        const diagnostics = stage.diagnostics.map((d) => ({
            severity: d.severity,
            message: d.message,
            ...(d.path ? { path: d.path } : {}),
        }));

        this.output.value = new BabylonAsset(engine, scene, {
            identity: usdAsset.identity,
            revision: usdAsset.revision,
            manifest: {
                format: "babylon",
                importedFrom: "usd",
                diagnostics,
            } as NodeAssetJsonObject,
        });
    }
}

RegisterBlock(USD2BabylonBlock.ClassName, (name, nodeAsset) => new USD2BabylonBlock(name, nodeAsset));
