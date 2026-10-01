import { getWorkspaceRepository } from "@/server/workspace";
import { validateWorkspaceShape } from "@/server/workspace/validate";
import { CreateWorkspaceInputType, CreateWorkspaceOutputType } from "../types";

export async function createWorkspace(input: CreateWorkspaceInputType): Promise<CreateWorkspaceOutputType> {
    validateWorkspaceShape(input.workspace);

    const repo = getWorkspaceRepository();
    const record = await repo.create(input.workspace);

    return { id: record.id, ingestionToken: record.ingestionToken, workspace: record.workspace };
}
