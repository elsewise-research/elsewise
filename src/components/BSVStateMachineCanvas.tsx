'use client';
import { useMemo, useState } from "react";
import { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide, type SimulationNodeDatum, type SimulationLinkDatum } from "d3-force";
import { Stage, Layer, Arrow, Circle, Text, Group, Path } from "react-konva";
import { Trajectory } from "@/models/Trajectory";
import { ValueClustering, TrajectoryMoment, DIMENSION_VALUE_SEPARATOR } from "@/models/ValueClustering";

const WIDTH = 320;
const HEIGHT = 260;
const NODE_RADIUS = 15;
const MIN_OPACITY = 0.25;

type SimNode = SimulationNodeDatum & {
    id: string;
    count: number;
};

type SimLink = SimulationLinkDatum<SimNode>;

type Props = {
    valueClustering: ValueClustering;
    trajectories: Trajectory[];
    onCellClick?: (moments: TrajectoryMoment[]) => void;
};

export default function BSVStateMachineCanvas({ valueClustering, trajectories, onCellClick }: Props) {
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

    const { nodes, links } = useMemo(() => {
        const turnOrderByTrajectory = new Map<string, Map<string, number>>();
        for (const trajectory of trajectories) {
            const turnOrder = new Map<string, number>();
            trajectory.turns.forEach((turn, index) => turnOrder.set(turn.id, index + 1));
            turnOrderByTrajectory.set(trajectory.id, turnOrder);
        }
        const getTurnOrder = (moment: TrajectoryMoment): number | undefined =>
            turnOrderByTrajectory.get(moment.trajectoryId)?.get(moment.turnId);

        // Which state (valueMapping key) each trajectory moment belongs to.
        const stateByMoment = new Map<string, string>();
        for (const [key, moments] of Object.entries(valueClustering.valueMapping)) {
            for (const moment of moments) {
                stateByMoment.set(`${moment.trajectoryId}::${moment.turnId}`, key);
            }
        }

        const simNodes: SimNode[] = Object.entries(valueClustering.valueMapping)
            .filter(([, moments]) => moments.length > 0)
            .map(([key, moments]) => ({ id: key, count: moments.length }));

        const edgeKeys = new Set<string>();
        for (const trajectory of trajectories) {
            for (let i = 0; i < trajectory.turns.length - 1; i++) {
                const fromMoment = { trajectoryId: trajectory.id, turnId: trajectory.turns[i].id };
                const toMoment = { trajectoryId: trajectory.id, turnId: trajectory.turns[i + 1].id };
                const fromOrder = getTurnOrder(fromMoment);
                const toOrder = getTurnOrder(toMoment);
                if (fromOrder === undefined || toOrder === undefined || toOrder !== fromOrder + 1) continue;

                const fromState = stateByMoment.get(`${fromMoment.trajectoryId}::${fromMoment.turnId}`);
                const toState = stateByMoment.get(`${toMoment.trajectoryId}::${toMoment.turnId}`);
                if (!fromState || !toState) continue;

                edgeKeys.add(`${fromState}->${toState}`);
            }
        }

        const simLinks: SimLink[] = Array.from(edgeKeys).map((edgeKey) => {
            const [source, target] = edgeKey.split("->");
            return { source, target };
        });

        const simulation = forceSimulation(simNodes)
            .force("charge", forceManyBody().strength(-10))
            .force("link", forceLink<SimNode, SimLink>(simLinks).id((n) => n.id).distance(70))
            .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
            .force("collide", forceCollide(NODE_RADIUS + 12))
            .stop();

        for (let i = 0; i < 300; i++) simulation.tick();

        // Rescale/recenter the settled layout so the whole graph, including each node's
        // label (a 120px-wide box below it), fits inside the viewport.
        const labelHalfWidth = 60;
        const labelDepth = NODE_RADIUS + 4 + 16;
        const paddingX = labelHalfWidth + 4;
        const paddingY = Math.max(NODE_RADIUS + 8, labelDepth) + 4;
        const xs = simNodes.map((n) => n.x ?? WIDTH / 2);
        const ys = simNodes.map((n) => n.y ?? HEIGHT / 2);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const graphWidth = maxX - minX || 1;
        const graphHeight = maxY - minY || 1;
        const scale = Math.min(
            (WIDTH - paddingX * 2) / graphWidth,
            (HEIGHT - paddingY * 2) / graphHeight,
            3, // avoid blowing up spacing when there are only one or two nodes
        );
        const offsetX = (WIDTH - graphWidth * scale) / 2 - minX * scale;
        const offsetY = (HEIGHT - graphHeight * scale) / 2 - minY * scale;

        for (const node of simNodes) {
            node.x = (node.x ?? WIDTH / 2) * scale + offsetX;
            node.y = (node.y ?? HEIGHT / 2) * scale + offsetY;
        }

        return { nodes: simNodes, links: simLinks };
    }, [valueClustering, trajectories]);

    const maxCount = Math.max(1, ...nodes.map((n) => n.count));
    const opacityFor = (count: number) =>
        maxCount === 1 ? 1 : MIN_OPACITY + (1 - MIN_OPACITY) * ((count - 1) / (maxCount - 1));

    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    return (
        <Stage width={WIDTH} height={HEIGHT}>
            <Layer>
                {links.map((link, index) => {
                    const source = typeof link.source === "object" ? link.source : nodeById.get(link.source as string);
                    const target = typeof link.target === "object" ? link.target : nodeById.get(link.target as string);
                    if (!source || !target || source.x === undefined || target.x === undefined) return null;

                    const sx = source.x!, sy = source.y!, tx = target.x!, ty = target.y!;

                    // Self-loop: draw a small loop above the node instead of a straight arrow.
                    if (source.id === target.id) {
                        const loopSize = NODE_RADIUS * 1.4;
                        return (
                            <Path
                                key={`link-${index}`}
                                data={`M ${sx - NODE_RADIUS * 0.5} ${sy - NODE_RADIUS * 0.9}
                                       C ${sx - loopSize} ${sy - loopSize * 1.8}, ${sx + loopSize} ${sy - loopSize * 1.8}, ${sx + NODE_RADIUS * 0.5} ${sy - NODE_RADIUS * 0.9}`}
                                stroke="#999"
                                strokeWidth={1.5}
                                opacity={0.7}
                            />
                        );
                    }

                    const dx = tx - sx, dy = ty - sy;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    const unitX = dx / dist, unitY = dy / dist;
                    const margin = NODE_RADIUS + 2;

                    return (
                        <Arrow
                            key={`link-${index}`}
                            points={[
                                sx + unitX * margin,
                                sy + unitY * margin,
                                tx - unitX * margin,
                                ty - unitY * margin,
                            ]}
                            stroke="#111"
                            fill="#111"
                            strokeWidth={1.5}
                            pointerLength={6}
                            pointerWidth={6}
                            opacity={(opacityFor(source.count) + opacityFor(target.count)) / 2}
                        />
                    );
                })}

                {nodes.map((node) => (
                    <Group
                        key={node.id}
                        x={node.x}
                        y={node.y}
                        onClick={() => onCellClick?.(valueClustering.valueMapping[node.id] ?? [])}
                        onTap={() => onCellClick?.(valueClustering.valueMapping[node.id] ?? [])}
                        onMouseEnter={(e) => {
                            const stage = e.target.getStage();
                            if (stage) stage.container().style.cursor = "pointer";
                            setHoveredNodeId(node.id);
                        }}
                        onMouseLeave={(e) => {
                            const stage = e.target.getStage();
                            if (stage) stage.container().style.cursor = "default";
                            setHoveredNodeId(null);
                        }}
                    >
                        <Circle
                            radius={NODE_RADIUS}
                            fill="#FFFFFF"
                            opacity={opacityFor(node.count)}
                            stroke={hoveredNodeId === node.id ? "#333" : "#000"}
                            strokeWidth={hoveredNodeId === node.id ? 1.5 : 1}
                        />
                        <Text
                            text={String(node.count)}
                            fontSize={12}
                            fontStyle="600"
                            fill="black"
                            width={NODE_RADIUS * 2}
                            height={NODE_RADIUS * 2}
                            offsetX={NODE_RADIUS}
                            offsetY={NODE_RADIUS}
                            align="center"
                            verticalAlign="middle"
                        />
                        <Text
                            text={node.id.split(DIMENSION_VALUE_SEPARATOR).join(", ")}
                            fontSize={10}
                            fill="#333"
                            y={NODE_RADIUS + 4}
                            width={120}
                            offsetX={60}
                            align="center"
                        />
                    </Group>
                ))}
            </Layer>
        </Stage>
    );
}
