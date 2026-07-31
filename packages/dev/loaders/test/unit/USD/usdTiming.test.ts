import { describe, expect, it } from "vitest";
import { NullEngine } from "core/Engines/nullEngine";
import { Quaternion, Vector3 } from "core/Maths/math.vector.pure";
import { TransformNode } from "core/Meshes/transformNode.pure";
import { Scene } from "core/scene";
import { CreateAnimationsForPrim } from "loaders/USD/adapter/animationAdapter";
import { MapLayerToResolvedStage } from "loaders/USD/resolution/mapping/stageMapper";
import { ParseUsda } from "loaders/USD/resolution/parser/usda/usdaParser";
import { type IResolvedAnimation, type IResolvedAnimationTrack, type IResolvedStage } from "loaders/USD/resolution/resolvedStage";
import { type ISdfLayer } from "loaders/USD/resolution/sdf";

// Timing is hardened at the parse-to-resolved-stage seam: the authored time-code rate is validated so it
// can never produce infinite, NaN, or time-reversed animation timing; authored time samples take precedence
// over a default; and interpolation is chosen by value type (numeric tracks linear, held tokens held) with
// USD's default of linear. A single adapter assertion covers seconds-to-frames baking and endpoint holding.

const Epsilon = 1e-6;
const IdentityMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
];

function animatedTranslateUsda(stageMetadata: string, sampleTimes: [number, number]): string {
    return `#usda 1.0
(
${stageMetadata}
)

def Xform "Animated"
{
    double3 xformOp:translate.timeSamples = {
        ${sampleTimes[0]}: (0, 0, 0),
        ${sampleTimes[1]}: (10, 0, 0),
    }
    uniform token[] xformOpOrder = ["xformOp:translate"]
}
`;
}

function mapUsda(text: string): IResolvedStage {
    return MapLayerToResolvedStage(ParseUsda(text, "/Scenes/timing.usda"));
}

function trackOf(stage: IResolvedStage, target: IResolvedAnimationTrack["target"]): IResolvedAnimationTrack {
    return stage.root.children[0].animation!.tracks.find((track) => track.target === target)!;
}

describe("USD timing metadata resolution", () => {
    it("falls back to 24 time codes per second for a non-positive timeCodesPerSecond, keeping animation times finite", () => {
        const stage = mapUsda(animatedTranslateUsda("    timeCodesPerSecond = 0", [0, 24]));

        expect(stage.metadata.timeCodesPerSecond).toBe(24);
        const times = Array.from(trackOf(stage, "translation").times);
        expect(times).toEqual([0, 1]);
        expect(times.every((time) => Number.isFinite(time))).toBe(true);
        expect(stage.diagnostics.some((diagnostic) => diagnostic.severity === "warning" && /timeCodesPerSecond/.test(diagnostic.message))).toBe(true);
    });

    it("rejects a negative timeCodesPerSecond so the timeline is not reversed", () => {
        const stage = mapUsda(animatedTranslateUsda("    timeCodesPerSecond = -24", [0, 24]));

        expect(stage.metadata.timeCodesPerSecond).toBe(24);
        expect(Array.from(trackOf(stage, "translation").times)).toEqual([0, 1]);
    });

    it("uses a valid authored timeCodesPerSecond to convert time codes to seconds", () => {
        const stage = mapUsda(animatedTranslateUsda("    timeCodesPerSecond = 12", [0, 12]));

        expect(stage.metadata.timeCodesPerSecond).toBe(12);
        expect(Array.from(trackOf(stage, "translation").times)).toEqual([0, 1]);
        expect(stage.diagnostics.some((diagnostic) => /timeCodesPerSecond|framesPerSecond/.test(diagnostic.message))).toBe(false);
    });

    it("falls back to a valid framesPerSecond when timeCodesPerSecond is invalid", () => {
        const stage = mapUsda(animatedTranslateUsda("    timeCodesPerSecond = 0\n    framesPerSecond = 30", [0, 30]));

        expect(stage.metadata.timeCodesPerSecond).toBe(30);
        expect(Array.from(trackOf(stage, "translation").times)).toEqual([0, 1]);
        expect(stage.diagnostics.some((diagnostic) => diagnostic.severity === "warning" && /timeCodesPerSecond/.test(diagnostic.message))).toBe(true);
    });

    it("uses a valid framesPerSecond when timeCodesPerSecond is absent", () => {
        const stage = mapUsda(animatedTranslateUsda("    framesPerSecond = 30", [0, 30]));

        expect(stage.metadata.timeCodesPerSecond).toBe(30);
        expect(Array.from(trackOf(stage, "translation").times)).toEqual([0, 1]);
        expect(stage.diagnostics.some((diagnostic) => /timeCodesPerSecond|framesPerSecond/.test(diagnostic.message))).toBe(false);
    });
});

// OpenUSD validates the framesPerSecond field and rejects the whole layer when it is non-positive, unlike
// timeCodesPerSecond which parses and is only handled defensively; these tests pin that asymmetry.
describe("USD framesPerSecond field validation", () => {
    it("rejects a non-positive framesPerSecond as a fatal layer error", () => {
        expect(() => mapUsda(animatedTranslateUsda("    framesPerSecond = 0", [0, 24]))).toThrow(/framesPerSecond/);
    });

    it("rejects an invalid framesPerSecond even when a valid timeCodesPerSecond is present", () => {
        expect(() => mapUsda(animatedTranslateUsda("    timeCodesPerSecond = 24\n    framesPerSecond = -1", [0, 24]))).toThrow(/framesPerSecond/);
    });

    it("rejects a non-finite framesPerSecond as a fatal layer error", () => {
        const layer: ISdfLayer = { identifier: "/Scenes/timing.usda", subLayers: [], framesPerSecond: Number.NaN, rootPrims: [] };

        expect(() => MapLayerToResolvedStage(layer)).toThrow(/framesPerSecond/);
    });
});

describe("USD time-sample value resolution", () => {
    it("prefers authored time samples over a default when both are present", () => {
        const text = `#usda 1.0
(
    timeCodesPerSecond = 24
)

def Xform "Animated"
{
    double3 xformOp:translate = (99, 99, 99)
    double3 xformOp:translate.timeSamples = {
        0: (0, 0, 0),
        24: (10, 0, 0),
    }
    uniform token[] xformOpOrder = ["xformOp:translate"]
}
`;
        const stage = mapUsda(text);
        const world = stage.root.children[0];

        expect(Array.from(trackOf(stage, "translation").values)).toEqual([0, 0, 0, 10, 0, 0]);
        // The static base transform still resolves to the authored default; the samples drive the animation.
        expect(world.transform.translation).toEqual([99, 99, 99]);
    });

    it("interpolates numeric tracks linearly by default and holds token visibility", () => {
        // Visibility tracks only survive on renderable prims, so this exercises a Mesh to observe both
        // the numeric translation track and the non-interpolatable visibility token together.
        const text = `#usda 1.0
(
    timeCodesPerSecond = 24
)

def Mesh "Animated"
{
    int[] faceVertexCounts = [3]
    int[] faceVertexIndices = [0, 1, 2]
    point3f[] points = [(0, 0, 0), (1, 0, 0), (0, 1, 0)]
    double3 xformOp:translate.timeSamples = {
        0: (0, 0, 0),
        24: (10, 0, 0),
    }
    token visibility.timeSamples = {
        0: "inherited",
        24: "invisible",
    }
    uniform token[] xformOpOrder = ["xformOp:translate"]
}
`;
        const stage = mapUsda(text);

        expect(trackOf(stage, "translation").interpolation).toBe("linear");
        expect(trackOf(stage, "visibility").interpolation).toBe("held");
    });

    it("honors an explicit stage interpolation = held opinion for numeric tracks", () => {
        const stage = mapUsda(animatedTranslateUsda('    timeCodesPerSecond = 24\n    interpolation = "held"', [0, 24]));

        expect(trackOf(stage, "translation").interpolation).toBe("held");
    });

    it("composes multiple ordered animated rotations into one rotation track", () => {
        const stage = mapUsda(`#usda 1.0
(
    timeCodesPerSecond = 24
)
def Xform "Animated"
{
    float xformOp:rotateX.timeSamples = {
        0: 0,
        24: 90,
    }
    float xformOp:rotateY.timeSamples = {
        0: 0,
        24: 90,
    }
    uniform token[] xformOpOrder = ["xformOp:rotateY", "xformOp:rotateX"]
}
`);
        const animation = stage.root.children[0].animation!;
        const rotationTracks = animation.tracks.filter((track) => track.target === "rotation");
        expect(rotationTracks).toHaveLength(1);
        expect(animation.tracks).toHaveLength(3);

        const expected = Quaternion.RotationAxis(new Vector3(0, 1, 0), Math.PI / 2).multiply(Quaternion.RotationAxis(new Vector3(1, 0, 0), Math.PI / 2));
        const values = rotationTracks[0].values;
        expect(Math.abs(values[4] - expected.x)).toBeLessThan(1e-5);
        expect(Math.abs(values[5] - expected.y)).toBeLessThan(1e-5);
        expect(Math.abs(values[6] - expected.z)).toBeLessThan(1e-5);
        expect(Math.abs(values[7] - expected.w)).toBeLessThan(1e-5);
    });

    it("honors omitted ordered xformOps and animated inverse operations", () => {
        const stage = mapUsda(`#usda 1.0
(
    timeCodesPerSecond = 24
)
def Xform "Animated"
{
    double3 xformOp:translate.timeSamples = {
        0: (5, 0, 0),
        24: (10, 0, 0),
    }
    double3 xformOp:scale.timeSamples = {
        0: (2, 2, 2),
        24: (3, 3, 3),
    }
    uniform token[] xformOpOrder = ["!invert!xformOp:translate"]
}
`);
        const animation = stage.root.children[0].animation!;
        const translation = trackOf(stage, "translation");
        const scale = trackOf(stage, "scale");
        expect(animation.tracks).toHaveLength(3);
        expect(Array.from(translation.values)).toEqual([-5, 0, 0, -10, 0, 0]);
        expect(Array.from(scale.values)).toEqual([1, 1, 1, 1, 1, 1]);
    });

    it("does not animate xformOps omitted by an empty authoritative order", () => {
        const stage = mapUsda(`#usda 1.0
(
    timeCodesPerSecond = 24
)
def Xform "Animated"
{
    double3 xformOp:translate.timeSamples = {
        0: (5, 0, 0),
        24: (10, 0, 0),
    }
    uniform token[] xformOpOrder = []
}
`);

        expect(stage.root.children[0].animation).toBeUndefined();
    });

    it("unions ordered operation sample times and applies held or linear interpolation to each op", () => {
        const linear = mapUsda(`#usda 1.0
(
    timeCodesPerSecond = 24
)
def Xform "Animated"
{
    double3 xformOp:translate.timeSamples = {
        0: (0, 0, 0),
        24: (10, 0, 0),
    }
    float xformOp:rotateX.timeSamples = {
        0: 0,
        12: 45,
        24: 90,
    }
    uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateX"]
}
`);
        const linearTranslation = trackOf(linear, "translation");
        expect(Array.from(linearTranslation.times)).toEqual([0, 0.5, 1]);
        expect(linearTranslation.values[3]).toBeCloseTo(5);

        const held = mapUsda(`#usda 1.0
(
    timeCodesPerSecond = 24
    interpolation = "held"
)
def Xform "Animated"
{
    double3 xformOp:translate.timeSamples = {
        0: (0, 0, 0),
        24: (10, 0, 0),
    }
    float xformOp:rotateX.timeSamples = {
        0: 0,
        12: 45,
        24: 90,
    }
    uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateX"]
}
`);
        const heldTranslation = trackOf(held, "translation");
        expect(heldTranslation.interpolation).toBe("held");
        expect(heldTranslation.values[3]).toBe(0);
    });

    it("matches the static ordered transform at the first animation sample", () => {
        const stage = mapUsda(`#usda 1.0
(
    timeCodesPerSecond = 24
)
def Xform "Animated"
{
    double3 xformOp:translate = (1, 2, 3)
    double3 xformOp:translate.timeSamples = {
        0: (1, 2, 3),
        24: (4, 5, 6),
    }
    float xformOp:rotateY = 10
    float xformOp:rotateY.timeSamples = {
        0: 10,
        24: 20,
    }
    double3 xformOp:scale = (2, 3, 4)
    double3 xformOp:scale.timeSamples = {
        0: (2, 3, 4),
        24: (3, 4, 5),
    }
    uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateY", "xformOp:scale"]
}
`);
        const resolved = stage.root.children[0];
        const translation = trackOf(stage, "translation");
        const rotation = trackOf(stage, "rotation");
        const scale = trackOf(stage, "scale");

        expect(Array.from(translation.values.slice(0, 3))).toEqual(resolved.transform.translation);
        for (const [index, value] of Array.from(rotation.values.slice(0, 4)).entries()) {
            expect(value).toBeCloseTo(resolved.transform.rotation[index], 6);
        }
        expect(Array.from(scale.values.slice(0, 3))).toEqual(resolved.transform.scale);
    });

    it("keeps static and animated rotation evaluation aligned without xformOpOrder", () => {
        const stage = mapUsda(`#usda 1.0
(
    timeCodesPerSecond = 24
)
def Xform "Animated"
{
    float xformOp:rotateZ:anim = 10
    float xformOp:rotateZ:anim.timeSamples = {
        0: 10,
        24: 20,
    }
}
`);
        const resolved = stage.root.children[0];
        const rotation = trackOf(stage, "rotation");

        for (const [index, value] of Array.from(rotation.values.slice(0, 4)).entries()) {
            expect(value).toBeCloseTo(resolved.transform.rotation[index], 6);
        }
    });
});

describe("USD static xformOp resolution edge cases", () => {
    it("resolves a suffixed xformOp:orient without an authoritative xformOpOrder", () => {
        const stage = mapUsda(`#usda 1.0
def Xform "World"
{
    quatf xformOp:orient:variant = (0.7071068, 0, 0.7071068, 0)
}
`);
        const rotation = stage.root.children[0].transform.rotation;
        // A 90-degree rotation about Y: (x=0, y=sin(45), z=0, w=cos(45)) authored as (w, x, y, z) in USDA.
        expect(rotation[1]).toBeCloseTo(0.7071068, 5);
        expect(rotation[3]).toBeCloseTo(0.7071068, 5);
    });

    it("resolves a suffixed xformOp:orient inside an authoritative xformOpOrder", () => {
        const stage = mapUsda(`#usda 1.0
def Xform "World"
{
    quatf xformOp:orient:variant = (0.7071068, 0, 0.7071068, 0)
    uniform token[] xformOpOrder = ["xformOp:orient:variant"]
}
`);
        const rotation = stage.root.children[0].transform.rotation;
        expect(rotation[1]).toBeCloseTo(0.7071068, 5);
        expect(rotation[3]).toBeCloseTo(0.7071068, 5);
    });

    it("does not misread a non-namespaced xformOp:translate-prefixed token as the vector translate op", () => {
        // "xformOp:translateExtra" is not a real USD op (translate has no bare-suffix variant like
        // rotateX/rotateY); a naive prefix match would silently treat it as the double3 translate and
        // read a zero vector. It must instead be diagnosed as unsupported and left out of the transform.
        const stage = mapUsda(`#usda 1.0
def Xform "World"
{
    double3 xformOp:translate = (5, 6, 7)
    double xformOp:translateExtra = 9
    uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:translateExtra"]
}
`);
        const world = stage.root.children[0];
        expect(world.transform.translation).toEqual([5, 6, 7]);
        expect(stage.diagnostics.some((diagnostic) => /translateExtra/.test(diagnostic.message) && /[Uu]nsupported/.test(diagnostic.message))).toBe(true);
    });

    it("does not misread a non-namespaced xformOp:scale-prefixed token as the vector scale op", () => {
        const stage = mapUsda(`#usda 1.0
def Xform "World"
{
    double3 xformOp:scale = (2, 2, 2)
    double xformOp:scaleExtra = 9
    uniform token[] xformOpOrder = ["xformOp:scale", "xformOp:scaleExtra"]
}
`);
        const world = stage.root.children[0];
        expect(world.transform.scale).toEqual([2, 2, 2]);
        expect(stage.diagnostics.some((diagnostic) => /scaleExtra/.test(diagnostic.message) && /[Uu]nsupported/.test(diagnostic.message))).toBe(true);
    });

    it("diagnoses and substitutes identity for an inverse of a singular (zero-scale) xformOp", () => {
        const stage = mapUsda(`#usda 1.0
def Xform "World"
{
    double3 xformOp:scale = (0, 1, 1)
    uniform token[] xformOpOrder = ["!invert!xformOp:scale"]
}
`);
        const world = stage.root.children[0];
        // Identity was substituted because (0, 1, 1) has no inverse.
        expect(world.transform.translation).toEqual([0, 0, 0]);
        expect(world.transform.scale[0]).toBeCloseTo(1);
        expect(stage.diagnostics.some((diagnostic) => /singular/.test(diagnostic.message) && diagnostic.severity === "warning")).toBe(true);
    });
});

describe("USD animation adapter timing", () => {
    it("bakes sample seconds to Babylon frames and holds the nearest endpoint outside the range", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const node = new TransformNode("Animated", scene);
            const animation: IResolvedAnimation = {
                tracks: [
                    {
                        target: "translation",
                        times: new Float32Array([0, 1]),
                        values: new Float32Array([0, 0, 0, 10, 0, 0]),
                        interpolation: "linear",
                    },
                ],
            };

            const [translation] = CreateAnimationsForPrim(animation, node, 24);

            expect(translation.getKeys().map((key) => key.frame)).toEqual([0, 24]);
            expect((translation.evaluate(-10) as Vector3).equalsWithEpsilon(new Vector3(0, 0, 0), Epsilon)).toBe(true);
            expect((translation.evaluate(100) as Vector3).equalsWithEpsilon(new Vector3(10, 0, 0), Epsilon)).toBe(true);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });
});

describe("USD skeleton animation timing", () => {
    it("keeps skeleton animation times finite when the authored rate is invalid", () => {
        const stage = MapLayerToResolvedStage(invalidRateSkinnedLayer());

        expect(stage.metadata.timeCodesPerSecond).toBe(24);
        const times = Array.from(stage.skeletons[0].animation!.times);
        expect(times).toEqual([0, 1]);
        expect(times.every((time) => Number.isFinite(time))).toBe(true);
    });
});

function invalidRateSkinnedLayer(): ISdfLayer {
    return {
        identifier: "/Scenes/skinned-timing.usda",
        timeCodesPerSecond: 0,
        subLayers: [],
        rootPrims: [
            {
                name: "World",
                path: "/World",
                specifier: "def",
                typeName: "SkelRoot",
                properties: {
                    "skel:animationSource": { kind: "relationship", targets: { isExplicit: true, explicit: ["/World/Anim"] } },
                },
                children: [
                    {
                        name: "Rig",
                        path: "/World/Rig",
                        specifier: "def",
                        typeName: "Skeleton",
                        properties: {
                            joints: { kind: "attribute", typeName: "token[]", default: { type: "token[]", value: ["Root"] } },
                            bindTransforms: { kind: "attribute", typeName: "matrix4d[]", default: { type: "matrix4d[]", value: [IdentityMatrix] } },
                            restTransforms: { kind: "attribute", typeName: "matrix4d[]", default: { type: "matrix4d[]", value: [IdentityMatrix] } },
                        },
                        children: [],
                    },
                    {
                        name: "Mesh",
                        path: "/World/Mesh",
                        specifier: "def",
                        typeName: "Mesh",
                        properties: {
                            points: {
                                kind: "attribute",
                                typeName: "point3f[]",
                                default: {
                                    type: "point3f[]",
                                    value: [
                                        [0, 0, 0],
                                        [1, 0, 0],
                                        [0, 1, 0],
                                    ],
                                },
                            },
                            faceVertexCounts: { kind: "attribute", typeName: "int[]", default: { type: "int[]", value: [3] } },
                            faceVertexIndices: { kind: "attribute", typeName: "int[]", default: { type: "int[]", value: [0, 1, 2] } },
                            "skel:skeleton": { kind: "relationship", targets: { isExplicit: true, explicit: ["/World/Rig"] } },
                            "primvars:skel:jointIndices": {
                                kind: "attribute",
                                typeName: "int[]",
                                metadata: { elementSize: { type: "int", value: 1 } },
                                default: { type: "int[]", value: [0, 0, 0] },
                            },
                            "primvars:skel:jointWeights": {
                                kind: "attribute",
                                typeName: "float[]",
                                metadata: { elementSize: { type: "int", value: 1 } },
                                default: { type: "float[]", value: [1, 1, 1] },
                            },
                        },
                        children: [],
                    },
                    {
                        name: "Anim",
                        path: "/World/Anim",
                        specifier: "def",
                        typeName: "SkelAnimation",
                        properties: {
                            joints: { kind: "attribute", typeName: "token[]", default: { type: "token[]", value: ["Root"] } },
                            translations: {
                                kind: "attribute",
                                typeName: "float3[]",
                                timeSamples: {
                                    times: [0, 24],
                                    values: [
                                        { type: "vec3f[]", value: [[0, 0, 0]] },
                                        { type: "vec3f[]", value: [[1, 0, 0]] },
                                    ],
                                },
                            },
                        },
                        children: [],
                    },
                ],
            },
        ],
    };
}
