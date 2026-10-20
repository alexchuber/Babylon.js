import { FreeCamera } from "core/Cameras/freeCamera";
import { NullEngine } from "core/Engines/nullEngine";
import { TransformNode } from "core/Meshes/transformNode";
import { Vector3 } from "core/Maths/math.vector";
import { Scene } from "core/scene";
import { GLTF2Export } from "serializers/glTF/2.0";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("glTF node and camera export", () => {
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

    it("exports parent-child nodes and a camera reference", async () => {
        const parent = new TransformNode("parent", scene);
        const child = new TransformNode("child", scene);
        child.parent = parent;
        const camera = new FreeCamera("camera", Vector3.Zero(), scene);
        camera.parent = child;

        const data = await GLTF2Export.GLTFAsync(scene, "hierarchy", { exportWithoutWaitingForScene: true });
        const gltf = JSON.parse(data.files["hierarchy.gltf"] as string);
        const parentNode = gltf.nodes.find((node: { name: string }) => node.name === "parent");
        const childIndex = gltf.nodes.findIndex((node: { name: string }) => node.name === "child");

        expect(parentNode.children).toContain(childIndex);
        expect(gltf.cameras).toHaveLength(1);
        expect(gltf.nodes.find((node: { name: string }) => node.name === "camera").camera).toBe(0);
    });
});
