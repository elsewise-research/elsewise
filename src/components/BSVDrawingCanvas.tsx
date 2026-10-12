'use client';
import { useState } from "react";
import { Stage, Layer, Rect, Text, Circle, Group, Arrow, Label, Tag } from "react-konva";
import { Trajectory } from "@/models/Trajectory";
import { TrajectoryMoment } from "@/models/ValueClustering";
import { HIGHLIGHTED_OPACITY, NON_HIGHLIGHTED_OPACITY } from "@/utils/color";

const MIN_CELL_SIZE = 70;
const LABEL_WIDTH = 100;
const HEADER_HEIGHT = 40;
const CIRCLE_RADIUS = 8;
const CIRCLE_GAP = 3;
const CELL_MARGIN = 10;
const EMPTY_CELL_OPACITY = 0.20;

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
    rowLabel?: (row: string) => string;
    cornerLabel?: string;
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
    rowLabel = (row) => row,
    cornerLabel = "Value",
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

    // Grow cells beyond the minimum so the one with the most moments in it still fits them
    // all, wrapping onto multiple lines (roughly as many per line as lines) instead of
    // stretching a single row — that's what keeps the cell square.
    const spacing = CIRCLE_RADIUS * 2 + CIRCLE_GAP;
    const maxMomentsPerCell = Math.max(
        1,
        ...values.flatMap((value) => columns.map((column) => getCellMoments(value, column).length)),
    );
    const momentsPerRow = Math.max(1, Math.ceil(Math.sqrt(maxMomentsPerCell)));
    const momentRows = Math.ceil(maxMomentsPerCell / momentsPerRow);
    const contentSize = Math.max(momentsPerRow, momentRows) * spacing - CIRCLE_GAP;
    const cellSize = Math.max(MIN_CELL_SIZE, contentSize + CELL_MARGIN * 2 + 8);

    const cellCenter = (rowIndex: number, colIndex: number) => ({
        x: LABEL_WIDTH + colIndex * cellSize + cellSize / 2,
        y: HEADER_HEIGHT + rowIndex * cellSize + cellSize / 2,
    });

    // Lay out the moments belonging to each (row, column) cell in a grid, wrapping onto a new
    // line every `momentsPerRow` moments (each line re-centered for its own moment count, and
    // the whole grid centered vertically within the cell).
    const momentPositions = new Map<string, { x: number; y: number }>();
    values.forEach((value, rowIndex) => {
        columns.forEach((column, colIndex) => {
            const moments = getCellMoments(value, column);
            if (moments.length === 0) return;

            const { x: cx, y: cy } = cellCenter(rowIndex, colIndex);
            const rows = Math.ceil(moments.length / momentsPerRow);
            const gridHeight = rows * spacing - CIRCLE_GAP;
            moments.forEach((moment, i) => {
                const row = Math.floor(i / momentsPerRow);
                const col = i % momentsPerRow;
                const rowCount = Math.min(momentsPerRow, moments.length - row * momentsPerRow);
                const rowWidth = rowCount * spacing - CIRCLE_GAP;

                const x = cx - rowWidth / 2 + col * spacing + spacing / 2;
                const y = cy - gridHeight / 2 + row * spacing + spacing / 2;
                momentPositions.set(`${moment.trajectoryId}::${moment.turnId}`, { x, y });
            });
        });
    });

    // Which (row, col) cell each trajectory moment falls in — built the same way as
    // momentPositions, but keyed to the cell rather than the moment's own on-screen spot.
    const momentCell = new Map<string, { rowIndex: number; colIndex: number }>();
    values.forEach((value, rowIndex) => {
        columns.forEach((column, colIndex) => {
            for (const moment of getCellMoments(value, column)) {
                momentCell.set(`${moment.trajectoryId}::${moment.turnId}`, { rowIndex, colIndex });
            }
        });
    });

    const cellHalf = (cellSize - CELL_MARGIN * 2) / 2;

    // The point on `fromCell`'s border closest to `toCell`. Since grid cells never overlap in
    // a row they don't share or a column they don't share, that point's x is pinned to
    // fromCell's near edge whenever the columns differ (its center x otherwise, as every x in
    // the shared column is equally close) — and symmetrically for y and rows — which also
    // means it lands exactly on the corner when both differ. Pulled back by `pad` so the arrow
    // doesn't touch the cell edge.
    const nearestEdgePoint = (
        fromCell: { rowIndex: number; colIndex: number },
        toCell: { rowIndex: number; colIndex: number },
        pad: number,
    ) => {
        const { x: cx, y: cy } = cellCenter(fromCell.rowIndex, fromCell.colIndex);
        const dCol = toCell.colIndex - fromCell.colIndex;
        const dRow = toCell.rowIndex - fromCell.rowIndex;
        const offsetX = dCol > 0 ? cellHalf : dCol < 0 ? -cellHalf : 0;
        const offsetY = dRow > 0 ? cellHalf : dRow < 0 ? -cellHalf : 0;

        const dist = Math.sqrt(offsetX * offsetX + offsetY * offsetY) || 1;
        const scale = Math.max(0, dist - pad) / dist;
        return { x: cx + offsetX * scale, y: cy + offsetY * scale };
    };

    // One arrow per distinct (fromCell -> toCell) pair, merging every trajectory's consecutive
    // turns that cross that same pair of cells; its opacity is the average across all of them.
    const cellArrows = new Map<string, { points: number[]; opacitySum: number; count: number }>();
    if (showArrows) {
        for (const trajectory of trajectories) {
            for (let i = 0; i < trajectory.turns.length - 1; i++) {
                const fromTurnId = trajectory.turns[i].id;
                const toTurnId = trajectory.turns[i + 1].id;
                const fromCell = momentCell.get(`${trajectory.id}::${fromTurnId}`);
                const toCell = momentCell.get(`${trajectory.id}::${toTurnId}`);
                if (!fromCell || !toCell) continue;
                if (fromCell.rowIndex === toCell.rowIndex && fromCell.colIndex === toCell.colIndex) continue;

                const key = `${fromCell.rowIndex}-${fromCell.colIndex}->${toCell.rowIndex}-${toCell.colIndex}`;
                const opacity = (markerOpacity(trajectory.id, fromTurnId) + markerOpacity(trajectory.id, toTurnId)) / 2;

                let entry = cellArrows.get(key);
                if (!entry) {
                    const start = nearestEdgePoint(fromCell, toCell, 4);
                    const end = nearestEdgePoint(toCell, fromCell, 4);
                    entry = { points: [start.x, start.y, end.x, end.y], opacitySum: 0, count: 0 };
                    cellArrows.set(key, entry);
                }
                entry.opacitySum += opacity;
                entry.count += 1;
            }
        }
    }

    const arrows = Array.from(cellArrows.entries()).map(([key, { points, opacitySum, count }]) => ({
        key,
        points,
        opacity: opacitySum / count,
    }));

    const width = LABEL_WIDTH + columns.length * cellSize;
    const height = HEADER_HEIGHT + values.length * cellSize;

    return (
        <Stage width={width} height={height}>
            <Layer>
                {/* clickable cell areas: highlight every moment in this (value, column) combination */}
                {values.map((value, rowIndex) =>
                    columns.map((column, colIndex) => (
                        <Rect
                            key={`cell-${rowIndex}-${colIndex}`}
                            x={LABEL_WIDTH + colIndex * cellSize + CELL_MARGIN}
                            y={HEADER_HEIGHT + rowIndex * cellSize + CELL_MARGIN}
                            width={cellSize - CELL_MARGIN * 2}
                            height={cellSize - CELL_MARGIN * 2}
                            fill="#eee"
                            cornerRadius={10}
                            opacity={getCellMoments(value, column).length > 0 ? 1 : EMPTY_CELL_OPACITY}
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
                <Text text={cornerLabel} x={8} y={6} fontSize={12} fontStyle="bold" fill="#777" />
                {columns.map((column, colIndex) => (
                    <Text
                        key={`col-header-${column}`}
                        text={columnLabel(column)}
                        x={LABEL_WIDTH + colIndex * cellSize}
                        y={6}
                        width={cellSize}
                        align="center"
                        fontSize={12}
                        fill="#777"
                    />
                ))}

                {/* row labels */}
                {values.map((value, rowIndex) => (
                    <Text
                        key={`row-label-${value}`}
                        text={rowLabel(value)}
                        x={8}
                        y={HEADER_HEIGHT + rowIndex * cellSize + cellSize / 2 - 6}
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
                        stroke="#999"
                        fill="#999"
                        strokeWidth={2}
                        pointerLength={5}
                        pointerWidth={5}
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
