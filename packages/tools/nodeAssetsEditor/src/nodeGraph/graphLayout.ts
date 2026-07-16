import { type IGraphFrame, type IGraphNode, type IGraphWire, type Vec2 } from "./graphModel";
import { FrameHeaderHeight, GetNodesBounds, GetNodeSize } from "./geometry";

const LayoutOrigin = { x: 80, y: 80 };
const HorizontalGap = 120;
const VerticalGap = 56;
const FrameHorizontalPadding = 32;
const FrameVerticalPadding = 24;

/** Positions produced by the graph organizer for nodes and frames. */
export interface IGraphLayout {
    readonly nodePositions: ReadonlyMap<string, Vec2>;
    readonly frameBounds: ReadonlyMap<string, { readonly position: Vec2; readonly size: { readonly width: number; readonly height: number } }>;
}

function CompareNodes(left: IGraphNode, right: IGraphNode): number {
    return left.position.y - right.position.y || left.position.x - right.position.x || left.id.localeCompare(right.id);
}

function ComputeNodeDepths(nodes: readonly IGraphNode[], outgoingNodeIds: ReadonlyMap<string, ReadonlySet<string>>): ReadonlyMap<string, number> {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const indices = new Map<string, number>();
    const lowLinks = new Map<string, number>();
    const stack: string[] = [];
    const onStack = new Set<string>();
    const components: string[][] = [];
    let nextIndex = 0;

    const visit = (nodeId: string): void => {
        indices.set(nodeId, nextIndex);
        lowLinks.set(nodeId, nextIndex);
        nextIndex++;
        stack.push(nodeId);
        onStack.add(nodeId);

        const targets = [...(outgoingNodeIds.get(nodeId) ?? [])].map((targetId) => nodeById.get(targetId)!).sort(CompareNodes);
        for (const target of targets) {
            if (!indices.has(target.id)) {
                visit(target.id);
                lowLinks.set(nodeId, Math.min(lowLinks.get(nodeId)!, lowLinks.get(target.id)!));
            } else if (onStack.has(target.id)) {
                lowLinks.set(nodeId, Math.min(lowLinks.get(nodeId)!, indices.get(target.id)!));
            }
        }

        if (lowLinks.get(nodeId) === indices.get(nodeId)) {
            const component: string[] = [];
            let memberId: string;
            do {
                memberId = stack.pop()!;
                onStack.delete(memberId);
                component.push(memberId);
            } while (memberId !== nodeId);
            component.sort((left, right) => CompareNodes(nodeById.get(left)!, nodeById.get(right)!));
            components.push(component);
        }
    };

    for (const node of [...nodes].sort(CompareNodes)) {
        if (!indices.has(node.id)) {
            visit(node.id);
        }
    }

    const componentByNodeId = new Map<string, number>();
    components.forEach((component, componentId) => {
        for (const nodeId of component) {
            componentByNodeId.set(nodeId, componentId);
        }
    });

    const outgoingComponentIds = components.map(() => new Set<number>());
    const incomingCounts = components.map(() => 0);
    for (const [sourceNodeId, targetNodeIds] of outgoingNodeIds) {
        const sourceComponentId = componentByNodeId.get(sourceNodeId)!;
        for (const targetNodeId of targetNodeIds) {
            const targetComponentId = componentByNodeId.get(targetNodeId)!;
            if (sourceComponentId !== targetComponentId && !outgoingComponentIds[sourceComponentId].has(targetComponentId)) {
                outgoingComponentIds[sourceComponentId].add(targetComponentId);
                incomingCounts[targetComponentId]++;
            }
        }
    }

    const compareComponents = (left: number, right: number) => CompareNodes(nodeById.get(components[left][0])!, nodeById.get(components[right][0])!);
    const componentDepths = components.map(() => 0);
    const ready = components
        .map((_component, componentId) => componentId)
        .filter((componentId) => incomingCounts[componentId] === 0)
        .sort(compareComponents);
    while (ready.length > 0) {
        const componentId = ready.shift()!;
        const targets = [...outgoingComponentIds[componentId]].sort(compareComponents);
        for (const targetId of targets) {
            componentDepths[targetId] = Math.max(componentDepths[targetId], componentDepths[componentId] + 1);
            incomingCounts[targetId]--;
            if (incomingCounts[targetId] === 0) {
                ready.push(targetId);
                ready.sort(compareComponents);
            }
        }
    }

    return new Map(nodes.map((node) => [node.id, componentDepths[componentByNodeId.get(node.id)!]]));
}

/**
 * Computes a deterministic left-to-right layered layout from the graph's wire direction.
 * Disconnected nodes share the source column, cyclic components share a layer, and frames are resized
 * around their organized members.
 * @param nodes The graph nodes to organize.
 * @param wires The directed wires between nodes.
 * @param frames The editor frames whose bounds should follow their members.
 * @returns Node positions and frame bounds without mutating the graph.
 */
export function ComputeGraphLayout(nodes: readonly IGraphNode[], wires: readonly IGraphWire[], frames: readonly IGraphFrame[]): IGraphLayout {
    const nodeIdByPortId = new Map<string, string>();
    const outgoingNodeIds = new Map<string, Set<string>>();

    for (const node of nodes) {
        outgoingNodeIds.set(node.id, new Set());
        for (const port of node.ports) {
            nodeIdByPortId.set(port.id, node.id);
        }
    }

    for (const wire of wires) {
        const fromNodeId = nodeIdByPortId.get(wire.fromPortId);
        const toNodeId = nodeIdByPortId.get(wire.toPortId);
        if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) {
            continue;
        }
        const targets = outgoingNodeIds.get(fromNodeId)!;
        if (!targets.has(toNodeId)) {
            targets.add(toNodeId);
        }
    }

    const depths = ComputeNodeDepths(nodes, outgoingNodeIds);
    const columns = new Map<number, IGraphNode[]>();
    for (const node of nodes) {
        const depth = depths.get(node.id) ?? 0;
        const column = columns.get(depth) ?? [];
        column.push(node);
        columns.set(depth, column);
    }

    const nodePositions = new Map<string, Vec2>();
    let x = LayoutOrigin.x;
    for (const depth of [...columns.keys()].sort((left, right) => left - right)) {
        const column = columns.get(depth)!.sort(CompareNodes);
        let y = LayoutOrigin.y;
        let columnWidth = 0;
        for (const node of column) {
            const size = GetNodeSize(node);
            nodePositions.set(node.id, { x, y });
            y += size.height + VerticalGap;
            columnWidth = Math.max(columnWidth, size.width);
        }
        x += columnWidth + HorizontalGap;
    }

    const arrangedNodes = nodes.map((node) => ({ ...node, position: nodePositions.get(node.id) ?? node.position }));
    const arrangedNodeById = new Map(arrangedNodes.map((node) => [node.id, node]));
    const frameBounds = new Map<string, { position: Vec2; size: { width: number; height: number } }>();
    for (const frame of frames) {
        const memberBounds = GetNodesBounds(frame.nodeIds.map((nodeId) => arrangedNodeById.get(nodeId)).filter((node): node is IGraphNode => node !== undefined));
        if (!memberBounds) {
            frameBounds.set(frame.id, { position: frame.position, size: frame.size });
            continue;
        }
        frameBounds.set(frame.id, {
            position: {
                x: memberBounds.minX - FrameHorizontalPadding,
                y: memberBounds.minY - FrameHeaderHeight - FrameVerticalPadding,
            },
            size: {
                width: memberBounds.maxX - memberBounds.minX + FrameHorizontalPadding * 2,
                height: memberBounds.maxY - memberBounds.minY + FrameHeaderHeight + FrameVerticalPadding * 2,
            },
        });
    }

    return { nodePositions, frameBounds };
}
