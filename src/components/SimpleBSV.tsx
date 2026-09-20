import { type Node, type NodeProps } from "@xyflow/react";
import { Trajectory } from "@/models/Trajectory";
import { ValueClustering, TrajectoryMoment } from "@/models/ValueClustering";

import "./styles/canvas.css"

type simpleBSVData = {
    dimensionName : string;
    dimensionDescription : string;
    trajectories : Trajectory[];
    valueClustering : ValueClustering;
    trajectoryColorSetting : Record<string, string>;
    compactView : boolean;
}

type SimpleBSV = Node<simpleBSVData, 'simpleBSV'>;

export default function SimpleBSV({data}: NodeProps<SimpleBSV>) {
    const {dimensionName, dimensionDescription, trajectories, valueClustering, trajectoryColorSetting} = data;

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

    return (
        <div className="bsv-node">
            <div className="bsv-title">{dimensionName}</div>
            <div className="bsv-description">{dimensionDescription}</div>
            <table className="bsv-table">
                <thead>
                    {/*<tr>
                        <th>Value</th>
                        <th>Trajectory Moments</th>
                    </tr>*/}
                </thead>
                <tbody>
                    {Object.entries(valueClustering.valueMapping).map(([value, moments]) => (
                        <tr key={value}>
                            <td className="bsv-value-clustering">
                            <p>{value}</p>
                            <div className="bsv-moments">
                                {moments.map((moment) => (
                                    <span
                                        key={`${moment.trajectoryId}-${moment.turnId}`}
                                        className="trajectory-moment-markor"
                                        style={{ backgroundColor: trajectoryColorSetting[moment.trajectoryId] }}
                                        title={`trajectoryId: ${moment.trajectoryId}\nturnId: ${moment.turnId}`}
                                    >
                                        {getTurnOrder(moment)}
                                    </span>
                                ))}
                            </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
