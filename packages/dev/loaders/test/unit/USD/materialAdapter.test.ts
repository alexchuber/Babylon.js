import { describe, expect, it } from "vitest";
import { NullEngine } from "core/Engines/nullEngine";
import { PBRMaterial } from "core/Materials/PBR/pbrMaterial.pure";
import { Scene } from "core/scene";
import { Texture } from "core/Materials/Textures/texture.pure";
import { type IResolvedDiagnostic, type IResolvedMaterial } from "loaders/USD/resolution/resolvedStage";
import { CreateMaterialFromResolved } from "loaders/USD/adapter/materialAdapter";

const OneByOnePngDataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFgAH/iZk9HQAAAABJRU5ErkJggg==";

describe("USD material adapter", () => {
    it("maps resolved PBR values and data-URI albedo texture settings", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const resolvedMaterial: IResolvedMaterial = {
            name: "ResolvedPreviewSurface",
            baseColor: [0.25, 0.5, 0.75],
            opacity: 0.6,
            metallic: 0.35,
            roughness: 0.8,
            emissiveColor: [0.1, 0.2, 0.3],
            ior: 1.45,
            occlusion: 0.7,
            clearcoat: 0.2,
            clearcoatRoughness: 0.4,
            useSpecularWorkflow: false,
            specularColor: [1, 1, 1],
            textures: {
                baseColor: {
                    uri: OneByOnePngDataUri,
                    uvSet: 1,
                    wrapU: "repeat",
                    wrapV: "clamp",
                    colorSpace: "sRGB",
                },
            },
        };

        const material = CreateMaterialFromResolved(resolvedMaterial, scene, {});

        expect(material.name).toBe("ResolvedPreviewSurface");
        expect(material.albedoColor.r).toBeCloseTo(0.25);
        expect(material.albedoColor.g).toBeCloseTo(0.5);
        expect(material.albedoColor.b).toBeCloseTo(0.75);
        expect(material.metallic).toBeCloseTo(0.35);
        expect(material.roughness).toBeCloseTo(0.8);
        expect(material.alpha).toBeCloseTo(0.6);
        expect(material.albedoTexture).toBeInstanceOf(Texture);
        expect(material.albedoTexture!.gammaSpace).toBe(true);
        expect(material.albedoTexture!.coordinatesIndex).toBe(1);
        expect(material.albedoTexture!.wrapU).toBe(Texture.WRAP_ADDRESSMODE);
        expect(material.albedoTexture!.wrapV).toBe(Texture.CLAMP_ADDRESSMODE);

        scene.dispose();
        engine.dispose();
    });

    it("does not interpret a specular-workflow roughness texture as glossiness", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const resolvedMaterial: IResolvedMaterial = {
            name: "SpecularWorkflow",
            baseColor: [1, 1, 1],
            opacity: 1,
            metallic: 0,
            roughness: 0.8,
            emissiveColor: [0, 0, 0],
            ior: 1.5,
            occlusion: 1,
            clearcoat: 0,
            clearcoatRoughness: 0,
            useSpecularWorkflow: true,
            specularColor: [1, 1, 1],
            textures: {
                roughness: {
                    uri: OneByOnePngDataUri,
                    uvSet: 0,
                    wrapU: "repeat",
                    wrapV: "repeat",
                    colorSpace: "raw",
                },
            },
        };

        const material = CreateMaterialFromResolved(resolvedMaterial, scene, {});

        expect(material.microSurface).toBeCloseTo(0.2);
        expect(material.microSurfaceTexture).toBeNull();

        scene.dispose();
        engine.dispose();
    });

    it.each([
        { name: "alpha test", opacity: 1, opacityThreshold: 0.5, expected: PBRMaterial.PBRMATERIAL_ALPHATEST },
        { name: "alpha blend", opacity: 0.5, opacityThreshold: undefined, expected: PBRMaterial.PBRMATERIAL_ALPHABLEND },
        { name: "alpha test and blend", opacity: 0.5, opacityThreshold: 0.5, expected: PBRMaterial.PBRMATERIAL_ALPHATESTANDBLEND },
    ])("selects $name from resolved opacity inputs", ({ opacity, opacityThreshold, expected }) => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const resolvedMaterial: IResolvedMaterial = {
            name: "Transparency",
            baseColor: [1, 1, 1],
            opacity,
            opacityThreshold,
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

        const material = CreateMaterialFromResolved(resolvedMaterial, scene, {});

        expect(material.transparencyMode).toBe(expected);
        expect(material.alphaCutOff).toBe(opacityThreshold ?? 0.4);

        scene.dispose();
        engine.dispose();
    });

    it("maps a packed metallic-roughness texture and black wrap mode", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const resolvedMaterial: IResolvedMaterial = {
            name: "PackedMetallicRoughness",
            baseColor: [1, 1, 1],
            opacity: 1,
            metallic: 1,
            roughness: 1,
            emissiveColor: [0, 0, 0],
            ior: 1.5,
            occlusion: 1,
            clearcoat: 0,
            clearcoatRoughness: 0,
            useSpecularWorkflow: false,
            specularColor: [1, 1, 1],
            textures: {
                metallic: {
                    uri: OneByOnePngDataUri,
                    uvSet: 0,
                    wrapU: "black",
                    wrapV: "black",
                    colorSpace: "raw",
                    channel: "b",
                    scale: [1, 1, 0.25, 1],
                },
                roughness: {
                    uri: OneByOnePngDataUri,
                    uvSet: 0,
                    wrapU: "black",
                    wrapV: "black",
                    colorSpace: "raw",
                    channel: "g",
                },
            },
        };

        const material = CreateMaterialFromResolved(resolvedMaterial, scene, {});

        expect(material.metallicTexture).toBeInstanceOf(Texture);
        expect(material.microSurfaceTexture).toBeInstanceOf(Texture);
        expect(material.useMetallnessFromMetallicTextureBlue).toBe(true);
        expect(material.useRoughnessFromMetallicTextureGreen).toBe(false);
        expect(material.metallicTexture!.wrapU).toBe(Texture.CLAMP_ADDRESSMODE);
        expect(material.metallicTexture!.wrapV).toBe(Texture.CLAMP_ADDRESSMODE);
        expect(material.metallicTexture!.level).toBeCloseTo(0.25);

        scene.dispose();
        engine.dispose();
    });

    it("does not reuse packed channels when their effective levels differ", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const diagnostics: IResolvedDiagnostic[] = [];
        const resolvedMaterial: IResolvedMaterial = {
            name: "IncompatiblePackedLevels",
            baseColor: [1, 1, 1],
            opacity: 1,
            metallic: 1,
            roughness: 1,
            emissiveColor: [0, 0, 0],
            ior: 1.5,
            occlusion: 1,
            clearcoat: 0,
            clearcoatRoughness: 0,
            useSpecularWorkflow: false,
            specularColor: [1, 1, 1],
            textures: {
                metallic: {
                    uri: OneByOnePngDataUri,
                    uvSet: 0,
                    wrapU: "repeat",
                    wrapV: "repeat",
                    colorSpace: "raw",
                    channel: "r",
                    scale: [2, 1, 1, 1],
                },
                roughness: {
                    uri: OneByOnePngDataUri,
                    uvSet: 0,
                    wrapU: "repeat",
                    wrapV: "repeat",
                    colorSpace: "raw",
                    channel: "g",
                    scale: [2, 1, 1, 1],
                },
            },
        };

        const material = CreateMaterialFromResolved(resolvedMaterial, scene, {}, diagnostics);

        expect(material.microSurfaceTexture).toBeInstanceOf(Texture);
        expect(material.microSurfaceTexture!.level).toBeCloseTo(2);
        expect(material.metallicTexture!.level).toBeCloseTo(2);
        expect(diagnostics.some((diagnostic) => diagnostic.message.includes("incompatible sampling transforms"))).toBe(true);

        scene.dispose();
        engine.dispose();
    });

    it("keeps red roughness separate from a shared metallic texture", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const diagnostics: IResolvedDiagnostic[] = [];
        const resolvedMaterial: IResolvedMaterial = {
            name: "RedPackedRoughness",
            baseColor: [1, 1, 1],
            opacity: 1,
            metallic: 1,
            roughness: 1,
            emissiveColor: [0, 0, 0],
            ior: 1.5,
            occlusion: 1,
            clearcoat: 0,
            clearcoatRoughness: 0,
            useSpecularWorkflow: false,
            specularColor: [1, 1, 1],
            textures: {
                metallic: {
                    uri: OneByOnePngDataUri,
                    uvSet: 0,
                    wrapU: "repeat",
                    wrapV: "repeat",
                    colorSpace: "raw",
                    channel: "b",
                },
                roughness: {
                    uri: OneByOnePngDataUri,
                    uvSet: 0,
                    wrapU: "repeat",
                    wrapV: "repeat",
                    colorSpace: "raw",
                    channel: "r",
                },
            },
        };

        const material = CreateMaterialFromResolved(resolvedMaterial, scene, {}, diagnostics);

        expect(material.microSurfaceTexture).toBeInstanceOf(Texture);
        expect(material.useRoughnessFromMetallicTextureGreen).toBe(false);
        expect(diagnostics.some((diagnostic) => diagnostic.message.includes("Packed roughness channel 'r'"))).toBe(true);

        scene.dispose();
        engine.dispose();
    });

    it("diagnoses unsupported standalone scalar channels and falls back explicitly", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const diagnostics: IResolvedDiagnostic[] = [];
        const resolvedMaterial: IResolvedMaterial = {
            name: "UnsupportedChannels",
            baseColor: [1, 1, 1],
            opacity: 1,
            metallic: 0,
            roughness: 0.5,
            emissiveColor: [0, 0, 0],
            ior: 1.5,
            occlusion: 1,
            clearcoat: 0.5,
            clearcoatRoughness: 0.5,
            useSpecularWorkflow: false,
            specularColor: [1, 1, 1],
            textures: {
                roughness: {
                    uri: OneByOnePngDataUri,
                    uvSet: 0,
                    wrapU: "repeat",
                    wrapV: "repeat",
                    colorSpace: "raw",
                    channel: "g",
                },
                clearcoat: {
                    uri: OneByOnePngDataUri,
                    uvSet: 0,
                    wrapU: "repeat",
                    wrapV: "repeat",
                    colorSpace: "raw",
                    channel: "b",
                },
                clearcoatRoughness: {
                    uri: "roughness.png",
                    uvSet: 0,
                    wrapU: "repeat",
                    wrapV: "repeat",
                    colorSpace: "raw",
                    channel: "r",
                },
            },
        };

        const material = CreateMaterialFromResolved(resolvedMaterial, scene, {}, diagnostics);

        expect(material.microSurfaceTexture).toBeInstanceOf(Texture);
        expect(material.clearCoat.texture).toBeInstanceOf(Texture);
        expect(material.clearCoat.textureRoughness).toBeInstanceOf(Texture);
        expect(diagnostics).toHaveLength(3);
        expect(diagnostics.every((diagnostic) => diagnostic.severity === "warning")).toBe(true);
        expect(diagnostics.map((diagnostic) => diagnostic.path)).toEqual(
            expect.arrayContaining(["/Materials/UnsupportedChannels/roughness", "/Materials/UnsupportedChannels/clearcoat", "/Materials/UnsupportedChannels/clearcoatRoughness"])
        );

        scene.dispose();
        engine.dispose();
    });

    it("diagnoses opacity channel approximation and unsupported texture scale/bias", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const diagnostics: IResolvedDiagnostic[] = [];
        const resolvedMaterial: IResolvedMaterial = {
            name: "TextureDiagnostics",
            baseColor: [1, 1, 1],
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
            textures: {
                opacity: {
                    uri: OneByOnePngDataUri,
                    uvSet: 0,
                    wrapU: "repeat",
                    wrapV: "repeat",
                    colorSpace: "raw",
                    channel: "r",
                    bias: [0.1, 0, 0, 0],
                },
                normal: {
                    uri: OneByOnePngDataUri,
                    uvSet: 0,
                    wrapU: "repeat",
                    wrapV: "repeat",
                    colorSpace: "raw",
                    scale: [1, 1, 2, 1],
                },
            },
        };

        const material = CreateMaterialFromResolved(resolvedMaterial, scene, {}, diagnostics);

        expect(material.opacityTexture).toBeInstanceOf(Texture);
        expect(material.opacityTexture!.getAlphaFromRGB).toBe(true);
        expect(material.bumpTexture).toBeInstanceOf(Texture);
        expect(diagnostics).toHaveLength(3);
        expect(diagnostics.some((diagnostic) => diagnostic.message.includes("luminance"))).toBe(true);
        expect(diagnostics.filter((diagnostic) => diagnostic.message.includes("scale/bias"))).toHaveLength(2);

        scene.dispose();
        engine.dispose();
    });
});
