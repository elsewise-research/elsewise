import { AppendTrajectoriesInputType, AppendTrajectoriesOutputType } from "../../../types";
import { withApi } from "../../../apiWrapper";
import { appendTrajectories } from "./response";

type RouteContext = { params: Promise<{ id: string }> };

function extractBearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : "";
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json();
  const token = extractBearerToken(request);

  return withApi<AppendTrajectoriesInputType & { id: string; token: string }, AppendTrajectoriesOutputType>(
    appendTrajectories,
    "workspace/trajectories/append",
  )({ ...body, id, token }, request);
}
