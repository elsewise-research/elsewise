import { GetLlmConfigOutputType } from "../types";

export async function getLlmConfig(): Promise<GetLlmConfigOutputType> {
    return { configured: Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) };
}
