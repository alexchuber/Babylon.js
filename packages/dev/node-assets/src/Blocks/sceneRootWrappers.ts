import { type Document, type Node, type Property, type Scene, type Skin } from "@gltf-transform/core";

type SceneRootWrapperPlan<Wrapper> = {
    scene: Scene;
    roots: readonly Node[];
    wrapper: Wrapper;
};

type RootAssignment<Wrapper> = {
    node: Node;
    plans: SceneRootWrapperPlan<Wrapper>[];
    requiresClone: boolean;
    wrapper: Wrapper;
};

type RootMembership<Wrapper> = {
    node: Node;
    plans: SceneRootWrapperPlan<Wrapper>[];
};

type CloneBatch<Wrapper> = {
    nodeClones: Map<Node, Node>;
    roots: Node[];
    skinClones: Map<Skin, Skin>;
    wrapper: Wrapper;
};

function HaveSameScenes<Wrapper>(left: readonly SceneRootWrapperPlan<Wrapper>[], right: readonly SceneRootWrapperPlan<Wrapper>[]): boolean {
    return left.length === right.length && left.every((plan, index) => plan.scene === right[index].scene);
}

function ListNodeHierarchies(roots: readonly Node[]): Node[] {
    const nodes: Node[] = [];
    const visited = new Set<Node>();
    const visit = (node: Node) => {
        if (visited.has(node)) {
            return;
        }
        visited.add(node);
        nodes.push(node);
        node.listChildren().forEach(visit);
    };
    roots.forEach(visit);
    return nodes;
}

function CloneNodeHierarchies(document: Document, roots: readonly Node[]): Map<Node, Node> {
    const nodes = ListNodeHierarchies(roots);
    const nodeClones = new Map<Node, Node>();
    for (const node of nodes) {
        nodeClones.set(node, document.createNode());
    }

    const propertyClones = new Map<Property, Property>(nodeClones);
    const resolve = <T extends Property>(property: T): T => (propertyClones.get(property) as T | undefined) ?? property;
    for (const [node, clone] of nodeClones) {
        clone.copy(node, resolve);
    }

    for (const animation of document.getRoot().listAnimations()) {
        // Snapshot channels before appending channels targeting the cloned nodes.
        for (const channel of [...animation.listChannels()]) {
            const target = channel.getTargetNode();
            if (target && nodeClones.has(target)) {
                animation.addChannel(document.createAnimationChannel().copy(channel, resolve));
            }
        }
    }

    return nodeClones;
}

function RetargetSkins<Wrapper>(
    document: Document,
    assignments: readonly RootAssignment<Wrapper>[],
    cloneBatches: readonly CloneBatch<Wrapper>[],
    areWrappersEquivalent: (left: Wrapper, right: Wrapper) => boolean
): void {
    const originalSkins = new Map<Node, Skin | null>();
    for (const assignment of assignments) {
        for (const node of ListNodeHierarchies([assignment.node])) {
            if (!originalSkins.has(node)) {
                originalSkins.set(node, node.getSkin());
            }
        }
    }

    for (const assignment of assignments) {
        const batch = cloneBatches.find((candidate) => areWrappersEquivalent(candidate.wrapper, assignment.wrapper));
        if (!batch) {
            continue;
        }
        for (const node of ListNodeHierarchies([assignment.node])) {
            const skin = originalSkins.get(node);
            const skeleton = skin?.getSkeleton();
            if (!skin || (!skin.listJoints().some((joint) => batch.nodeClones.has(joint)) && (!skeleton || !batch.nodeClones.has(skeleton)))) {
                continue;
            }
            let skinClone = batch.skinClones.get(skin);
            if (!skinClone) {
                const propertyClones = new Map<Property, Property>(batch.nodeClones);
                const resolve = <T extends Property>(property: T): T => (propertyClones.get(property) as T | undefined) ?? property;
                skinClone = document.createSkin().copy(skin, resolve);
                batch.skinClones.set(skin, skinClone);
            }
            (batch.nodeClones.get(node) ?? node).setSkin(skinClone);
        }
    }
}

/**
 * Wraps scene roots without moving shared roots out of other scenes. Roots needing different
 * wrappers are cloned structurally while meshes, cameras, accessors, and textures remain shared.
 * @param document The Universal document containing the scenes.
 * @param plans The original root membership and wrapper data for each scene.
 * @param areWrappersEquivalent Whether two scenes can share the same wrapper.
 * @param createWrapper Creates a wrapper from one plan's wrapper data.
 */
export function WrapSceneRoots<Wrapper>(
    document: Document,
    plans: readonly SceneRootWrapperPlan<Wrapper>[],
    areWrappersEquivalent: (left: Wrapper, right: Wrapper) => boolean,
    createWrapper: (wrapper: Wrapper) => Node
): void {
    const rootMemberships: RootMembership<Wrapper>[] = [];
    for (const plan of plans) {
        if (plan.roots.length === 0) {
            plan.scene.addChild(createWrapper(plan.wrapper));
            continue;
        }
        for (const root of plan.roots) {
            const membership = rootMemberships.find((candidate) => candidate.node === root);
            if (membership) {
                membership.plans.push(plan);
            } else {
                rootMemberships.push({ node: root, plans: [plan] });
            }
        }
    }

    const assignments: RootAssignment<Wrapper>[] = [];
    for (const membership of rootMemberships) {
        const partitions: { plans: SceneRootWrapperPlan<Wrapper>[]; wrapper: Wrapper }[] = [];
        for (const plan of membership.plans) {
            const partition = partitions.find((candidate) => areWrappersEquivalent(candidate.wrapper, plan.wrapper));
            if (partition) {
                partition.plans.push(plan);
            } else {
                partitions.push({ plans: [plan], wrapper: plan.wrapper });
            }
        }
        partitions.forEach((partition, index) => {
            assignments.push({
                node: membership.node,
                plans: partition.plans,
                requiresClone: index > 0,
                wrapper: partition.wrapper,
            });
        });
    }

    const groups: { assignments: RootAssignment<Wrapper>[]; plans: SceneRootWrapperPlan<Wrapper>[]; wrapper: Wrapper }[] = [];
    for (const assignment of assignments) {
        const group = groups.find((candidate) => areWrappersEquivalent(candidate.wrapper, assignment.wrapper) && HaveSameScenes(candidate.plans, assignment.plans));
        if (group) {
            group.assignments.push(assignment);
        } else {
            groups.push({ assignments: [assignment], plans: assignment.plans, wrapper: assignment.wrapper });
        }
    }

    const cloneBatches: CloneBatch<Wrapper>[] = [];
    for (const assignment of assignments) {
        if (!assignment.requiresClone) {
            continue;
        }
        const batch = cloneBatches.find((candidate) => areWrappersEquivalent(candidate.wrapper, assignment.wrapper));
        if (batch) {
            batch.roots.push(assignment.node);
        } else {
            cloneBatches.push({ nodeClones: new Map(), roots: [assignment.node], skinClones: new Map(), wrapper: assignment.wrapper });
        }
    }
    for (const batch of cloneBatches) {
        batch.nodeClones = CloneNodeHierarchies(document, batch.roots);
    }
    RetargetSkins(document, assignments, cloneBatches, areWrappersEquivalent);

    for (const group of groups) {
        const nodeClones = cloneBatches.find((batch) => areWrappersEquivalent(batch.wrapper, group.wrapper))?.nodeClones;
        const wrapper = createWrapper(group.wrapper);
        for (const assignment of group.assignments) {
            wrapper.addChild(assignment.requiresClone ? nodeClones!.get(assignment.node)! : assignment.node);
        }
        for (const plan of group.plans) {
            plan.scene.addChild(wrapper);
        }
    }
}
