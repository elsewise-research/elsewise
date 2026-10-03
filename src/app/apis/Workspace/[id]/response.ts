import { getWorkspaceRepository } from "@/server/workspace";
import { NotFoundError } from "@/server/errors";
import { validateWorkspaceShape } from "@/server/workspace/validate";
import { GetWorkspaceOutputType, ReplaceWorkspaceInputType, ReplaceWorkspaceOutputType } from "../../types";

export async function getWorkspace(input: { id: string }): Promise<GetWorkspaceOutputType> {
    const repo = getWorkspaceRepository();
    const record = await repo.getById(input.id);
    if (!record) throw new NotFoundError(`Workspace ${input.id} not found`);
    const batches = await repo.listBatches(input.id);

    return { id: record.id, ingestionToken: record.ingestionToken, workspace: record.workspace, batches };
}

export async function replaceWorkspace(
    input: ReplaceWorkspaceInputType & { id: string },
): Promise<ReplaceWorkspaceOutputType> {
    validateWorkspaceShape(input.workspace);

    const repo = getWorkspaceRepository();
    const record = await repo.replace(input.id, input.workspace);
    if (!record) throw new NotFoundError(`Workspace ${input.id} not found`);

    return { id: record.id, workspace: record.workspace };
}
