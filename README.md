# AI Agent Engineering Assessment

## Overview

This project simulates a simplified e-commerce platform and asks you to build a **natural-language AI agent** that assists a store administrator in managing orders and products.

You are provided with:
- A running **storefront UI** (customer-facing)
- An **admin UI** for viewing and managing store data
- A fully functional **backend API**

Your task is to:
1. Implement a **chatbot embedded in the admin UI**
2. Implement a **backend agent service** that the chatbot communicates with
3. Enable the agent to interpret natural language requests and make authorized changes via backend APIs

This assessment is designed to evaluate how you design, implement, and reason about AI agents in a realistic product environment.

---

## Application Structure

After setup, the application exposes three primary surfaces:

### 1. Storefront (Customer View)
- URL: `http://localhost:3000/`
- Read-only storefront for browsing products
- Included for realism and data generation

### 2. Admin Dashboard
- URL: `http://localhost:3000/admin`
- Displays:
    - Recent orders
    - Product catalog
- Allows:
    - Updating order status
    - Editing product details (name, description, price)

You will extend this page by embedding a **chatbot interface** that allows an administrator to manage the store using natural language.

### 3. Backend API
- Base URL: `http://localhost:3000/api`
- Full API documentation available at `http://localhost:3000/api`

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Ollama installed locally

### Setup

```bash
npm install
npm run dev
```

The application runs at `http://localhost:3000`.

---

## Your Task

### High-Level Goals

You will implement:

1. **A simple chatbot UI embedded in the admin page**
2. **A backend agent service**
3. **Agent logic** that translates natural language into API actions

The focus is on correctness, clarity, and sound engineering judgment - not UI polish or exhaustive feature coverage.

---

## Chatbot UI Requirements

### Location
- Embedded directly on the **admin page** (`/admin`)

### Implementation
- Use an off-the-shelf chatbot UI library  
  **Suggested:** https://ai-sdk.dev/docs/ai-sdk-ui/overview

### Responsibilities
- Accept natural language input from an admin user
- Display conversational responses
- Show confirmations, summaries, and error messages
- Communicate with your agent service via HTTP (or similar)

---

## Agent Service Requirements

### Framework
- **Required:** Google Agent Development Kit (ADK) for TypeScript  
  https://google.github.io/adk-docs/get-started/

### LLM Provider
- **Required:** Ollama
- Choose any Qwen3 model up to 30b parameters

### Responsibilities
The agent service should:
- Accept natural language requests from the chatbot
- Maintain short-term conversational context
- Decide when and how to call backend APIs
- Execute actions safely and deterministically
- Return clear, human-readable responses

---

## Required Agent Capabilities

### Orders
- Change order status (e.g., pending → shipped → cancelled)
- Validate order existence and transitions
- Handle errors gracefully and explain outcomes

Example:
```
"Cancel order ORD-1043"
```

### Products
- Update product description
- Update product price
- Validate inputs (e.g., non-negative prices)

Example:
```
"Change the price of SKU-001 to $49.99"
```

You are not required to support every API endpoint. Depth and correctness matter more than breadth.

---

## Architecture Expectations

A typical interaction flow:

```
Admin UI (Chatbot)
   ↓
Agent Service (ADK)
   ↓
Backend API (/api)
```

We will evaluate:
- Separation of concerns
- Tool definitions and usage
- Error handling and recovery
- Code structure and readability

---

## AI Coding Tools

You may use AI-assisted coding tools (e.g., Copilot, Cursor, ChatGPT).

However:
- You are expected to **fully understand the code**
- You must be able to explain:
    - Design decisions
    - Agent behavior
    - Tradeoffs and limitations

We will discuss this during the review.

---

## Engineering Best Practices Expectations

### Version Control & Commits
- Make small, logical commits
- Write clear, descriptive commit messages
- Avoid large or unrelated commits
- Your commit history should tell a coherent story

We will review commit history as part of the evaluation.

### Unit Testing
- Provide unit tests for core agent logic
- Test intent handling, validation, and error paths
- Mock or stub external dependencies (LLMs, APIs)
- Favor meaningful behavior tests over raw coverage

---

## Time & Scope Guidance

Expected effort: **4–6 hours**.

You are **not expected** to:
- Build a production-ready system
- Implement every possible workflow
- Perfect the UI

We are interested in:
- Sound architecture
- Clear reasoning
- Thoughtful tradeoffs

---

## Submission Guidelines

Please include:
1. **Source Code with git history**
2. **Updated README**
    - Setup instructions
    - Architecture overview
    - Known limitations
3. **Tests**
4. **Demo**
    - Live runnable project **or**
    - Short recorded walkthrough

---

## Evaluation Criteria

We will evaluate:

1. Agent design and reasoning
2. API integration correctness
3. Error handling and recovery
4. Code quality and test coverage
5. Communication and engineering judgment

---

If you have questions about expected behavior or constraints, please reach out to your hiring contact.

Good luck - we’re excited to see how you approach this.
