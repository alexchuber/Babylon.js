import { describe, expect, it } from "vitest";
import { ResolveUsdStageAsync } from "loaders/USD/resolution/usdResolver";

// Focused tests for the face-varying normals subdivision recovery heuristic.
// USD defaults subdivisionScheme to catmullClark. Face-varying UVs are valid on subdivision
// surfaces (interpolated per faceVaryingLinearInterpolation) and must NOT override the default.
// Face-varying normals are polygon-only (subdivision surfaces compute normals from the limit
// surface), so their presence with an unset scheme triggers a narrow recovery to "none".

function resolveUsda(usda: string) {
    return ResolveUsdStageAsync(usda, "", "test.usda", {});
}

const QuadPoints = "point3f[] points = [(-1,-1,0),(1,-1,0),(1,1,0),(-1,1,0)]";
const QuadCounts = "int[] faceVertexCounts = [4]";
const QuadIndices = "int[] faceVertexIndices = [0,1,2,3]";

const FaceVaryingUVs = `texCoord2f[] primvars:st = [(0,0),(1,0),(1,1),(0,1)] (
            interpolation = "faceVarying"
        )`;

const FaceVaryingNormals = `normal3f[] normals = [(0,0,1),(0,0,1),(0,0,1),(0,0,1)] (
            interpolation = "faceVarying"
        )`;

const ConstantNormals = `normal3f[] normals = [(0,0,1)] (
            interpolation = "constant"
        )`;

describe("USD subdivision scheme inference", () => {
    it("defaults to catmullClark when subdivisionScheme is not authored and no face-varying normals", async () => {
        const stage = await resolveUsda(`#usda 1.0
(defaultPrim = "M")
def Mesh "M" {
    ${QuadPoints}
    ${QuadCounts}
    ${QuadIndices}
}`);
        expect(stage.meshes[0].subdivisionScheme).toBe("catmullClark");
    });

    it("keeps catmullClark when only face-varying UVs are authored (no normals)", async () => {
        const stage = await resolveUsda(`#usda 1.0
(defaultPrim = "M")
def Mesh "M" {
    ${QuadPoints}
    ${QuadCounts}
    ${QuadIndices}
    ${FaceVaryingUVs}
}`);
        // Face-varying UVs are valid on subdivision surfaces and must NOT trigger
        // the polygon-mesh recovery.
        expect(stage.meshes[0].subdivisionScheme).toBe("catmullClark");
    });

    it("keeps catmullClark when constant normals and face-varying UVs are authored", async () => {
        const stage = await resolveUsda(`#usda 1.0
(defaultPrim = "M")
def Mesh "M" {
    ${QuadPoints}
    ${QuadCounts}
    ${QuadIndices}
    ${ConstantNormals}
    ${FaceVaryingUVs}
}`);
        expect(stage.meshes[0].subdivisionScheme).toBe("catmullClark");
    });

    it("recovers as none when face-varying normals are authored without subdivisionScheme", async () => {
        const stage = await resolveUsda(`#usda 1.0
(defaultPrim = "M")
def Mesh "M" {
    ${QuadPoints}
    ${QuadCounts}
    ${QuadIndices}
    ${FaceVaryingNormals}
}`);
        expect(stage.meshes[0].subdivisionScheme).toBe("none");
    });

    it("emits a recovery diagnostic when face-varying normals override the default scheme", async () => {
        const stage = await resolveUsda(`#usda 1.0
(defaultPrim = "M")
def Mesh "M" {
    ${QuadPoints}
    ${QuadCounts}
    ${QuadIndices}
    ${FaceVaryingNormals}
}`);
        const recovery = stage.diagnostics.find((d) => /face-varying normals.*Recovered/i.test(d.message));
        expect(recovery).toBeDefined();
        expect(recovery!.severity).toBe("warning");
        expect(recovery!.path).toBe("/M");
    });

    it("does NOT recover when face-varying normals are authored with explicit catmullClark", async () => {
        const stage = await resolveUsda(`#usda 1.0
(defaultPrim = "M")
def Mesh "M" {
    ${QuadPoints}
    ${QuadCounts}
    ${QuadIndices}
    ${FaceVaryingNormals}
    token subdivisionScheme = "catmullClark"
}`);
        // Explicit catmullClark is honored even with face-varying normals; the recovery
        // only applies when the scheme is absent (ambiguous authoring).
        expect(stage.meshes[0].subdivisionScheme).toBe("catmullClark");
    });

    it("honors explicit subdivisionScheme none regardless of normals", async () => {
        const stage = await resolveUsda(`#usda 1.0
(defaultPrim = "M")
def Mesh "M" {
    ${QuadPoints}
    ${QuadCounts}
    ${QuadIndices}
    token subdivisionScheme = "none"
}`);
        expect(stage.meshes[0].subdivisionScheme).toBe("none");
    });
});
