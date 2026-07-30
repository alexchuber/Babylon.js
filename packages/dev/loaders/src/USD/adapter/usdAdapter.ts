import { type ISceneLoaderAsyncResult } from "core/Loading/sceneLoader";
import { type Scene } from "core/scene";
import { type Nullable } from "core/types";
import { type AssetContainer } from "core/assetContainer";
import { type AbstractMesh } from "core/Meshes/abstractMesh";
import { type TransformNode } from "core/Meshes/transformNode.pure";
import { type Camera } from "core/Cameras/camera";
import { type Skeleton } from "core/Bones/skeleton";
import { type Animation } from "core/Animations/animation";
import { type AnimationGroup } from "core/Animations/animationGroup";
import { type Material } from "core/Materials/material";
import { Logger } from "core/Misc/logger";

import { type IResolvedStage, type IResolvedDiagnostic } from "../resolution/resolvedStage";
import { type USDLoadingOptions } from "../usdLoadingOptions";
import { CreateStageRoot } from "./transformAdapter";
import { AdaptPrim, type IUsdAdapterContext } from "./sceneGraphAdapter";
import { BuildAnimationGroup } from "./animationAdapter";
import { CreateExternalAssetState, ProcessExternalAssets, ExtendAncestorUris, type IExternalAssetState } from "./externalAssetAdapter";

/**
 * Adapts a fully-resolved {@link IResolvedStage} into Babylon objects, returning them as an
 * {@link ISceneLoaderAsyncResult}. The whole prim tree is parented under a single conversion root so
 * up-axis and unit handling happen once.
 *
 * Babylon performs no USD reasoning here — every value consumed has already been resolved.
 *
 * When an {@link USDLoadingOptions.externalAssetHandler | externalAssetHandler} is configured,
 * unhandled asset-valued properties are dispatched to it asynchronously; their loaded content is
 * instantiated under the authored prim transform.
 *
 * @param stage the resolved stage to adapt
 * @param scene the scene to create objects in
 * @param assetContainer the asset container being populated, if any (cameras are pushed onto it directly)
 * @param options loader options
 * @returns the loaded Babylon objects
 */
export async function AdaptResolvedStageToScene(
    stage: IResolvedStage,
    scene: Scene,
    assetContainer: Nullable<AssetContainer>,
    options: Readonly<USDLoadingOptions>
): Promise<ISceneLoaderAsyncResult> {
    const existingGeometries = new Set(scene.geometries);
    const meshes: AbstractMesh[] = [];
    const transformNodes: TransformNode[] = [];
    const cameras: Camera[] = [];
    const skeletons: Skeleton[] = [];
    const animationGroups: AnimationGroup[] = [];
    const animationEntries: { node: TransformNode; animations: Animation[] }[] = [];

    const root = CreateStageRoot(stage.metadata, scene);
    transformNodes.push(root);

    const adapterDiagnostics: import("../resolution/resolvedStage").IResolvedDiagnostic[] = [];
    const nodeByPrimPath = new Map<string, TransformNode>();
    const context: IUsdAdapterContext = {
        scene,
        stageRoot: root,
        stage,
        options,
        fps: ResolveFps(stage, options),
        meshes,
        transformNodes,
        cameras,
        skeletons,
        animationGroups,
        animationEntries,
        materialCache: new Map<number, Material>(),
        skeletonCache: new Map<number, Skeleton>(),
        diagnostics: adapterDiagnostics,
        nodeByPrimPath,
    };

    for (const child of stage.root.children) {
        AdaptPrim(child, root, context);
    }

    // Process external asset properties if a handler is configured or if any exist (for diagnostics)
    const externalAssetState = CreateExternalAssetState(options);
    const emptyAncestorUris: ReadonlySet<string> = new Set();
    await ProcessExternalAssetsForTree(stage.root, context, externalAssetState, stage, emptyAncestorUris);
    // Source container templates are NOT disposed here: instantiateModelsToScene clones share
    // the source geometry, so disposing the template would invalidate cloned mesh geometry.
    // The scene will dispose everything on scene.dispose().

    // Log adapter diagnostics (not stored on the frozen stage, logged directly)
    LogDiagnostics(adapterDiagnostics);

    if (animationEntries.length > 0) {
        animationGroups.push(BuildAnimationGroup("usd-animations", scene, animationEntries));
    }

    // ISceneLoaderAsyncResult has no `cameras` field; cameras auto-register on the scene. When an asset
    // container is being populated, also record them there so the container owns them like other objects.
    if (assetContainer) {
        for (const camera of cameras) {
            assetContainer.cameras.push(camera);
        }
    } else if (!scene.activeCamera && cameras.length > 0) {
        scene.activeCamera = cameras[0];
    }

    return {
        meshes,
        particleSystems: [],
        skeletons,
        animationGroups,
        transformNodes,
        geometries: scene.geometries.filter((geometry) => !existingGeometries.has(geometry)),
        lights: [],
        spriteManagers: [],
    };
}

// Recursively processes external asset properties through the resolved prim tree, threading
// ancestor external-asset URIs downward for cycle detection and depth limiting.
async function ProcessExternalAssetsForTree(
    resolvedPrim: import("../resolution/resolvedStage").IResolvedPrim,
    context: IUsdAdapterContext,
    state: IExternalAssetState,
    stage: IResolvedStage,
    ancestorUris: ReadonlySet<string>
): Promise<void> {
    if (resolvedPrim.unhandledAssetProperties && resolvedPrim.unhandledAssetProperties.length > 0) {
        const node = context.nodeByPrimPath.get(resolvedPrim.path);
        if (node) {
            await ProcessExternalAssets(resolvedPrim, node, context, state, stage.layerIdentifier, ancestorUris);
        }
    }

    // Extend ancestor URIs with this prim's own external asset URIs before recursing into children
    const childAncestorUris = ExtendAncestorUris(resolvedPrim, ancestorUris);

    for (const child of resolvedPrim.children) {
        // eslint-disable-next-line no-await-in-loop
        await ProcessExternalAssetsForTree(child, context, state, stage, childAncestorUris);
    }
}

// Resolves the bake fps: an explicit loader override wins, otherwise the stage's time-codes-per-second.
function ResolveFps(stage: IResolvedStage, options: Readonly<USDLoadingOptions>): number {
    if (options.targetFps !== undefined && Number.isFinite(options.targetFps) && options.targetFps > 0) {
        return options.targetFps;
    }
    const timeCodesPerSecond = stage.metadata.timeCodesPerSecond;
    return Number.isFinite(timeCodesPerSecond) && timeCodesPerSecond > 0 ? timeCodesPerSecond : 24;
}

function LogDiagnostics(diagnostics: readonly IResolvedDiagnostic[]): void {
    for (const diagnostic of diagnostics) {
        const message = `USD: ${diagnostic.message}${diagnostic.path ? ` (${diagnostic.path})` : ""}`;
        if (diagnostic.severity === "error") {
            Logger.Error(message);
        } else if (diagnostic.severity === "warning") {
            Logger.Warn(message);
        } else {
            Logger.Log(message);
        }
    }
}
