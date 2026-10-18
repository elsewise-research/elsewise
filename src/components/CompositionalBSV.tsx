import dynamic from "next/dynamic";
import { Grid3x3, Workflow, Trash2, Eye, EyeOff } from "lucide-react";
import { type Node, type NodeProps } from "@xyflow/react";
import { Trajectory } from "@/models/Trajectory";
import { ValueClustering, TrajectoryMoment, DIMENSION_VALUE_SEPARATOR } from "@/models/ValueClustering";
import { orderByDimensionValues } from "@/utils/dimension";

import "./styles/canvas.css"

const BSVDrawingCanvas = dynamic(() => import("./BSVDrawingCanvas"), { ssr: false });
const BSVStateMachineCanvas = dynamic(() => import("./BSVStateMachineCanvas"), { ssr: false });

type compositionalBSVData = {
    dimensionNames : string[];
    dimensionDescriptions : string[];
    dimensionValuesList : string[][];
    trajectories : Trajectory[];
    valueClustering : ValueClustering;
    trajectoryColorSetting : Record<string, string>;
    matrixView : boolean;
    isDropTarget? : boolean;
    onToggleMatrixView : () => void;
    onDelete : () => void;
    onMomentClick : (moment: TrajectoryMoment) => void;
    showArrows : boolean;
    onToggleArrows : () => void;
    onCellClick : (moments: TrajectoryMoment[]) => void;
    currTrajectoryMoment? : TrajectoryMoment;
    highlightedTrajectoryMoments? : TrajectoryMoment[];
    stateNodePositions? : Record<string, { x: number; y: number }>;
    onStateNodePositionChange? : (nodeId: string, position: { x: number; y: number }) => void;
}

type CompositionalBSV = Node<compositionalBSVData, 'compositionalBSV'>;

export default function CompositionalBSV({data}: NodeProps<CompositionalBSV>) {
    const {dimensionNames,
        dimensionDescriptions,
        dimensionValuesList,
        trajectories,
        valueClustering,
        trajectoryColorSetting,
        matrixView,
        onToggleMatrixView,
        onDelete,
        onMomentClick,
        onCellClick,
        currTrajectoryMoment,
        highlightedTrajectoryMoments,
        showArrows,
        onToggleArrows,
        stateNodePositions,
        onStateNodePositionChange,
        isDropTarget} = data;

        const isMatrixViewEligible = valueClustering.dimensionIds.length === 2;
        const showMatrixView = matrixView && isMatrixViewEligible;

        const turnOrderByTrajectory = new Map<string, Map<string, number>>();
        for (const trajectory of trajectories) {
            const turnOrder = new Map<string, number>();
            trajectory.turns.forEach((turn, index) => {
                turnOrder.set(turn.id, index + 1);
            });
            turnOrderByTrajectory.set(trajectory.id, turnOrder);
        }

        const getTurnOrder = (moment: TrajectoryMoment): number | undefined =>
            turnOrderByTrajectory.get(moment.trajectoryId)?.get(moment.turnId);

        const handleDeleteClick = () => {
            const confirmed = window.confirm(
                `Delete this combined BSV (${dimensionNames.join(" × ")})? Any BSV that references these dimensions — including other combined views — will also be deleted. This cannot be undone.`
            );
            if (confirmed) onDelete();
        };

        // The crossed valueClustering's keys are composite "rowValue_colValue" strings
        // (per DIMENSION_VALUE_SEPARATOR). Split them back out into the two dimensions'
        // own values so they can be laid out as matrix rows/columns.
        const presentRows = new Set<string>();
        const presentColumns = new Set<string>();
        const momentsByCell = new Map<string, TrajectoryMoment[]>();
        for (const [key, moments] of Object.entries(valueClustering.valueMapping)) {
            const [rowValue, columnValue] = key.split(DIMENSION_VALUE_SEPARATOR);
            presentRows.add(rowValue);
            presentColumns.add(columnValue);
            momentsByCell.set(`${rowValue}::${columnValue}`, moments);
        }

        const rows = orderByDimensionValues(presentRows, dimensionValuesList[0] ?? []);
        const columns = orderByDimensionValues(presentColumns, dimensionValuesList[1] ?? []);

        return (
            <div className={`bsv-node${isDropTarget ? " bsv-node--drop-target" : ""}`}>
                <div className="bsv-title">{dimensionNames.join(" × ")}</div>
                <div className="bsv-toolkit">
                    {isMatrixViewEligible && (
                        <button onClick={onToggleMatrixView} title={showMatrixView ? "Switch to state machine view" : "Switch to matrix view"}>
                            {showMatrixView ? <Workflow size={16} /> : <Grid3x3 size={16} />}
                        </button>
                    )}
                    {showMatrixView && (
                        <button onClick={onToggleArrows} title={showArrows ? "Hide arrows" : "Show arrows"}>
                            {showArrows ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    )}
                    <button onClick={handleDeleteClick} title="Delete this BSV">
                        <Trash2 size={16} />
                    </button>
                </div>
                <div className="bsv-description">
                    {dimensionNames.map((name, index) => (
                        <span key={name}>
                            <b>{name}</b>: {dimensionDescriptions[index]}
                            <br />
                        </span>
                    ))}
                </div>
                <div className="bsv-viz nodrag">
                  {showMatrixView ? (
                      <BSVDrawingCanvas
                          values={rows}
                          columns={columns}
                          getCellMoments={(rowValue, columnValue) => momentsByCell.get(`${rowValue}::${columnValue}`) ?? []}
                          trajectories={trajectories}
                          trajectoryColorSetting={trajectoryColorSetting}
                          getTurnOrder={getTurnOrder}
                          onMomentClick={onMomentClick}
                          onCellClick={onCellClick}
                          showArrows={showArrows}
                          currTrajectoryMoment={currTrajectoryMoment}
                          highlightedTrajectoryMoments={highlightedTrajectoryMoments}
                      />
                  ) : (
                      <BSVStateMachineCanvas
                          valueClustering={valueClustering}
                          trajectories={trajectories}
                          onCellClick={onCellClick}
                          highlightedTrajectoryMoments={highlightedTrajectoryMoments}
                          savedNodePositions={stateNodePositions}
                          onNodePositionChange={onStateNodePositionChange}
                      />
                  )}
                </div>
            </div>
        );
}
