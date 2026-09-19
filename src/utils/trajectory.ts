import { Trajectory } from "@/models/Trajectory";
import { Workspace } from "@/models/Workspace";
import { randomColor } from "@/utils/color";

export function summarizeTrajectories(trajectories: Trajectory[]) {
    return trajectories.map((trajectory) => ({
        id: trajectory.id,
        turnSummaries: trajectory.turns.map((turn) => ({
            id: turn.id,
            summary: turn.summary,
        })),
    }));
}

// Ensures every trajectory in the workspace has a color assigned in settings.trajectoryColors,
// assigning a random color to any trajectory that is missing one.
export function ensureTrajectoryColors(workspace: Workspace): Workspace {
    const trajectories = workspace.trajectories ?? [];
    const existingColors = workspace.settings?.trajectoryColors ?? {};

    const missingTrajectories = trajectories.filter((trajectory) => !existingColors[trajectory.id]);
    if (missingTrajectories.length === 0) {
        return workspace;
    }

    const trajectoryColors = { ...existingColors };
    for (const trajectory of missingTrajectories) {
        trajectoryColors[trajectory.id] = { color: randomColor() };
    }

    return {
        ...workspace,
        settings: {
            ...workspace.settings,
            trajectoryColors,
        },
    };
}

