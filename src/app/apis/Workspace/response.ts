import { getWorkspaceRepository } from "@/server/workspace";
import { validateWorkspaceShape, validateTrajectoriesShape } from "@/server/workspace/validate";
import { CreateWorkspaceInputType, CreateWorkspaceOutputType } from "../types";

export async function createWorkspace(input: CreateWorkspaceInputType): Promise<CreateWorkspaceOutputType> {
    validateWorkspaceShape(input.workspace);
    validateTrajectoriesShape(input.trajectories);

    const repo = getWorkspaceRepository();
    const { record, batch } = await repo.create(input.workspace, input.trajectories);

    return { id: record.id, ingestionToken: record.ingestionToken, workspace: record.workspace, batches: [batch] };
}
