import { type IResolvedMaterial, type IResolvedMaterialBinding, type IResolvedTexture, type ResolvedTextureSlot, type Vec3, type Vec4 } from "../resolvedStage";
import { type ISdfAttributeSpec, type ISdfPrimSpec } from "../sdf/index";
import { ResolveAssetIdentifier } from "../assetPath";
import { type IStageMappingContext } from "./mappingContext";
import {
    AsAssetPath,
    AsBoolean,
    AsNumber,
    AsToken,
    AsVec2,
    AsVec3,
    AsVec4,
    GetAttribute,
    GetAttributeValue,
    GetConnectionTargets,
    GetRelationship,
    GetRelationshipTargets,
    SplitPropertyPath,
} from "./valueAccess";

interface IPreviewInputMapping {
    readonly inputName: string;
    readonly scalarSlot?: keyof Omit<IResolvedMaterial, "name" | "textures">;
    readonly textureSlot?: ResolvedTextureSlot;
    readonly defaultChannel?: IResolvedTexture["channel"];
}

const PreviewInputMappings: IPreviewInputMapping[] = [
    { inputName: "diffuseColor", scalarSlot: "baseColor", textureSlot: "baseColor" },
    { inputName: "metallic", scalarSlot: "metallic", textureSlot: "metallic", defaultChannel: "b" },
    { inputName: "roughness", scalarSlot: "roughness", textureSlot: "roughness", defaultChannel: "r" },
    { inputName: "opacity", scalarSlot: "opacity", textureSlot: "opacity", defaultChannel: "a" },
    { inputName: "emissiveColor", scalarSlot: "emissiveColor", textureSlot: "emissive" },
    { inputName: "ior", scalarSlot: "ior" },
    { inputName: "occlusion", scalarSlot: "occlusion", textureSlot: "occlusion", defaultChannel: "r" },
    { inputName: "clearcoat", scalarSlot: "clearcoat", textureSlot: "clearcoat", defaultChannel: "r" },
    { inputName: "clearcoatRoughness", scalarSlot: "clearcoatRoughness", textureSlot: "clearcoatRoughness", defaultChannel: "g" },
    { inputName: "normal", textureSlot: "normal" },
    { inputName: "specularColor", scalarSlot: "specularColor" },
];

/**
 * Resolves a mesh or subset material binding and pools the target material.
 * @param prim prim that may author a material:binding relationship
 * @param context mapping context with material pool and prim lookup
 * @param fallbackBaseColor fallback color used when the bound material has no PreviewSurface
 * @returns resolved material binding, if one was authored
 */
export function ResolveMaterialBinding(prim: ISdfPrimSpec, context: IStageMappingContext, fallbackBaseColor?: Vec3): IResolvedMaterialBinding | undefined {
    const materialPath = GetMaterialBindingPath(prim);
    if (!materialPath) {
        return undefined;
    }
    return { materialIndex: ResolveMaterialIndex(materialPath, context, fallbackBaseColor) };
}

/**
 * Returns the direct `material:binding` target authored on a prim, if any.
 *
 * In USD a direct material binding applies to the prim and is inherited by every descendant in
 * namespace, so callers can walk this up an ancestor chain to bind meshes whose binding is authored
 * on a parent (a common pattern for exporters that reference geometry under a bound Xform).
 * @param prim prim that may author a `material:binding` relationship
 * @returns absolute material path, or undefined when none is authored
 */
export function GetMaterialBindingPath(prim: ISdfPrimSpec): string | undefined {
    return GetRelationshipTargets(GetRelationship(prim, "material:binding"))[0];
}

/**
 * Resolves and pools a Material prim by path.
 *
 * Materials that resolve to a real, supported PreviewSurface network are pooled by path alone,
 * since their appearance is fully determined by the authored network regardless of which mesh
 * bound them. Materials that fall back to a default (missing prim, or no supported network) are
 * pooled by path *and* fallbackBaseColor: the fallback color is part of the resulting material's
 * appearance, so two meshes bound to the same unsupported material but authoring different
 * displayColor fallbacks must not silently share one (incorrectly colored, for one of them)
 * material instance.
 * @param materialPath absolute path to the Material prim
 * @param context mapping context with material pool and prim lookup
 * @param fallbackBaseColor fallback color used when the material network is unsupported
 * @returns material pool index
 */
export function ResolveMaterialIndex(materialPath: string, context: IStageMappingContext, fallbackBaseColor?: Vec3): number {
    const prim = context.primByPath.get(materialPath);
    const surfaceShader = prim ? GetCachedSurfaceShader(materialPath, prim, context) : undefined;
    const usesFallback = !prim || !surfaceShader;
    const cacheKey = usesFallback ? `${materialPath}\u0000${FallbackColorCacheKey(fallbackBaseColor)}` : materialPath;

    const existing = context.materialIndexByPath.get(cacheKey);
    if (existing !== undefined) {
        return existing;
    }

    const material = prim ? BuildMaterialFromPrim(prim, surfaceShader, context, fallbackBaseColor) : BuildDefaultMaterial(materialPath, fallbackBaseColor ?? [1, 1, 1]);
    const index = context.materials.length;
    context.materials.push(material);
    context.materialIndexByPath.set(cacheKey, index);
    if (!prim) {
        context.diagnostics.push({ severity: "warning", path: materialPath, message: "Material binding target was not found; using a default material." });
    }
    return index;
}

// Resolves and caches the UsdPreviewSurface shader for a Material prim, once per materialPath.
// Reused for both the fallback/pooling decision and the actual material build so
// ResolvePreviewSurfaceShader (which reports diagnostics as a side effect for unresolvable shader
// connections) never runs more than once for the same material, regardless of how many meshes or
// distinct fallback colors bind to it.
function GetCachedSurfaceShader(materialPath: string, materialPrim: ISdfPrimSpec, context: IStageMappingContext): ISdfPrimSpec | undefined {
    const cached = context.materialSurfaceShaderByPath.get(materialPath);
    if (cached !== undefined) {
        return cached ?? undefined;
    }
    const surfaceShader = ResolvePreviewSurfaceShader(materialPrim, context);
    context.materialSurfaceShaderByPath.set(materialPath, surfaceShader ?? null);
    return surfaceShader;
}

function FallbackColorCacheKey(fallbackBaseColor: Vec3 | undefined): string {
    return fallbackBaseColor ? fallbackBaseColor.join(",") : "default";
}

/**
 * Returns the first displayColor value as a material fallback.
 * @param prim prim whose displayColor primvar should be inspected
 * @returns first authored display color, if present
 */
export function GetDisplayColorFallback(prim: ISdfPrimSpec): Vec3 | undefined {
    const colorValue = GetAttributeValue(GetAttribute(prim, "primvars:displayColor"));
    const color = AsVec3(colorValue);
    if (color) {
        return color;
    }
    const arrayValue = colorValue?.value;
    if (Array.isArray(arrayValue) && Array.isArray(arrayValue[0]) && arrayValue[0].length >= 3) {
        return [Number(arrayValue[0][0]), Number(arrayValue[0][1]), Number(arrayValue[0][2])];
    }
    return undefined;
}

function BuildMaterialFromPrim(materialPrim: ISdfPrimSpec, surfaceShader: ISdfPrimSpec | undefined, context: IStageMappingContext, fallbackBaseColor?: Vec3): IResolvedMaterial {
    if (!surfaceShader) {
        context.diagnostics.push({ severity: "info", path: materialPrim.path, message: "UsdPreviewSurface network was not found; using a default material." });
        DiagnoseAssetPathIssues(materialPrim, context);
        return BuildDefaultMaterial(materialPrim.name, fallbackBaseColor ?? [1, 1, 1]);
    }

    // A bound UsdPreviewSurface seeds from the schema's own input defaults (e.g. unauthored
    // diffuseColor is 0.18 gray), not the mesh displayColor hint, so unauthored inputs match a
    // reference UsdPreviewSurface renderer rather than the geometry's fallback color.
    const material = BuildPreviewSurfaceMaterial(materialPrim.name);
    for (const mapping of PreviewInputMappings) {
        ApplyPreviewInput(material, surfaceShader, mapping, context);
    }

    const opacityThreshold = AsNumber(GetAttributeValue(GetAttribute(surfaceShader, "inputs:opacityThreshold")));
    if (opacityThreshold !== undefined) {
        material.opacityThreshold = opacityThreshold;
    }
    material.useSpecularWorkflow = AsBoolean(GetAttributeValue(GetAttribute(surfaceShader, "inputs:useSpecularWorkflow"))) ?? material.useSpecularWorkflow;

    return material;
}

function ResolvePreviewSurfaceShader(materialPrim: ISdfPrimSpec, context: IStageMappingContext): ISdfPrimSpec | undefined {
    const surfaceOutput = GetAttribute(materialPrim, "outputs:surface");
    for (const connection of GetConnectionTargets(surfaceOutput)) {
        const target = SplitPropertyPath(connection);
        const shaderPrim = target ? context.primByPath.get(target.primPath) : undefined;
        if (!shaderPrim) {
            context.diagnostics.push({
                severity: "warning",
                path: surfaceOutput?.path ?? materialPrim.path,
                message: `Material surface output connection '${connection}' could not be resolved to a prim.`,
            });
            continue;
        }
        if (GetShaderId(shaderPrim) === "UsdPreviewSurface") {
            return shaderPrim;
        }
    }
    return materialPrim.children.find((child) => child.typeName === "Shader" && GetShaderId(child) === "UsdPreviewSurface");
}

interface IResolvedConnection {
    readonly prim: ISdfPrimSpec;
    readonly propertyName: string;
}

/**
 * Resolves the first authored connection on an input to its target prim and property.
 *
 * A missing connection returns undefined silently (the input is simply unconnected), while an
 * authored connection whose target prim cannot be found pushes a warning so a broken shading-network
 * path is diagnosed rather than dropped, then returns undefined so callers fall back to defaults.
 * @param input shader input attribute that may author a connection
 * @param context mapping context used for prim lookup and diagnostics
 * @returns the resolved target prim and property name, or undefined
 */
function ResolveConnectionTarget(input: ISdfAttributeSpec | undefined, context: IStageMappingContext): IResolvedConnection | undefined {
    const connection = GetConnectionTargets(input)[0];
    if (!connection) {
        return undefined;
    }
    const target = SplitPropertyPath(connection);
    const prim = target ? context.primByPath.get(target.primPath) : undefined;
    if (!prim || !target) {
        context.diagnostics.push({
            severity: "warning",
            path: input?.path ?? connection,
            message: `Shader connection target '${connection}' could not be resolved to a prim and was ignored.`,
        });
        return undefined;
    }
    return { prim, propertyName: target.propertyName };
}

function ApplyPreviewInput(material: IResolvedMaterial, shaderPrim: ISdfPrimSpec, mapping: IPreviewInputMapping, context: IStageMappingContext): void {
    const input = GetAttribute(shaderPrim, `inputs:${mapping.inputName}`);
    const inputValue = GetAttributeValue(input);
    if (mapping.scalarSlot) {
        ApplyScalarMaterialInput(material, mapping.scalarSlot, inputValue);
    }

    if (!mapping.textureSlot && GetConnectionTargets(input).length > 0) {
        context.diagnostics.push({
            severity: "info",
            path: input?.path ?? shaderPrim.path,
            message: `Connected texture for '${mapping.inputName}' is not representable in IResolvedMaterial and was skipped.`,
        });
        return;
    }
    const texture = mapping.textureSlot ? ResolveConnectedTexture(input, context, mapping.textureSlot, mapping.defaultChannel) : undefined;
    if (texture && mapping.textureSlot) {
        material.textures[mapping.textureSlot] = texture;
    }
}

function ApplyScalarMaterialInput(material: IResolvedMaterial, slot: keyof Omit<IResolvedMaterial, "name" | "textures">, value: ReturnType<typeof GetAttributeValue>): void {
    const vector = AsVec3(value);
    if (vector && (slot === "baseColor" || slot === "emissiveColor" || slot === "specularColor")) {
        material[slot] = vector;
        return;
    }
    const scalar = AsNumber(value);
    if (scalar !== undefined && slot !== "baseColor" && slot !== "emissiveColor" && slot !== "specularColor") {
        material[slot] = scalar as never;
    }
}

function ResolveConnectedTexture(
    input: ISdfAttributeSpec | undefined,
    context: IStageMappingContext,
    slot: ResolvedTextureSlot,
    defaultChannel?: IResolvedTexture["channel"]
): IResolvedTexture | undefined {
    const target = ResolveConnectionTarget(input, context);
    if (!target) {
        return undefined;
    }
    const texturePrim = target.prim;
    if (GetShaderId(texturePrim) !== "UsdUVTexture") {
        // Existing-but-wrong target type: the connection resolves to a prim that is not a texture, so
        // no image can be sampled for this input. Diagnose it rather than dropping it silently.
        context.diagnostics.push({
            severity: "warning",
            path: texturePrim.path,
            message: `Texture input connection resolves to '${GetShaderId(texturePrim) || "an untyped prim"}' instead of a UsdUVTexture; no texture was applied for this input.`,
        });
        return undefined;
    }

    const file = AsAssetPath(GetAttributeValue(GetAttribute(texturePrim, "inputs:file")));
    if (!file) {
        context.diagnostics.push({ severity: "warning", path: texturePrim.path, message: "UsdUVTexture is missing inputs:file and was ignored." });
        return undefined;
    }
    if (IsUsdLayerAsset(file)) {
        context.diagnostics.push({
            severity: "warning",
            path: texturePrim.path,
            message: `UsdUVTexture references a USD layer '${StripAssetDelimiters(file)}' as an image, which is not a supported texture source; the texture was skipped.`,
        });
        return undefined;
    }

    return {
        uri: ResolveAssetUri(file, context.layer.identifier),
        uvSet: ResolveTextureUvSet(texturePrim, context),
        wrapU: MapWrapMode(AsToken(GetAttributeValue(GetAttribute(texturePrim, "inputs:wrapS")))),
        wrapV: MapWrapMode(AsToken(GetAttributeValue(GetAttribute(texturePrim, "inputs:wrapT")))),
        colorSpace: ResolveTextureColorSpace(texturePrim, slot),
        scale: AsVec4(GetAttributeValue(GetAttribute(texturePrim, "inputs:scale"))) ?? AsVec4FromVec3(GetAttributeValue(GetAttribute(texturePrim, "inputs:scale"))),
        bias: AsVec4(GetAttributeValue(GetAttribute(texturePrim, "inputs:bias"))) ?? AsVec4FromVec3(GetAttributeValue(GetAttribute(texturePrim, "inputs:bias"))),
        channel: ResolveTextureChannel(target.propertyName, defaultChannel),
    };
}

function ResolveTextureUvSet(texturePrim: ISdfPrimSpec, context: IStageMappingContext): number {
    const stTarget = ResolveConnectionTarget(GetAttribute(texturePrim, "inputs:st"), context);
    const readerPrim = stTarget ? FindPrimvarReader(stTarget.prim, context) : undefined;
    const varname = readerPrim ? AsToken(GetAttributeValue(GetAttribute(readerPrim, "inputs:varname"))) : undefined;
    return UvSetNameToIndex(varname ?? "st");
}

function FindPrimvarReader(prim: ISdfPrimSpec, context: IStageMappingContext): ISdfPrimSpec | undefined {
    // UsdTransform2d and similar pass-through shaders forward the primvar through inputs:in, so walk
    // the connection chain to reach the underlying reader. The walk is iterative with a visited set so
    // a cyclic network cannot recurse without bound. No UV transform is applied because visuals are out
    // of scope for this slice; only the source UV set is resolved.
    const visited = new Set<string>();
    let current: ISdfPrimSpec | undefined = prim;
    while (current) {
        if (GetShaderId(current).startsWith("UsdPrimvarReader")) {
            return current;
        }
        if (visited.has(current.path)) {
            context.diagnostics.push({
                severity: "warning",
                path: current.path,
                message: "Cyclic shader inputs:in connection chain detected while resolving a texture UV set; defaulting to UV set 0.",
            });
            return undefined;
        }
        visited.add(current.path);
        if (GetShaderId(current) === "UsdTransform2d" && HasNonDefaultTransform2d(current)) {
            context.diagnostics.push({
                severity: "warning",
                path: current.path,
                message: "UsdTransform2d authors a non-default UV transform (scale/rotation/translation) which is not applied; the underlying UV set is used unchanged.",
            });
        }
        const nested = ResolveConnectionTarget(GetAttribute(current, "inputs:in"), context);
        current = nested?.prim;
    }
    return undefined;
}

function HasNonDefaultTransform2d(prim: ISdfPrimSpec): boolean {
    const rotation = AsNumber(GetAttributeValue(GetAttribute(prim, "inputs:rotation")));
    if (rotation !== undefined && rotation !== 0) {
        return true;
    }
    const scale = AsVec2(GetAttributeValue(GetAttribute(prim, "inputs:scale")));
    if (scale && (scale[0] !== 1 || scale[1] !== 1)) {
        return true;
    }
    const translation = AsVec2(GetAttributeValue(GetAttribute(prim, "inputs:translation")));
    if (translation && (translation[0] !== 0 || translation[1] !== 0)) {
        return true;
    }
    return false;
}

function UvSetNameToIndex(varname: string): number {
    if (varname === "st" || varname === "st0") {
        return 0;
    }
    const match = /(?:st|uv|UVMap)(\d+)/.exec(varname);
    return match ? Math.max(0, Number(match[1])) : 0;
}

function ResolveTextureColorSpace(texturePrim: ISdfPrimSpec, slot: ResolvedTextureSlot): IResolvedTexture["colorSpace"] {
    const authored = AsToken(GetAttributeValue(GetAttribute(texturePrim, "inputs:sourceColorSpace")));
    if (authored === "sRGB" || authored === "linear" || authored === "raw") {
        return authored;
    }
    return slot === "baseColor" || slot === "emissive" ? "sRGB" : "raw";
}

function ResolveTextureChannel(outputName: string | undefined, defaultChannel: IResolvedTexture["channel"] | undefined): IResolvedTexture["channel"] | undefined {
    const suffix = outputName?.split(":").pop();
    return suffix === "r" || suffix === "g" || suffix === "b" || suffix === "a" ? suffix : defaultChannel;
}

function ResolveAssetUri(path: string, layerIdentifier: string): string {
    const cleanPath = StripAssetDelimiters(path);
    if (cleanPath.startsWith("data:")) {
        return cleanPath;
    }
    // Resolve relative texture sidecars against the source layer, including the dropped-file scheme.
    return ResolveAssetIdentifier(cleanPath, layerIdentifier);
}

function StripAssetDelimiters(path: string): string {
    return path.length >= 2 && path.startsWith("@") && path.endsWith("@") ? path.slice(1, -1) : path;
}

const UsdLayerExtensions = [".usd", ".usda", ".usdc", ".usdz"];

/**
 * Determines whether a texture asset path points at a USD layer rather than an image.
 *
 * A UsdUVTexture must reference an image; an authored `inputs:file` that targets a USD layer (for
 * example a stale reference or an unsupported nested-stage workflow) cannot be sampled as a texture,
 * so it is rejected with a diagnostic instead of being resolved.
 * @param path authored asset path, possibly wrapped in `@...@` delimiters and with a query/fragment
 * @returns true when the path's extension is a USD layer format
 */
function IsUsdLayerAsset(path: string): boolean {
    const clean = StripAssetDelimiters(path).split("?")[0].split("#")[0].trim().toLowerCase();
    return UsdLayerExtensions.some((ext) => clean.endsWith(ext));
}

function MapWrapMode(mode: string | undefined): IResolvedTexture["wrapU"] {
    if (mode === "clamp" || mode === "mirror" || mode === "black") {
        return mode;
    }
    return "repeat";
}

function GetShaderId(shaderPrim: ISdfPrimSpec): string {
    return AsToken(GetAttributeValue(GetAttribute(shaderPrim, "info:id"))) ?? "";
}

/**
 * Scans a material prim's shader children for asset-valued inputs that are empty or use absolute
 * nonportable paths. These indicate authoring-tool artifacts (e.g. MDL textures with local paths)
 * that cannot be resolved at runtime. Produces stable structured diagnostics without echoing the
 * authored path content. Only called when the material network is unsupported (no PreviewSurface).
 * @param materialPrim the material prim whose shader children are scanned
 * @param context mapping context used for diagnostics
 */
function DiagnoseAssetPathIssues(materialPrim: ISdfPrimSpec, context: IStageMappingContext): void {
    for (const child of materialPrim.children) {
        if (child.typeName !== "Shader") {
            continue;
        }
        for (const [propName, prop] of Object.entries(child.properties)) {
            if (prop.kind !== "attribute" || !propName.startsWith("inputs:")) {
                continue;
            }
            const assetValue = AsAssetPath(GetAttributeValue(prop));
            if (assetValue === undefined) {
                continue;
            }
            const cleanPath = assetValue.length >= 2 && assetValue.startsWith("@") && assetValue.endsWith("@") ? assetValue.slice(1, -1) : assetValue;
            if (cleanPath === "") {
                context.diagnostics.push({
                    severity: "warning",
                    path: `${child.path}.${propName}`,
                    message: "Asset input has an empty path and cannot be resolved.",
                });
            } else if (IsAbsoluteNonportablePath(cleanPath)) {
                context.diagnostics.push({
                    severity: "warning",
                    path: `${child.path}.${propName}`,
                    message: "Asset input uses an absolute nonportable path that cannot be resolved at runtime.",
                });
            }
        }
    }
}

/**
 * Detects absolute OS-specific paths that are not resolvable in a portable context:
 * Windows drive letters (e.g. `C:` or `D:/`), UNC paths (e.g. `\\server\share`), and Unix
 * absolute paths (e.g. `/`). HTTPS/HTTP URLs and data URIs are portable and not flagged.
 * @param path the clean asset path to test
 * @returns true when the path is an absolute nonportable OS path
 */
function IsAbsoluteNonportablePath(path: string): boolean {
    if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) {
        return false;
    }
    // Windows drive letter (e.g. C:/ or C:\)
    if (/^[A-Za-z]:[/\\]/.test(path)) {
        return true;
    }
    // UNC path
    if (path.startsWith("\\\\")) {
        return true;
    }
    // Unix absolute path
    if (path.startsWith("/")) {
        return true;
    }
    return false;
}

function BuildDefaultMaterial(name: string, baseColor: Vec3): IResolvedMaterial {
    return {
        name,
        baseColor,
        opacity: 1,
        metallic: 0,
        roughness: 0.5,
        emissiveColor: [0, 0, 0],
        ior: 1.5,
        occlusion: 1,
        clearcoat: 0,
        clearcoatRoughness: 0,
        useSpecularWorkflow: false,
        specularColor: [1, 1, 1],
        textures: {},
    };
}

/**
 * UsdPreviewSurface input defaults that differ from {@link BuildDefaultMaterial}.
 *
 * These match the UsdPreviewSurface schema so a bound material with unauthored inputs resolves to the
 * same values a reference renderer would use, most notably the 0.18 gray diffuse color.
 */
const UsdPreviewSurfaceDefaults = {
    diffuseColor: [0.18, 0.18, 0.18] as Vec3,
    specularColor: [0, 0, 0] as Vec3,
    clearcoatRoughness: 0.01,
} as const;

function BuildPreviewSurfaceMaterial(name: string): IResolvedMaterial {
    const diffuse = UsdPreviewSurfaceDefaults.diffuseColor;
    const specular = UsdPreviewSurfaceDefaults.specularColor;
    return {
        name,
        baseColor: [diffuse[0], diffuse[1], diffuse[2]],
        opacity: 1,
        metallic: 0,
        roughness: 0.5,
        emissiveColor: [0, 0, 0],
        ior: 1.5,
        occlusion: 1,
        clearcoat: 0,
        clearcoatRoughness: UsdPreviewSurfaceDefaults.clearcoatRoughness,
        useSpecularWorkflow: false,
        specularColor: [specular[0], specular[1], specular[2]],
        textures: {},
    };
}

function AsVec4FromVec3(value: ReturnType<typeof GetAttributeValue>): Vec4 | undefined {
    const vec3 = AsVec3(value);
    return vec3 ? [vec3[0], vec3[1], vec3[2], 1] : undefined;
}
