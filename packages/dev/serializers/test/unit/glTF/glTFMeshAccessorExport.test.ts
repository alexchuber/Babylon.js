import { NullEngine } from "core/Engines/nullEngine";
import { CreateBox } from "core/Meshes/Builders/boxBuilder";
import { Scene } from "core/scene";
import { GLTF2Export } from "serializers/glTF/2.0";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("glTF mesh accessor export", () => {
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

    it("exports box primitive attributes, indices, and backing buffer", async () => {
        CreateBox("box", {}, scene);

        const data = await GLTF2Export.GLTFAsync(scene, "mesh", { exportWithoutWaitingForScene: true });
        const gltf = JSON.parse(data.files["mesh.gltf"] as string);
        const primitive = gltf.meshes[0].primitives[0];

        expect(primitive.attributes.POSITION).toBeDefined();
        expect(primitive.indices).toBeDefined();
        expect(gltf.accessors[primitive.attributes.POSITION].count).toBeGreaterThan(0);
        expect(data.files["mesh.bin"]).toBeDefined();
    });
});
