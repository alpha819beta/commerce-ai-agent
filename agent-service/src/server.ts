import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import { streamChatTurn } from './agent/agent';
import { config } from './config';

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: config.adminOrigin }));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

/**
 * Streams the assistant's reply as Server-Sent Events: one `data:` line per
 * text delta (`{"type":"delta","text":"..."}`), then a closing
 * `{"type":"done"}` or `{"type":"error",...}` line. A plain fetch() with a
 * ReadableStream reader (not EventSource, since this is a POST) is how the
 * chat widget consumes this — see public/admin/chat.js.
 */
app.post('/chat', async (req: Request, res: Response) => {
  const { sessionId, message } = req.body ?? {};

  if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
    return res.status(400).json({ error: { code: 'INVALID_SESSION', message: 'sessionId is required.' } });
  }
  if (typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: { code: 'INVALID_MESSAGE', message: 'message is required.' } });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  try {
    for await (const delta of streamChatTurn(sessionId, message)) {
      res.write(`data: ${JSON.stringify({ type: 'delta', text: delta })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  } catch (err) {
    console.error('Error while streaming chat turn:', err);
    res.write(
      `data: ${JSON.stringify({ type: 'error', message: 'An unexpected error occurred in the agent service.' })}\n\n`
    );
  } finally {
    res.end();
  }
});

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} not found` } });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error in agent service:', err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred in the agent service.' } });
});

app.listen(config.port, () => {
  console.log(`Agent service listening on http://localhost:${config.port}`);
  console.log(`Backend API: ${config.apiBaseUrl}`);
  console.log(`Ollama: ${config.ollamaBaseUrl} (model: ${config.ollamaModel})`);
});

export default app;
