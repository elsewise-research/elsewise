import { NextResponse } from "next/server";
import { getRequestId } from "./LLM";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/server/errors";

/**
 * Non-LLM twin of withLLMApi: same request-id logging/error-handling shape,
 * mapped to the server/errors.ts error types instead of LLM-specific failures.
 */
export function withApi<T, R>(
  fn: (input: T, request?: Request) => Promise<R>,
  routeName?: string,
): (input: T, request?: Request) => Promise<NextResponse<R | { error: string }>> {
  return async (input: T, request?: Request) => {
    const reqId = getRequestId(request);
    const route = routeName || "API";

    try {
      console.log(`[${reqId}] ✅ ${route}: Processing request`);
      const response: R = await fn(input, request);
      console.log(`[${reqId}] ✅ ${route}: Completed successfully`);
      return NextResponse.json(response);
    } catch (error) {
      console.error(`[${reqId}] ❌ ${route} Error:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (error instanceof NotFoundError) {
        return NextResponse.json({ error: errorMessage }, { status: 404 });
      }
      if (error instanceof UnauthorizedError) {
        return NextResponse.json({ error: errorMessage }, { status: 401 });
      }
      if (error instanceof ValidationError) {
        return NextResponse.json({ error: errorMessage }, { status: 400 });
      }
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
  };
}
