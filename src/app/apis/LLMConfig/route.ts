import { GetLlmConfigOutputType } from "../types";
import { withApi } from "../apiWrapper";
import { getLlmConfig } from "./response";

export async function GET(request: Request) {
  return withApi<Record<string, never>, GetLlmConfigOutputType>(
    getLlmConfig,
    "llm/config",
  )({}, request);
}
