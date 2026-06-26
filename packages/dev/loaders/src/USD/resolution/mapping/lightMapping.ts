import { type IResolvedLight, type IResolvedTexture, type ResolvedLightKind } from "../resolvedStage";
import { type ISdfPrimSpec } from "../sdf";
import { type IStageMappingContext } from "./mappingContext";
import { AsAssetPath, AsBoolean, AsNumber, AsVec3, GetAttribute, GetAttributeValue } from "./valueAccess";

/**
 * Maps a supported UsdLux prim into the resolved light payload.
 * @param prim UsdLux prim to map
 * @param context mapping context used for layer-relative asset resolution
 * @returns resolved light payload, or undefined when the prim is not a supported UsdLux light
 */
export function ResolveLight(prim: ISdfPrimSpec, context: IStageMappingContext): IResolvedLight | undefined {
    const kind = MapLightKind(prim.typeName);
    if (!kind) {
        return undefined;
    }

    const light: IResolvedLight = {
        kind,
        color: AsVec3(GetAttributeValue(GetAttribute(prim, "inputs:color"))) ?? [1, 1, 1],
        intensity: AsNumber(GetAttributeValue(GetAttribute(prim, "inputs:intensity"))) ?? 1,
        exposure: AsNumber(GetAttributeValue(GetAttribute(prim, "inputs:exposure"))) ?? 0,
    };

    ApplyKindSpecificInputs(light, prim, context);
    return light;
}

function MapLightKind(typeName: string | undefined): ResolvedLightKind | undefined {
    switch (typeName) {
        case "DistantLight":
            return "distant";
        case "SphereLight":
            return "sphere";
        case "RectLight":
            return "rect";
        case "DiskLight":
            return "disk";
        case "DomeLight":
            return "dome";
        case "CylinderLight":
            return "cylinder";
        default:
            return undefined;
    }
}

function ApplyKindSpecificInputs(light: IResolvedLight, prim: ISdfPrimSpec, context: IStageMappingContext): void {
    const normalize = AsBoolean(GetAttributeValue(GetAttribute(prim, "inputs:normalize")));
    if (normalize !== undefined) {
        light.normalize = normalize;
    }

    if (light.kind === "distant") {
        light.angle = AsNumber(GetAttributeValue(GetAttribute(prim, "inputs:angle")));
    } else if (light.kind === "sphere" || light.kind === "disk" || light.kind === "cylinder") {
        light.radius = AsNumber(GetAttributeValue(GetAttribute(prim, "inputs:radius")));
    } else if (light.kind === "rect") {
        light.width = AsNumber(GetAttributeValue(GetAttribute(prim, "inputs:width")));
        light.height = AsNumber(GetAttributeValue(GetAttribute(prim, "inputs:height")));
    } else if (light.kind === "dome") {
        light.domeTexture = ResolveDomeTexture(prim, context);
    }
}

function ResolveDomeTexture(prim: ISdfPrimSpec, context: IStageMappingContext): IResolvedTexture | undefined {
    const file = AsAssetPath(GetAttributeValue(GetAttribute(prim, "inputs:texture:file")));
    if (!file) {
        return undefined;
    }

    return {
        uri: ResolveAssetUri(file, context.layer.identifier),
        uvSet: 0,
        wrapU: "repeat",
        wrapV: "repeat",
        colorSpace: "sRGB",
    };
}

function ResolveAssetUri(path: string, layerIdentifier: string): string {
    const cleanPath = StripAssetDelimiters(path);
    if (/^[a-z]+:\/\//i.test(cleanPath) || cleanPath.startsWith("/") || cleanPath.startsWith("data:")) {
        return cleanPath;
    }
    const slashIndex = layerIdentifier.lastIndexOf("/");
    return slashIndex >= 0 ? `${layerIdentifier.slice(0, slashIndex + 1)}${cleanPath.replace(/^\.\//, "")}` : cleanPath;
}

function StripAssetDelimiters(path: string): string {
    return path.length >= 2 && path.startsWith("@") && path.endsWith("@") ? path.slice(1, -1) : path;
}
