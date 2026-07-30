import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { MTLFileLoader } from "loaders/OBJ/mtlFileLoader";

describe("MTLFileLoader - map_Ns specular exponent texture", () => {
    let engine: NullEngine;
    let scene: Scene;

    beforeEach(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
    });

    afterEach(() => {
        scene.dispose();
        engine.dispose();
    });

    it("maps map_Ns to specularTexture when map_Ks is absent", () => {
        const mtl = new MTLFileLoader();
        mtl.parseMTL(scene, ["newmtl testMaterial", "Kd 0.8 0.8 0.8", "map_Ns textures/roughness.png"].join("\n"), "", null);

        expect(mtl.materials.length).toBe(1);
        const mat = mtl.materials[0];
        expect(mat.specularTexture).toBeDefined();
        expect(mat.specularTexture!.name).toContain("roughness.png");
    });

    it("map_Ks wins over map_Ns when map_Ks appears AFTER map_Ns", () => {
        const mtl = new MTLFileLoader();
        mtl.parseMTL(scene, ["newmtl testMaterial", "Kd 0.8 0.8 0.8", "map_Ns textures/roughness.png", "map_Ks textures/specular.png"].join("\n"), "", null);

        expect(mtl.materials.length).toBe(1);
        const mat = mtl.materials[0];
        expect(mat.specularTexture).toBeDefined();
        expect(mat.specularTexture!.name).toContain("specular.png");
    });

    it("map_Ks wins over map_Ns when map_Ks appears BEFORE map_Ns", () => {
        const mtl = new MTLFileLoader();
        mtl.parseMTL(scene, ["newmtl testMaterial", "Kd 0.8 0.8 0.8", "map_Ks textures/specular.png", "map_Ns textures/roughness.png"].join("\n"), "", null);

        expect(mtl.materials.length).toBe(1);
        const mat = mtl.materials[0];
        expect(mat.specularTexture).toBeDefined();
        expect(mat.specularTexture!.name).toContain("specular.png");
    });

    it("map_Ks alone works unchanged", () => {
        const mtl = new MTLFileLoader();
        mtl.parseMTL(scene, ["newmtl testMaterial", "Kd 0.8 0.8 0.8", "map_Ks textures/specular.png"].join("\n"), "", null);

        expect(mtl.materials.length).toBe(1);
        const mat = mtl.materials[0];
        expect(mat.specularTexture).toBeDefined();
        expect(mat.specularTexture!.name).toContain("specular.png");
    });

    it("neither map_Ks nor map_Ns leaves specularTexture null", () => {
        const mtl = new MTLFileLoader();
        mtl.parseMTL(scene, ["newmtl testMaterial", "Kd 0.8 0.8 0.8"].join("\n"), "", null);

        expect(mtl.materials.length).toBe(1);
        const mat = mtl.materials[0];
        expect(mat.specularTexture).toBeNull();
    });
});
