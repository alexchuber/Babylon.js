import { describe, expect, it } from "vitest";
import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { Texture } from "core/Materials/Textures/texture.pure";
import { type IResolvedMaterial } from "loaders/USD/resolution/resolvedStage";
import { CreateMaterialFromResolved } from "loaders/USD/adapter/materialAdapter";

const OneByOnePng = new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 207, 192,
    240, 31, 0, 5, 0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

describe("USD material adapter", () => {
    it("maps resolved PBR values and embedded albedo texture settings", () => {
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
                    uri: "inline-base-color.png",
                    data: OneByOnePng,
                    mimeType: "image/png",
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
});
