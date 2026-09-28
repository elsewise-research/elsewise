'use client';
import { useState } from "react";
import { Stage, Layer, Rect, Text, Circle, Group, Arrow, Label, Tag } from "react-konva";
import { Trajectory } from "@/models/Trajectory";
import { TrajectoryMoment } from "@/models/ValueClustering";
import { HIGHLIGHTED_OPACITY, NON_HIGHLIGHTED_OPACITY } from "@/utils/color";

const ROW_HEIGHT = 44;
const MIN_COL_WIDTH = 70;
const LABEL_WIDTH = 100;
const HEADER_HEIGHT = 40;
const CIRCLE_RADIUS = 10;
const CIRCLE_GAP = 4;
const CELL_MARGIN = 3;

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
    onCellClick?: (moments: TrajectoryMoment[]) => void;
    currTrajectoryMoment?: TrajectoryMoment;
    highlightedTrajectoryMoments?: TrajectoryMoment[];
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
    onCellClick,
    currTrajectoryMoment,
    highlightedTrajectoryMoments = [],
}: Props) {
    // With nothing highlighted, every moment shows at full opacity; once something is
    // highlighted, only members of that set stay at full opacity and the rest dim.
    const isHighlighted = (trajectoryId: string, turnId: string) =>
        highlightedTrajectoryMoments.length === 0
        || highlightedTrajectoryMoments.some(
            (highlighted) => highlighted.trajectoryId === trajectoryId && highlighted.turnId === turnId,
        );

    const markerOpacity = (trajectoryId: string, turnId: string) =>
        isHighlighted(trajectoryId, turnId) ? HIGHLIGHTED_OPACITY : NON_HIGHLIGHTED_OPACITY;
    const [hovered, setHovered] = useState<HoverInfo | null>(null);

    // Widen columns beyond the minimum so the cell with the most moments in it
    // still fits them all without overflowing.
    const spacing = CIRCLE_RADIUS * 2 + CIRCLE_GAP;
    const maxMomentsPerCell = Math.max(
        1,
        ...values.flatMap((value) => columns.map((column) => getCellMoments(value, column).length)),
    );
    const colWidth = Math.max(MIN_COL_WIDTH, maxMomentsPerCell * spacing - CIRCLE_GAP + CELL_MARGIN * 2 + 8);

    const cellCenter = (rowIndex: number, colIndex: number) => ({
        x: LABEL_WIDTH + colIndex * colWidth + colWidth / 2,
        y: HEADER_HEIGHT + rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2,
    });

    // Lay out the moments belonging to each (row, column) cell side by side within it.
    const momentPositions = new Map<string, { x: number; y: number }>();
    values.forEach((value, rowIndex) => {
        columns.forEach((column, colIndex) => {
            const moments = getCellMoments(value, column);
            if (moments.length === 0) return;

            const { x: cx, y: cy } = cellCenter(rowIndex, colIndex);
            const totalWidth = moments.length * spacing - CIRCLE_GAP;
            moments.forEach((moment, i) => {
                const x = cx - totalWidth / 2 + spacing * i + spacing / 2;
                momentPositions.set(`${moment.trajectoryId}::${moment.turnId}`, { x, y: cy });
            });
        });
    });

    const arrows = !showArrows ? [] : trajectories.flatMap((trajectory) => {
        const segments: { key: string; points: number[]; color: string; opacity: number }[] = [];
        for (let i = 0; i < trajectory.turns.length - 1; i++) {
            const fromTurnId = trajectory.turns[i].id;
            const toTurnId = trajectory.turns[i + 1].id;
            const from = momentPositions.get(`${trajectory.id}::${fromTurnId}`);
            const to = momentPositions.get(`${trajectory.id}::${toTurnId}`);
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
                opacity: (markerOpacity(trajectory.id, fromTurnId) + markerOpacity(trajectory.id, toTurnId)) / 2,
            });
        }
        return segments;
    });

    const width = LABEL_WIDTH + columns.length * colWidth;
    const height = HEADER_HEIGHT + values.length * ROW_HEIGHT;

    return (
        <Stage width={width} height={height}>
            <Layer>
                {/* clickable cell areas: highlight every moment in this (value, column) combination */}
                {values.map((value, rowIndex) =>
                    columns.map((column, colIndex) => (
                        <Rect
                            key={`cell-${rowIndex}-${colIndex}`}
                            x={LABEL_WIDTH + colIndex * colWidth + CELL_MARGIN}
                            y={HEADER_HEIGHT + rowIndex * ROW_HEIGHT + CELL_MARGIN}
                            width={colWidth - CELL_MARGIN * 2}
                            height={ROW_HEIGHT - CELL_MARGIN * 2}
                            fill="#eee"
                            cornerRadius={10}
                            onClick={() => onCellClick?.(getCellMoments(value, column))}
                            onTap={() => onCellClick?.(getCellMoments(value, column))}
                            onMouseEnter={(e) => {
                                const stage = e.target.getStage();
                                if (stage) stage.container().style.cursor = "pointer";
                            }}
                            onMouseLeave={(e) => {
                                const stage = e.target.getStage();
                                if (stage) stage.container().style.cursor = "default";
                            }}
                        />
                    )),
                )}

                {/* headers */}
                <Text text="Value" x={8} y={6} fontSize={12} fontStyle="bold" fill="#777" />
                {columns.map((column, colIndex) => (
                    <Text
                        key={`col-header-${column}`}
                        text={columnLabel(column)}
                        x={LABEL_WIDTH + colIndex * colWidth}
                        y={6}
                        width={colWidth}
                        align="center"
                        fontSize={12}
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
                        opacity={arrow.opacity}
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
                            opacity={markerOpacity(trajectoryId, turnId)}
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
                            <Circle
                                radius={CIRCLE_RADIUS}
                                fill={trajectoryColorSetting[trajectoryId] ?? "#999"}
                                stroke={
                                    currTrajectoryMoment
                                    && currTrajectoryMoment.trajectoryId === trajectoryId
                                    && currTrajectoryMoment.turnId === turnId
                                        ? "black"
                                        : undefined
                                }
                                strokeWidth={2}
                            />
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
