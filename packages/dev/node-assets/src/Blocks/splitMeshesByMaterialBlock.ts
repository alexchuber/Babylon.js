import { type Material, type Mesh, type Primitive } from "@gltf-transform/core";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetGltfAsset } from "../representations/gltfAsset";

/** Splits Universal meshes so each resulting mesh contains primitives using one material. */
export class SplitMeshesByMaterialBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "SplitMeshesByMaterialBlock";

    /** The Universal asset whose meshes will be split. */
    public readonly input: NodeAssetConnectionPoint;
    /** The split Universal asset. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a Split Meshes by Material block.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.UNIVERSAL);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    /** Splits multi-material meshes in the incoming Universal asset in place. */
    public override async _buildBlockAsync(): Promise<void> {
        const asset = GetGltfAsset(this.input.value, this.input.name);
        const document = asset.document;
        const root = document.getRoot();

        for (const mesh of [...root.listMeshes()]) {
            const primitiveGroups = GroupPrimitivesByMaterial(mesh);
            if (primitiveGroups.length < 2) {
                continue;
            }

            const sourceNodes = root.listNodes().filter((node) => node.getMesh() === mesh);
            const [firstGroup, ...remainingGroups] = primitiveGroups;
            for (const primitive of mesh.listPrimitives()) {
                mesh.removePrimitive(primitive);
            }
            for (const primitive of firstGroup.primitives) {
                mesh.addPrimitive(primitive);
            }

            remainingGroups.forEach((group, groupIndex) => {
                const splitMesh = document
                    .createMesh(CreateSplitName(mesh.getName(), group.material?.getName(), groupIndex + 1))
                    .setWeights(mesh.getWeights())
                    .setExtras({ ...mesh.getExtras() });
                for (const primitive of group.primitives) {
                    splitMesh.addPrimitive(primitive);
                }

                for (const sourceNode of sourceNodes) {
                    const splitNode = document
                        .createNode(CreateSplitName(sourceNode.getName() || mesh.getName(), group.material?.getName(), groupIndex + 1))
                        .setMesh(splitMesh)
                        .setSkin(sourceNode.getSkin())
                        .setWeights(sourceNode.getWeights());
                    sourceNode.addChild(splitNode);
                }
            });
        }

        this.output.value = asset;
    }
}

function GroupPrimitivesByMaterial(mesh: Mesh): Array<{ readonly material: Material | null; readonly primitives: Primitive[] }> {
    const groups = new Map<Material | null, Primitive[]>();
    for (const primitive of mesh.listPrimitives()) {
        const material = primitive.getMaterial();
        const primitives = groups.get(material);
        if (primitives) {
            primitives.push(primitive);
        } else {
            groups.set(material, [primitive]);
        }
    }
    return Array.from(groups, ([material, primitives]) => ({ material, primitives }));
}

function CreateSplitName(subjectName: string, materialName: string | undefined, index: number): string {
    const subject = subjectName || "mesh";
    const material = materialName || `material-${index}`;
    return `${subject}-${material}`;
}

RegisterBlock(SplitMeshesByMaterialBlock.ClassName, (name, nodeAsset) => new SplitMeshesByMaterialBlock(name, nodeAsset));
