import { BaseLlm, LlmRequest, LlmResponse } from '@google/adk';
import type { BaseLlmConnection } from '@google/adk';
import type { Content, FunctionDeclaration, Part, Schema } from '@google/genai';
import { config } from '../config';

/**
 * `@google/adk` ships a first-party connector only for Gemini (`models/google_llm.ts`);
 * there is no built-in OpenAI-compatible or Ollama connector in this package version, and
 * the extension point is the abstract `BaseLlm` class (see `models/base_llm.ts`), not an
 * AI-SDK-style model object. This adapter implements that extension point directly against
 * Ollama's OpenAI-compatible `/chat/completions` endpoint.
 *
 * `generateContentAsync` always streams from Ollama (`stream: true`) and yields a partial
 * `LlmResponse` (cumulative text so far, `partial: true`) for every text delta Ollama sends,
 * then one final non-partial `LlmResponse` with the complete text or tool call(s). ADK's
 * `LlmAgent`/`Runner` forward every yielded `LlmResponse` to the caller as it arrives
 * regardless of `partial` (only non-partial events get persisted to session history — see
 * `BaseSessionService.appendEvent`/`Runner.processAndAppendEvent` — partials are purely a
 * transient signal to whoever is consuming `Runner.runAsync`, which is exactly how this
 * surfaces real-time streaming all the way out through `agent/agent.ts`'s `streamChatTurn`
 * without needing ADK's separate live/bidi (`runLive`) machinery). `connect()` (bidirectional
 * voice/video) is not implemented since the chat widget never uses it.
 */
export class OllamaLlm extends BaseLlm {
  constructor(
    private readonly baseUrl: string,
    private readonly ollamaModelName: string,
    adkModelName: string
  ) {
    super({ model: adkModelName });
  }

  async *generateContentAsync(
    llmRequest: LlmRequest,
    _stream?: boolean,
    abortSignal?: AbortSignal
  ): AsyncGenerator<LlmResponse, void> {
    const body = buildChatCompletionRequest(this.ollamaModelName, llmRequest);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortSignal,
      });
    } catch (err) {
      yield unreachableResponse((err as Error).message);
      return;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      yield unreachableResponse(`Ollama returned HTTP ${res.status}: ${text}`);
      return;
    }

    if (!res.body) {
      yield unreachableResponse('Ollama returned a response with no body.');
      return;
    }

    yield* this.streamResponse(res.body);
  }

  private async *streamResponse(body: ReadableStream<Uint8Array>): AsyncGenerator<LlmResponse, void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedText = '';
    const toolCalls = new Map<number, { id?: string; name?: string; arguments: string }>();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice('data:'.length).trim();
          if (payload === '[DONE]') continue;

          let chunk: any;
          try {
            chunk = JSON.parse(payload);
          } catch {
            continue;
          }

          const delta = chunk?.choices?.[0]?.delta;
          if (!delta) continue;

          if (typeof delta.content === 'string' && delta.content.length > 0) {
            accumulatedText += delta.content;
            yield { partial: true, content: { role: 'model', parts: [{ text: accumulatedText }] } };
          }

          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const existing = toolCalls.get(tc.index) ?? { arguments: '' };
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
              if (tc.function?.arguments) existing.arguments += tc.function.arguments;
              toolCalls.set(tc.index, existing);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (toolCalls.size > 0) {
      const parts: Part[] = Array.from(toolCalls.values()).map((tc) => ({
        functionCall: { id: tc.id, name: tc.name || '', args: safeParseJson(tc.arguments) },
      }));
      yield { content: { role: 'model', parts } };
    } else {
      yield { content: { role: 'model', parts: [{ text: accumulatedText }] } };
    }
  }

  async connect(): Promise<BaseLlmConnection> {
    throw new Error('Live/streaming connections are not supported by the Ollama adapter.');
  }
}

export function createOllamaModel(): OllamaLlm {
  return new OllamaLlm(config.ollamaBaseUrl, config.ollamaModel, `ollama/${config.ollamaModel}`);
}

function unreachableResponse(detail: string): LlmResponse {
  return {
    errorCode: 'OLLAMA_UNAVAILABLE',
    errorMessage: detail,
    content: {
      role: 'model',
      parts: [
        {
          text: "I couldn't reach the local language model (Ollama). Please make sure Ollama is running and the configured model has been pulled.",
        },
      ],
    },
  };
}

// ============================================================================
// ADK Content[] <-> OpenAI-compatible chat.completions request/response
// ============================================================================

interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
}

function buildChatCompletionRequest(model: string, llmRequest: LlmRequest) {
  const messages: OpenAiMessage[] = [];

  const systemText = extractSystemInstruction(llmRequest);
  if (systemText) {
    messages.push({ role: 'system', content: systemText });
  }

  for (const content of llmRequest.contents) {
    messages.push(...contentToMessages(content));
  }

  const tools = Object.values(llmRequest.toolsDict)
    .map((tool) => tool._getDeclaration())
    .filter((decl): decl is FunctionDeclaration => Boolean(decl))
    .map((decl) => ({
      type: 'function' as const,
      function: {
        name: decl.name,
        description: decl.description || '',
        parameters: decl.parameters ? schemaToJsonSchema(decl.parameters) : { type: 'object', properties: {} },
      },
    }));

  return {
    model,
    messages,
    ...(tools.length > 0 ? { tools } : {}),
    stream: true,
  };
}

function safeParseJson(text: string): Record<string, unknown> {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function extractSystemInstruction(llmRequest: LlmRequest): string | undefined {
  const instruction = llmRequest.config?.systemInstruction;
  if (!instruction) return undefined;
  if (typeof instruction === 'string') return instruction;
  const contents = Array.isArray(instruction) ? instruction : [instruction];
  const texts: string[] = [];
  for (const item of contents) {
    if (typeof item === 'string') {
      texts.push(item);
    } else if (item && typeof item === 'object' && 'parts' in item) {
      for (const part of (item as Content).parts || []) {
        if (part.text) texts.push(part.text);
      }
    } else if (item && typeof item === 'object' && 'text' in item) {
      const text = (item as Part).text;
      if (text) texts.push(text);
    }
  }
  return texts.length > 0 ? texts.join('\n') : undefined;
}

/** A single ADK `Content` can hold text, a function call, or a function response - never mixed. */
function contentToMessages(content: Content): OpenAiMessage[] {
  const parts = content.parts || [];

  const functionResponseParts = parts.filter((p) => p.functionResponse);
  if (functionResponseParts.length > 0) {
    return functionResponseParts.map((p) => ({
      role: 'tool' as const,
      tool_call_id: p.functionResponse!.id || p.functionResponse!.name || 'unknown',
      content: JSON.stringify(p.functionResponse!.response ?? {}),
    }));
  }

  const functionCallParts = parts.filter((p) => p.functionCall);
  if (functionCallParts.length > 0) {
    return [
      {
        role: 'assistant',
        tool_calls: functionCallParts.map((p, index) => ({
          id: p.functionCall!.id || `call_${index}`,
          type: 'function' as const,
          function: {
            name: p.functionCall!.name || '',
            arguments: JSON.stringify(p.functionCall!.args ?? {}),
          },
        })),
      },
    ];
  }

  const text = parts.map((p) => p.text || '').join('');
  return [{ role: content.role === 'model' ? 'assistant' : 'user', content: text }];
}

/** Lowercases genai's uppercase `Type` enum values ("OBJECT" -> "object") so the schema is valid JSON Schema. */
function schemaToJsonSchema(schema: Schema): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (schema.type) result.type = String(schema.type).toLowerCase();
  if (schema.description) result.description = schema.description;
  if (schema.enum) result.enum = schema.enum;
  if (schema.required) result.required = schema.required;
  if (schema.items) result.items = schemaToJsonSchema(schema.items);
  if (schema.properties) {
    result.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [key, schemaToJsonSchema(value)])
    );
  }
  return result;
}
