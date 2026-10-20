import { NullEngine } from "core/Engines/nullEngine";
import { StandardMaterial } from "core/Materials/standardMaterial";
import { Color3 } from "core/Maths/math.color";
import { CreateBox } from "core/Meshes/Builders/boxBuilder";
import { Scene } from "core/scene";
import { GLTF2Export } from "serializers/glTF/2.0";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("glTF core material export", () => {
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

    it("exports standard diffuse color as the metallic-roughness base color", async () => {
        const mesh = CreateBox("box", {}, scene);
        const material = new StandardMaterial("material", scene);
        material.diffuseColor = new Color3(0.2, 0.4, 0.6);
        mesh.material = material;

        const data = await GLTF2Export.GLTFAsync(scene, "material", { exportWithoutWaitingForScene: true });
        const gltf = JSON.parse(data.files["material.gltf"] as string);

        const baseColorFactor = gltf.materials[0].pbrMetallicRoughness.baseColorFactor;
        expect(baseColorFactor[0]).toBeCloseTo(0.0144956, 6);
        expect(baseColorFactor[1]).toBeCloseTo(0.0666043, 6);
        expect(baseColorFactor[2]).toBeCloseTo(0.1625185, 6);
        expect(baseColorFactor[3]).toBe(1);
    });
});
