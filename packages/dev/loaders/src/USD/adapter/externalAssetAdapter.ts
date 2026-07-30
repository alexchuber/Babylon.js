import { AbstractMesh } from "core/Meshes/abstractMesh";
import { type TransformNode } from "core/Meshes/transformNode.pure";
import { type AssetContainer } from "core/assetContainer";
import { type Node } from "core/node";

import { type IResolvedPrim } from "../resolution/resolvedStage";
import { type USDLoadingOptions } from "../usdLoadingOptions";
import { type IUsdExternalAssetRequest } from "../usdExternalAssetHandler";
import { ValidateResourceLimit } from "../usdErrors";
import { type IUsdAdapterContext } from "./sceneGraphAdapter";

const DefaultMaxExternalAssetRequests = 64;
const DefaultMaxExternalAssetDepth = 32;

/**
 * Mutable state for the external asset handler within a single load operation.
 */
export interface IExternalAssetState {
    /**
     * Canonical URI → off-scene source container template. `null` means unsupported.
     * Every occurrence is cloned from the template via `instantiateModelsToScene` (default
     * clone mode). Templates are deterministically disposed before the adapter returns.
     */
    readonly sourceCache: Map<string, AssetContainer | null>;
    /** Number of handler invocations issued so far. */
    requestCount: number;
    /** Validated maximum handler invocations. */
    readonly maxRequests: number;
    /** Validated maximum external asset URI ancestry depth. */
    readonly maxDepth: number;
}

/**
 * Creates a fresh external asset state for one load operation, validating limits from options.
 * @param options loader options containing limit overrides
 * @returns initialized state
 */
export function CreateExternalAssetState(options: Readonly<USDLoadingOptions>): IExternalAssetState {
    return {
        sourceCache: new Map(),
        requestCount: 0,
        maxRequests:
            options.maxExternalAssetRequests !== undefined ? ValidateResourceLimit(options.maxExternalAssetRequests, "maxExternalAssetRequests") : DefaultMaxExternalAssetRequests,
        maxDepth: options.maxExternalAssetDepth !== undefined ? ValidateResourceLimit(options.maxExternalAssetDepth, "maxExternalAssetDepth") : DefaultMaxExternalAssetDepth,
    };
}

/**
 * Deterministically disposes every off-scene source container template while preserving
 * shared geometry that cloned meshes still reference.
 *
 * `instantiateModelsToScene` in clone mode produces `Mesh.clone` copies that share the
 * same `Geometry` object with the source mesh. `AssetContainer.dispose()` explicitly
 * disposes all tracked geometries, which would release the underlying vertex buffers.
 * Clearing `container.geometries` before disposal prevents this; the cloned meshes
 * retain their own geometry references and the outer `_LoadAssetContainerAsync` captures
 * them into the public AssetContainer for proper ownership and cleanup.
 *
 * Source textures are NOT cleared: `PBRMaterial.clone` (via `SerializationHelper.Clone`)
 * calls `Texture.clone()` for each serialized texture field, producing distinct Texture
 * objects on the cloned material. Disposing the source container correctly releases the
 * source-only textures and their internal refs; the cloned textures are independent.
 *
 * @param state the external asset state to clean up
 */
export function DisposeSourceContainers(state: IExternalAssetState): void {
    for (const [, container] of state.sourceCache) {
        if (container) {
            // Prevent dispose() from force-releasing shared vertex buffers.
            // Cloned meshes reference the same Geometry objects as the source; clearing
            // the container's array prevents dispose() from destroying them. The outer
            // container's collectNewEntities sweep captures them for proper ownership.
            container.geometries.length = 0;
            container.dispose();
        }
    }
    state.sourceCache.clear();
}

/**
 * Builds the bounded ancestry array for a resolved prim from its path segments.
 * @param prim the prim to compute ancestry for
 * @returns ordered ancestor paths (prim first, then parent, grandparent, etc.)
 */
export function BuildAncestry(prim: IResolvedPrim): readonly string[] {
    const ancestry: string[] = [prim.path];
    const segments = prim.path.split("/").filter(Boolean);
    for (let depth = segments.length - 1; depth > 0; depth--) {
        ancestry.push("/" + segments.slice(0, depth).join("/"));
    }
    return ancestry;
}

/**
 * Processes all unhandled asset properties on a single prim.
 *
 * URI ancestry cycle protection and depth limiting are driven by `ancestorUris`: the set
 * of canonical external-asset URIs from ancestor prims in the prim-tree recursion.
 *
 * @param prim the resolved prim with unhandled asset properties
 * @param node the Babylon transform node representing this prim
 * @param context the adapter context
 * @param state external asset handler state
 * @param layerIdentifier the source layer identifier
 * @param ancestorUris canonical URIs from ancestor prims' external asset properties
 * @returns a promise that resolves when all handler invocations are complete
 */
export async function ProcessExternalAssets(
    prim: IResolvedPrim,
    node: TransformNode,
    context: IUsdAdapterContext,
    state: IExternalAssetState,
    layerIdentifier: string,
    ancestorUris: ReadonlySet<string>
): Promise<void> {
    const handler = context.options.externalAssetHandler;
    const properties = prim.unhandledAssetProperties;
    if (!properties || properties.length === 0) {
        return;
    }

    const ancestry = BuildAncestry(prim);

    for (const property of properties) {
        if (!handler) {
            context.diagnostics.push({
                severity: "info",
                path: `${prim.path}.${property.propertyName}`,
                message: `Unhandled asset-valued property '${property.propertyName}' references '${property.authoredPath}'; no external asset handler is configured.`,
            });
            continue;
        }

        const canonicalUri = property.resolvedPath;

        // Ancestry-based cycle protection
        if (ancestorUris.has(canonicalUri)) {
            context.diagnostics.push({
                severity: "warning",
                path: `${prim.path}.${property.propertyName}`,
                message: `External asset cycle detected: '${property.authoredPath}' (resolved '${canonicalUri}') is already in the ancestor URI chain.`,
            });
            continue;
        }

        // URI ancestry depth limit
        if (ancestorUris.size >= state.maxDepth) {
            context.diagnostics.push({
                severity: "warning",
                path: `${prim.path}.${property.propertyName}`,
                message: `External asset depth limit reached: URI chain depth ${ancestorUris.size} has reached the ${state.maxDepth}-level limit.`,
            });
            continue;
        }

        // Request count limit
        if (state.requestCount >= state.maxRequests) {
            context.diagnostics.push({
                severity: "warning",
                path: `${prim.path}.${property.propertyName}`,
                message: `External asset handler request skipped: request count ${state.requestCount} has reached the ${state.maxRequests}-request limit.`,
            });
            continue;
        }

        // Canonical-URI deduplication
        if (state.sourceCache.has(canonicalUri)) {
            const cachedContainer = state.sourceCache.get(canonicalUri);
            if (cachedContainer) {
                CloneFromTemplate(cachedContainer, node, context);
            } else {
                context.diagnostics.push({
                    severity: "info",
                    path: `${prim.path}.${property.propertyName}`,
                    message: `External asset handler reported unsupported for property '${property.propertyName}' referencing '${property.authoredPath}'.`,
                });
            }
            continue;
        }

        const request: IUsdExternalAssetRequest = {
            primPath: prim.path,
            propertyName: property.propertyName,
            authoredUri: property.authoredPath,
            resolvedUri: property.resolvedPath,
            sourceLayerIdentifier: layerIdentifier,
            scene: context.scene,
            ancestry,
        };

        state.requestCount++;

        // eslint-disable-next-line no-await-in-loop
        const result = await handler(request);

        if (result.handled) {
            state.sourceCache.set(canonicalUri, result.container);
            CloneFromTemplate(result.container, node, context);
        } else {
            state.sourceCache.set(canonicalUri, null);
            context.diagnostics.push({
                severity: "info",
                path: `${prim.path}.${property.propertyName}`,
                message: `External asset handler reported unsupported for property '${property.propertyName}' referencing '${property.authoredPath}'.`,
            });
        }
    }
}

/**
 * Returns ancestor URIs extended with this prim's own external asset URIs.
 * @param prim the prim whose external asset URIs should be added
 * @param ancestorUris the current set of ancestor URIs
 * @returns a new set if this prim adds URIs, or the same set if it has none
 */
export function ExtendAncestorUris(prim: IResolvedPrim, ancestorUris: ReadonlySet<string>): ReadonlySet<string> {
    if (!prim.unhandledAssetProperties || prim.unhandledAssetProperties.length === 0) {
        return ancestorUris;
    }
    const extended = new Set(ancestorUris);
    for (const property of prim.unhandledAssetProperties) {
        extended.add(property.resolvedPath);
    }
    return extended;
}

/**
 * Clones a distinct model hierarchy from an off-scene source container template and parents
 * its root nodes under the given prim transform node.
 *
 * Uses `instantiateModelsToScene` in clone mode (the default `doNotInstantiate: true`)
 * with material cloning. Clones share geometry via ref counting so the source template
 * can be safely disposed after all cloning is complete.
 *
 * Tracks ALL instantiated nodes — root transforms, root meshes, descendant transforms,
 * descendant meshes, skeletons, and animation groups — in the adapter context.
 * @param template the handler-returned source container (kept off-scene)
 * @param parentNode the Babylon transform node to parent cloned roots under
 * @param context the adapter context for ownership tracking
 */
function CloneFromTemplate(template: AssetContainer, parentNode: TransformNode, context: IUsdAdapterContext): void {
    const entries = template.instantiateModelsToScene(undefined, true);

    for (const rootNode of entries.rootNodes) {
        rootNode.parent = parentNode;
        CollectNodeAndDescendants(rootNode, context);
    }
    for (const skeleton of entries.skeletons) {
        if (!context.skeletons.includes(skeleton)) {
            context.skeletons.push(skeleton);
        }
    }
    for (const animationGroup of entries.animationGroups) {
        if (!context.animationGroups.includes(animationGroup)) {
            context.animationGroups.push(animationGroup);
        }
    }
}

/**
 * Collects a node and all its descendants into the adapter context's mesh and transform
 * node arrays, ensuring every instantiated entity is tracked for outer container ownership.
 * @param node the node to collect
 * @param context the adapter context for ownership tracking
 */
function CollectNodeAndDescendants(node: Node, context: IUsdAdapterContext): void {
    if (node instanceof AbstractMesh) {
        if (!context.meshes.includes(node)) {
            context.meshes.push(node);
        }
    } else {
        const tn = node as TransformNode;
        if (!context.transformNodes.includes(tn)) {
            context.transformNodes.push(tn);
        }
    }
    for (const child of node.getChildren()) {
        CollectNodeAndDescendants(child, context);
    }
}
