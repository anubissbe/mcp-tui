import express from 'express';
import Joi from 'joi';

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
    apiKeys = process.env.API_KEYS ? process.env.API_KEYS.split(',') : ['default-api-key']
  } = config;

  const app = express();

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
        // Placeholder implementation - will be implemented in later tasks
        return { session_id: 'temp-session-id', seq: 0 };

      case 'tui.read_frame':
        // Placeholder implementation
        return { seq: 0, rows: 24, cols: 80, cursor: { row: 0, col: 0 }, text: '' };

      case 'tui.send_keys':
        // Placeholder implementation
        return { ok: true };

      case 'tui.expect':
        // Placeholder implementation
        return { matched: false, snapshot_seq: 0 };

      case 'tui.close':
        // Placeholder implementation
        return { ok: true, exit_code: 0 };

      default:
        const error = new Error(JsonRpcErrors.METHOD_NOT_FOUND.message);
        error.code = JsonRpcErrors.METHOD_NOT_FOUND.code;
        throw error;
    }
  }

  // Start the server
  const server = app.listen(port, () => {
    console.log(`MCP TUI Runner server listening on port ${port}`);
  });

  return { app, server };
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createServer().catch(console.error);
}