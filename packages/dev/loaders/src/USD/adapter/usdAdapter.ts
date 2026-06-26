import { type ISceneLoaderAsyncResult } from "core/Loading/sceneLoader";
import { type Scene } from "core/scene";
import { type Nullable } from "core/types";
import { type AssetContainer } from "core/assetContainer";
import { type AbstractMesh } from "core/Meshes/abstractMesh";
import { type TransformNode } from "core/Meshes/transformNode.pure";

import { type IResolvedStage } from "../resolution/resolvedStage";
import { type USDLoadingOptions } from "../usdLoadingOptions";
import { CreateStageRoot } from "./transformAdapter";
import { AdaptPrim, type IUsdAdapterContext } from "./sceneGraphAdapter";

/**
 * Adapts a fully-resolved {@link IResolvedStage} into Babylon objects, returning them as an
 * {@link ISceneLoaderAsyncResult}. The whole prim tree is parented under a single conversion root so
 * up-axis and unit handling happen once.
 *
 * Babylon performs no USD reasoning here — every value consumed has already been resolved.
 *
 * @param stage the resolved stage to adapt
 * @param scene the scene to create objects in
 * @param _assetContainer the asset container being populated, if any (objects are collected by the caller)
 * @param options loader options
 * @returns the loaded Babylon objects
 */
export function AdaptResolvedStageToScene(
    stage: IResolvedStage,
    scene: Scene,
    _assetContainer: Nullable<AssetContainer>,
    options: Readonly<USDLoadingOptions>
): ISceneLoaderAsyncResult {
    const meshes: AbstractMesh[] = [];
    const transformNodes: TransformNode[] = [];

    const root = CreateStageRoot(stage.metadata, scene);
    transformNodes.push(root);

    const context: IUsdAdapterContext = { scene, stage, options, meshes, transformNodes };
    for (const child of stage.root.children) {
        AdaptPrim(child, root, context);
    }

    return {
        meshes,
        particleSystems: [],
        skeletons: [],
        animationGroups: [],
        transformNodes,
        geometries: [],
        lights: [],
        spriteManagers: [],
    };
}
