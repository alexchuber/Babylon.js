import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { IsBabylonAsset } from "../representations/babylonAsset";

/**
 * Retrieves a mesh from a {@link BabylonAsset} (BABYLON_SCENE) by name and exposes its
 * properties as a JSON object.
 */
export class GetBabylonMeshBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "GetBabylonMeshBlock";

    /** The Babylon scene to query. */
    public readonly input: NodeAssetConnectionPoint;

    /** The name of the mesh to retrieve. */
    public readonly meshName: NodeAssetConnectionPoint;

    /** The mesh properties as a JSON object. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new get Babylon mesh block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.BABYLON_SCENE);
        this.meshName = this._registerInput("meshName", NodeAssetConnectionPointType.STRING);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.JSON);
    }

    /**
     * Finds the mesh by name in the input scene and serializes its key geometric and
     * transform properties as a JSON object on the {@link output}.
     */
    public override async _buildBlockAsync(): Promise<void> {
        if (this.input.value == null) {
            throw new Error(`The "${this.name}" block has no input scene.`);
        }
        if (!IsBabylonAsset(this.input.value)) {
            throw new Error(`The "${this.name}" block did not receive a BabylonAsset.`);
        }
        const babylonAsset = this.input.value;

        const targetName = this.meshName.value as string;
        if (!targetName) {
            throw new Error(`The "${this.name}" block has no mesh name to look up.`);
        }

        const mesh = babylonAsset.scene.getMeshByName(targetName);
        if (!mesh) {
            throw new Error(`The "${this.name}" block could not find mesh "${targetName}" in the scene.`);
        }

        const position = mesh.position;
        const rotation = mesh.rotation;
        const scaling = mesh.scaling;

        this.output.value = {
            name: mesh.name,
            id: mesh.id,
            position: { x: position.x, y: position.y, z: position.z },
            rotation: { x: rotation.x, y: rotation.y, z: rotation.z },
            scaling: { x: scaling.x, y: scaling.y, z: scaling.z },
            isEnabled: mesh.isEnabled(),
            isVisible: mesh.isVisible,
            totalVertices: mesh.getTotalVertices(),
        };
    }
}

RegisterBlock(GetBabylonMeshBlock.ClassName, (name, nodeAsset) => new GetBabylonMeshBlock(name, nodeAsset));
