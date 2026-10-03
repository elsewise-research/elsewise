import { GetBatchDataOutputType } from "../../../../types";
import { withApi } from "../../../../apiWrapper";
import { getBatchData } from "./response";

type RouteContext = { params: Promise<{ id: string; batchId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { id, batchId } = await context.params;
  return withApi<{ id: string; batchId: string }, GetBatchDataOutputType>(
    getBatchData,
    "workspace/batch/get",
  )({ id, batchId }, request);
}
