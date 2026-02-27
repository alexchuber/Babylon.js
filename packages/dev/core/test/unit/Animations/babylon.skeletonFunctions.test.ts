import { Skeleton } from "core/Bones/skeleton";
import { CreateSkeletonFromTransformNodeHierarchy } from "core/Bones/skeleton.functions";
import { Engine, NullEngine } from "core/Engines";
import { Quaternion, Vector3 } from "core/Maths/math.vector";
import { Mesh } from "core/Meshes/mesh";
import { MeshBuilder } from "core/Meshes/meshBuilder";
import { TransformNode } from "core/Meshes/transformNode";
import { Scene } from "core/scene";

describe("CreateSkeletonFromTransformNodeHierarchy", () => {
    let engine: Engine;
    let scene: Scene;

    beforeEach(() => {
        engine = new NullEngine({
            renderHeight: 256,
            renderWidth: 256,
            textureSize: 256,
            deterministicLockstep: false,
            lockstepMaxSteps: 1,
        });
        scene = new Scene(engine);
    });

    afterEach(() => {
        scene.dispose();
        engine.dispose();
    });

    /**
     * Helper: Creates a simple hierarchy of transform nodes with rotationQuaternion set.
     */
    function createTransformNodeHierarchy(names: string[]): TransformNode[] {
        const nodes: TransformNode[] = [];
        for (let i = 0; i < names.length; i++) {
            const tn = new TransformNode(names[i], scene);
            tn.rotationQuaternion = Quaternion.Identity();
            if (i > 0) {
                tn.parent = nodes[i - 1];
            }
            nodes.push(tn);
        }
        return nodes;
    }

    it("should create a skeleton with bones matching the transform node hierarchy", () => {
        const nodes = createTransformNodeHierarchy(["Hips", "Spine", "Head"]);

        const skeleton = CreateSkeletonFromTransformNodeHierarchy(nodes[0], scene);

        expect(skeleton).toBeInstanceOf(Skeleton);
        expect(skeleton.bones.length).toBe(3);
        expect(skeleton.bones[0].name).toBe("Hips");
        expect(skeleton.bones[1].name).toBe("Spine");
        expect(skeleton.bones[2].name).toBe("Head");
    });

    it("should link bones to their corresponding transform nodes", () => {
        const nodes = createTransformNodeHierarchy(["Hips", "Spine"]);

        const skeleton = CreateSkeletonFromTransformNodeHierarchy(nodes[0], scene);

        expect(skeleton.bones[0]._linkedTransformNode).toBe(nodes[0]);
        expect(skeleton.bones[1]._linkedTransformNode).toBe(nodes[1]);
    });

    it("should preserve parent-child relationships in bones", () => {
        const nodes = createTransformNodeHierarchy(["Hips", "Spine", "Head"]);

        const skeleton = CreateSkeletonFromTransformNodeHierarchy(nodes[0], scene);

        expect(skeleton.bones[0].parent).toBeNull();
        expect(skeleton.bones[1].parent).toBe(skeleton.bones[0]);
        expect(skeleton.bones[2].parent).toBe(skeleton.bones[1]);
    });

    it("should only convert transform nodes with rotationQuaternion set", () => {
        const root = new TransformNode("Hips", scene);
        root.rotationQuaternion = Quaternion.Identity();

        // Child without rotationQuaternion — should be skipped
        const noQuatChild = new TransformNode("NoQuat", scene);
        noQuatChild.parent = root;

        // Child with rotationQuaternion — should become a bone
        const quatChild = new TransformNode("WithQuat", scene);
        quatChild.rotationQuaternion = Quaternion.Identity();
        quatChild.parent = root;

        const skeleton = CreateSkeletonFromTransformNodeHierarchy(root, scene);

        expect(skeleton.bones.length).toBe(2);
        expect(skeleton.bones[0].name).toBe("Hips");
        expect(skeleton.bones[1].name).toBe("WithQuat");
    });

    it("should use custom name when provided", () => {
        const nodes = createTransformNodeHierarchy(["Hips"]);

        const skeleton = CreateSkeletonFromTransformNodeHierarchy(nodes[0], scene, {
            name: "CustomSkeleton",
        });

        expect(skeleton.name).toBe("CustomSkeleton");
    });

    it("should use rootNode name + '_skeleton' as default name", () => {
        const nodes = createTransformNodeHierarchy(["Hips"]);

        const skeleton = CreateSkeletonFromTransformNodeHierarchy(nodes[0], scene);

        expect(skeleton.name).toBe("Hips_skeleton");
    });

    it("should attach skeleton to existing mesh when mesh option is provided", () => {
        const nodes = createTransformNodeHierarchy(["Hips", "Spine"]);
        const mesh = MeshBuilder.CreateBox("targetMesh", { size: 1 }, scene);

        const skeleton = CreateSkeletonFromTransformNodeHierarchy(nodes[0], scene, {
            mesh,
        });

        expect(mesh.skeleton).toBe(skeleton);
    });

    it("should create a visualization mesh when createMesh is true", () => {
        const nodes = createTransformNodeHierarchy(["Hips", "Spine"]);
        const options: { createMesh: boolean; mesh?: Mesh } = { createMesh: true };

        const skeleton = CreateSkeletonFromTransformNodeHierarchy(nodes[0], scene, options);

        expect(options.mesh).toBeDefined();
        expect(options.mesh).toBeInstanceOf(Mesh);
        expect(options.mesh!.skeleton).toBe(skeleton);
    });

    it("should skip Mesh nodes (only TransformNode class)", () => {
        const root = new TransformNode("Root", scene);
        root.rotationQuaternion = Quaternion.Identity();

        // Mesh subclass — should be skipped even with rotationQuaternion
        const meshChild = MeshBuilder.CreateBox("MeshChild", { size: 1 }, scene);
        meshChild.rotationQuaternion = Quaternion.Identity();
        meshChild.parent = root;

        const skeleton = CreateSkeletonFromTransformNodeHierarchy(root, scene);

        expect(skeleton.bones.length).toBe(1);
        expect(skeleton.bones[0].name).toBe("Root");
    });
});
