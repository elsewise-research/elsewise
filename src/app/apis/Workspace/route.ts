import { CreateWorkspaceInputType, CreateWorkspaceOutputType } from "../types";
import { withApi } from "../apiWrapper";
import { createWorkspace } from "./response";

export async function POST(request: Request) {
  const body = await request.json();
  return withApi<CreateWorkspaceInputType, CreateWorkspaceOutputType>(createWorkspace, "workspace/create")(
    body,
    request,
  );
}
