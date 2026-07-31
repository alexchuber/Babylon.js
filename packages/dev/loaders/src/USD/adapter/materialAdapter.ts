import { Color3 } from "core/Maths/math.color.pure";
import { PBRMaterial } from "core/Materials/PBR/pbrMaterial.pure";
import { Texture } from "core/Materials/Textures/texture.pure";
import { type Scene } from "core/scene";
import { type IResolvedDiagnostic, type IResolvedMaterial, type IResolvedTexture, type ResolvedTextureSlot } from "../resolution/resolvedStage";
import { type USDLoadingOptions } from "../usdLoadingOptions";

type ResolvedTextureChannel = NonNullable<IResolvedTexture["channel"]>;
type ResolvedTextureWrap = IResolvedTexture["wrapU"];

/**
 * Creates a Babylon PBR material from an already-resolved USD material.
 *
 * USD scalar texture channels are mapped onto Babylon's native PBR slots where those slots expose
 * channel controls. Standalone roughness textures use Babylon's `microSurfaceTexture`, which samples
 * the red channel; metallic/roughness packed into the same texture can use metallic red/blue and
 * roughness green/alpha. `black` wrap is approximated with clamp because Babylon has no direct black
 * border wrap mode. Unsupported scalar channels and lossy scale/bias/channel mappings fall back to
 * Babylon's closest native behavior and emit structured adapter diagnostics. Per-channel texture
 * scale is applied through `Texture.level` only when Babylon can represent it as one uniform multiplier;
 * bias and non-uniform color scale need a shader-level swizzle path that the frozen resolved-stage contract does not provide. The USD specular workflow is
 * approximated with PBRMaterial's specular/glossiness controls (`reflectivityColor` and
 * `microSurface = 1 - roughness`). A specular-workflow roughness texture is intentionally skipped
 * because assigning it directly would reinterpret roughness as glossiness.
 *
 * @param material the resolved USD material data
 * @param scene the scene to create the Babylon material in
 * @param _options loader options reserved for future material resolution behavior
 * @param diagnostics optional adapter diagnostic sink for lossy texture fallbacks
 * @returns the created Babylon PBR material
 */
export function CreateMaterialFromResolved(material: IResolvedMaterial, scene: Scene, _options: Readonly<USDLoadingOptions>, diagnostics?: IResolvedDiagnostic[]): PBRMaterial {
    const babylonMaterial = new PBRMaterial(material.name, scene);

    babylonMaterial.albedoColor = CreateColor3(material.baseColor);
    babylonMaterial.alpha = material.opacity;
    babylonMaterial.emissiveColor = CreateColor3(material.emissiveColor);
    babylonMaterial.indexOfRefraction = material.ior;
    babylonMaterial.ambientTextureStrength = material.occlusion;

    if (material.useSpecularWorkflow) {
        babylonMaterial.metallic = null;
        babylonMaterial.roughness = null;
        babylonMaterial.reflectivityColor = CreateColor3(material.specularColor);
        babylonMaterial.microSurface = 1 - material.roughness;
    } else {
        babylonMaterial.metallic = material.metallic;
        babylonMaterial.roughness = material.roughness;
    }

    babylonMaterial.clearCoat.intensity = material.clearcoat;
    babylonMaterial.clearCoat.roughness = material.clearcoatRoughness;
    babylonMaterial.clearCoat.isEnabled = material.clearcoat > 0 || material.textures.clearcoat !== undefined || material.textures.clearcoatRoughness !== undefined;

    ApplyTextureSlots(babylonMaterial, material, scene, diagnostics);
    ApplyTransparencyMode(babylonMaterial, material);

    return babylonMaterial;
}

function ApplyTextureSlots(babylonMaterial: PBRMaterial, material: IResolvedMaterial, scene: Scene, diagnostics?: IResolvedDiagnostic[]): void {
    const textures = material.textures;

    if (textures.baseColor) {
        babylonMaterial.albedoTexture = CreateTexture(textures.baseColor, scene, "baseColor", diagnostics, material.name);
    }

    if (textures.normal) {
        babylonMaterial.bumpTexture = CreateTexture(textures.normal, scene, "normal", diagnostics, material.name);
    }

    if (textures.emissive) {
        babylonMaterial.emissiveTexture = CreateTexture(textures.emissive, scene, "emissive", diagnostics, material.name);
    }

    if (textures.occlusion) {
        babylonMaterial.ambientTexture = CreateTexture(textures.occlusion, scene, "occlusion", diagnostics, material.name);
        babylonMaterial.useAmbientInGrayScale = true;
    }

    if (textures.opacity) {
        const opacityTexture = CreateTexture(textures.opacity, scene, "opacity", diagnostics, material.name);
        opacityTexture.hasAlpha = true;
        opacityTexture.getAlphaFromRGB = textures.opacity.channel !== undefined && textures.opacity.channel !== "a";
        if (textures.opacity.channel && textures.opacity.channel !== "a") {
            AddTextureDiagnostic(diagnostics, material.name, "opacity", `Opacity channel '${textures.opacity.channel}' is approximated with Babylon's luminance-from-RGB mode.`);
        }
        babylonMaterial.opacityTexture = opacityTexture;
    } else if (textures.baseColor && material.opacityThreshold !== undefined && babylonMaterial.albedoTexture) {
        babylonMaterial.albedoTexture.hasAlpha = true;
        babylonMaterial.useAlphaFromAlbedoTexture = true;
    }

    if (!material.useSpecularWorkflow) {
        ApplyMetallicRoughnessTextures(babylonMaterial, textures.metallic, textures.roughness, scene, diagnostics, material.name);
    }

    ApplyClearCoatTextures(babylonMaterial, textures.clearcoat, textures.clearcoatRoughness, scene, diagnostics, material.name);
}

function ApplyMetallicRoughnessTextures(
    babylonMaterial: PBRMaterial,
    metallicTexture: IResolvedTexture | undefined,
    roughnessTexture: IResolvedTexture | undefined,
    scene: Scene,
    diagnostics?: IResolvedDiagnostic[],
    materialName = "material"
): void {
    const supportedMetallicTexture = metallicTexture ? NormalizeScalarTexture(metallicTexture, "metallic", diagnostics, materialName) : undefined;
    if (metallicTexture) {
        babylonMaterial.metallicTexture = CreateTexture(supportedMetallicTexture!, scene, "metallic", diagnostics, materialName);
        babylonMaterial.useMetallnessFromMetallicTextureBlue = GetTextureChannel(supportedMetallicTexture!, "metallic") === "b";
    }

    if (!roughnessTexture) {
        return;
    }

    const sameTextureSource = Boolean(metallicTexture && AreSameTextureIdentity(metallicTexture, roughnessTexture));
    const packedRoughnessCandidate = NormalizeScalarTexture(roughnessTexture, "roughness", diagnostics, materialName, sameTextureSource);
    if (
        metallicTexture &&
        IsPackedRoughnessChannel(packedRoughnessCandidate!) &&
        ArePackedTextureSourceCompatible(supportedMetallicTexture!, packedRoughnessCandidate!, "metallic", "roughness")
    ) {
        ApplyRoughnessPackingToMetallicTexture(babylonMaterial, packedRoughnessCandidate!);
        return;
    }

    if (sameTextureSource && !IsPackedRoughnessChannel(packedRoughnessCandidate!)) {
        AddTextureDiagnostic(
            diagnostics,
            materialName,
            "roughness",
            `Packed roughness channel '${GetTextureChannel(roughnessTexture, "roughness")}' is not supported by Babylon's metallic texture flags; the source was loaded separately.`
        );
    } else if (sameTextureSource) {
        AddTextureDiagnostic(
            diagnostics,
            materialName,
            "roughness",
            "Metallic and roughness textures share a source but have incompatible sampling transforms; separate Babylon textures were created."
        );
    }
    const supportedRoughnessTexture = sameTextureSource ? NormalizeScalarTexture(roughnessTexture, "roughness", diagnostics, materialName) : packedRoughnessCandidate;
    babylonMaterial.microSurfaceTexture = CreateTexture(supportedRoughnessTexture!, scene, "roughness", diagnostics, materialName);
}

function ApplyRoughnessPackingToMetallicTexture(babylonMaterial: PBRMaterial, roughnessTexture: IResolvedTexture): void {
    const roughnessChannel = GetTextureChannel(roughnessTexture, "roughness");
    babylonMaterial.useRoughnessFromMetallicTextureAlpha = roughnessChannel === "a";
    babylonMaterial.useRoughnessFromMetallicTextureGreen = roughnessChannel === "g";
}

function ApplyClearCoatTextures(
    babylonMaterial: PBRMaterial,
    clearcoatTexture: IResolvedTexture | undefined,
    clearcoatRoughnessTexture: IResolvedTexture | undefined,
    scene: Scene,
    diagnostics?: IResolvedDiagnostic[],
    materialName = "material"
): void {
    const supportedClearcoatTexture = clearcoatTexture ? NormalizeScalarTexture(clearcoatTexture, "clearcoat", diagnostics, materialName) : undefined;
    if (clearcoatTexture) {
        babylonMaterial.clearCoat.texture = CreateTexture(supportedClearcoatTexture!, scene, "clearcoat", diagnostics, materialName);
    }

    if (!clearcoatRoughnessTexture) {
        return;
    }

    const supportedClearcoatRoughnessTexture = NormalizeScalarTexture(clearcoatRoughnessTexture, "clearcoatRoughness", diagnostics, materialName);
    if (clearcoatTexture && ArePackedTextureSourceCompatible(supportedClearcoatTexture!, supportedClearcoatRoughnessTexture!, "clearcoat", "clearcoatRoughness")) {
        babylonMaterial.clearCoat.useRoughnessFromMainTexture = true;
        return;
    }

    if (clearcoatTexture && AreSameTextureIdentity(clearcoatTexture, clearcoatRoughnessTexture)) {
        AddTextureDiagnostic(
            diagnostics,
            materialName,
            "clearcoatRoughness",
            "Clearcoat textures share a source but have incompatible sampling transforms; separate Babylon textures were created."
        );
    }
    babylonMaterial.clearCoat.textureRoughness = CreateTexture(supportedClearcoatRoughnessTexture!, scene, "clearcoatRoughness", diagnostics, materialName);
    babylonMaterial.clearCoat.useRoughnessFromMainTexture = false;
}

function ApplyTransparencyMode(babylonMaterial: PBRMaterial, material: IResolvedMaterial): void {
    const hasOpacityTexture = material.textures.opacity !== undefined;
    const hasAlphaCutoff = material.opacityThreshold !== undefined;

    if (hasAlphaCutoff) {
        babylonMaterial.alphaCutOff = material.opacityThreshold!;
        babylonMaterial.transparencyMode = material.opacity < 1 || hasOpacityTexture ? PBRMaterial.PBRMATERIAL_ALPHATESTANDBLEND : PBRMaterial.PBRMATERIAL_ALPHATEST;
        return;
    }

    babylonMaterial.transparencyMode = material.opacity < 1 || hasOpacityTexture ? PBRMaterial.PBRMATERIAL_ALPHABLEND : PBRMaterial.PBRMATERIAL_OPAQUE;
}

function CreateTexture(texture: IResolvedTexture, scene: Scene, slot: ResolvedTextureSlot, diagnostics?: IResolvedDiagnostic[], materialName = "material"): Texture {
    const gammaSpace = texture.colorSpace === "sRGB";
    const babylonTexture = new Texture(texture.uri, scene, { gammaSpace });

    babylonTexture.name = texture.uri;
    babylonTexture.coordinatesIndex = texture.uvSet;
    babylonTexture.wrapU = GetAddressMode(texture.wrapU);
    babylonTexture.wrapV = GetAddressMode(texture.wrapV);
    babylonTexture.gammaSpace = gammaSpace;
    ApplyTextureScaleBias(babylonTexture, texture, slot, diagnostics, materialName);

    return babylonTexture;
}

function GetAddressMode(wrap: ResolvedTextureWrap): number {
    switch (wrap) {
        case "repeat":
            return Texture.WRAP_ADDRESSMODE;
        case "mirror":
            return Texture.MIRROR_ADDRESSMODE;
        case "clamp":
        case "black":
            return Texture.CLAMP_ADDRESSMODE;
    }
}

function ApplyTextureScaleBias(
    babylonTexture: Texture,
    texture: IResolvedTexture,
    slot: ResolvedTextureSlot,
    diagnostics?: IResolvedDiagnostic[],
    materialName = "material"
): void {
    const level = GetSupportedTextureLevel(texture, slot);
    if (level !== undefined) {
        babylonTexture.level = level;
    } else if (texture.scale || texture.bias) {
        AddTextureDiagnostic(
            diagnostics,
            materialName,
            slot,
            "Texture scale/bias is not fully representable by Babylon's native texture controls; the unsupported component was ignored."
        );
    }
}

function GetSupportedTextureLevel(texture: IResolvedTexture, slot: ResolvedTextureSlot): number | undefined {
    if (!texture.scale || HasUnsupportedBias(texture, slot)) {
        return undefined;
    }

    if (slot === "baseColor" || slot === "emissive") {
        return texture.scale[0] === texture.scale[1] && texture.scale[1] === texture.scale[2] && texture.scale[2] === texture.scale[3] ? texture.scale[0] : undefined;
    }

    if (slot === "normal") {
        return texture.scale[0] === texture.scale[1] && texture.scale[1] === texture.scale[2] ? texture.scale[0] : undefined;
    }

    return texture.scale[GetChannelIndex(GetTextureChannel(texture, slot))];
}

function HasUnsupportedBias(texture: IResolvedTexture, slot: ResolvedTextureSlot): boolean {
    if (!texture.bias) {
        return false;
    }

    if (slot === "baseColor" || slot === "emissive") {
        return texture.bias[0] !== 0 || texture.bias[1] !== 0 || texture.bias[2] !== 0 || texture.bias[3] !== 0;
    }

    if (slot === "normal") {
        return texture.bias[0] !== 0 || texture.bias[1] !== 0 || texture.bias[2] !== 0;
    }

    return texture.bias[GetChannelIndex(GetTextureChannel(texture, slot))] !== 0;
}

function GetTextureChannel(texture: IResolvedTexture, slot: ResolvedTextureSlot): ResolvedTextureChannel {
    if (texture.channel) {
        return texture.channel;
    }

    switch (slot) {
        case "opacity":
            return "a";
        case "roughness":
            return "r";
        case "clearcoatRoughness":
            return "g";
        case "baseColor":
        case "normal":
        case "emissive":
        case "metallic":
            return "b";
        case "occlusion":
        case "clearcoat":
            return "r";
    }
}

function GetChannelIndex(channel: ResolvedTextureChannel): number {
    switch (channel) {
        case "r":
            return 0;
        case "g":
            return 1;
        case "b":
            return 2;
        case "a":
            return 3;
    }
}

function AreSameTextureIdentity(left: IResolvedTexture, right: IResolvedTexture): boolean {
    return left.uri === right.uri && left.uvSet === right.uvSet && left.wrapU === right.wrapU && left.wrapV === right.wrapV && left.colorSpace === right.colorSpace;
}

function ArePackedTextureSourceCompatible(left: IResolvedTexture, right: IResolvedTexture, leftSlot: ResolvedTextureSlot, rightSlot: ResolvedTextureSlot): boolean {
    if (!AreSameTextureIdentity(left, right)) {
        return false;
    }

    const leftLevel = GetPackedTextureLevel(left, leftSlot);
    const rightLevel = GetPackedTextureLevel(right, rightSlot);
    return leftLevel !== undefined && rightLevel !== undefined && leftLevel === rightLevel;
}

function IsPackedRoughnessChannel(texture: IResolvedTexture): boolean {
    const channel = GetTextureChannel(texture, "roughness");
    return channel === "g" || channel === "a";
}

function GetPackedTextureLevel(texture: IResolvedTexture, slot: ResolvedTextureSlot): number | undefined {
    if (!texture.scale) {
        return HasUnsupportedBias(texture, slot) ? undefined : 1;
    }
    return GetSupportedTextureLevel(texture, slot);
}

function NormalizeScalarTexture(
    texture: IResolvedTexture | undefined,
    slot: "metallic" | "roughness" | "clearcoat" | "clearcoatRoughness",
    diagnostics?: IResolvedDiagnostic[],
    materialName = "material",
    packed = false
): IResolvedTexture | undefined {
    if (!texture) {
        return undefined;
    }
    const channel = GetTextureChannel(texture, slot);
    const supportedChannels: Record<typeof slot, readonly ResolvedTextureChannel[]> = {
        metallic: ["r", "b"],
        roughness: packed ? ["r", "g", "a"] : ["r"],
        clearcoat: ["r"],
        clearcoatRoughness: ["g"],
    };
    if (supportedChannels[slot].includes(channel)) {
        return texture;
    }
    AddTextureDiagnostic(diagnostics, materialName, slot, `Texture channel '${channel}' is not supported for this Babylon slot; falling back to '${supportedChannels[slot][0]}'.`);
    return { ...texture, channel: supportedChannels[slot][0] };
}

function AddTextureDiagnostic(diagnostics: IResolvedDiagnostic[] | undefined, materialName: string, slot: ResolvedTextureSlot, message: string): void {
    diagnostics?.push({
        severity: "warning",
        path: `/Materials/${materialName}/${slot}`,
        message,
    });
}

function CreateColor3(value: readonly [number, number, number]): Color3 {
    return new Color3(value[0], value[1], value[2]);
}
