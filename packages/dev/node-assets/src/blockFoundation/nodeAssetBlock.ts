import { NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointDirection } from "../connection/nodeAssetConnectionPointDirection";
import { type NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";
import { UniqueIdGenerator } from "../utils/uniqueIdGenerator";

/**
 * Base class for all node-asset blocks. A block owns a set of input and output connection
 * points and, during build, reads its resolved inputs and writes its outputs.
 */
export abstract class NodeAssetBlock {
    /** The class name. Used for identification and safe under minification. */
    public static ClassName = "NodeAssetBlock";

    /** The display name of the block. */
    public readonly name: string;

    /** A session-unique id for this block. Preserved across {@link serialize}/parse. */
    public uniqueId: number;

    private readonly _inputs: NodeAssetConnectionPoint[] = [];
    private readonly _outputs: NodeAssetConnectionPoint[] = [];

    /**
     * Creates a new block and registers it with its owning node asset.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        this.name = name;
        this.uniqueId = UniqueIdGenerator.UniqueId;
        nodeAsset._registerBlock(this);
    }

    /** This block's input connection points. */
    public get inputs(): ReadonlyArray<NodeAssetConnectionPoint> {
        return this._inputs;
    }

    /** This block's output connection points. */
    public get outputs(): ReadonlyArray<NodeAssetConnectionPoint> {
        return this._outputs;
    }

    /**
     * Gets the class name of the block.
     * @returns The class name.
     */
    public getClassName(): string {
        return (this.constructor as typeof NodeAssetBlock).ClassName;
    }

    /**
     * Registers a new input connection point on this block.
     * @param name - The display name of the input.
     * @param type - The value type carried by the input.
     * @param isOptional - Whether the input may be left unconnected at build time. Defaults to false.
     * @returns The created connection point.
     */
    protected _registerInput(name: string, type: NodeAssetConnectionPointType, isOptional = false): NodeAssetConnectionPoint {
        const point = new NodeAssetConnectionPoint(name, this, type, NodeAssetConnectionPointDirection.Input, isOptional);
        this._inputs.push(point);
        return point;
    }

    /**
     * Registers a new output connection point on this block.
     * @param name - The display name of the output.
     * @param type - The value type carried by the output.
     * @returns The created connection point.
     */
    protected _registerOutput(name: string, type: NodeAssetConnectionPointType): NodeAssetConnectionPoint {
        const point = new NodeAssetConnectionPoint(name, this, type, NodeAssetConnectionPointDirection.Output);
        this._outputs.push(point);
        return point;
    }

    /**
     * Runtime hook invoked by {@link NodeAsset.buildAsync}. This block's inputs' values are
     * already resolved; read them and set this block's outputs' values.
     */
    public abstract _buildBlockAsync(): Promise<void>;

    /**
     * Serializes this block to a plain object. Subclasses override to add their own state,
     * calling `super.serialize()` first.
     * @returns The serialization object.
     */
    public serialize(): NodeAssetBlockSerialization {
        return {
            customType: this.getClassName(),
            id: this.uniqueId,
            name: this.name,
        };
    }

    /**
     * Restores block-specific state from a serialization object produced by {@link serialize}.
     * The base implementation does nothing; subclasses override to read their own state. Identity
     * (id/name) and connections are restored by {@link NodeAsset.Parse}.
     * @param _serializationObject - The serialization object.
     */
    public _deserialize(_serializationObject: NodeAssetBlockSerialization): void {}
}
