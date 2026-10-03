import { ReplaceBatchValueClusteringsInputType, ReplaceBatchValueClusteringsOutputType } from "../../../../../types";
import { withApi } from "../../../../../apiWrapper";
import { replaceBatchValueClusterings } from "./response";

type RouteContext = { params: Promise<{ id: string; batchId: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const { id, batchId } = await context.params;
  const body = await request.json();
  return withApi<ReplaceBatchValueClusteringsInputType & { id: string; batchId: string }, ReplaceBatchValueClusteringsOutputType>(
    replaceBatchValueClusterings,
    "workspace/batch/valueClusterings/replace",
  )({ ...body, id, batchId }, request);
}
