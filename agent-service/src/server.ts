import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import { runChatTurn } from './agent/agent';
import { config } from './config';

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: config.adminOrigin }));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.post(
  '/chat',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId, message } = req.body ?? {};

      if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
        return res.status(400).json({ error: { code: 'INVALID_SESSION', message: 'sessionId is required.' } });
      }
      if (typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: { code: 'INVALID_MESSAGE', message: 'message is required.' } });
      }

      const reply = await runChatTurn(sessionId, message);
      res.json({ reply });
    } catch (err) {
      next(err);
    }
  }
);

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
