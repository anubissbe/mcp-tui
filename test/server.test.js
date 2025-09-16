import { test, describe } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createServer } from '../src/server.js';

describe('MCP Server HTTP Tests', () => {
  let app;
  let server;

  // Setup test server before each test
  test('setup', async () => {
    const { app: testApp, server: testServer } = await createServer({
      port: 0, // Use random port for testing
      apiKeys: ['test-api-key-123']
    });
    app = testApp;
    server = testServer;
  });

  test('should respond to health check', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    assert.deepStrictEqual(response.body, { status: 'ok', service: 'mcp-tui-runner' });
  });

  test('should reject requests without API key', async () => {
    const response = await request(app)
      .post('/mcp')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tui.start',
        params: { command: 'echo', args: ['hello'] }
      })
      .expect(401);

    assert.strictEqual(response.body.error, 'Unauthorized: API key required');
  });

  test('should reject requests with invalid API key', async () => {
    const response = await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer invalid-key')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tui.start',
        params: { command: 'echo', args: ['hello'] }
      })
      .expect(401);

    assert.strictEqual(response.body.error, 'Unauthorized: Invalid API key');
  });

  test('should accept requests with valid API key', async () => {
    const response = await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer test-api-key-123')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tui.start',
        params: { command: 'echo', args: ['hello'] }
      });

    // Should not return 401
    assert.notStrictEqual(response.status, 401);
    // Should return valid JSON-RPC response structure
    assert.strictEqual(response.body.jsonrpc, '2.0');
    assert.strictEqual(response.body.id, 1);
  });

  test('should validate JSON-RPC request format', async () => {
    const response = await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer test-api-key-123')
      .send({
        // Missing required jsonrpc field
        id: 1,
        method: 'tui.start'
      })
      .expect(400);

    assert.strictEqual(response.body.jsonrpc, '2.0');
    assert.strictEqual(response.body.error.code, -32600);
    assert(response.body.error.message.includes('Invalid Request'));
  });

  test('should handle unknown methods gracefully', async () => {
    const response = await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer test-api-key-123')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'unknown.method',
        params: {}
      })
      .expect(200);

    assert.strictEqual(response.body.jsonrpc, '2.0');
    assert.strictEqual(response.body.error.code, -32601);
    assert.strictEqual(response.body.error.message, 'Method not found');
  });

  // Cleanup after tests
  test('cleanup', async () => {
    if (server) {
      server.close();
    }
  });
});