import { Trajectory } from "@/models/Trajectory";

export function summarizeTrajectories(trajectories: Trajectory[]) {
    return trajectories.map((trajectory) => ({
        id: trajectory.id,
        turnSummaries: trajectory.turns.map((turn) => ({
            id: turn.id,
            summary: turn.summary,
        })),
    }));
}
