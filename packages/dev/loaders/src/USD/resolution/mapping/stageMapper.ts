import { type IResolvedDiagnostic, type IResolvedMaterial, type IResolvedMesh, type IResolvedPrim, type IResolvedStage, type IStageMetadata } from "../resolvedStage";
import { type ISdfLayer, type ISdfPrimSpec } from "../sdf";
import { ResolvePrimAnimation } from "./animationMapping";
import { ResolveMaterialBinding, GetDisplayColorFallback } from "./materialMapping";
import { type IStageMappingContext } from "./mappingContext";
import { BuildMeshPoolKey, ResolveMesh } from "./meshMapping";
import { IdentityTransform, ResolveTransform } from "./transformMapping";
import { AsToken, GetAttribute, GetAttributeValue } from "./valueAccess";

/**
 * Maps one already-composed flattened Sdf layer into the read-only resolved stage contract.
 * @param layer flattened Sdf layer to map
 * @returns resolved stage consumed by the Babylon USD adapter
 */
export function MapLayerToResolvedStage(layer: ISdfLayer): IResolvedStage {
    const diagnostics: IResolvedDiagnostic[] = [];
    const meshes: IResolvedMesh[] = [];
    const materials: IResolvedMaterial[] = [];
    const context: IStageMappingContext = {
        layer,
        primByPath: BuildPrimIndex(layer.rootPrims),
        meshes,
        materials,
        meshIndexByKey: new Map(),
        materialIndexByPath: new Map(),
        diagnostics,
    };
    const metadata = ResolveStageMetadata(layer);
    const root: IResolvedPrim = {
        path: "/",
        name: "",
        kind: "transform",
        transform: IdentityTransform(),
        visible: true,
        children: layer.rootPrims.map((prim) => MapPrim(prim, true, metadata, context)),
    };

    return {
        metadata,
        root,
        meshes,
        materials,
        skeletons: [],
        diagnostics,
    };
}

function ResolveStageMetadata(layer: ISdfLayer): IStageMetadata {
    return {
        upAxis: layer.upAxis === "Z" ? "Z" : "Y",
        metersPerUnit: layer.metersPerUnit ?? 0.01,
        timeCodesPerSecond: layer.timeCodesPerSecond ?? 24,
        startTimeCode: layer.startTimeCode ?? 0,
        endTimeCode: layer.endTimeCode ?? 0,
        defaultPrimPath: layer.defaultPrim ? (layer.defaultPrim.startsWith("/") ? layer.defaultPrim : `/${layer.defaultPrim}`) : undefined,
    };
}

function MapPrim(primSpec: ISdfPrimSpec, parentVisible: boolean, metadata: IStageMetadata, context: IStageMappingContext): IResolvedPrim {
    const visible = parentVisible && ResolveVisibility(primSpec);
    const prim: IResolvedPrim = {
        path: primSpec.path,
        name: primSpec.name,
        kind: "transform",
        transform: ResolveTransform(primSpec, context.diagnostics),
        visible,
        children: [],
    };

    ApplySchemaPayload(prim, primSpec, context);
    const animation = ResolvePrimAnimation(primSpec, context.layer, metadata, context.diagnostics);
    if (animation) {
        prim.animation = animation;
    }
    prim.children = primSpec.children.map((child) => MapPrim(child, visible, metadata, context));
    return prim;
}

function ApplySchemaPayload(prim: IResolvedPrim, primSpec: ISdfPrimSpec, context: IStageMappingContext): void {
    if (IsDeferredSchema(primSpec.typeName)) {
        context.diagnostics.push({ severity: "info", path: primSpec.path, message: `Schema ${primSpec.typeName} mapping deferred.` });
        return;
    }

    if (primSpec.typeName !== "Mesh") {
        if (primSpec.instanceable) {
            context.diagnostics.push({ severity: "info", path: primSpec.path, message: "Instanceable non-Mesh prim mapping is deferred." });
        }
        return;
    }

    const mesh = ResolveMesh(primSpec, context);
    if (!mesh) {
        return;
    }
    const meshIndex = PoolMesh(mesh, context);
    prim.materialBinding = ResolveMaterialBinding(primSpec, context, GetDisplayColorFallback(primSpec));
    if (primSpec.instanceable) {
        prim.kind = "instance";
        prim.instanceSourceMeshIndex = meshIndex;
    } else {
        prim.kind = "mesh";
        prim.meshIndex = meshIndex;
    }
}

function PoolMesh(mesh: NonNullable<ReturnType<typeof ResolveMesh>>, context: IStageMappingContext): number {
    const key = BuildMeshPoolKey(mesh);
    const existing = context.meshIndexByKey.get(key);
    if (existing !== undefined) {
        return existing;
    }
    const index = context.meshes.length;
    context.meshes.push(mesh);
    context.meshIndexByKey.set(key, index);
    return index;
}

function ResolveVisibility(primSpec: ISdfPrimSpec): boolean {
    return AsToken(GetAttributeValue(GetAttribute(primSpec, "visibility"))) !== "invisible";
}

function BuildPrimIndex(rootPrims: ISdfPrimSpec[]): ReadonlyMap<string, ISdfPrimSpec> {
    const primByPath = new Map<string, ISdfPrimSpec>();
    const visit = (prim: ISdfPrimSpec) => {
        primByPath.set(prim.path, prim);
        prim.children.forEach(visit);
    };
    rootPrims.forEach(visit);
    return primByPath;
}

function IsDeferredSchema(typeName: string | undefined): boolean {
    return (
        typeName === "Camera" ||
        typeName === "PointInstancer" ||
        typeName === "Skeleton" ||
        typeName === "SkelRoot" ||
        typeName?.endsWith("Light") === true ||
        typeName?.startsWith("UsdLux") === true
    );
}
