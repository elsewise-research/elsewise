import { useState } from "react";
import { ChevronUp, ChevronDown, ArrowLeft } from "lucide-react";
import { Trajectory } from "@/models/Trajectory";
import { Dimension } from "@/models/Dimension";
import { ValueClustering, TrajectoryMoment } from "@/models/ValueClustering";

import "./styles/dialog.css"
import "./styles/canvas.css"

export default function TrajectoryViewer({
    currTrajectoryMoment,
    trajectories,
    trajectoryColorSetting,
    valueClusterings,
    dimensions,
    onBackToOverview,
}: {
    currTrajectoryMoment?: TrajectoryMoment;
    trajectories: Trajectory[];
    trajectoryColorSetting: Record<string, string>;
    valueClusterings: ValueClustering[];
    dimensions: Dimension[];
    onBackToOverview: () => void;
}) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isStepsExpanded, setIsStepsExpanded] = useState(true);
    const [isValueClusteringExpanded, setIsValueClusteringExpanded] = useState(true);
    const [expandedTrajectoryIds, setExpandedTrajectoryIds] = useState<Set<string>>(new Set());

    const toggleTrajectoryExpanded = (trajectoryId: string) => {
        setExpandedTrajectoryIds((expanded) => {
            const next = new Set(expanded);
            if (next.has(trajectoryId)) {
                next.delete(trajectoryId);
            } else {
                next.add(trajectoryId);
            }
            return next;
        });
    };

    const turn = currTrajectoryMoment
        ? trajectories
            .find((trajectory) => trajectory.id === currTrajectoryMoment.trajectoryId)
            ?.turns.find((turn) => turn.id === currTrajectoryMoment.turnId)
        : undefined;

    // For each single-dimension ValueClustering, find the value (if any) whose moment
    // list contains this exact trajectory moment.
    const assignedValues = currTrajectoryMoment
        ? valueClusterings
            .filter((valueClustering) => valueClustering.dimensionIds.length <= 1)
            .map((valueClustering) => {
                const value = Object.entries(valueClustering.valueMapping).find(([, moments]) =>
                    moments.some(
                        (moment) =>
                            moment.trajectoryId === currTrajectoryMoment.trajectoryId
                            && moment.turnId === currTrajectoryMoment.turnId,
                    ),
                )?.[0];

                const dimensionId = valueClustering.dimensionIds[0];
                const dimensionName = dimensions.find((dimension) => dimension.id === dimensionId)?.name ?? dimensionId;

                return {
                    dimensionId,
                    dimensionName,
                    value,
                };
            })
        : [];

    return (
    <div className="dialog">
        <div className="dialog-collapse-btn">
            <button onClick={() => setIsCollapsed((collapsed) => !collapsed)} title={isCollapsed ? "Expand" : "Collapse"}>
                {isCollapsed ? <ChevronDown size={32} /> : <ChevronUp size={32} />}
            </button>
        </div>
      <div className="trajectory-viewer-header">
        <h2><b>Trajectory Viewer</b></h2>
        {currTrajectoryMoment && !isCollapsed && (
            <button className="back-link" onClick={onBackToOverview}><ArrowLeft size={14} /></button>
        )}
      </div>
      <div hidden={isCollapsed}>
        {currTrajectoryMoment ? (
            turn ? (
                <div>
                    <p>
                        <b>Trajectory:</b>{" "}
                        <span
                            className="trajectory-moment-markor"
                            style={{ backgroundColor: trajectoryColorSetting[currTrajectoryMoment.trajectoryId] ?? "#999" }}
                        />{" "}
                        {currTrajectoryMoment.trajectoryId}
                    </p>
                    <p><b>Turn:</b> {currTrajectoryMoment.turnId}</p>
                    <p><i>{turn.summary}</i></p>
                    <div
                        className="trajectory-turn-value-clustering"
                        onClick={() => setIsValueClusteringExpanded((expanded) => !expanded)}
                    >
                        <b>Dimension Values</b>
                        {isValueClusteringExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                    {isValueClusteringExpanded && (
                        <table className="trajectory-turn-values">
                            <tbody>
                                {assignedValues.map(({ dimensionId, dimensionName, value }) => (
                                    <tr key={dimensionId}>
                                        <td><b>{dimensionName}</b></td>
                                        <td>{value ?? "unassigned"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                    <div
                        className="trajectory-turn-detail"
                        onClick={() => setIsStepsExpanded((expanded) => !expanded)}
                    >
                        <b>Details</b>
                        {isStepsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                    {isStepsExpanded && turn.steps.map((step, index) => (
                        <div key={index} className="trajectory-step">
                            <p><b>{step.subject}</b> ({step.type})</p>
                            {step.type === "message" ? (
                                <p>{step.content.content}</p>
                            ) : (
                                <p>{step.content.actionName}({JSON.stringify(step.content.actionArgs)})</p>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div>
                    <p>Turn &quot;{currTrajectoryMoment.turnId}&quot; not found in trajectory &quot;{currTrajectoryMoment.trajectoryId}&quot;.</p>
                </div>
            )
        ) : (
            <ul>
                {trajectories.map((trajectory) => {
                    const isExpanded = expandedTrajectoryIds.has(trajectory.id);
                    return (
                        <li key={trajectory.id} className="trajectory-legend-item">
                            <div
                                className="trajectory-legend-row"
                                onClick={() => toggleTrajectoryExpanded(trajectory.id)}
                            >
                                <span
                                    className="trajectory-moment-markor"
                                    style={{ backgroundColor: trajectoryColorSetting[trajectory.id] ?? "#999" }}
                                />
                                <p>{trajectory.id}</p>
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </div>
                            {isExpanded && (
                                <ol className="trajectory-turn-summaries">
                                    {trajectory.turns.map((turn) => (
                                        <li key={turn.id}><p className="turn-id"><b>{turn.id}</b></p> {turn.summary}</li>
                                    ))}
                                </ol>
                            )}
                        </li>
                    );
                })}
            </ul>
        )}
      </div>
    </div>
    );
}
