import { getWorkspaceRepository } from "@/server/workspace";
import { NotFoundError } from "@/server/errors";
import { validateValueClusteringsShape } from "@/server/workspace/validate";
import { ReplaceBatchValueClusteringsInputType, ReplaceBatchValueClusteringsOutputType } from "../../../../../types";

export async function replaceBatchValueClusterings(
    input: ReplaceBatchValueClusteringsInputType & { id: string; batchId: string },
): Promise<ReplaceBatchValueClusteringsOutputType> {
    validateValueClusteringsShape(input.valueClusterings);

    const repo = getWorkspaceRepository();

    // Ensures a legacy (pre-batching) workspace has already been lazily migrated into
    // the batches table before we try to update one of its batch rows.
    const workspace = await repo.getById(input.id);
    if (!workspace) throw new NotFoundError(`Workspace ${input.id} not found`);

    const data = await repo.replaceBatchValueClusterings(input.id, input.batchId, input.valueClusterings);
    if (!data) throw new NotFoundError(`Batch ${input.batchId} not found`);

    return { batchId: input.batchId, valueClusterings: data.valueClusterings };
}
