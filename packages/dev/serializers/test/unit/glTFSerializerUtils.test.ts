jest.doMock("babylonjs-gltf2interface", () => ({}), { virtual: true }); // Mock the glTF interface until I get confirmation to add it to the top-level tsconfig.json
import { Matrix, Quaternion, Vector3 } from "core/Maths/math.vector";
import { _ConvertToGLTFPBRMetallicRoughness, _SolveMetallic } from "serializers/glTF/2.0/glTFMaterialExporter";
import { ConvertToRightHandedRotation } from "serializers/glTF/2.0/glTFUtilities";

let seed = 1;
function random() {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

describe("Handedness helpers", () => {
    it("converts rotation quaternions via change of basis", async () => {
        const convertHandednessMatrix = Matrix.Compose(new Vector3(-1, 1, 1), Quaternion.Identity(), Vector3.Zero());
        const convertHandednessMatrixInvert = convertHandednessMatrix.clone().invert();
        const m = new Matrix();
        for (let i = 0; i < 1000; ++i) {
            const q = new Quaternion(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1, random() * 2 - 1).normalize();
            const q1 = ConvertToRightHandedRotation(q.clone());
            Matrix.FromQuaternionToRef(q, m);
            const q2 = Quaternion.FromRotationMatrix(convertHandednessMatrix.multiply(m).multiply(convertHandednessMatrixInvert));
            expect(q1.isApprox(q2, 0.0000001)).toBeTruthy();
        }
    });
});

describe("Material helpers", () => {
    it("solves for metallic", async () => {
        const solveZero = _SolveMetallic(1.0, 0.0, 1.0);
        const solveApproxOne = _SolveMetallic(0.0, 1.0, 1.0);

        expect(solveZero).toBe(0.0);
        expect(solveApproxOne).toBeCloseTo(1.0, 1e-6);
    });
});
