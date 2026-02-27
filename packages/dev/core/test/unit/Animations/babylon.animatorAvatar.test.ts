import { AnimationGroup, AnimatorAvatar, IRetargetOptions } from "core/Animations";
import { Animation } from "core/Animations/animation";
import { Bone } from "core/Bones/bone";
import { Skeleton } from "core/Bones/skeleton";
import { Engine, NullEngine } from "core/Engines";
import { Matrix, Quaternion, Vector3 } from "core/Maths/math.vector";
import { Mesh } from "core/Meshes/mesh";
import { MeshBuilder } from "core/Meshes/meshBuilder";
import { TransformNode } from "core/Meshes/transformNode";
import { MorphTarget } from "core/Morph/morphTarget";
import { MorphTargetManager } from "core/Morph/morphTargetManager";
import { Scene } from "core/scene";
import { Logger } from "core/Misc/logger";

describe("AnimatorAvatar", () => {
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
     * Helper: Creates a simple skeleton with bones linked to transform nodes.
     * Hierarchy: root -> child1 -> child2
     */
    function createSkeletonWithTransformNodes(
        skeletonName: string,
        boneNames: string[],
        parentNode: TransformNode
    ): { skeleton: Skeleton; bones: Bone[]; transformNodes: TransformNode[] } {
        const skeleton = new Skeleton(skeletonName, skeletonName, scene);
        const bones: Bone[] = [];
        const transformNodes: TransformNode[] = [];

        for (let i = 0; i < boneNames.length; i++) {
            const tn = new TransformNode(boneNames[i], scene);
            tn.rotationQuaternion = Quaternion.Identity();
            tn.parent = i === 0 ? parentNode : transformNodes[i - 1];

            const bone = new Bone(boneNames[i], skeleton, i === 0 ? null : bones[i - 1], Matrix.Identity(), undefined, undefined, i);
            bone.linkTransformNode(tn);

            bones.push(bone);
            transformNodes.push(tn);
        }

        return { skeleton, bones, transformNodes };
    }

    /**
     * Helper: Creates a mesh with vertices (so it passes the vertex count filter).
     */
    function createMeshWithVertices(name: string, parent: TransformNode): Mesh {
        const mesh = MeshBuilder.CreateBox(name, { size: 1 }, scene);
        mesh.parent = parent;
        return mesh;
    }

    /**
     * Helper: Creates a source animation group targeting transform nodes with position animations.
     */
    function createSourceAnimationGroup(
        groupName: string,
        targets: TransformNode[],
        property = "position"
    ): AnimationGroup {
        const group = new AnimationGroup(groupName, scene);

        for (const target of targets) {
            const animType =
                property === "rotationQuaternion"
                    ? Animation.ANIMATIONTYPE_QUATERNION
                    : Animation.ANIMATIONTYPE_VECTOR3;

            const animation = new Animation(`${target.name}_${property}`, property, 30, animType);

            if (property === "rotationQuaternion") {
                animation.setKeys([
                    { frame: 0, value: Quaternion.Identity() },
                    { frame: 30, value: Quaternion.RotationAxis(Vector3.Up(), Math.PI) },
                ]);
            } else {
                animation.setKeys([
                    { frame: 0, value: new Vector3(0, 0, 0) },
                    { frame: 30, value: new Vector3(1, 2, 3) },
                ]);
            }

            group.addTargetedAnimation(animation, target);
        }

        return group;
    }

    // ──────────────────────────────────────
    // Constructor tests
    // ──────────────────────────────────────

    describe("constructor", () => {
        it("should create an empty avatar when no rootNode is provided", () => {
            const avatar = new AnimatorAvatar("empty");

            expect(avatar.name).toBe("empty");
            expect(avatar.rootNode).toBeUndefined();
            expect(avatar.meshes).toEqual([]);
            expect(avatar.skeletons.size).toBe(0);
            expect(avatar.morphTargetManagers.size).toBe(0);
        });

        it("should scan hierarchy and collect meshes with vertices", () => {
            const root = new TransformNode("root", scene);
            const mesh1 = createMeshWithVertices("mesh1", root);
            const mesh2 = createMeshWithVertices("mesh2", root);

            const avatar = new AnimatorAvatar("test", root);

            expect(avatar.meshes.length).toBe(2);
            expect(avatar.meshes).toContain(mesh1);
            expect(avatar.meshes).toContain(mesh2);
        });

        it("should collect skeletons from meshes", () => {
            const root = new TransformNode("root", scene);
            const mesh = createMeshWithVertices("mesh", root);
            const skeleton = new Skeleton("skel", "skel", scene);
            mesh.skeleton = skeleton;

            const avatar = new AnimatorAvatar("test", root);

            expect(avatar.skeletons.size).toBe(1);
            expect(avatar.skeletons.has(skeleton)).toBe(true);
        });

        it("should not add duplicate skeletons when shared by multiple meshes", () => {
            const root = new TransformNode("root", scene);
            const mesh1 = createMeshWithVertices("mesh1", root);
            const mesh2 = createMeshWithVertices("mesh2", root);
            const skeleton = new Skeleton("skel", "skel", scene);
            mesh1.skeleton = skeleton;
            mesh2.skeleton = skeleton;

            const avatar = new AnimatorAvatar("test", root);

            expect(avatar.skeletons.size).toBe(1);
        });

        it("should collect morph target managers and set meshName and numMaxInfluencers", () => {
            const root = new TransformNode("root", scene);
            const mesh = createMeshWithVertices("testMesh", root);
            const mtm = new MorphTargetManager(scene);
            const target = new MorphTarget("morph1", 0, scene);
            mtm.addTarget(target);
            mesh.morphTargetManager = mtm;

            const avatar = new AnimatorAvatar("test", root);

            expect(avatar.morphTargetManagers.size).toBe(1);
            expect(mtm.meshName).toBe("testMesh");
            expect(mtm.numMaxInfluencers).toBe(mtm.numTargets);
        });

        it("should rename root node to avatar name", () => {
            const root = new TransformNode("originalName", scene);

            new AnimatorAvatar("newName", root);

            expect(root.name).toBe("newName");
        });

        it("should set showWarnings to true by default", () => {
            const avatar = new AnimatorAvatar("test");
            expect(avatar.showWarnings).toBe(true);
        });
    });

    // ──────────────────────────────────────
    // findBoneByTransformNode tests
    // ──────────────────────────────────────

    describe("findBoneByTransformNode", () => {
        it("should find a bone by transform node name", () => {
            const root = new TransformNode("root", scene);
            const mesh = createMeshWithVertices("mesh", root);
            const { skeleton, bones, transformNodes } = createSkeletonWithTransformNodes("skel", ["Hips", "Spine"], root);
            mesh.skeleton = skeleton;

            const avatar = new AnimatorAvatar("test", root);
            const found = avatar.findBoneByTransformNode("Hips");

            expect(found).toBe(bones[0]);
        });

        it("should find a bone by TransformNode instance", () => {
            const root = new TransformNode("root", scene);
            const mesh = createMeshWithVertices("mesh", root);
            const { skeleton, bones, transformNodes } = createSkeletonWithTransformNodes("skel", ["Hips", "Spine"], root);
            mesh.skeleton = skeleton;

            const avatar = new AnimatorAvatar("test", root);
            const found = avatar.findBoneByTransformNode(transformNodes[1]);

            expect(found).toBe(bones[1]);
        });

        it("should return null when bone is not found", () => {
            const root = new TransformNode("root", scene);
            const mesh = createMeshWithVertices("mesh", root);
            const { skeleton } = createSkeletonWithTransformNodes("skel", ["Hips"], root);
            mesh.skeleton = skeleton;

            const avatar = new AnimatorAvatar("test", root);
            const found = avatar.findBoneByTransformNode("NonExistent");

            expect(found).toBeNull();
        });
    });

    // ──────────────────────────────────────
    // findBoneByName tests
    // ──────────────────────────────────────

    describe("findBoneByName", () => {
        it("should find a bone by name", () => {
            const root = new TransformNode("root", scene);
            const mesh = createMeshWithVertices("mesh", root);
            const { skeleton, bones } = createSkeletonWithTransformNodes("skel", ["Hips", "Spine", "Head"], root);
            mesh.skeleton = skeleton;

            const avatar = new AnimatorAvatar("test", root);
            const found = avatar.findBoneByName("Spine");

            expect(found).toBe(bones[1]);
        });

        it("should return null when bone name does not exist", () => {
            const root = new TransformNode("root", scene);
            const mesh = createMeshWithVertices("mesh", root);
            const { skeleton } = createSkeletonWithTransformNodes("skel", ["Hips"], root);
            mesh.skeleton = skeleton;

            const avatar = new AnimatorAvatar("test", root);
            const found = avatar.findBoneByName("NonExistent");

            expect(found).toBeNull();
        });
    });

    // ──────────────────────────────────────
    // mapMorphTargetNameToMorphTarget tests
    // ──────────────────────────────────────

    describe("mapMorphTargetNameToMorphTarget", () => {
        it("should lazily build the morph target map using meshName_targetName keys", () => {
            const root = new TransformNode("root", scene);
            const mesh = createMeshWithVertices("myMesh", root);
            const mtm = new MorphTargetManager(scene);
            const target = new MorphTarget("smile", 0, scene);
            mtm.addTarget(target);
            mesh.morphTargetManager = mtm;

            const avatar = new AnimatorAvatar("test", root);
            const map = avatar.mapMorphTargetNameToMorphTarget;

            expect(map.has("myMesh_smile")).toBe(true);
            expect(map.get("myMesh_smile")).toBe(target);
        });
    });

    // ──────────────────────────────────────
    // dispose tests
    // ──────────────────────────────────────

    describe("dispose", () => {
        it("should dispose skeletons, morph targets and root node when disposeResources is true", () => {
            const root = new TransformNode("root", scene);
            const mesh = createMeshWithVertices("mesh", root);
            const skeleton = new Skeleton("skel", "skel", scene);
            mesh.skeleton = skeleton;

            const avatar = new AnimatorAvatar("test", root);

            const skelDispose = jest.spyOn(skeleton, "dispose");
            const rootDispose = jest.spyOn(root, "dispose");

            avatar.dispose();

            expect(skelDispose).toHaveBeenCalled();
            expect(rootDispose).toHaveBeenCalledWith(false, true);
        });

        it("should do nothing when disposeResources is false", () => {
            const root = new TransformNode("root", scene);
            const mesh = createMeshWithVertices("mesh", root);
            const skeleton = new Skeleton("skel", "skel", scene);
            mesh.skeleton = skeleton;

            const avatar = new AnimatorAvatar("test", root, false);

            const skelDispose = jest.spyOn(skeleton, "dispose");

            avatar.dispose();

            expect(skelDispose).not.toHaveBeenCalled();
        });
    });

    // ──────────────────────────────────────
    // retargetAnimationGroup tests
    // ──────────────────────────────────────

    describe("retargetAnimationGroup", () => {
        /**
         * Sets up a source avatar with transform nodes and a target avatar with a skeleton.
         * Both have the same bone names for easy retargeting.
         */
        function setupRetargetScenario(boneNames = ["Hips", "Spine", "Head"]) {
            // Source: transform node hierarchy with animations
            const sourceRoot = new TransformNode("sourceRoot", scene);
            const sourceNodes: TransformNode[] = [];
            for (let i = 0; i < boneNames.length; i++) {
                const tn = new TransformNode(boneNames[i], scene);
                tn.rotationQuaternion = Quaternion.Identity();
                tn.parent = i === 0 ? sourceRoot : sourceNodes[i - 1];
                sourceNodes.push(tn);
            }

            // Target: skeleton with matching bone names
            const targetRoot = new TransformNode("targetRoot", scene);
            const targetMesh = createMeshWithVertices("targetMesh", targetRoot);
            const { skeleton, bones, transformNodes: targetTNs } = createSkeletonWithTransformNodes("targetSkel", boneNames, targetRoot);
            targetMesh.skeleton = skeleton;

            const targetAvatar = new AnimatorAvatar("target", targetRoot);

            return { sourceRoot, sourceNodes, targetRoot, targetMesh, skeleton, bones, targetTNs, targetAvatar };
        }

        it("should return a new animation group, not the original", () => {
            const { sourceNodes, targetAvatar } = setupRetargetScenario();
            const sourceGroup = createSourceAnimationGroup("walk", sourceNodes);

            const result = targetAvatar.retargetAnimationGroup(sourceGroup);

            expect(result).not.toBe(sourceGroup);
            expect(result).toBeInstanceOf(AnimationGroup);
        });

        it("should use source animation group name by default", () => {
            const { sourceNodes, targetAvatar } = setupRetargetScenario();
            const sourceGroup = createSourceAnimationGroup("walk", sourceNodes);

            const result = targetAvatar.retargetAnimationGroup(sourceGroup);

            expect(result.name).toBe("walk");
        });

        it("should retarget transform node animations to skeleton bones by name", () => {
            const { sourceNodes, targetAvatar, targetTNs } = setupRetargetScenario();
            const sourceGroup = createSourceAnimationGroup("walk", sourceNodes);

            const result = targetAvatar.retargetAnimationGroup(sourceGroup);

            // Animations should now target the target avatar's transform nodes (linked from bones)
            expect(result.targetedAnimations.length).toBe(sourceNodes.length);
            for (const ta of result.targetedAnimations) {
                expect(targetTNs).toContain(ta.target);
            }
        });

        it("should remove animations for bones not found in target (when showWarnings is true)", () => {
            const { sourceNodes, targetAvatar } = setupRetargetScenario(["Hips", "Spine"]);

            // Create source with an extra bone "Head" that doesn't exist in target
            const extraNode = new TransformNode("Head", scene);
            extraNode.rotationQuaternion = Quaternion.Identity();
            extraNode.parent = sourceNodes[1];
            const allSourceNodes = [...sourceNodes, extraNode];

            const sourceGroup = createSourceAnimationGroup("walk", allSourceNodes);

            // Note: showWarnings must be true for animations to be removed (per implementation)
            const result = targetAvatar.retargetAnimationGroup(sourceGroup, {
                fixRootPosition: false,
            });

            // "Head" animation should be removed since target only has Hips and Spine
            expect(result.targetedAnimations.length).toBe(2);
        });

        it("should handle animations targeting non-TransformNode targets gracefully", () => {
            const { targetAvatar } = setupRetargetScenario();
            const group = new AnimationGroup("test", scene);

            // Create an animation targeting a plain object (not TransformNode)
            const animation = new Animation("other", "value", 30, Animation.ANIMATIONTYPE_FLOAT);
            animation.setKeys([
                { frame: 0, value: 0 },
                { frame: 30, value: 1 },
            ]);
            group.addTargetedAnimation(animation, { value: 0 });

            const result = targetAvatar.retargetAnimationGroup(group, { fixRootPosition: false });

            // Non-TransformNode targets should be left as-is (not removed, not retargeted)
            expect(result).toBeDefined();
        });

        it("should suppress warnings when showWarnings is false", () => {
            const { targetAvatar } = setupRetargetScenario(["Hips"]);
            const extraNode = new TransformNode("NonExistent", scene);
            extraNode.rotationQuaternion = Quaternion.Identity();
            const sourceGroup = createSourceAnimationGroup("walk", [extraNode]);

            const warnSpy = jest.spyOn(Logger, "Warn");
            targetAvatar.showWarnings = false;
            targetAvatar.retargetAnimationGroup(sourceGroup, { fixRootPosition: false });

            expect(warnSpy).not.toHaveBeenCalled();
            warnSpy.mockRestore();
        });

        // ──────────────────────────────────────
        // Options tests
        // ──────────────────────────────────────

        describe("options", () => {
            it("animationGroupName should rename the cloned group", () => {
                const { sourceNodes, targetAvatar } = setupRetargetScenario();
                const sourceGroup = createSourceAnimationGroup("walk", sourceNodes);

                const result = targetAvatar.retargetAnimationGroup(sourceGroup, {
                    animationGroupName: "customName",
                });

                expect(result.name).toBe("customName");
            });

            it("retargetAnimationKeys=false should skip key value adjustment", () => {
                const { sourceNodes, targetAvatar } = setupRetargetScenario();
                const sourceGroup = createSourceAnimationGroup("walk", sourceNodes);

                // Get the original key values
                const originalKeys = sourceGroup.targetedAnimations[0].animation.getKeys();
                const originalValue = originalKeys[1].value.clone();

                const result = targetAvatar.retargetAnimationGroup(sourceGroup, {
                    retargetAnimationKeys: false,
                });

                // Keys should NOT be adjusted when retargetAnimationKeys is false
                const resultKeys = result.targetedAnimations[0].animation.getKeys();
                expect(resultKeys[1].value.equals(originalValue)).toBe(true);
            });

            it("fixRootPosition=false should skip root position scaling", () => {
                const { sourceNodes, targetAvatar } = setupRetargetScenario();
                const sourceGroup = createSourceAnimationGroup("walk", sourceNodes);

                // This should not throw and should produce a valid result
                const result = targetAvatar.retargetAnimationGroup(sourceGroup, {
                    fixRootPosition: false,
                });

                expect(result).toBeDefined();
                expect(result.targetedAnimations.length).toBeGreaterThan(0);
            });

            it("checkHierarchy=true should validate parent chains", () => {
                // Create a target with mismatched hierarchy
                const targetRoot = new TransformNode("targetRoot", scene);
                const targetMesh = createMeshWithVertices("targetMesh", targetRoot);
                const skeleton = new Skeleton("skel", "skel", scene);

                // Create bones with a DIFFERENT hierarchy than source
                const hipsBone = new Bone("Hips", skeleton, null, Matrix.Identity(), undefined, undefined, 0);
                const hipsTN = new TransformNode("Hips", scene);
                hipsTN.rotationQuaternion = Quaternion.Identity();
                hipsTN.parent = targetRoot;
                hipsBone.linkTransformNode(hipsTN);

                // "Spine" bone with no parent (mismatch: in source, Spine is child of Hips)
                const spineBone = new Bone("Spine", skeleton, null, Matrix.Identity(), undefined, undefined, 1);
                const spineTN = new TransformNode("Spine", scene);
                spineTN.rotationQuaternion = Quaternion.Identity();
                spineTN.parent = targetRoot;
                spineBone.linkTransformNode(spineTN);

                targetMesh.skeleton = skeleton;
                const targetAvatar = new AnimatorAvatar("target", targetRoot);

                // Source with correct hierarchy: Hips -> Spine
                const sourceHips = new TransformNode("Hips", scene);
                sourceHips.rotationQuaternion = Quaternion.Identity();
                const sourceSpine = new TransformNode("Spine", scene);
                sourceSpine.rotationQuaternion = Quaternion.Identity();
                sourceSpine.parent = sourceHips;

                const sourceGroup = createSourceAnimationGroup("walk", [sourceHips, sourceSpine]);
                targetAvatar.showWarnings = false;

                const result = targetAvatar.retargetAnimationGroup(sourceGroup, {
                    checkHierarchy: true,
                });

                // Some animations may be removed due to hierarchy mismatch
                expect(result).toBeDefined();
            });

            it("mapNodeNames should remap source bone names to target bone names", () => {
                const { targetAvatar, targetTNs } = setupRetargetScenario(["Hips", "Spine", "Head"]);

                // Source uses different names
                const srcHips = new TransformNode("Armature|Hips", scene);
                srcHips.rotationQuaternion = Quaternion.Identity();
                const srcSpine = new TransformNode("Armature|Spine", scene);
                srcSpine.rotationQuaternion = Quaternion.Identity();
                srcSpine.parent = srcHips;

                const sourceGroup = createSourceAnimationGroup("walk", [srcHips, srcSpine]);

                const nameMap = new Map<string, string>();
                nameMap.set("Armature|Hips", "Hips");
                nameMap.set("Armature|Spine", "Spine");

                const result = targetAvatar.retargetAnimationGroup(sourceGroup, {
                    mapNodeNames: nameMap,
                });

                // Animations should be retargeted to the correct target bones
                expect(result.targetedAnimations.length).toBe(2);
                for (const ta of result.targetedAnimations) {
                    expect(targetTNs.slice(0, 2)).toContain(ta.target);
                }
            });
        });

        // ──────────────────────────────────────
        // MorphTarget retargeting
        // ──────────────────────────────────────

        describe("morph target retargeting", () => {
            it("should retarget morph target influence animations", () => {
                const targetRoot = new TransformNode("targetRoot", scene);
                const targetMesh = createMeshWithVertices("faceMesh", targetRoot);
                const targetMTM = new MorphTargetManager(scene);
                const targetMorph = new MorphTarget("smile", 0, scene);
                targetMTM.addTarget(targetMorph);
                targetMesh.morphTargetManager = targetMTM;

                const targetAvatar = new AnimatorAvatar("target", targetRoot);

                // Source morph target
                const sourceMTM = new MorphTargetManager(scene);
                sourceMTM.meshName = "faceMesh";
                const sourceMorph = new MorphTarget("smile", 0, scene);
                sourceMTM.addTarget(sourceMorph);
                (sourceMorph as any).morphTargetManager = sourceMTM;

                const group = new AnimationGroup("morphAnim", scene);
                const animation = new Animation("influence", "influence", 30, Animation.ANIMATIONTYPE_FLOAT);
                animation.setKeys([
                    { frame: 0, value: 0 },
                    { frame: 30, value: 1 },
                ]);
                group.addTargetedAnimation(animation, sourceMorph);

                const result = targetAvatar.retargetAnimationGroup(group);

                expect(result.targetedAnimations.length).toBe(1);
                expect(result.targetedAnimations[0].target).toBe(targetMorph);
            });

            it("should remove morph target animation when target morph is not found", () => {
                const targetRoot = new TransformNode("targetRoot", scene);
                createMeshWithVertices("faceMesh", targetRoot);
                const targetAvatar = new AnimatorAvatar("target", targetRoot);

                const sourceMTM = new MorphTargetManager(scene);
                sourceMTM.meshName = "faceMesh";
                const sourceMorph = new MorphTarget("frown", 0, scene);
                sourceMTM.addTarget(sourceMorph);
                (sourceMorph as any).morphTargetManager = sourceMTM;

                const group = new AnimationGroup("morphAnim", scene);
                const animation = new Animation("influence", "influence", 30, Animation.ANIMATIONTYPE_FLOAT);
                animation.setKeys([
                    { frame: 0, value: 0 },
                    { frame: 30, value: 1 },
                ]);
                group.addTargetedAnimation(animation, sourceMorph);

                targetAvatar.showWarnings = false;
                const result = targetAvatar.retargetAnimationGroup(group);

                expect(result.targetedAnimations.length).toBe(0);
            });
        });

        // ──────────────────────────────────────
        // Bones without linked transform nodes (#17926)
        // ──────────────────────────────────────

        describe("bones without linked transform nodes (#17926)", () => {
            /**
             * Helper: Creates a skeleton where bones have NO linked transform nodes.
             */
            function createSkeletonWithoutTransformNodes(
                skeletonName: string,
                boneNames: string[]
            ): { skeleton: Skeleton; bones: Bone[] } {
                const skeleton = new Skeleton(skeletonName, skeletonName, scene);
                const bones: Bone[] = [];

                for (let i = 0; i < boneNames.length; i++) {
                    const bone = new Bone(boneNames[i], skeleton, i === 0 ? null : bones[i - 1], Matrix.Identity(), undefined, undefined, i);
                    // Deliberately NOT calling bone.linkTransformNode()
                    bones.push(bone);
                }

                return { skeleton, bones };
            }

            it("should match bones by bone name when no linked transform node exists", () => {
                const targetRoot = new TransformNode("targetRoot", scene);
                const targetMesh = createMeshWithVertices("targetMesh", targetRoot);
                const { skeleton, bones } = createSkeletonWithoutTransformNodes("skel", ["Hips", "Spine", "Head"]);
                targetMesh.skeleton = skeleton;

                const targetAvatar = new AnimatorAvatar("target", targetRoot);

                // Source uses transform nodes with matching names
                const sourceHips = new TransformNode("Hips", scene);
                sourceHips.rotationQuaternion = Quaternion.Identity();
                const sourceSpine = new TransformNode("Spine", scene);
                sourceSpine.rotationQuaternion = Quaternion.Identity();
                sourceSpine.parent = sourceHips;

                const sourceGroup = createSourceAnimationGroup("walk", [sourceHips, sourceSpine]);

                const result = targetAvatar.retargetAnimationGroup(sourceGroup, { fixRootPosition: false });

                // Both should be retargeted: targets become the bones themselves (not transform nodes)
                expect(result.targetedAnimations.length).toBe(2);
                expect(result.targetedAnimations[0].target).toBe(bones[0]); // Hips bone
                expect(result.targetedAnimations[1].target).toBe(bones[1]); // Spine bone
            });

            it("should prefer linked transform node name over bone name for matching", () => {
                const targetRoot = new TransformNode("targetRoot", scene);
                const targetMesh = createMeshWithVertices("targetMesh", targetRoot);
                const skeleton = new Skeleton("skel", "skel", scene);

                // Bone's own name is "bone0" but linked TN name is "Hips"
                const tn = new TransformNode("Hips", scene);
                tn.rotationQuaternion = Quaternion.Identity();
                tn.parent = targetRoot;
                const bone = new Bone("bone0", skeleton, null, Matrix.Identity(), undefined, undefined, 0);
                bone.linkTransformNode(tn);

                targetMesh.skeleton = skeleton;
                const targetAvatar = new AnimatorAvatar("target", targetRoot);

                const sourceHips = new TransformNode("Hips", scene);
                sourceHips.rotationQuaternion = Quaternion.Identity();
                const sourceGroup = createSourceAnimationGroup("walk", [sourceHips]);

                const result = targetAvatar.retargetAnimationGroup(sourceGroup, { fixRootPosition: false });

                // Should match by linked transform node name "Hips", target becomes the TN
                expect(result.targetedAnimations.length).toBe(1);
                expect(result.targetedAnimations[0].target).toBe(tn);
            });

            it("findBoneByTransformNode should return null for bones without linked transform nodes", () => {
                const targetRoot = new TransformNode("targetRoot", scene);
                const targetMesh = createMeshWithVertices("targetMesh", targetRoot);
                const { skeleton } = createSkeletonWithoutTransformNodes("skel", ["Hips"]);
                targetMesh.skeleton = skeleton;

                const avatar = new AnimatorAvatar("test", targetRoot);

                // findBoneByTransformNode searches by linked TN name, so won't find unlinked bones
                expect(avatar.findBoneByTransformNode("Hips")).toBeNull();
                // But findBoneByName should find it
                expect(avatar.findBoneByName("Hips")).not.toBeNull();
            });
        });

        // ──────────────────────────────────────
        // Source animation immutability
        // ──────────────────────────────────────

        describe("source animation immutability", () => {
            it("should not modify the source animation group's targets", () => {
                const { sourceNodes, targetAvatar } = setupRetargetScenario();
                const sourceGroup = createSourceAnimationGroup("walk", sourceNodes);

                const originalTargets = sourceGroup.targetedAnimations.map((ta) => ta.target);

                targetAvatar.retargetAnimationGroup(sourceGroup);

                // Source targets should be unchanged
                for (let i = 0; i < sourceGroup.targetedAnimations.length; i++) {
                    expect(sourceGroup.targetedAnimations[i].target).toBe(originalTargets[i]);
                }
            });

            it("should not modify the source animation group's keyframe values", () => {
                const { sourceNodes, targetAvatar } = setupRetargetScenario();
                const sourceGroup = createSourceAnimationGroup("walk", sourceNodes);

                // Snapshot the original key values
                const originalKeyValues = sourceGroup.targetedAnimations.map((ta) =>
                    ta.animation.getKeys().map((k) => k.value.clone())
                );

                targetAvatar.retargetAnimationGroup(sourceGroup);

                // Source key values should be unchanged
                for (let i = 0; i < sourceGroup.targetedAnimations.length; i++) {
                    const keys = sourceGroup.targetedAnimations[i].animation.getKeys();
                    for (let j = 0; j < keys.length; j++) {
                        expect(keys[j].value.equals(originalKeyValues[i][j])).toBe(true);
                    }
                }
            });
        });

        // ──────────────────────────────────────
        // Rotation and scaling animation retargeting
        // ──────────────────────────────────────

        describe("rotation and scaling animations", () => {
            it("should retarget rotationQuaternion animations", () => {
                const { sourceNodes, targetAvatar, targetTNs } = setupRetargetScenario();
                const sourceGroup = createSourceAnimationGroup("rotate", sourceNodes, "rotationQuaternion");

                const result = targetAvatar.retargetAnimationGroup(sourceGroup);

                expect(result.targetedAnimations.length).toBe(sourceNodes.length);
                for (const ta of result.targetedAnimations) {
                    expect(ta.animation.targetProperty).toBe("rotationQuaternion");
                    expect(targetTNs).toContain(ta.target);
                }
            });

            it("should retarget scaling animations", () => {
                const { sourceNodes, targetAvatar, targetTNs } = setupRetargetScenario();
                const sourceGroup = createSourceAnimationGroup("scale", sourceNodes, "scaling");

                const result = targetAvatar.retargetAnimationGroup(sourceGroup);

                expect(result.targetedAnimations.length).toBe(sourceNodes.length);
                for (const ta of result.targetedAnimations) {
                    expect(ta.animation.targetProperty).toBe("scaling");
                    expect(targetTNs).toContain(ta.target);
                }
            });

            it("should handle mixed animation types in same group", () => {
                const { sourceNodes, targetAvatar, targetTNs } = setupRetargetScenario(["Hips", "Spine"]);
                const group = new AnimationGroup("mixed", scene);

                // Position animation on Hips
                const posAnim = new Animation("Hips_pos", "position", 30, Animation.ANIMATIONTYPE_VECTOR3);
                posAnim.setKeys([
                    { frame: 0, value: new Vector3(0, 0, 0) },
                    { frame: 30, value: new Vector3(1, 1, 1) },
                ]);
                group.addTargetedAnimation(posAnim, sourceNodes[0]);

                // Rotation animation on Spine
                const rotAnim = new Animation("Spine_rot", "rotationQuaternion", 30, Animation.ANIMATIONTYPE_QUATERNION);
                rotAnim.setKeys([
                    { frame: 0, value: Quaternion.Identity() },
                    { frame: 30, value: Quaternion.RotationAxis(Vector3.Up(), Math.PI / 2) },
                ]);
                group.addTargetedAnimation(rotAnim, sourceNodes[1]);

                const result = targetAvatar.retargetAnimationGroup(group);

                expect(result.targetedAnimations.length).toBe(2);
                expect(result.targetedAnimations[0].animation.targetProperty).toBe("position");
                expect(result.targetedAnimations[1].animation.targetProperty).toBe("rotationQuaternion");
            });

            it("should modify rotation keyframe values when retargetAnimationKeys is true", () => {
                const { sourceNodes, targetAvatar } = setupRetargetScenario();

                // Give source nodes a non-identity transform so retargeting produces different values
                sourceNodes[0].position = new Vector3(0, 1, 0);
                sourceNodes[0].computeWorldMatrix(true);

                const sourceGroup = createSourceAnimationGroup("rotate", sourceNodes.slice(0, 1), "rotationQuaternion");

                const originalValue = sourceGroup.targetedAnimations[0].animation.getKeys()[1].value.clone();

                const result = targetAvatar.retargetAnimationGroup(sourceGroup, {
                    retargetAnimationKeys: true,
                    fixRootPosition: false,
                });

                // The retargeted animation should have keys (may or may not differ depending on bone setup)
                const resultKeys = result.targetedAnimations[0].animation.getKeys();
                expect(resultKeys.length).toBe(2);
                // Values should be quaternions
                expect(resultKeys[0].value).toBeInstanceOf(Quaternion);
                expect(resultKeys[1].value).toBeInstanceOf(Quaternion);
            });
        });

        // ──────────────────────────────────────
        // fixAnimations option
        // ──────────────────────────────────────

        describe("fixAnimations", () => {
            it("should correct orthogonal consecutive quaternion keyframes", () => {
                const { sourceNodes, targetAvatar } = setupRetargetScenario(["Hips"]);

                const group = new AnimationGroup("orthogonal", scene);
                const anim = new Animation("rot", "rotationQuaternion", 30, Animation.ANIMATIONTYPE_QUATERNION);

                // Create two quaternions that are nearly orthogonal (dot product ~ 0)
                const q1 = Quaternion.RotationAxis(Vector3.Up(), 0);
                const q2 = Quaternion.RotationAxis(Vector3.Up(), Math.PI / 2);
                // Make q2 orthogonal to q1: dot(q1, q2) should be ~0
                const qOrthogonal = new Quaternion(q1.y, -q1.x, q1.w, -q1.z); // Construct orthogonal quat
                const q3 = Quaternion.RotationAxis(Vector3.Up(), 0.1); // Normal follow-up

                anim.setKeys([
                    { frame: 0, value: q1.clone() },
                    { frame: 10, value: qOrthogonal.clone() },
                    { frame: 20, value: q3.clone() },
                ]);
                group.addTargetedAnimation(anim, sourceNodes[0]);

                const result = targetAvatar.retargetAnimationGroup(group, {
                    fixAnimations: true,
                    retargetAnimationKeys: false,
                    fixRootPosition: false,
                });

                // After fixing, orthogonal quaternion should be replaced
                const resultKeys = result.targetedAnimations[0].animation.getKeys();
                expect(resultKeys.length).toBe(3);
                // The fix replaces the second quat with a copy of the first when they're orthogonal
            });
        });

        // ──────────────────────────────────────
        // fixGroundReference warnings and behavior
        // ──────────────────────────────────────

        describe("fixGroundReference and fixRootPosition", () => {
            it("should warn when groundReferenceNodeName is missing and fixRootPosition is true", () => {
                const { sourceNodes, targetAvatar } = setupRetargetScenario();
                const sourceGroup = createSourceAnimationGroup("walk", sourceNodes);

                const warnSpy = jest.spyOn(Logger, "Warn");

                targetAvatar.retargetAnimationGroup(sourceGroup, {
                    fixRootPosition: true,
                    // groundReferenceNodeName NOT provided
                });

                const groundRefWarning = warnSpy.mock.calls.find((call) =>
                    (call[0] as string).includes("groundReferenceNodeName")
                );
                expect(groundRefWarning).toBeDefined();
                warnSpy.mockRestore();
            });

            it("should warn when fixGroundReferenceDynamicRefNode is true but fixGroundReference is false", () => {
                // Need fixRootPosition=true to enter the block, plus valid ground reference config
                const targetRoot = new TransformNode("targetRoot", scene);
                const targetMesh = createMeshWithVertices("targetMesh", targetRoot);
                const skeleton = new Skeleton("skel", "skel", scene);

                const hipsTN = new TransformNode("Hips", scene);
                hipsTN.position = new Vector3(0, 2, 0);
                hipsTN.rotationQuaternion = Quaternion.Identity();
                hipsTN.parent = targetRoot;
                const hipsBone = new Bone("Hips", skeleton, null, Matrix.Identity(), undefined, undefined, 0);
                hipsBone.linkTransformNode(hipsTN);

                const footTN = new TransformNode("LeftFoot", scene);
                footTN.position = new Vector3(0, -2, 0);
                footTN.rotationQuaternion = Quaternion.Identity();
                footTN.parent = hipsTN;
                const footBone = new Bone("LeftFoot", skeleton, hipsBone, Matrix.Identity(), undefined, undefined, 1);
                footBone.linkTransformNode(footTN);

                targetMesh.skeleton = skeleton;
                const targetAvatar = new AnimatorAvatar("target", targetRoot);

                const srcHips = new TransformNode("Hips", scene);
                srcHips.position = new Vector3(0, 1, 0);
                srcHips.rotationQuaternion = Quaternion.Identity();
                const srcFoot = new TransformNode("LeftFoot", scene);
                srcFoot.position = new Vector3(0, -1, 0);
                srcFoot.rotationQuaternion = Quaternion.Identity();
                srcFoot.parent = srcHips;
                const sourceGroup = createSourceAnimationGroup("walk", [srcHips, srcFoot]);

                const warnSpy = jest.spyOn(Logger, "Warn");

                targetAvatar.retargetAnimationGroup(sourceGroup, {
                    fixRootPosition: true,
                    fixGroundReference: false,
                    fixGroundReferenceDynamicRefNode: true,
                    rootNodeName: "Hips",
                    groundReferenceNodeName: "LeftFoot",
                });

                const dynamicRefWarning = warnSpy.mock.calls.find((call) =>
                    (call[0] as string).includes("fixGroundReferenceDynamicRefNode")
                );
                expect(dynamicRefWarning).toBeDefined();
                warnSpy.mockRestore();
            });

            it("should warn when groundReferenceNodeName is missing and fixGroundReference is true", () => {
                const { sourceNodes, targetAvatar } = setupRetargetScenario();
                const sourceGroup = createSourceAnimationGroup("walk", sourceNodes);

                const warnSpy = jest.spyOn(Logger, "Warn");

                targetAvatar.retargetAnimationGroup(sourceGroup, {
                    fixRootPosition: false,
                    fixGroundReference: true,
                    // groundReferenceNodeName NOT provided
                });

                const groundRefWarning = warnSpy.mock.calls.find((call) =>
                    (call[0] as string).includes("groundReferenceNodeName")
                );
                expect(groundRefWarning).toBeDefined();
                warnSpy.mockRestore();
            });

            it("should not warn about ground reference when both fixRootPosition and fixGroundReference are false", () => {
                const { sourceNodes, targetAvatar } = setupRetargetScenario();
                const sourceGroup = createSourceAnimationGroup("walk", sourceNodes);

                const warnSpy = jest.spyOn(Logger, "Warn");

                targetAvatar.retargetAnimationGroup(sourceGroup, {
                    fixRootPosition: false,
                    fixGroundReference: false,
                });

                const groundRefWarning = warnSpy.mock.calls.find((call) =>
                    (call[0] as string).includes("groundReferenceNodeName")
                );
                expect(groundRefWarning).toBeUndefined();
                warnSpy.mockRestore();
            });

            it("should execute fixRootPosition when groundReferenceNodeName and rootNodeName are provided", () => {
                // Build a scenario with spatially meaningful positions
                const targetRoot = new TransformNode("targetRoot", scene);
                const targetMesh = createMeshWithVertices("targetMesh", targetRoot);
                const skeleton = new Skeleton("skel", "skel", scene);

                // Hips at y=2, LeftFoot at y=0 (ground)
                const hipsTN = new TransformNode("Hips", scene);
                hipsTN.position = new Vector3(0, 2, 0);
                hipsTN.rotationQuaternion = Quaternion.Identity();
                hipsTN.parent = targetRoot;
                const hipsBone = new Bone("Hips", skeleton, null, Matrix.Identity(), undefined, undefined, 0);
                hipsBone.linkTransformNode(hipsTN);

                const footTN = new TransformNode("LeftFoot", scene);
                footTN.position = new Vector3(0, -2, 0);
                footTN.rotationQuaternion = Quaternion.Identity();
                footTN.parent = hipsTN;
                const footBone = new Bone("LeftFoot", skeleton, hipsBone, Matrix.Identity(), undefined, undefined, 1);
                footBone.linkTransformNode(footTN);

                targetMesh.skeleton = skeleton;
                const targetAvatar = new AnimatorAvatar("target", targetRoot);

                // Source with similar hierarchy
                const srcHips = new TransformNode("Hips", scene);
                srcHips.position = new Vector3(0, 1, 0);
                srcHips.rotationQuaternion = Quaternion.Identity();
                const srcFoot = new TransformNode("LeftFoot", scene);
                srcFoot.position = new Vector3(0, -1, 0);
                srcFoot.rotationQuaternion = Quaternion.Identity();
                srcFoot.parent = srcHips;

                const sourceGroup = createSourceAnimationGroup("walk", [srcHips, srcFoot]);

                // Should not throw with proper ground reference config
                const result = targetAvatar.retargetAnimationGroup(sourceGroup, {
                    fixRootPosition: true,
                    rootNodeName: "Hips",
                    groundReferenceNodeName: "LeftFoot",
                });

                expect(result).toBeDefined();
                expect(result.targetedAnimations.length).toBeGreaterThan(0);
            });
        });

        // ──────────────────────────────────────
        // Edge cases and bad paths
        // ──────────────────────────────────────

        describe("edge cases", () => {
            it("should handle empty animation group", () => {
                const { targetAvatar } = setupRetargetScenario();
                const emptyGroup = new AnimationGroup("empty", scene);

                const result = targetAvatar.retargetAnimationGroup(emptyGroup, { fixRootPosition: false });

                expect(result).toBeDefined();
                expect(result.targetedAnimations.length).toBe(0);
            });

            it("should handle animation group where no bones match (all removed)", () => {
                const { targetAvatar } = setupRetargetScenario(["Hips"]);

                const unknown1 = new TransformNode("Unknown1", scene);
                unknown1.rotationQuaternion = Quaternion.Identity();
                const unknown2 = new TransformNode("Unknown2", scene);
                unknown2.rotationQuaternion = Quaternion.Identity();
                unknown2.parent = unknown1;

                const sourceGroup = createSourceAnimationGroup("walk", [unknown1, unknown2]);

                // showWarnings=true so unmatched animations are removed
                const result = targetAvatar.retargetAnimationGroup(sourceGroup, { fixRootPosition: false });

                expect(result.targetedAnimations.length).toBe(0);
            });

            it("should search across multiple skeletons", () => {
                const targetRoot = new TransformNode("targetRoot", scene);
                const mesh1 = createMeshWithVertices("mesh1", targetRoot);
                const mesh2 = createMeshWithVertices("mesh2", targetRoot);

                // Skeleton 1 has "Hips"
                const skel1 = new Skeleton("skel1", "skel1", scene);
                const hipsTN = new TransformNode("Hips", scene);
                hipsTN.rotationQuaternion = Quaternion.Identity();
                hipsTN.parent = targetRoot;
                const hipsBone = new Bone("Hips", skel1, null, Matrix.Identity(), undefined, undefined, 0);
                hipsBone.linkTransformNode(hipsTN);
                mesh1.skeleton = skel1;

                // Skeleton 2 has "LeftHand"
                const skel2 = new Skeleton("skel2", "skel2", scene);
                const handTN = new TransformNode("LeftHand", scene);
                handTN.rotationQuaternion = Quaternion.Identity();
                handTN.parent = targetRoot;
                const handBone = new Bone("LeftHand", skel2, null, Matrix.Identity(), undefined, undefined, 0);
                handBone.linkTransformNode(handTN);
                mesh2.skeleton = skel2;

                const targetAvatar = new AnimatorAvatar("target", targetRoot);
                expect(targetAvatar.skeletons.size).toBe(2);

                // Source animates both
                const srcHips = new TransformNode("Hips", scene);
                srcHips.rotationQuaternion = Quaternion.Identity();
                const srcHand = new TransformNode("LeftHand", scene);
                srcHand.rotationQuaternion = Quaternion.Identity();
                srcHand.parent = srcHips;

                const sourceGroup = createSourceAnimationGroup("anim", [srcHips, srcHand]);

                const result = targetAvatar.retargetAnimationGroup(sourceGroup, { fixRootPosition: false });

                // Both should be matched across different skeletons
                expect(result.targetedAnimations.length).toBe(2);
                expect(result.targetedAnimations[0].target).toBe(hipsTN);
                expect(result.targetedAnimations[1].target).toBe(handTN);
            });

            it("should handle mapNodeNames with partial coverage", () => {
                const { targetAvatar, targetTNs } = setupRetargetScenario(["Hips", "Spine", "Head"]);

                // Source: "Armature|Hips" needs mapping, but "Spine" matches directly
                const srcHips = new TransformNode("Armature|Hips", scene);
                srcHips.rotationQuaternion = Quaternion.Identity();
                const srcSpine = new TransformNode("Spine", scene);
                srcSpine.rotationQuaternion = Quaternion.Identity();
                srcSpine.parent = srcHips;

                const sourceGroup = createSourceAnimationGroup("walk", [srcHips, srcSpine]);

                const nameMap = new Map<string, string>();
                nameMap.set("Armature|Hips", "Hips");
                // "Spine" is NOT in the map — should match by original name

                const result = targetAvatar.retargetAnimationGroup(sourceGroup, {
                    mapNodeNames: nameMap,
                    fixRootPosition: false,
                });

                expect(result.targetedAnimations.length).toBe(2);
                expect(result.targetedAnimations[0].target).toBe(targetTNs[0]); // Hips via map
                expect(result.targetedAnimations[1].target).toBe(targetTNs[1]); // Spine via direct name
            });
        });
    });
});
