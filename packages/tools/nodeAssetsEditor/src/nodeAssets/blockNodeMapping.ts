/**
 * The pure mapping between a NodeAssets block and its visual node/ports. Owns the id scheme and the
 * per-kind port styling, so the graph controller (which constructs nodes) and the reconciler (which
 * keeps a node's ports in step with its block) share one source of truth instead of duplicating it.
 *
 * All NodeAssets/gltf-transform types are confined to this app layer; the framework never imports it.
 */

import { NodeAssetConnectionPointDirection } from "node-assets/connection/nodeAssetConnectionPointDirection";
import { NodeAssetConnectionPointType } from "node-assets/connection/nodeAssetConnectionPointType";
import { type NodeAssetBlock } from "node-assets/blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "node-assets/connection/nodeAssetConnectionPoint";

import { type IGraphNode, type IGraphPort, type Vec2 } from "../nodeGraph/graphModel";
import { BabylonScenePortColor, ImagePortColor, JsonPortColor, NodeGeometryPortColor, NumberPortColor, ScenePortColor, StringPortColor, UsdStagePortColor, type IBlockDescriptor } from "./blockCatalog";

/**
 * The visual node id for a block, stable across reconciles for a given block instance.
 * @param block - The block to identify.
 * @returns The node id.
 */
export function NodeIdForBlock(block: NodeAssetBlock): string {
    return `node-${block.uniqueId}`;
}

/**
 * The visual port id for a connection point, encoding its owner block, direction, and name.
 * @param block - The block owning the connection point.
 * @param point - The connection point to identify.
 * @returns The port id.
 */
export function PortIdForPoint(block: NodeAssetBlock, point: NodeAssetConnectionPoint): string {
    const direction = point.direction === NodeAssetConnectionPointDirection.Output ? "out" : "in";
    return `port-${block.uniqueId}-${direction}-${point.name}`;
}

/** Per-kind port label and dot color, so each connection-point type renders distinctly. */
const PortStyleByType: Record<NodeAssetConnectionPointType, { readonly name: string; readonly color: string }> = {
    [NodeAssetConnectionPointType.GLTF_DOCUMENT]: { name: "glTF Document", color: ScenePortColor },
    [NodeAssetConnectionPointType.NUMBER]: { name: "Number", color: NumberPortColor },
    [NodeAssetConnectionPointType.STRING]: { name: "String", color: StringPortColor },
    [NodeAssetConnectionPointType.JSON]: { name: "Json", color: JsonPortColor },
    [NodeAssetConnectionPointType.IMAGE]: { name: "Image", color: ImagePortColor },
    [NodeAssetConnectionPointType.USD_STAGE]: { name: "USD Stage", color: UsdStagePortColor },
    [NodeAssetConnectionPointType.BABYLON_SCENE]: { name: "Babylon Scene", color: BabylonScenePortColor },
    [NodeAssetConnectionPointType.NODE_GEOMETRY]: { name: "Node Geometry", color: NodeGeometryPortColor },
};

/**
 * Maps a connection point to its visual port.
 * @param block - The block owning the connection point.
 * @param point - The connection point to map.
 * @returns The visual port.
 */
export function PointToPort(block: NodeAssetBlock, point: NodeAssetConnectionPoint): IGraphPort {
    const style = PortStyleByType[point.type];
    return {
        id: PortIdForPoint(block, point),
        // The port name is purely cosmetic (wires are mapped by id), so show the type.
        name: style.name,
        direction: point.direction === NodeAssetConnectionPointDirection.Output ? "output" : "input",
        color: style.color,
    };
}

/**
 * Maps a block to its visual node, emitting input ports before output ports.
 * @param block - The block to map.
 * @param descriptor - The block's descriptor, for its header color.
 * @param position - The node's position in graph space.
 * @param title - The node's header title.
 * @param collapsed - Whether the node starts collapsed.
 * @returns The visual node.
 */
export function BlockToNode(block: NodeAssetBlock, descriptor: IBlockDescriptor, position: Vec2, title: string, collapsed: boolean): IGraphNode {
    const ports: IGraphPort[] = [];
    for (const input of block.inputs) {
        ports.push(PointToPort(block, input));
    }
    for (const output of block.outputs) {
        ports.push(PointToPort(block, output));
    }
    return { id: NodeIdForBlock(block), title, headerColor: descriptor.headerColor, position, collapsed, ports };
}
