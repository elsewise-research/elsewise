import { NextResponse } from 'next/server';

export type ApiLine = {
    role: 'user' | 'assistant';
    content: Array<{
      type: 'text' | 'image';
      text?: string;
      source?: {
        type: 'base64';
        media_type: string;
        data: string;
      };
      metadata?: Record<string, object>;
      // Marks this block (and everything before it) as cacheable by Anthropic's prompt
      // caching — a later request sharing the same prefix bytes gets a fast, cheap cache hit
      // instead of full reprocessing. Passed straight through to the API body below.
      cache_control?: { type: 'ephemeral' };
    }>;
  };

export interface ApiOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

// Helper to get request ID from headers (set by middleware)
export function getRequestId(request?: Request): string {
  if (!request) return 'no-req-id';
  return request.headers.get('x-request-id') || 'no-req-id';
}

const DEFAULT_ANTHROPIC_OPTIONS: ApiOptions = {
  model: 'claude-haiku-4-5-20251001',
  temperature: 0.8,
  maxTokens: 32500,
};

const DEFAULT_OPENAI_OPTIONS: ApiOptions = {
  model: 'gpt-5-mini',
  maxTokens: 32500,
};

type LLMProvider = 'anthropic' | 'openai';

// Prefers Anthropic when both keys are configured; falls back to OpenAI.
function resolveProvider(): LLMProvider {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  throw new Error('No LLM provider configured — set ANTHROPIC_API_KEY or OPENAI_API_KEY');
}

async function callAnthropicAPI(
  systemPrompt: string,
  messages: Array<ApiLine>,
  options: ApiOptions = {},
) {
  // const { model, temperature, maxTokens } = { ...DEFAULT_ANTHROPIC_OPTIONS, ...options };
  const { model, maxTokens } = { ...DEFAULT_ANTHROPIC_OPTIONS, ...options };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    } as HeadersInit,
    body: JSON.stringify({
      model,
      messages,
      system: systemPrompt,
      max_tokens: maxTokens,
      // temperature,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Anthropic API error (${response.status})`;
    try {
      const errorData = JSON.parse(errorText);
      if (errorData.error?.message) {
        errorMessage = errorData.error.message;
      } else if (errorData.message) {
        errorMessage = errorData.message;
      } else {
        errorMessage = `${errorMessage}: ${errorText}`;
      }
    } catch {
      // If parsing fails, use the raw error text
      errorMessage = `${errorMessage}: ${errorText}`;
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  if (!data) {
    throw new Error('Empty response from API');
  }

  if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
    console.error('Unexpected API response structure:', JSON.stringify(data));
    throw new Error('Invalid API response structure: content array missing or empty');
  }

  // Skip the first thinking token if it exists
  const contentItem = data.content[0].type == 'text' ? data.content[0] : data.content[1];

  if (!contentItem || typeof contentItem.text !== 'string') {
    console.error('Unexpected content item structure:', JSON.stringify(contentItem));
    throw new Error('Invalid content item: text field missing or not a string');
  }

  return contentItem.text;
}

// Flattens an ApiLine's text blocks into one string. Image content and Anthropic's
// cache_control hint (prompt caching is automatic server-side on OpenAI, no flag needed)
// aren't used by any current caller, so they're simply ignored here rather than translated.
function flattenApiLineText(line: ApiLine): string {
  return line.content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}

async function callOpenAIAPI(
  systemPrompt: string,
  messages: Array<ApiLine>,
  options: ApiOptions = {},
) {
  const { model, maxTokens } = { ...DEFAULT_OPENAI_OPTIONS, ...options };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map((line) => ({ role: line.role, content: flattenApiLineText(line) })),
      ],
      // gpt-5-family models reject `max_tokens` and `temperature`; use max_completion_tokens.
      max_completion_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `OpenAI API error (${response.status})`;
    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.error?.message ?? `${errorMessage}: ${errorText}`;
    } catch {
      errorMessage = `${errorMessage}: ${errorText}`;
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    console.error('Unexpected OpenAI response structure:', JSON.stringify(data));
    throw new Error('Invalid OpenAI response structure: choices[0].message.content missing or not a string');
  }

  return content;
}

/**
 * Makes a request to whichever LLM provider is configured (Anthropic preferred,
 * OpenAI as a fallback — see resolveProvider).
 */
export async function callLLM(
  systemPrompt: string,
  messages: Array<ApiLine>,
  options: ApiOptions = {},
) {
  const provider = resolveProvider();
  return provider === 'anthropic'
    ? callAnthropicAPI(systemPrompt, messages, options)
    : callOpenAIAPI(systemPrompt, messages, options);
}

/**
 * Wraps a function in a NextResponse for LLM operations
 */
export function withLLMApi<T, R>(
  fn: (input: T) => Promise<R>,
  routeName?: string,
): (input: T, request?: Request) => Promise<NextResponse<R | { error: string }>> {
  return async (input: T, request?: Request) => {
    const reqId = getRequestId(request);
    const route = routeName || 'LLM-API';

    try {
      console.log(`[${reqId}] ✅ ${route}: Processing request`);
      const response: R = await fn(input);
      console.log(`[${reqId}] ✅ ${route}: Completed successfully`);
      return NextResponse.json(response);
    } catch (error) {
      console.error(`[${reqId}] ❌ ${route} Error:`, error);
      if (error instanceof Error && error.name === 'AbortError') {
        return NextResponse.json({ error: 'Request was cancelled' }, { status: 499 });
      }

      // Properly serialize error message
      const errorMessage = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
  };
}