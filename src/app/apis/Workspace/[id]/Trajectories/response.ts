import { getWorkspaceRepository } from "@/server/workspace";
import { NotFoundError, UnauthorizedError } from "@/server/errors";
import { validateTrajectoriesShape } from "@/server/workspace/validate";
import { AppendTrajectoriesInputType, AppendTrajectoriesOutputType } from "../../../types";

export async function appendTrajectories(
    input: AppendTrajectoriesInputType & { id: string; token: string },
): Promise<AppendTrajectoriesOutputType> {
    const repo = getWorkspaceRepository();

    // Collapse "no such workspace" and "wrong token" into the same 401 so a caller
    // on the network can't use this endpoint to probe for valid workspace ids.
    const tokenOk = await repo.verifyIngestionToken(input.id, input.token);
    if (!tokenOk) throw new UnauthorizedError("Invalid or missing ingestion token");

    validateTrajectoriesShape(input.trajectories);

    const result = await repo.appendTrajectoryBatch(input.id, input.trajectories);
    if (!result) throw new NotFoundError(`Workspace ${input.id} not found`);

    return { id: input.id, batch: result.batch, appendedCount: input.trajectories.length };
}
