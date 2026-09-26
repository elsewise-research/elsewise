'use client';
import { useState } from "react";
import { Stage, Layer, Line, Text, Circle, Group, Arrow, Label, Tag } from "react-konva";
import { Trajectory } from "@/models/Trajectory";
import { TrajectoryMoment } from "@/models/ValueClustering";

const ROW_HEIGHT = 44;
const COL_WIDTH = 70;
const LABEL_WIDTH = 100;
const HEADER_HEIGHT = 28;
const CIRCLE_RADIUS = 10;
const CIRCLE_GAP = 4;

type HoverInfo = {
    x: number;
    y: number;
    trajectoryId: string;
    turnId: string;
};

type Props = {
    values: string[];
    columns: string[];
    trajectories: Trajectory[];
    trajectoryColorSetting: Record<string, string>;
    getCellMoments: (rowValue: string, columnValue: string) => TrajectoryMoment[];
    getTurnOrder: (moment: TrajectoryMoment) => number | undefined;
    columnLabel?: (column: string) => string;
    showArrows?: boolean;
    onMomentClick?: (moment: TrajectoryMoment) => void;
};

export default function BSVDrawingCanvas({
    values,
    columns,
    trajectories,
    trajectoryColorSetting,
    getCellMoments,
    getTurnOrder,
    columnLabel = (column) => column,
    showArrows = true,
    onMomentClick,
}: Props) {
    const [hovered, setHovered] = useState<HoverInfo | null>(null);

    const cellCenter = (rowIndex: number, colIndex: number) => ({
        x: LABEL_WIDTH + colIndex * COL_WIDTH + COL_WIDTH / 2,
        y: HEADER_HEIGHT + rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2,
    });

    // Lay out the moments belonging to each (row, column) cell side by side within it.
    const momentPositions = new Map<string, { x: number; y: number }>();
    values.forEach((value, rowIndex) => {
        columns.forEach((column, colIndex) => {
            const moments = getCellMoments(value, column);
            if (moments.length === 0) return;

            const { x: cx, y: cy } = cellCenter(rowIndex, colIndex);
            const spacing = CIRCLE_RADIUS * 2 + CIRCLE_GAP;
            const totalWidth = moments.length * spacing - CIRCLE_GAP;
            moments.forEach((moment, i) => {
                const x = cx - totalWidth / 2 + spacing * i + spacing / 2;
                momentPositions.set(`${moment.trajectoryId}::${moment.turnId}`, { x, y: cy });
            });
        });
    });

    const arrows = !showArrows ? [] : trajectories.flatMap((trajectory) => {
        const segments: { key: string; points: number[]; color: string }[] = [];
        for (let i = 0; i < trajectory.turns.length - 1; i++) {
            const from = momentPositions.get(`${trajectory.id}::${trajectory.turns[i].id}`);
            const to = momentPositions.get(`${trajectory.id}::${trajectory.turns[i + 1].id}`);
            if (!from || !to) continue;

            // Trim both ends back to the circles' edges so the line (and its arrowhead)
            // don't get hidden underneath the moment circles, which render on top.
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const margin = CIRCLE_RADIUS + 2;
            const unitX = dist > 0 ? dx / dist : 0;
            const unitY = dist > 0 ? dy / dist : 0;

            segments.push({
                key: `${trajectory.id}-${i}`,
                points: [
                    from.x + unitX * margin,
                    from.y + unitY * margin,
                    to.x - unitX * margin,
                    to.y - unitY * margin,
                ],
                color: trajectoryColorSetting[trajectory.id] ?? "#999",
            });
        }
        return segments;
    });

    const width = LABEL_WIDTH + columns.length * COL_WIDTH;
    const height = HEADER_HEIGHT + values.length * ROW_HEIGHT;

    return (
        <Stage width={width} height={height}>
            <Layer>
                {/* grid lines */}
                {values.map((_, rowIndex) => (
                    <Line
                        key={`row-line-${rowIndex}`}
                        points={[0, HEADER_HEIGHT + rowIndex * ROW_HEIGHT, width, HEADER_HEIGHT + rowIndex * ROW_HEIGHT]}
                        stroke="#eee"
                        strokeWidth={1}
                    />
                ))}
                {columns.map((_, colIndex) => (
                    <Line
                        key={`col-line-${colIndex}`}
                        points={[LABEL_WIDTH + colIndex * COL_WIDTH, 0, LABEL_WIDTH + colIndex * COL_WIDTH, height]}
                        stroke="#eee"
                        strokeWidth={1}
                    />
                ))}

                {/* headers */}
                <Text text="Value" x={8} y={6} fontSize={12} fontStyle="bold" fill="#777" />
                {columns.map((column, colIndex) => (
                    <Text
                        key={`col-header-${column}`}
                        text={columnLabel(column)}
                        x={LABEL_WIDTH + colIndex * COL_WIDTH}
                        y={6}
                        width={COL_WIDTH}
                        align="center"
                        fontSize={12}
                        fontStyle="bold"
                        fill="#777"
                    />
                ))}

                {/* row labels */}
                {values.map((value, rowIndex) => (
                    <Text
                        key={`row-label-${value}`}
                        text={value}
                        x={8}
                        y={HEADER_HEIGHT + rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2 - 6}
                        width={LABEL_WIDTH - 12}
                        fontSize={12}
                        fill="#777"
                    />
                ))}

                {/* arrows connecting consecutive moments within the same trajectory */}
                {arrows.map((arrow) => (
                    <Arrow
                        key={arrow.key}
                        points={arrow.points}
                        stroke={arrow.color}
                        fill={arrow.color}
                        strokeWidth={1.5}
                        pointerLength={6}
                        pointerWidth={6}
                        opacity={0.7}
                    />
                ))}

                {/* moments */}
                {Array.from(momentPositions.entries()).map(([key, pos]) => {
                    const [trajectoryId, turnId] = key.split("::");
                    const order = getTurnOrder({ trajectoryId, turnId });
                    return (
                        <Group
                            key={key}
                            x={pos.x}
                            y={pos.y}
                            onClick={() => onMomentClick?.({ trajectoryId, turnId })}
                            onTap={() => onMomentClick?.({ trajectoryId, turnId })}
                            onMouseEnter={(e) => {
                                const stage = e.target.getStage();
                                if (stage) stage.container().style.cursor = "pointer";
                                setHovered({ x: pos.x, y: pos.y, trajectoryId, turnId });
                            }}
                            onMouseLeave={(e) => {
                                const stage = e.target.getStage();
                                if (stage) stage.container().style.cursor = "default";
                                setHovered(null);
                            }}
                        >
                            <Circle radius={CIRCLE_RADIUS} fill={trajectoryColorSetting[trajectoryId] ?? "#999"} />
                            <Text
                                text={order !== undefined ? String(order) : ""}
                                fontSize={10}
                                fontStyle="600"
                                fill="white"
                                width={CIRCLE_RADIUS * 2}
                                height={CIRCLE_RADIUS * 2}
                                offsetX={CIRCLE_RADIUS}
                                offsetY={CIRCLE_RADIUS}
                                align="center"
                                verticalAlign="middle"
                            />
                        </Group>
                    );
                })}

                {hovered && (
                    <Label x={hovered.x} y={hovered.y - CIRCLE_RADIUS - 8} opacity={0.9}>
                        <Tag fill="black" cornerRadius={4} pointerDirection="down" pointerWidth={6} pointerHeight={6} />
                        <Text
                            text={`trajectoryId: ${hovered.trajectoryId}\nturnId: ${hovered.turnId}`}
                            fontSize={10}
                            fill="white"
                            padding={4}
                        />
                    </Label>
                )}
            </Layer>
        </Stage>
    );
}
