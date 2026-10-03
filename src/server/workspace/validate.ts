import { Trajectory } from "@/models/Trajectory";
import { Workspace } from "@/models/Workspace";
import { ValueClustering } from "@/models/ValueClustering";
import { ValidationError } from "@/server/errors";

function isTrajectoryShape(value: unknown): value is Trajectory {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.id === "string" && Array.isArray(candidate.turns);
}

function isValueClusteringShape(value: unknown): value is ValueClustering {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return Array.isArray(candidate.dimensionIds)
        && typeof candidate.valueMapping === "object" && candidate.valueMapping !== null;
}

export function validateValueClusteringsShape(incoming: unknown): asserts incoming is ValueClustering[] {
    if (!Array.isArray(incoming)) {
        throw new ValidationError("valueClusterings must be an array");
    }
    if (!incoming.every(isValueClusteringShape)) {
        throw new ValidationError("every value clustering must have a `dimensionIds` array and a `valueMapping` object");
    }
}

export function validateWorkspaceShape(workspace: unknown): asserts workspace is Workspace {
    if (typeof workspace !== "object" || workspace === null) {
        throw new ValidationError("workspace must be an object");
    }
}

export function validateTrajectoriesShape(incoming: unknown): asserts incoming is Trajectory[] {
    if (!Array.isArray(incoming)) {
        throw new ValidationError("trajectories must be an array");
    }
    if (!incoming.every(isTrajectoryShape)) {
        throw new ValidationError("every trajectory must have an `id` string and a `turns` array");
    }

    const seenIds = new Set<string>();
    for (const trajectory of incoming) {
        if (seenIds.has(trajectory.id)) {
            throw new ValidationError(`duplicate trajectory id: ${trajectory.id}`);
        }
        seenIds.add(trajectory.id);
    }
}
