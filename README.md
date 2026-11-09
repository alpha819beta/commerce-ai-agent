# AI Agent Engineering Assessment

A mock e-commerce platform (storefront + admin dashboard + REST API) with a natural-language
admin assistant: a chatbot embedded in the admin dashboard that can look up and change order
status, cancel orders, and update product price/description by calling the existing Backend API.

## Architecture

```
Admin UI (Chatbot widget)  ──POST /chat──▶  Agent Service (Express + Google ADK)
http://localhost:3000/admin                  http://localhost:3001
                                                      │
                                                      │ HTTP (fetch)
                                                      ▼
                                              Backend API
                                              http://localhost:3000/api
                                                      │
                                              Ollama (Qwen3, local)
                                              http://localhost:11434
```

- **Backend API** (root project, `src/`) — unchanged from the original mock e-commerce API:
  products/variants/inventory, orders/fulfillment/refunds, promotions. Storefront at `/`,
  admin dashboard at `/admin`, API docs at `/api`.
- **Agent Service** (`agent-service/`) — a separate Express service built with
  [Google ADK for TypeScript](https://google.github.io/adk-docs/get-started/typescript/)
  (`@google/adk`). It exposes one endpoint, `POST /chat`, that runs one turn of an `LlmAgent`
  against a local Ollama model and streams the natural-language reply back as Server-Sent
  Events, token by token. The agent only ever talks to the Backend API over HTTP — it has no
  direct access to the data files — so every action it takes is validated the same way a human
  admin's click would be.
- **Chatbot widget** (`public/admin.html`, `public/admin/chat.js`, `public/admin/admin.css`) —
  a small vanilla-JS chat panel embedded in the existing admin page. It POSTs to the agent
  service, renders the streamed reply as it arrives, and refreshes the existing orders/products
  lists once the reply finishes, so a successful action is visible immediately without a page
  reload.

Why a separate service instead of folding the agent into `server.ts`: the assignment's own
diagram and "Agent Service Requirements" describe it as a distinct component, and keeping it
separate means the agent can only reach the store through the same API surface any other
client uses — it can't reach into storage directly.

Why a vanilla-JS widget instead of the suggested Vercel AI SDK UI (React) components: the
existing admin page has zero build tooling (plain HTML/CSS/JS served statically by Express).
Pulling in React and a bundler for one chat widget would be a disproportionate increase in
complexity for this assessment, and would fight the grain of the existing codebase.

## Setup

### Prerequisites
- Node.js 24.13+ and npm 11.8+ (required by `@google/adk`)
- [Ollama](https://ollama.com) installed and running locally
- A Qwen3 model (≤30B) pulled in Ollama, e.g.:
  ```bash
  ollama pull qwen3:4b
  ```

### 1. Backend API + storefront + admin UI (root project)
```bash
npm install
npm run dev
```
Runs at `http://localhost:3000` (storefront `/`, admin `/admin`, API docs `/api`).

### 2. Agent service
```bash
cd agent-service
npm install
cp .env.example .env   # adjust OLLAMA_MODEL etc. if needed
npm run dev
```
Runs at `http://localhost:3001`. Requires Ollama to be running locally with the model in
`OLLAMA_MODEL` already pulled.

Open `http://localhost:3000/admin`, click the "💬 Assistant" button, and chat.

### Tests
```bash
npm test                 # root project: Backend API route tests
cd agent-service && npm test   # agent service: tool/validation/error-handling unit tests
```

## Agent Capabilities

- **Orders**: look up status ("what's the status of ORD-1043?"), change status ("mark
  ORD-1043 as shipped"), cancel an order ("cancel order ORD-1043"). Status changes are
  validated against the same status enum the Backend API enforces, and API-level errors
  (e.g. cancelling an already-cancelled order) are relayed back as plain language rather than
  failing silently.
- **Products**: look up a product ("what's the price of SKU-001?"), update price ("change the
  price of SKU-001 to $49.99"), update description. Prices are validated as non-negative
  numbers before any API call is made. Products/orders can be referred to by SKU/order number,
  raw id, or (for products) name — resolution logic lives in `agent-service/src/resolvers.ts`.
- Anything outside these two areas, the agent is instructed to say so rather than improvise.

## Testing strategy

Per the assignment's guidance to test "intent handling, validation, and error paths" while
mocking external dependencies, the agent service's unit tests (`agent-service/src/__tests__/`)
target the plain TypeScript functions behind each ADK tool — `apiClient`, `resolvers`,
`tools/orders`, `tools/products` — with `fetch` and the API client mocked. They don't depend on
a running Ollama instance or Backend API, and don't exercise ADK's `Runner`/`LlmAgent` machinery
directly, since that's thin wiring around logic that's already covered (consistent with the
root project's own `jest.config.js`, which excludes `server.ts` from coverage).

## Known limitations

- **No OpenAI/AI-SDK-compatible connector for Ollama in `@google/adk`.** The installed
  package (`@google/adk@2.4.0`) only ships a first-party Gemini connector; the extension point
  is the abstract `BaseLlm` class. `agent-service/src/agent/model.ts` implements that class
  directly against Ollama's OpenAI-compatible `/chat/completions` endpoint (request/response
  conversion, tool-call mapping, and SSE stream parsing). This was the most standards-based
  option available at build time — a future ADK release may ship a native connector worth
  switching to.
- **Streaming only covers text, not tool-call progress.** `POST /chat` streams the reply as
  Server-Sent Events, and the chat widget renders it token-by-token. Nothing streams while a
  tool is actually being called (there's no text to show yet) — the widget shows "Thinking..."
  until the model starts producing its summary of the tool result, which then streams in.
- **Conversation memory is in-process and per-session only.** ADK's in-memory session service
  keeps short-term context per browser session (a random id generated on page load) and is
  lost if the agent service restarts.
- **Single admin dashboard origin.** The agent service's CORS is locked to `ADMIN_ORIGIN`
  (default `http://localhost:3000`); there's no auth on `/chat` beyond that, since this is a
  local admin tool, not a deployed multi-tenant service.
- **Pre-existing Backend API issues, not introduced by this change:** two tests in the root
  project's own `src/__tests__/orders.test.ts` fail against the unmodified Backend API
  (`subtotal`/`taxTotal` double-counts tax in `calculateOrderTotals`, and a full refund can
  leave `paymentStatus` as `partially_refunded` instead of `refunded` due to rounding) — left
  as-is since the Backend API was provided as "fully functional" and out of scope for this
  assessment.
