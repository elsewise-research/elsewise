import dynamic from "next/dynamic";
import { Rows3, LayoutGrid } from "lucide-react";
import { type Node, type NodeProps } from "@xyflow/react";
import { Trajectory } from "@/models/Trajectory";
import { ValueClustering, TrajectoryMoment } from "@/models/ValueClustering";

import "./styles/canvas.css"

const BSVDrawingCanvas = dynamic(() => import("./BSVDrawingCanvas"), { ssr: false });

type simpleBSVData = {
    dimensionName : string;
    dimensionDescription : string;
    trajectories : Trajectory[];
    valueClustering : ValueClustering;
    trajectoryColorSetting : Record<string, string>;
    compactView : boolean;
    isDropTarget? : boolean;
    onToggleCompactView : () => void;
}

type SimpleBSV = Node<simpleBSVData, 'simpleBSV'>;

export default function SimpleBSV({data}: NodeProps<SimpleBSV>) {
    const {dimensionName,
        dimensionDescription,
        trajectories,
        valueClustering,
        trajectoryColorSetting,
        compactView,
        onToggleCompactView,
        isDropTarget} = data;

    if (valueClustering.dimensionIds.length !== 1) {
        throw new Error(
            `SimpleBSV expects valueClustering.dimensionIds to contain exactly one element, got ${valueClustering.dimensionIds.length}`
        );
    }

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

    const renderMoment = (moment: TrajectoryMoment) => (
        <span
            key={`${moment.trajectoryId}-${moment.turnId}`}
            className="trajectory-moment-markor"
            style={{ backgroundColor: trajectoryColorSetting[moment.trajectoryId] }}
            title={`trajectoryId: ${moment.trajectoryId}\nturnId: ${moment.turnId}`}
        >
            {getTurnOrder(moment)}
        </span>
    );

    const distinctTurnOrders = Array.from(
        new Set(
            Object.values(valueClustering.valueMapping)
                .flat()
                .map((moment) => getTurnOrder(moment))
                .filter((order): order is number => order !== undefined)
        )
    ).sort((a, b) => a - b);

    return (
        <div className={`bsv-node${isDropTarget ? " bsv-node--drop-target" : ""}`}>
            <div className="bsv-toolkit">
                <button onClick={onToggleCompactView} title={compactView ? "Switch to expanded view" : "Switch to compact view"}>
                    {compactView ? <LayoutGrid size={16} /> : <Rows3 size={16} />}
                </button>
            </div>
            <div className="bsv-title">{dimensionName}</div>
            <div className="bsv-description">{dimensionDescription}</div>
            <div className="bsv-viz">
            {compactView ? (
                <table className="bsv-table">
                    <tbody>
                        {Object.entries(valueClustering.valueMapping).map(([value, moments]) => (
                            <tr key={value}>
                                <td className="bsv-value-clustering">
                                <p>{value}</p>
                                <div className="bsv-moments">
                                    {moments.map(renderMoment)}
                                </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <BSVDrawingCanvas
                    values={Object.keys(valueClustering.valueMapping)}
                    columns={distinctTurnOrders.map(String)}
                    columnLabel={(column) => `step ${column}`}
                    getCellMoments={(rowValue, column) =>
                        (valueClustering.valueMapping[rowValue] ?? []).filter(
                            (moment) => getTurnOrder(moment) === Number(column),
                        )
                    }
                    trajectories={trajectories}
                    trajectoryColorSetting={trajectoryColorSetting}
                    getTurnOrder={getTurnOrder}
                />
            )}
            </div>
        </div>
    );
}
