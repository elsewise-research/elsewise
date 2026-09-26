import dynamic from "next/dynamic";
import { Grid3x3, Workflow, Trash2 } from "lucide-react";
import { type Node, type NodeProps } from "@xyflow/react";
import { Trajectory } from "@/models/Trajectory";
import { ValueClustering, TrajectoryMoment, DIMENSION_VALUE_SEPARATOR } from "@/models/ValueClustering";

import "./styles/canvas.css"

const BSVDrawingCanvas = dynamic(() => import("./BSVDrawingCanvas"), { ssr: false });
const BSVStateMachineCanvas = dynamic(() => import("./BSVStateMachineCanvas"), { ssr: false });

type compositionalBSVData = {
    dimensionNames : string[];
    dimensionDescriptions : string[];
    trajectories : Trajectory[];
    valueClustering : ValueClustering;
    trajectoryColorSetting : Record<string, string>;
    matrixView : boolean;
    isDropTarget? : boolean;
    onToggleMatrixView : () => void;
    onDelete : () => void;
}

type CompositionalBSV = Node<compositionalBSVData, 'compositionalBSV'>;

export default function CompositionalBSV({data}: NodeProps<CompositionalBSV>) {
    const {dimensionNames,
        dimensionDescriptions,
        trajectories,
        valueClustering,
        trajectoryColorSetting,
        matrixView,
        onToggleMatrixView,
        onDelete,
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
        const rows = new Set<string>();
        const columns = new Set<string>();
        const momentsByCell = new Map<string, TrajectoryMoment[]>();
        for (const [key, moments] of Object.entries(valueClustering.valueMapping)) {
            const [rowValue, columnValue] = key.split(DIMENSION_VALUE_SEPARATOR);
            rows.add(rowValue);
            columns.add(columnValue);
            momentsByCell.set(`${rowValue}::${columnValue}`, moments);
        }

        return (
            <div className={`bsv-node${isDropTarget ? " bsv-node--drop-target" : ""}`}>
                <div className="bsv-toolkit">
                    {isMatrixViewEligible && (
                        <button onClick={onToggleMatrixView} title={showMatrixView ? "Switch to state machine view" : "Switch to matrix view"}>
                            {showMatrixView ? <Workflow size={16} /> : <Grid3x3 size={16} />}
                        </button>
                    )}
                    <button onClick={handleDeleteClick} title="Delete this BSV">
                        <Trash2 size={16} />
                    </button>
                </div>
                <div className="bsv-title">{dimensionNames.join(" × ")}</div>
                <div className="bsv-description">
                    {dimensionNames.map((name, index) => (
                        <span key={name}>
                            <b>{name}</b>: {dimensionDescriptions[index]}
                            <br />
                        </span>
                    ))}
                </div>
                <div className="bsv-viz">
                  {showMatrixView ? (
                      <BSVDrawingCanvas
                          values={Array.from(rows)}
                          columns={Array.from(columns)}
                          getCellMoments={(rowValue, columnValue) => momentsByCell.get(`${rowValue}::${columnValue}`) ?? []}
                          trajectories={trajectories}
                          trajectoryColorSetting={trajectoryColorSetting}
                          getTurnOrder={getTurnOrder}
                          showArrows={false}
                      />
                  ) : (
                      <BSVStateMachineCanvas
                          valueClustering={valueClustering}
                          trajectories={trajectories}
                      />
                  )}
                </div>
            </div>
        );
}
