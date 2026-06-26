import { type Scene } from "core/scene";
import { type AbstractMesh } from "core/Meshes/abstractMesh";
import { TransformNode } from "core/Meshes/transformNode.pure";
import { type IResolvedStage, type IResolvedPrim } from "../resolution/resolvedStage";
import { type USDLoadingOptions } from "../usdLoadingOptions";
import { ApplyResolvedTransform } from "./transformAdapter";
import { CreateMeshFromResolved } from "./geometryAdapter";

/**
 * Mutable context threaded through the recursive prim-tree walk, collecting the Babylon objects the
 * adapter creates. Phase 1 workstreams extend this with lights, skeletons, animation groups, etc.
 */
export interface IUsdAdapterContext {
    /** The scene objects are created in. */
    scene: Scene;
    /** The resolved stage being adapted (provides the shared mesh/material/skeleton pools). */
    stage: IResolvedStage;
    /** Loader options. */
    options: Readonly<USDLoadingOptions>;
    /** Collected meshes. */
    meshes: AbstractMesh[];
    /** Collected transform nodes. */
    transformNodes: TransformNode[];
}

/**
 * Recursively adapts a resolved prim (and its descendants) into Babylon nodes parented under `parent`.
 * @param prim the resolved prim to adapt
 * @param parent the Babylon node to parent the created node under
 * @param context the adapter context collecting created objects
 */
export function AdaptPrim(prim: IResolvedPrim, parent: TransformNode, context: IUsdAdapterContext): void {
    let node: TransformNode;

    if (prim.kind === "mesh" && prim.meshIndex !== undefined) {
        const mesh = CreateMeshFromResolved(prim.name, context.stage.meshes[prim.meshIndex], context.scene);
        context.meshes.push(mesh);
        node = mesh;
    } else {
        // transform / instance / pointInstancer / light / camera are represented as plain transform
        // nodes in Phase 0; workstreams D/F replace instance/point-instancer/light/camera handling.
        node = new TransformNode(prim.name, context.scene);
        context.transformNodes.push(node);
    }

    ApplyResolvedTransform(node, prim.transform);
    node.parent = parent;
    if (!prim.visible) {
        node.setEnabled(false);
    }

    for (const child of prim.children) {
        AdaptPrim(child, node, context);
    }
}
