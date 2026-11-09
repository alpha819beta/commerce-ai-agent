import { InMemoryRunner, LlmAgent, stringifyContent } from '@google/adk';
import { createOllamaModel } from './model';
import { allTools } from './toolDefs';

const AGENT_NAME = 'ecommerce_admin_agent';
const APP_NAME = 'ecommerce-admin-agent';

const INSTRUCTION = `You are an assistant embedded in an e-commerce admin dashboard. You help the admin manage orders and products using the tools provided. You can:
- Look up an order's status (get_order_status), change an order's status (update_order_status), or cancel an order (cancel_order).
- Look up a product's price/description (get_product), update a product's price (update_product_price), or update a product's description (update_product_description).

Rules:
- Only take the actions above. If the admin asks for something outside this scope, say so plainly instead of guessing or improvising a different action.
- Orders and products may be referred to by order number (e.g. "ORD-1043"), SKU (e.g. "SKU-001"), id, or name. Pass whatever the admin typed straight through to the tool; the tool resolves it.
- If a request is ambiguous (e.g. missing which order/product, or an unclear status), ask a short clarifying question instead of guessing.
- After a tool call, summarize the result for the admin in one or two clear sentences. If the tool reports a failure, relay the reason plainly and do not pretend it succeeded.
- Never fabricate order or product data; only state what a tool returned.`;

let runnerInstance: InMemoryRunner | null = null;

function getRunner(): InMemoryRunner {
  if (!runnerInstance) {
    const rootAgent = new LlmAgent({
      name: AGENT_NAME,
      model: createOllamaModel(),
      instruction: INSTRUCTION,
      tools: allTools,
    });
    runnerInstance = new InMemoryRunner({ agent: rootAgent, appName: APP_NAME });
  }
  return runnerInstance;
}

/**
 * Runs one turn of the conversation for the given session, maintaining
 * short-term context in ADK's in-memory session service (per-sessionId
 * history, lost on service restart — see README limitations).
 *
 * Yields text deltas as they arrive from the model so the caller (the SSE
 * handler in server.ts) can forward them to the browser in real time.
 * `OllamaLlm.generateContentAsync` (agent/model.ts) yields the model's
 * *cumulative* text so far on every partial chunk; this generator diffs
 * against what it already emitted so each yielded chunk here is the true
 * incremental delta. Tool-call turns produce no text (only the follow-up
 * turn that summarizes the tool result does), so nothing is yielded while a
 * tool is being called — streaming resumes once the model starts producing
 * its summary.
 */
export async function* streamChatTurn(sessionId: string, message: string): AsyncGenerator<string, void> {
  const runner = getRunner();

  await runner.sessionService.getOrCreateSession({
    appName: APP_NAME,
    userId: sessionId,
    sessionId,
  });

  let emittedLength = 0;
  let sawAnyText = false;

  for await (const event of runner.runAsync({
    userId: sessionId,
    sessionId,
    newMessage: { role: 'user', parts: [{ text: message }] },
  })) {
    const text = stringifyContent(event);
    if (!text) continue;

    sawAnyText = true;
    if (text.length > emittedLength) {
      yield text.slice(emittedLength);
      emittedLength = text.length;
    }

    if (!event.partial) {
      emittedLength = 0;
    }
  }

  if (!sawAnyText) {
    yield "I didn't produce a response for that — could you rephrase?";
  }
}
