import { NullEngine } from "core/Engines/nullEngine";
import { PointLight } from "core/Lights/pointLight";
import { CreateBox } from "core/Meshes/Builders/boxBuilder";
import { Matrix, Vector3 } from "core/Maths/math.vector";
import { Scene } from "core/scene";
import { GLTF2Export } from "serializers/glTF/2.0";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "core/Meshes/thinInstanceMesh";

describe("glTF lights and GPU instancing extensions", () => {
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

    it("exports a punctual light and thin instances through registered extensions", async () => {
        const mesh = CreateBox("instances", {}, scene);
        mesh.thinInstanceSetBuffer("matrix", new Float32Array(Matrix.Translation(1, 0, 0).asArray()));
        expect(mesh.hasThinInstances).toBe(true);
        const light = new PointLight("point", Vector3.Zero(), scene);
        light.parent = mesh;

        const data = await GLTF2Export.GLTFAsync(scene, "extensions", { exportWithoutWaitingForScene: true });
        const gltf = JSON.parse(data.files["extensions.gltf"] as string);
        const node = gltf.nodes.find((entry: { name: string }) => entry.name === "instances");

        expect(node.extensions.EXT_mesh_gpu_instancing.attributes.TRANSLATION).toBeDefined();
        expect(gltf.extensions.KHR_lights_punctual.lights).toHaveLength(1);
    });
});
