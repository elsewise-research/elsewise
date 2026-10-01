import { GetWorkspaceOutputType, ReplaceWorkspaceInputType, ReplaceWorkspaceOutputType } from "../../types";
import { withApi } from "../../apiWrapper";
import { getWorkspace, replaceWorkspace } from "./response";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return withApi<{ id: string }, GetWorkspaceOutputType>(getWorkspace, "workspace/get")({ id }, request);
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json();
  return withApi<ReplaceWorkspaceInputType & { id: string }, ReplaceWorkspaceOutputType>(
    replaceWorkspace,
    "workspace/replace",
  )({ ...body, id }, request);
}
