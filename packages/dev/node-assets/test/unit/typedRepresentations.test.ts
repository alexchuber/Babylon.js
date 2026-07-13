import { Document } from "@gltf-transform/core";
import { NullEngine } from "core/Engines/nullEngine";
import { NodeGeometry } from "core/Meshes/Node/nodeGeometry";
import { VertexData } from "core/Meshes/mesh.vertexData";
import { Scene } from "core/scene";
import { type IResolvedStage } from "loaders/USD";
import { describe, expect, expectTypeOf, it } from "vitest";

import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { type NodeAssetJsonValue, type NodeAssetValueMap } from "../../src/connection/nodeAssetValueMap";
import { BabylonAsset, IsBabylonAsset } from "../../src/representations/babylonAsset";
import { GltfAsset, IsGltfAsset } from "../../src/representations/gltfAsset";
import { IsNodeGeometryAsset, NodeGeometryAsset } from "../../src/representations/nodeGeometryAsset";
import { IsUsdAsset, UsdAsset } from "../../src/representations/usdAsset";

function CreateResolvedStage(): IResolvedStage {
    return {
        metadata: {
            upAxis: "Y",
            metersPerUnit: 1,
            timeCodesPerSecond: 24,
            startTimeCode: 0,
            endTimeCode: 0,
        },
        root: {
            path: "/",
            name: "",
            kind: "transform",
            transform: {
                translation: [0, 0, 0],
                rotation: [0, 0, 0, 1],
                scale: [1, 1, 1],
            },
            visible: true,
            children: [],
        },
        meshes: [
            {
                positions: new Float32Array([1, 2, 3]),
                indices: new Uint32Array([0]),
                subdivisionScheme: "none",
                doubleSided: false,
                orientation: "rightHanded",
            },
        ],
        materials: [],
        skeletons: [],
        diagnostics: [],
    };
}

const MetadataConstructors = [
    {
        name: "GltfAsset",
        construct(metadata: unknown): void {
            Reflect.construct(GltfAsset, [new Document(), metadata]);
        },
    },
    {
        name: "UsdAsset",
        construct(metadata: unknown): void {
            Reflect.construct(UsdAsset, [CreateResolvedStage(), metadata]);
        },
    },
    {
        name: "BabylonAsset",
        construct(metadata: unknown): void {
            const engine = new NullEngine();
            const scene = new Scene(engine);
            try {
                Reflect.construct(BabylonAsset, [engine, scene, metadata]);
            } finally {
                if (!scene.isDisposed) {
                    scene.dispose();
                }
                engine.dispose();
            }
        },
    },
    {
        name: "NodeGeometryAsset",
        construct(metadata: unknown): void {
            const nodeGeometry = new NodeGeometry("metadata-validation");
            try {
                Reflect.construct(NodeGeometryAsset, [nodeGeometry, metadata]);
            } finally {
                nodeGeometry.dispose();
            }
        },
    },
] as const;

describe("typed representations", () => {
    it("keeps the flat enum stable and appends concrete representation and resource kinds", () => {
        expect(NodeAssetConnectionPointType.GLTF_DOCUMENT).toBe(0);
        expect(NodeAssetConnectionPointType.SCENE).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
        expect(NodeAssetConnectionPointType.NUMBER).toBe(1);
        expect(NodeAssetConnectionPointType.STRING).toBe(2);
        expect(NodeAssetConnectionPointType.JSON).toBe(3);
        expect(NodeAssetConnectionPointType.IMAGE).toBe(4);
        expect(NodeAssetConnectionPointType.USD_STAGE).toBe(5);
        expect(NodeAssetConnectionPointType.BABYLON_SCENE).toBe(6);
        expect(NodeAssetConnectionPointType.NODE_GEOMETRY).toBe(7);
        expect("REPRESENTATION" in NodeAssetConnectionPointType).toBe(false);
        expect(NodeAssetConnectionPointType[NodeAssetConnectionPointType.GLTF_DOCUMENT]).toBe("GLTF_DOCUMENT");
    });

    it("correlates every kind with its concrete value type", () => {
        expectTypeOf<NodeAssetValueMap[NodeAssetConnectionPointType.GLTF_DOCUMENT]>().toEqualTypeOf<GltfAsset>();
        expectTypeOf<NodeAssetValueMap[NodeAssetConnectionPointType.USD_STAGE]>().toEqualTypeOf<UsdAsset>();
        expectTypeOf<NodeAssetValueMap[NodeAssetConnectionPointType.BABYLON_SCENE]>().toEqualTypeOf<BabylonAsset>();
        expectTypeOf<NodeAssetValueMap[NodeAssetConnectionPointType.NODE_GEOMETRY]>().toEqualTypeOf<NodeGeometryAsset>();
        expectTypeOf<NodeAssetValueMap[NodeAssetConnectionPointType.NUMBER]>().toEqualTypeOf<number>();
        expectTypeOf<NodeAssetValueMap[NodeAssetConnectionPointType.STRING]>().toEqualTypeOf<string>();
        expectTypeOf<NodeAssetValueMap[NodeAssetConnectionPointType.JSON]>().toEqualTypeOf<NodeAssetJsonValue>();
    });

    it.each(MetadataConstructors)("validates explicit metadata for $name", ({ construct }) => {
        expect(() => construct({ identity: " ", revision: 0, manifest: {}, overlay: {} })).toThrow(/identity/);
        expect(() => construct({ identity: "asset", revision: -1, manifest: {}, overlay: {} })).toThrow(/revision/);
        expect(() => construct({ identity: "asset", revision: 1.5, manifest: {}, overlay: {} })).toThrow(/revision/);
        expect(() => construct({ identity: "asset", revision: Number.POSITIVE_INFINITY, manifest: {}, overlay: {} })).toThrow(/revision/);
        expect(() => construct({ identity: "asset", revision: 0, manifest: { invalid: undefined }, overlay: {} })).toThrow(/manifest/);
    });

    it("validates the explicit USD overlay", () => {
        expect(() =>
            Reflect.construct(UsdAsset, [
                CreateResolvedStage(),
                {
                    identity: "fixture-usd",
                    revision: 0,
                    manifest: {},
                    overlay: { invalid: undefined },
                },
            ])
        ).toThrow(/overlay/);
    });

    it("owns a live glTF document and preserves explicit metadata across clones", () => {
        const document = new Document();
        const manifest = { source: "fixture.glb", facts: { meshCount: 0 } };
        const asset = new GltfAsset(document, {
            identity: "fixture-gltf",
            revision: 4,
            manifest,
        });

        const clone = asset.clone();

        expect(asset.document).toBe(document);
        expect(clone.document).not.toBe(document);
        expect(clone.identity).toBe("fixture-gltf");
        expect(clone.revision).toBe(4);
        expect(clone.manifest).toEqual(manifest);
        expect(Object.isFrozen(asset.manifest)).toBe(true);
        expect(Object.isFrozen(asset.manifest.facts)).toBe(true);
        expect(IsGltfAsset(asset)).toBe(true);
        expect(IsGltfAsset(document)).toBe(false);
    });

    it("owns a deeply frozen resolved USD stage and immutable overlay", () => {
        const stage = CreateResolvedStage();
        const overlay = { "/World": { visibility: "inherited" } };
        const asset = new UsdAsset(stage, {
            identity: "fixture-usd",
            revision: 2,
            manifest: { source: "fixture.usda" },
            overlay,
        });

        expect(asset.stage).not.toBe(stage);
        expect(asset.overlay).toEqual(overlay);
        expect(Object.isFrozen(asset.stage)).toBe(true);
        expect(Object.isFrozen(asset.stage.root)).toBe(true);
        expect(Object.isFrozen(asset.stage.root.transform.translation)).toBe(true);
        expect(Object.isFrozen(asset.overlay)).toBe(true);
        expect(Object.isFrozen(asset.overlay["/World"])).toBe(true);
        stage.meshes[0].positions[0] = 10;
        asset.stage.meshes[0].positions[0] = 20;
        expect(asset.stage.meshes[0].positions[0]).toBe(1);
        expect(IsUsdAsset(asset)).toBe(true);
        expect(IsUsdAsset(stage)).toBe(false);
    });

    it("owns a live matching NullEngine and Scene, preserves dynamic handedness, and is affine", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const asset = new BabylonAsset(engine, scene, {
            identity: "fixture-babylon",
            revision: 1,
            manifest: { source: "fixture.babylon" },
        });

        expect(asset.engine).toBe(engine);
        expect(asset.scene).toBe(scene);
        expect(asset.isAffine).toBe(true);
        expect(asset.scene.useRightHandedSystem).toBe(false);
        scene.useRightHandedSystem = true;
        expect(asset.scene.useRightHandedSystem).toBe(true);
        expect(IsBabylonAsset(asset)).toBe(true);
        expect(IsBabylonAsset(scene)).toBe(false);

        const otherEngine = new NullEngine();
        expect(
            () =>
                new BabylonAsset(otherEngine, scene, {
                    identity: "invalid-owner",
                    revision: 0,
                    manifest: {},
                })
        ).toThrow(/scene must belong to the supplied NullEngine/);
        otherEngine.dispose();
        asset.dispose();
        asset.dispose();
        expect(scene.isDisposed).toBe(true);
    });

    it("owns an unevaluated NodeGeometry and an optional frozen VertexData snapshot", () => {
        const nodeGeometry = new NodeGeometry("fixture");
        const evaluatedNodeGeometry = new NodeGeometry("evaluated fixture");
        const vertexData = new VertexData();
        vertexData.positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
        vertexData.indices = [0, 1, 2];
        vertexData.colors = [1, 0, 0, 0, 1, 0, 0, 0, 1];
        vertexData.matricesIndicesExtra = [4, 5, 6, 7, 4, 5, 6, 7, 4, 5, 6, 7];
        vertexData.matricesWeightsExtra = [0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25];
        vertexData.metadata = { source: { kind: "evaluated" } };

        const unevaluated = new NodeGeometryAsset(nodeGeometry, {
            identity: "fixture-node-geometry",
            revision: 0,
            manifest: { source: "fixture.json" },
        });
        const evaluated = new NodeGeometryAsset(
            evaluatedNodeGeometry,
            {
                identity: "fixture-node-geometry",
                revision: 1,
                manifest: { source: "fixture.json" },
            },
            vertexData
        );

        expect(unevaluated.nodeGeometry).toBe(nodeGeometry);
        expect(unevaluated.evaluatedVertexData).toBeUndefined();
        expect(evaluated.nodeGeometry).toBe(evaluatedNodeGeometry);
        expect(evaluated.evaluatedVertexData).not.toBe(vertexData);
        expect(evaluated.evaluatedVertexData?.positions).toEqual(vertexData.positions);
        expect(evaluated.evaluatedVertexData?.colors).toEqual(vertexData.colors);
        expect(evaluated.evaluatedVertexData?.matricesIndicesExtra).toEqual(vertexData.matricesIndicesExtra);
        expect(evaluated.evaluatedVertexData?.matricesWeightsExtra).toEqual(vertexData.matricesWeightsExtra);
        expect(evaluated.evaluatedVertexData?.metadata).toEqual(vertexData.metadata);
        expect(Object.isFrozen(evaluated.evaluatedVertexData)).toBe(true);
        expect(Object.isFrozen(evaluated.evaluatedVertexData?.positions)).toBe(true);
        expect(Object.isFrozen(evaluated.evaluatedVertexData?.metadata.source)).toBe(true);
        expect(IsNodeGeometryAsset(evaluated)).toBe(true);
        expect(IsNodeGeometryAsset(nodeGeometry)).toBe(false);

        unevaluated.dispose();
        evaluated.dispose();
        evaluated.dispose();
    });

    it.each([
        ["missing positions", new VertexData()],
        [
            "misaligned positions",
            Object.assign(new VertexData(), {
                positions: [0, 0],
            }),
        ],
        [
            "non-finite positions",
            Object.assign(new VertexData(), {
                positions: [0, Number.NaN, 0],
            }),
        ],
        [
            "mismatched normals",
            Object.assign(new VertexData(), {
                positions: [0, 0, 0],
                normals: [0, 1, 0, 0, 1, 0],
            }),
        ],
        [
            "out-of-range indices",
            Object.assign(new VertexData(), {
                positions: [0, 0, 0],
                indices: [1],
            }),
        ],
        [
            "mismatched extra matrix weights",
            Object.assign(new VertexData(), {
                positions: [0, 0, 0],
                matricesWeightsExtra: [0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25],
            }),
        ],
        [
            "mutable metadata containers",
            Object.assign(new VertexData(), {
                positions: [0, 0, 0],
                metadata: { values: new Uint8Array([1]) },
            }),
        ],
    ])("rejects an invalid evaluated VertexData snapshot with %s", (_case, vertexData) => {
        const nodeGeometry = new NodeGeometry("invalid snapshot");
        try {
            expect(
                () =>
                    new NodeGeometryAsset(
                        nodeGeometry,
                        {
                            identity: "invalid-snapshot",
                            revision: 0,
                            manifest: {},
                        },
                        vertexData
                    )
            ).toThrow(/evaluated VertexData snapshot/);
        } finally {
            nodeGeometry.dispose();
        }
    });

    it("preserves absent and explicitly null snapshot fields distinctly", () => {
        const nodeGeometry = new NodeGeometry("optional snapshot fields");
        const vertexData = new VertexData();
        vertexData.positions = [0, 0, 0];
        vertexData.normals = null;

        const asset = new NodeGeometryAsset(
            nodeGeometry,
            {
                identity: "optional-snapshot-fields",
                revision: 0,
                manifest: {},
            },
            vertexData
        );

        expect(asset.evaluatedVertexData?.normals).toBeNull();
        expect(asset.evaluatedVertexData?.uvs).toBeUndefined();
        expect(asset.evaluatedVertexData?.indices).toBeUndefined();
        expect(asset.evaluatedVertexData?.materialInfos).toBeUndefined();
        asset.dispose();
    });

    it.each([null, false, 0, ""])("rejects a non-undefined runtime snapshot value: %j", (invalidSnapshot) => {
        const nodeGeometry = new NodeGeometry("invalid runtime snapshot");
        try {
            expect(() =>
                Reflect.construct(NodeGeometryAsset, [
                    nodeGeometry,
                    {
                        identity: "invalid-runtime-snapshot",
                        revision: 0,
                        manifest: {},
                    },
                    invalidSnapshot,
                ])
            ).toThrow(/evaluated VertexData snapshot/);
        } finally {
            nodeGeometry.dispose();
        }
    });
});
