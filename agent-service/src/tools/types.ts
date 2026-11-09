/**
 * Every tool function returns this shape instead of throwing, so a failed
 * lookup/validation/API call always becomes a sentence the agent can relay
 * to the admin rather than an unhandled rejection inside the ADK turn.
 */
export type ToolResult =
  | { ok: true; message: string; data?: Record<string, unknown> }
  | { ok: false; message: string; code?: string };
