import { describe, expect, it } from "vitest";
import { NullEngine } from "core/Engines/nullEngine";
import { Matrix, Quaternion, Vector3 } from "core/Maths/math.vector.pure";
import { TransformNode } from "core/Meshes/transformNode.pure";
import { MeshBuilder } from "core/Meshes/meshBuilder";
import { Scene } from "core/scene";
import { ApplyResolvedTransform, CreateStageRoot } from "loaders/USD/adapter/transformAdapter";
import { USDFileLoader } from "loaders/USD/usdFileLoader";
import { type IResolvedTransform, type IStageMetadata } from "loaders/USD/resolution/resolvedStage";

const Epsilon = 1e-6;

function baseMetadata(metadata: Partial<IStageMetadata>): IStageMetadata {
    return {
        upAxis: "Y",
        metersPerUnit: 1,
        timeCodesPerSecond: 24,
        startTimeCode: 0,
        endTimeCode: 0,
        ...metadata,
    };
}

function areEquivalentQuaternions(actual: Quaternion, expected: Quaternion): boolean {
    const dot = actual.x * expected.x + actual.y * expected.y + actual.z * expected.z + actual.w * expected.w;
    return Math.abs(Math.abs(dot) - 1) < Epsilon;
}

describe("USD transform adapter", () => {
    it("preserves the caller's handedness while converting the imported root", () => {
        const engine = new NullEngine();
        const leftHandedScene = new Scene(engine);
        const rightHandedScene = new Scene(engine);
        rightHandedScene.useRightHandedSystem = true;

        try {
            const leftRoot = CreateStageRoot(baseMetadata({}), leftHandedScene);
            const rightRoot = CreateStageRoot(baseMetadata({}), rightHandedScene);

            expect(leftHandedScene.useRightHandedSystem).toBe(false);
            expect(leftRoot.scaling.asArray()).toEqual([1, 1, -1]);
            expect(rightHandedScene.useRightHandedSystem).toBe(true);
            expect(rightRoot.scaling.asArray()).toEqual([1, 1, 1]);
        } finally {
            leftHandedScene.dispose();
            rightHandedScene.dispose();
            engine.dispose();
        }
    });

    it("converts Z-up centimeter stage transforms to Y-up meter world space", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const root = CreateStageRoot(baseMetadata({ upAxis: "Z", metersPerUnit: 0.01 }), scene);
            const node = new TransformNode("UsdChild", scene);
            node.parent = root;

            ApplyResolvedTransform(node, {
                translation: [1, 2, 3],
                rotation: [0, 0, 0, 1],
                scale: [1, 1, 1],
            });

            root.computeWorldMatrix(true);
            node.computeWorldMatrix(true);

            expect(node.getAbsolutePosition().equalsWithEpsilon(new Vector3(0.01, 0.03, 0.02), Epsilon)).toBe(true);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("keeps a Y-up meter stage root identity-like", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const root = CreateStageRoot(baseMetadata({ upAxis: "Y", metersPerUnit: 1 }), scene);

            expect(root.position.equalsWithEpsilon(Vector3.Zero(), Epsilon)).toBe(true);
            expect(root.scaling.equalsWithEpsilon(new Vector3(1, 1, -1), Epsilon)).toBe(true);
            expect(areEquivalentQuaternions(root.rotationQuaternion!, Quaternion.Identity())).toBe(true);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("preserves a full local matrix in preference to the TRS fallback", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const node = new TransformNode("UsdMatrixNode", scene);
            const matrix = Matrix.FromValues(1, 0.5, 0, 0, 0, 1, 0.25, 0, 0, 0, 1, 0, 5, 6, 7, 1);

            ApplyResolvedTransform(node, {
                translation: [100, 200, 300],
                rotation: [0, 0, 0, 1],
                scale: [10, 10, 10],
                matrix: matrix.asArray(),
            });

            expect(node.computeWorldMatrix(true).equals(matrix)).toBe(true);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("applies TRS directly when no full matrix is present", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const node = new TransformNode("UsdTrsNode", scene);
            const rotation = Quaternion.RotationAxis(new Vector3(0, 0, 1), Math.PI / 4);
            const transform: IResolvedTransform = {
                translation: [1, 2, 3],
                rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
                scale: [4, 5, 6],
            };

            ApplyResolvedTransform(node, transform);

            expect(node.position.equalsWithEpsilon(new Vector3(1, 2, 3), Epsilon)).toBe(true);
            expect(node.scaling.equalsWithEpsilon(new Vector3(4, 5, 6), Epsilon)).toBe(true);
            expect(areEquivalentQuaternions(node.rotationQuaternion!, rotation)).toBe(true);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it.each([false, true])("leaves pre-existing scene content and handedness unchanged on load failure (%s-handed)", async (useRightHandedSystem) => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        scene.useRightHandedSystem = useRightHandedSystem;
        const existingMesh = MeshBuilder.CreateBox("existing", { size: 1 }, scene);
        const baseline = {
            meshes: scene.meshes.length,
            transformNodes: scene.transformNodes.length,
            geometries: scene.geometries.length,
            materials: scene.materials.length,
        };
        const usda = `#usda 1.0
(
    defaultPrim = "Root"
)
def Xform "Root"
{
    def Xform "Asset"
    {
        custom asset assetInfo:source = @./asset.obj@
    }
}
`;

        try {
            await expect(
                new USDFileLoader({
                    externalAssetHandler: async () => {
                        throw new Error("intentional handler failure");
                    },
                }).importMeshAsync(null, scene, usda, "")
            ).rejects.toThrow("intentional handler failure");
            expect(scene.useRightHandedSystem).toBe(useRightHandedSystem);
            expect(scene.getMeshByName("existing")).toBe(existingMesh);
            expect(existingMesh.parent).toBeNull();
            expect(scene.meshes).toHaveLength(baseline.meshes);
            expect(scene.transformNodes).toHaveLength(baseline.transformNodes);
            expect(scene.geometries).toHaveLength(baseline.geometries);
            expect(scene.materials).toHaveLength(baseline.materials);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it.each([
        { name: "left-handed", useRightHandedSystem: false, expectedZ: -0.03 },
        { name: "right-handed", useRightHandedSystem: true, expectedZ: 0.03 },
    ])("keeps pre-existing $name content unchanged on successful USD import", async ({ useRightHandedSystem, expectedZ }) => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        scene.useRightHandedSystem = useRightHandedSystem;
        const existingMesh = MeshBuilder.CreateBox("existing", { size: 1 }, scene);
        existingMesh.position.set(4, 5, 6);
        const usda = `#usda 1.0
(
    defaultPrim = "Root"
)
def Xform "Root"
{
    double3 xformOp:translate = (1, 2, 3)
    uniform token[] xformOpOrder = ["xformOp:translate"]
    def Mesh "Triangle"
    {
        int[] faceVertexCounts = [3]
        int[] faceVertexIndices = [0, 1, 2]
        point3f[] points = [(0, 0, 0), (1, 0, 0), (0, 1, 0)]
    }
}
`;

        try {
            await new USDFileLoader().importMeshAsync(null, scene, usda, "");
            const importedMesh = scene.getMeshByName("Triangle")!;
            importedMesh.computeWorldMatrix(true);

            expect(scene.useRightHandedSystem).toBe(useRightHandedSystem);
            expect(existingMesh.position.asArray()).toEqual([4, 5, 6]);
            const importedPosition = importedMesh.getAbsolutePosition();
            expect(importedPosition.x).toBeCloseTo(0.01, 5);
            expect(importedPosition.y).toBeCloseTo(0.02, 5);
            expect(importedPosition.z).toBeCloseTo(expectedZ, 5);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("does not double-apply the pre-transform when a matrix stack is animated", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const usda = `#usda 1.0
(
    timeCodesPerSecond = 24
)
def Xform "Animated"
{
    matrix4d xformOp:transform = ((1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (5, 0, 0, 1))
    matrix4d xformOp:transform.timeSamples = {
        0: ((1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (5, 0, 0, 1)),
        24: ((1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (10, 0, 0, 1))
    }
    uniform token[] xformOpOrder = ["xformOp:transform"]
}
`;

        try {
            const result = await new USDFileLoader().importMeshAsync(null, scene, usda, "");
            const node = result.transformNodes.find((candidate) => candidate.name === "Animated")!;
            expect(node.position.x).toBeCloseTo(5);
            const animationGroup = result.animationGroups[0];
            animationGroup.start(false);
            animationGroup.goToFrame(0);
            expect(node.position.x).toBeCloseTo(5);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });
});
