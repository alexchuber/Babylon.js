import { Vector3, Quaternion, Matrix } from "core/Maths/math.vector.pure";
import { TransformNode } from "core/Meshes/transformNode.pure";
import { type Scene } from "core/scene";
import { type IResolvedTransform, type IStageMetadata } from "../resolution/resolvedStage";

const DegToRad = Math.PI / 180;

/**
 * Creates the root node that converts USD stage space into Babylon space without changing the
 * caller's scene handedness. USD stages use right-handed coordinates; a left-handed Babylon scene
 * receives a subtree-local reflection on the root and the corresponding up-axis rotation.
 *
 * The whole imported prim tree is parented under this node, so up-axis (Z-up → Y-up) and
 * `metersPerUnit` scaling happen once at the root. Geometry adapters invert the effective side
 * orientation for the reflected left-handed subtree.
 *
 * @param metadata the stage metadata describing axes and units
 * @param scene the scene to create the node in
 * @returns the configured root transform node
 */
export function CreateStageRoot(metadata: IStageMetadata, scene: Scene): TransformNode {
    const root = new TransformNode("__usd_root__", scene);
    const unit = metadata.metersPerUnit > 0 ? metadata.metersPerUnit : 1;
    const isRightHandedScene = scene.useRightHandedSystem;
    root.rotationQuaternion = metadata.upAxis === "Z" ? Quaternion.RotationAxis(new Vector3(1, 0, 0), (isRightHandedScene ? -90 : 90) * DegToRad) : Quaternion.Identity();
    root.scaling = new Vector3(unit, unit, isRightHandedScene ? unit : -unit);
    return root;
}

/**
 * Applies a resolved local transform to a Babylon node. When the resolved transform carries a full
 * matrix (lossy TRS, e.g. shear) it is decomposed and used in preference to the TRS triple.
 * @param node the node to write the transform onto
 * @param transform the resolved local transform
 */
export function ApplyResolvedTransform(node: TransformNode, transform: IResolvedTransform): void {
    if (transform.matrix && transform.matrix.length === 16) {
        node.position.setAll(0);
        node.rotationQuaternion = Quaternion.Identity();
        node.scaling.setAll(1);
        node.setPreTransformMatrix(Matrix.FromArray(transform.matrix));
        return;
    }

    node.position = new Vector3(transform.translation[0], transform.translation[1], transform.translation[2]);
    node.rotationQuaternion = new Quaternion(transform.rotation[0], transform.rotation[1], transform.rotation[2], transform.rotation[3]);
    node.scaling = new Vector3(transform.scale[0], transform.scale[1], transform.scale[2]);
}
