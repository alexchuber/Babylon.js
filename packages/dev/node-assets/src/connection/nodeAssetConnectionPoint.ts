import { type Nullable } from "core/types";

import { type NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { NodeAssetConnectionPointDirection } from "./nodeAssetConnectionPointDirection";
import { type NodeAssetConnectionPointType } from "./nodeAssetConnectionPointType";

/**
 * A single connection point on a {@link NodeAssetBlock}. Inputs consume a value; outputs
 * produce one. An input references its single source output; an output references every input
 * it feeds, so a single output can fan out to multiple inputs.
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
     * For an input, the single output feeding it (or null when unconnected). Outputs track the
     * inputs they feed via {@link connectedPoints} instead and leave this null.
     */
    public connectedPoint: Nullable<NodeAssetConnectionPoint> = null;

    /**
     * Whether this input may be left unconnected at build time. Optional inputs are skipped (rather
     * than raising a "not connected" error) when {@link NodeAsset.buildAsync} evaluates the graph, so
     * a block can fall back to a default. Always `false` for outputs.
     */
    public readonly isOptional: boolean;

    private readonly _connectedPoints: NodeAssetConnectionPoint[] = [];

    /**
     * The runtime payload. {@link NodeAsset.buildAsync} clears values it uses after build-owned
     * resources are disposed; direct block callers retain values they assign.
     */
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

    /** For an output, the inputs it feeds (fan-out); empty for an input, which uses {@link connectedPoint}. */
    public get connectedPoints(): ReadonlyArray<NodeAssetConnectionPoint> {
        return this._connectedPoints;
    }

    /** Whether this connection point is linked to another. */
    public get isConnected(): boolean {
        return this.direction === NodeAssetConnectionPointDirection.Input ? this.connectedPoint !== null : this._connectedPoints.length > 0;
    }

    /**
     * Connects this point to another. May be called on either side; the connection is always
     * normalized so the output feeds the input. An output may feed several inputs (fan-out); an
     * input keeps a single source, so reconnecting one replaces its previous source. Rejects
     * same-direction pairs and incompatible types.
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

        // Already the input's source: nothing to do (and avoid a duplicate fan-out edge).
        if (other.connectedPoint === this) {
            return;
        }
        // An input has a single source; drop its previous one before rewiring.
        if (other.connectedPoint) {
            other.connectedPoint._removeConnectedPoint(other);
        }
        this._connectedPoints.push(other);
        other.connectedPoint = this;
    }

    /**
     * Breaks this connection point's links. An input clears its single source and removes itself
     * from that output's fan-out list; an output clears every input it feeds. Both sides are always
     * left consistent. Safe to call on an unconnected point.
     */
    public disconnect(): void {
        if (this.direction === NodeAssetConnectionPointDirection.Input) {
            const source = this.connectedPoint;
            if (!source) {
                return;
            }
            this.connectedPoint = null;
            source._removeConnectedPoint(this);
            return;
        }

        // Output: clear every input it feeds, then forget them all.
        for (const input of this._connectedPoints) {
            input.connectedPoint = null;
        }
        this._connectedPoints.length = 0;
    }

    private _removeConnectedPoint(input: NodeAssetConnectionPoint): void {
        const index = this._connectedPoints.indexOf(input);
        if (index !== -1) {
            this._connectedPoints.splice(index, 1);
        }
    }
}
