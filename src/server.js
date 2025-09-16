import express from 'express';
import Joi from 'joi';
import { PtyBackend } from './pty-backend.js';
import { SessionManager } from './session-manager.js';

// JSON-RPC request validation schema
const jsonRpcRequestSchema = Joi.object({
  jsonrpc: Joi.string().valid('2.0').required(),
  id: Joi.alternatives([Joi.string(), Joi.number()]).required(),
  method: Joi.string().required(),
  params: Joi.object().default({})
});

// JSON-RPC error codes
const JsonRpcErrors = {
  PARSE_ERROR: { code: -32700, message: 'Parse error' },
  INVALID_REQUEST: { code: -32600, message: 'Invalid Request' },
  METHOD_NOT_FOUND: { code: -32601, message: 'Method not found' },
  INVALID_PARAMS: { code: -32602, message: 'Invalid params' },
  INTERNAL_ERROR: { code: -32603, message: 'Internal error' }
};

// Create and configure the MCP server
export async function createServer(config = {}) {
  const {
    port = process.env.PORT || 3000,
    apiKeys = process.env.API_KEYS ? process.env.API_KEYS.split(',') : ['default-api-key'],
    maxSessions = config.maxSessions || 10,
    sessionTimeout = config.sessionTimeout || 30 * 60 * 1000
  } = config;

  const app = express();

  // Initialize PTY backend and session manager
  const ptyBackend = new PtyBackend();
  const sessionManager = new SessionManager(ptyBackend, {
    maxSessions,
    sessionTimeout
  });

  // Middleware
  app.use(express.json({ limit: '1mb' }));

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'mcp-tui-runner' });
  });

  // API key authentication middleware
  function authenticateApiKey(req, res, next) {
    const authHeader = req.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: API key required' });
    }

    const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!apiKeys.includes(apiKey)) {
      return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
    }

    next();
  }

  // Main MCP endpoint
  app.post('/mcp', authenticateApiKey, async (req, res) => {
    try {
      // Validate JSON-RPC request format
      const { error, value: request } = jsonRpcRequestSchema.validate(req.body);

      if (error) {
        return res.status(400).json({
          jsonrpc: '2.0',
          id: req.body.id || null,
          error: JsonRpcErrors.INVALID_REQUEST
        });
      }

      // Route to appropriate MCP tool handler
      const result = await handleMcpMethod(request.method, request.params);

      // Return successful JSON-RPC response
      res.json({
        jsonrpc: '2.0',
        id: request.id,
        result
      });

    } catch (err) {
      console.error('MCP request error:', err);

      // Return JSON-RPC error response
      res.json({
        jsonrpc: '2.0',
        id: req.body.id || null,
        error: {
          code: err.code || JsonRpcErrors.INTERNAL_ERROR.code,
          message: err.message || JsonRpcErrors.INTERNAL_ERROR.message
        }
      });
    }
  });

  // MCP method dispatcher
  async function handleMcpMethod(method, params) {
    switch (method) {
      case 'tui.start':
        return await handleTuiStart(params);

      case 'tui.read_frame':
        return await handleTuiReadFrame(params);

      case 'tui.send_keys':
        return await handleTuiSendKeys(params);

      case 'tui.expect':
        return await handleTuiExpect(params);

      case 'tui.resize':
        return await handleTuiResize(params);

      case 'tui.close':
        return await handleTuiClose(params);

      default:
        const error = new Error(JsonRpcErrors.METHOD_NOT_FOUND.message);
        error.code = JsonRpcErrors.METHOD_NOT_FOUND.code;
        throw error;
    }
  }

  // MCP tool implementations
  async function handleTuiStart(params) {
    const schema = Joi.object({
      command: Joi.string().required(),
      args: Joi.array().items(Joi.string()).default([]),
      cwd: Joi.string(),
      env: Joi.object().pattern(Joi.string(), Joi.string()).default({}),
      rows: Joi.number().integer().min(1).max(1000).default(24),
      cols: Joi.number().integer().min(1).max(1000).default(80)
    });

    const { error, value } = schema.validate(params);
    if (error) {
      const validationError = new Error(`Invalid parameters: ${error.message}`);
      validationError.code = JsonRpcErrors.INVALID_PARAMS.code;
      throw validationError;
    }

    try {
      const session = await sessionManager.createSession(value);
      return {
        session_id: session.id,
        seq: session.lastSequence
      };
    } catch (err) {
      const error = new Error(`Failed to start TUI session: ${err.message}`);
      error.code = JsonRpcErrors.INTERNAL_ERROR.code;
      throw error;
    }
  }

  async function handleTuiReadFrame(params) {
    const schema = Joi.object({
      session_id: Joi.string().required(),
      since_seq: Joi.number().integer().min(0).default(0)
    });

    const { error, value } = schema.validate(params);
    if (error) {
      const validationError = new Error(`Invalid parameters: ${error.message}`);
      validationError.code = JsonRpcErrors.INVALID_PARAMS.code;
      throw validationError;
    }

    try {
      const frame = sessionManager.getSessionFrame(value.session_id, value.since_seq);
      return {
        seq: frame.sequence,
        rows: frame.rows,
        cols: frame.cols,
        cursor: frame.cursor,
        text: frame.text
      };
    } catch (err) {
      const error = new Error(`Failed to read frame: ${err.message}`);
      error.code = JsonRpcErrors.INTERNAL_ERROR.code;
      throw error;
    }
  }

  async function handleTuiSendKeys(params) {
    const schema = Joi.object({
      session_id: Joi.string().required(),
      keys: Joi.array().items(Joi.string()).required(),
      throttle_ms: Joi.number().integer().min(0).max(1000).default(10)
    });

    const { error, value } = schema.validate(params);
    if (error) {
      const validationError = new Error(`Invalid parameters: ${error.message}`);
      validationError.code = JsonRpcErrors.INVALID_PARAMS.code;
      throw validationError;
    }

    try {
      await sessionManager.sendKeys(value.session_id, value.keys, value.throttle_ms);
      return { ok: true };
    } catch (err) {
      const error = new Error(`Failed to send keys: ${err.message}`);
      error.code = JsonRpcErrors.INTERNAL_ERROR.code;
      throw error;
    }
  }

  async function handleTuiExpect(params) {
    const schema = Joi.object({
      session_id: Joi.string().required(),
      pattern: Joi.string().required(),
      timeout_ms: Joi.number().integer().min(100).max(30000).default(5000),
      negate: Joi.boolean().default(false)
    });

    const { error, value } = schema.validate(params);
    if (error) {
      const validationError = new Error(`Invalid parameters: ${error.message}`);
      validationError.code = JsonRpcErrors.INVALID_PARAMS.code;
      throw validationError;
    }

    // Placeholder implementation - will be enhanced with pattern matching
    try {
      const frame = sessionManager.getSessionFrame(value.session_id);
      const regex = new RegExp(value.pattern);
      const matched = regex.test(frame.text) !== value.negate;

      return {
        matched,
        snapshot_seq: frame.sequence
      };
    } catch (err) {
      const error = new Error(`Failed to expect pattern: ${err.message}`);
      error.code = JsonRpcErrors.INTERNAL_ERROR.code;
      throw error;
    }
  }

  async function handleTuiResize(params) {
    const schema = Joi.object({
      session_id: Joi.string().required(),
      rows: Joi.number().integer().min(1).max(1000).required(),
      cols: Joi.number().integer().min(1).max(1000).required()
    });

    const { error, value } = schema.validate(params);
    if (error) {
      const validationError = new Error(`Invalid parameters: ${error.message}`);
      validationError.code = JsonRpcErrors.INVALID_PARAMS.code;
      throw validationError;
    }

    try {
      await sessionManager.resizeSession(value.session_id, value.rows, value.cols);
      return { ok: true };
    } catch (err) {
      const error = new Error(`Failed to resize session: ${err.message}`);
      error.code = JsonRpcErrors.INTERNAL_ERROR.code;
      throw error;
    }
  }

  async function handleTuiClose(params) {
    const schema = Joi.object({
      session_id: Joi.string().required(),
      signal: Joi.string().valid('SIGTERM', 'SIGKILL', 'SIGINT').default('SIGTERM')
    });

    const { error, value } = schema.validate(params);
    if (error) {
      const validationError = new Error(`Invalid parameters: ${error.message}`);
      validationError.code = JsonRpcErrors.INVALID_PARAMS.code;
      throw validationError;
    }

    try {
      const session = sessionManager.getSession(value.session_id);
      await sessionManager.closeSession(value.session_id, value.signal);

      return {
        ok: true,
        exit_code: session.exitCode
      };
    } catch (err) {
      const error = new Error(`Failed to close session: ${err.message}`);
      error.code = JsonRpcErrors.INTERNAL_ERROR.code;
      throw error;
    }
  }

  // Set up graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down MCP TUI Runner...');

    try {
      await sessionManager.cleanup();
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Start the server
  const server = app.listen(port, () => {
    console.log(`MCP TUI Runner server listening on port ${port}`);
    console.log(`Maximum sessions: ${maxSessions}`);
    console.log(`Session timeout: ${sessionTimeout / 1000}s`);
  });

  return { app, server, sessionManager };
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createServer().catch(console.error);
}