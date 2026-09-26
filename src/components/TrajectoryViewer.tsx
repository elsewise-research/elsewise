import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { Trajectory } from "@/models/Trajectory";
import { TrajectoryMoment } from "@/models/ValueClustering";

import "./styles/dialog.css"
import "./styles/canvas.css"

export default function TrajectoryViewer({
    currTrajectoryMoment,
    trajectories,
    trajectoryColorSetting,
    onBackToOverview,
}: {
    currTrajectoryMoment?: TrajectoryMoment;
    trajectories: Trajectory[];
    trajectoryColorSetting: Record<string, string>;
    onBackToOverview: () => void;
}) {
    const [isCollapsed, setIsCollapsed] = useState(false);

    const turn = currTrajectoryMoment
        ? trajectories
            .find((trajectory) => trajectory.id === currTrajectoryMoment.trajectoryId)
            ?.turns.find((turn) => turn.id === currTrajectoryMoment.turnId)
        : undefined;

    return (
    <div className="dialog">
        <div className="dialog-collapse-btn">
            <button onClick={() => setIsCollapsed((collapsed) => !collapsed)} title={isCollapsed ? "Expand" : "Collapse"}>
                {isCollapsed ? <ChevronDown size={32} /> : <ChevronUp size={32} />}
            </button>
        </div>
      <div>
        <h2><b>Trajectory Viewer</b></h2>
      </div>
      <div hidden={isCollapsed}>
        {currTrajectoryMoment ? (
            turn ? (
                <div>
                    <button onClick={onBackToOverview}>{"<- "}Back to trajectory overview</button>
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
                    {turn.steps.map((step, index) => (
                        <div key={index}>
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
                    <button onClick={onBackToOverview}>{"<- "}Back to trajectory overview</button>
                </div>
            )
        ) : (
            <ul>
                {trajectories.map((trajectory) => (
                    <li key={trajectory.id}>
                        <span
                            className="trajectory-moment-markor"
                            style={{ backgroundColor: trajectoryColorSetting[trajectory.id] ?? "#999" }}
                        />
                        <p>{trajectory.id}</p>
                    </li>
                ))}
            </ul>
        )}
      </div>
    </div>
    );
}
