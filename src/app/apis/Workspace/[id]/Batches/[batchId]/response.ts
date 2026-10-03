import { getWorkspaceRepository } from "@/server/workspace";
import { NotFoundError } from "@/server/errors";
import { GetBatchDataOutputType } from "../../../../types";

export async function getBatchData(input: { id: string; batchId: string }): Promise<GetBatchDataOutputType> {
    const repo = getWorkspaceRepository();

    const workspace = await repo.getById(input.id);
    if (!workspace) throw new NotFoundError(`Workspace ${input.id} not found`);

    const data = await repo.getBatchData(input.id, input.batchId);
    if (!data) throw new NotFoundError(`Batch ${input.batchId} not found`);

    return { batchId: input.batchId, data };
}
