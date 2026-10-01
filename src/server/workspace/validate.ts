import { Trajectory } from "@/models/Trajectory";
import { Workspace } from "@/models/Workspace";
import { ValidationError } from "@/server/errors";

function isTrajectoryShape(value: unknown): value is Trajectory {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.id === "string" && Array.isArray(candidate.turns);
}

export function validateWorkspaceShape(workspace: unknown): asserts workspace is Workspace {
    if (typeof workspace !== "object" || workspace === null) {
        throw new ValidationError("workspace must be an object");
    }
    const { trajectories } = workspace as Workspace;
    if (trajectories !== undefined) {
        validateTrajectoriesShape(trajectories, []);
    }
}

export function validateTrajectoriesShape(incoming: unknown, existing: Trajectory[]): asserts incoming is Trajectory[] {
    if (!Array.isArray(incoming)) {
        throw new ValidationError("trajectories must be an array");
    }
    if (!incoming.every(isTrajectoryShape)) {
        throw new ValidationError("every trajectory must have an `id` string and a `turns` array");
    }

    const seenIds = new Set(existing.map((trajectory) => trajectory.id));
    for (const trajectory of incoming) {
        if (seenIds.has(trajectory.id)) {
            throw new ValidationError(`duplicate trajectory id: ${trajectory.id}`);
        }
        seenIds.add(trajectory.id);
    }
}
