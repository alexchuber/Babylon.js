import { NullEngine } from "core/Engines/nullEngine";
import { SceneLoader } from "core/Loading/sceneLoader";

// Side-effect import: registers the .babylon file loader plugin.
import "core/Loading/Plugins/babylonFileLoader";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { BabylonAsset } from "../representations/babylonAsset";

/**
 * Imports a `.babylon` file from a URL and exposes it as a {@link BabylonAsset} on its output.
 */
export class ImportBabylonBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ImportBabylonBlock";

    /** The URL to load the `.babylon` file from. */
    public readonly url: NodeAssetConnectionPoint;

    /** The imported Babylon scene representation. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new Babylon import block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.url = this._registerInput("url", NodeAssetConnectionPointType.STRING);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.BABYLON_SCENE);
    }

    /**
     * Loads a `.babylon` file from the URL on the {@link url} input and wraps the result
     * in a {@link BabylonAsset} on the {@link output}.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const urlValue = this.url.value as string;
        if (!urlValue) {
            throw new Error(`The "${this.name}" import block has no URL to load.`);
        }

        const engine = new NullEngine();
        try {
            const scene = await SceneLoader.LoadAsync("", urlValue, engine);
            this.output.value = new BabylonAsset(engine, scene, {
                identity: urlValue,
                revision: 0,
                manifest: { format: "babylon", source: urlValue },
            });
        } catch (error) {
            engine.dispose();
            throw new Error(`The "${this.name}" import block failed to load "${urlValue}": ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        }
    }
}

RegisterBlock(ImportBabylonBlock.ClassName, (name, nodeAsset) => new ImportBabylonBlock(name, nodeAsset));
