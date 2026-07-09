import { type Nullable } from "core/types";

import { type NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { NodeAssetConnectionPointDirection } from "./nodeAssetConnectionPointDirection";
import { type NodeAssetConnectionPointType } from "./nodeAssetConnectionPointType";

/**
 * A single connection point on a {@link NodeAssetBlock}. Inputs consume a value; outputs
 * produce one. A connected input/output pair references each other symmetrically.
 */
export class NodeAssetConnectionPoint {
    /** The display name of the connection point. */
    public readonly name: string;

    /** The value type carried by this connection point. */
    public readonly type: NodeAssetConnectionPointType;

    /** Whether this is an input or an output point. */
    public readonly direction: NodeAssetConnectionPointDirection;

    /** The block that owns this connection point. */
    public readonly ownerBlock: NodeAssetBlock;

    /**
     * Whether this input may be left unconnected at build time. Optional inputs are skipped (rather
     * than raising a "not connected" error) when {@link NodeAsset.buildAsync} evaluates the graph, so
     * a block can fall back to a default. Always `false` for outputs.
     */
    public readonly isOptional: boolean;

    /** The connection point on the other side of the link, or null when unconnected. */
    public connectedPoint: Nullable<NodeAssetConnectionPoint> = null;

    /** The runtime payload, resolved during {@link NodeAsset.buildAsync}. */
    public value: unknown = null;

    /**
     * Creates a new connection point.
     * @param name - The display name of the connection point.
     * @param ownerBlock - The block that owns this connection point.
     * @param type - The value type carried by this connection point.
     * @param direction - Whether this is an input or an output point.
     * @param isOptional - Whether an input may be left unconnected at build time. Defaults to false.
     */
    public constructor(name: string, ownerBlock: NodeAssetBlock, type: NodeAssetConnectionPointType, direction: NodeAssetConnectionPointDirection, isOptional = false) {
        this.name = name;
        this.ownerBlock = ownerBlock;
        this.type = type;
        this.direction = direction;
        this.isOptional = isOptional;
    }

    /** Whether this connection point is linked to another. */
    public get isConnected(): boolean {
        return this.connectedPoint !== null;
    }

    /**
     * Connects this point to another. May be called on either side; the connection is always
     * normalized so the output feeds the input. Rejects same-direction pairs and incompatible types.
     * @param other - The connection point to connect to.
     */
    public connectTo(other: NodeAssetConnectionPoint): void {
        // Normalize so the connection logic always runs from the output side.
        if (this.direction === NodeAssetConnectionPointDirection.Input) {
            if (other.direction !== NodeAssetConnectionPointDirection.Output) {
                throw new Error(`Cannot connect input "${this.name}" to input "${other.name}"; an input must connect to an output.`);
            }
            other.connectTo(this);
            return;
        }

        if (other.direction !== NodeAssetConnectionPointDirection.Input) {
            throw new Error(`Cannot connect output "${this.name}" to output "${other.name}"; an output must connect to an input.`);
        }

        if (this.type !== other.type) {
            throw new Error(`Cannot connect "${this.name}" to "${other.name}"; incompatible connection point types.`);
        }

        this.connectedPoint = other;
        other.connectedPoint = this;
    }

    /**
     * Breaks the link between this connection point and its connected point, if any. Clears both
     * sides symmetrically. Safe to call on an unconnected point.
     */
    public disconnect(): void {
        const other = this.connectedPoint;
        if (!other) {
            return;
        }
        this.connectedPoint = null;
        other.connectedPoint = null;
    }
}
