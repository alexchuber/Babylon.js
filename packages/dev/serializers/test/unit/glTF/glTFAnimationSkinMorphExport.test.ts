import { Animation } from "core/Animations/animation";
import { AnimationGroup } from "core/Animations/animationGroup";
import { Bone } from "core/Bones/bone";
import { Skeleton } from "core/Bones/skeleton";
import { NullEngine } from "core/Engines/nullEngine";
import { VertexBuffer } from "core/Buffers/buffer";
import { Matrix, Vector3 } from "core/Maths/math.vector";
import { CreateBox } from "core/Meshes/Builders/boxBuilder";
import { TransformNode } from "core/Meshes/transformNode";
import { MorphTarget } from "core/Morph/morphTarget";
import { MorphTargetManager } from "core/Morph/morphTargetManager";
import { Scene } from "core/scene";
import { GLTF2Export } from "serializers/glTF/2.0";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("glTF animation, skin, and morph export", () => {
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

    it("exports a targeted node animation", async () => {
        const node = CreateBox("animated", {}, scene);
        const group = new AnimationGroup("move", scene);
        const animation = new Animation("position", "position", 30, Animation.ANIMATIONTYPE_VECTOR3);
        animation.setKeys([
            { frame: 0, value: Vector3.Zero() },
            { frame: 30, value: new Vector3(1, 0, 0) },
        ]);
        group.addTargetedAnimation(animation, node);

        const data = await GLTF2Export.GLTFAsync(scene, "animation", { exportWithoutWaitingForScene: true });
        const gltf = JSON.parse(data.files["animation.gltf"] as string);

        expect(gltf.animations).toHaveLength(1);
        expect(gltf.animations[0].channels).toHaveLength(1);
    });

    it("exports a skeleton and morph target on a mesh", async () => {
        const mesh = CreateBox("deformable", {}, scene);
        const skeleton = new Skeleton("skeleton", "skeleton", scene);
        const root = new TransformNode("root", scene);
        const bone = new Bone("root", skeleton, null, Matrix.Identity());
        bone.linkTransformNode(root);
        skeleton.prepare(true);
        const vertexCount = mesh.getTotalVertices();
        const indices = new Float32Array(vertexCount * 4);
        const weights = new Float32Array(vertexCount * 4);
        for (let index = 0; index < vertexCount; index++) {
            weights[index * 4] = 1;
        }
        mesh.setVerticesData(VertexBuffer.MatricesIndicesKind, indices);
        mesh.setVerticesData(VertexBuffer.MatricesWeightsKind, weights);
        mesh.skeleton = skeleton;

        const basePositions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
        const target = new MorphTarget("raised", 0, scene);
        target.setPositions(new Float32Array(Array.from(basePositions, (value, index) => value + (index % 3 === 1 ? 0.1 : 0))));
        const manager = new MorphTargetManager(scene);
        manager.addTarget(target);
        mesh.morphTargetManager = manager;

        const data = await GLTF2Export.GLTFAsync(scene, "deformation", { exportWithoutWaitingForScene: true });
        const gltf = JSON.parse(data.files["deformation.gltf"] as string);

        expect(gltf.skins).toHaveLength(1);
        expect(gltf.meshes[0].primitives[0].targets).toHaveLength(1);
    });
});
