import { Trajectory } from "@/models/Trajectory";
import { Workspace } from "@/models/Workspace";
import { randomColor } from "@/utils/color";

export function processTrajectoriesText(text: string): { trajectories: Trajectory[] } {
    return JSON.parse(text);
}

export function summarizeTrajectories(trajectories: Trajectory[]) {
    return trajectories.map((trajectory) => ({
        id: trajectory.id,
        turnSummaries: trajectory.turns.map((turn) => ({
            id: turn.id,
            summary: turn.summary,
        })),
    }));
}

// Ensures every given trajectory has a color assigned in settings.trajectoryColors,
// assigning a random color to any trajectory that is missing one.
export function ensureTrajectoryColors(workspace: Workspace, trajectories: Trajectory[]): Workspace {
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

