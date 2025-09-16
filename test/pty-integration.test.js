import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createServer } from '../src/server.js';

describe('PTY Integration Tests', () => {
  let app;
  let server;
  let sessionManager;

  before(async () => {
    const serverInstance = await createServer({
      port: 0, // Use random port for testing
      apiKeys: ['test-api-key-123']
    });
    app = serverInstance.app;
    server = serverInstance.server;
    sessionManager = serverInstance.sessionManager;
  });

  after(async () => {
    if (sessionManager) {
      await sessionManager.cleanup();
    }
    if (server) {
      server.close();
    }
  });

  test('should create TUI session via API', async () => {
    const response = await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer test-api-key-123')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tui.start',
        params: {
          command: 'echo',
          args: ['hello world'],
          rows: 24,
          cols: 80
        }
      })
      .expect(200);

    assert.strictEqual(response.body.jsonrpc, '2.0');
    assert.strictEqual(response.body.id, 1);
    assert.ok(response.body.result);
    assert.ok(response.body.result.session_id);
    assert.strictEqual(typeof response.body.result.seq, 'number');

    // Clean up session
    const sessionId = response.body.result.session_id;
    await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer test-api-key-123')
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tui.close',
        params: { session_id: sessionId }
      });
  });

  test('should read frame from session', async () => {
    // Create session
    const createResponse = await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer test-api-key-123')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tui.start',
        params: {
          command: 'echo',
          args: ['test output'],
          rows: 24,
          cols: 80
        }
      })
      .expect(200);

    const sessionId = createResponse.body.result.session_id;

    // Allow process to run
    await new Promise(resolve => setTimeout(resolve, 100));

    // Read frame
    const frameResponse = await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer test-api-key-123')
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tui.read_frame',
        params: { session_id: sessionId }
      })
      .expect(200);

    assert.strictEqual(frameResponse.body.jsonrpc, '2.0');
    assert.ok(frameResponse.body.result);
    assert.strictEqual(typeof frameResponse.body.result.seq, 'number');
    assert.strictEqual(frameResponse.body.result.rows, 24);
    assert.strictEqual(frameResponse.body.result.cols, 80);
    assert.ok(typeof frameResponse.body.result.text === 'string');

    // Clean up
    await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer test-api-key-123')
      .send({
        jsonrpc: '2.0',
        id: 3,
        method: 'tui.close',
        params: { session_id: sessionId }
      });
  });

  test('should send keys to session', async () => {
    // Create session with cat command (echo input)
    const createResponse = await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer test-api-key-123')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tui.start',
        params: {
          command: 'cat',
          rows: 24,
          cols: 80
        }
      })
      .expect(200);

    const sessionId = createResponse.body.result.session_id;

    // Send keys
    const keysResponse = await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer test-api-key-123')
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tui.send_keys',
        params: {
          session_id: sessionId,
          keys: ['hello', '\r']
        }
      })
      .expect(200);

    assert.strictEqual(keysResponse.body.result.ok, true);

    // Clean up
    await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer test-api-key-123')
      .send({
        jsonrpc: '2.0',
        id: 3,
        method: 'tui.close',
        params: { session_id: sessionId }
      });
  });

  test('should resize session', async () => {
    // Create session
    const createResponse = await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer test-api-key-123')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tui.start',
        params: {
          command: 'sleep',
          args: ['1'],
          rows: 24,
          cols: 80
        }
      })
      .expect(200);

    const sessionId = createResponse.body.result.session_id;

    // Resize session
    const resizeResponse = await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer test-api-key-123')
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tui.resize',
        params: {
          session_id: sessionId,
          rows: 30,
          cols: 120
        }
      })
      .expect(200);

    assert.strictEqual(resizeResponse.body.result.ok, true);

    // Verify resize in frame
    const frameResponse = await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer test-api-key-123')
      .send({
        jsonrpc: '2.0',
        id: 3,
        method: 'tui.read_frame',
        params: { session_id: sessionId }
      })
      .expect(200);

    assert.strictEqual(frameResponse.body.result.rows, 30);
    assert.strictEqual(frameResponse.body.result.cols, 120);

    // Clean up
    await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer test-api-key-123')
      .send({
        jsonrpc: '2.0',
        id: 4,
        method: 'tui.close',
        params: { session_id: sessionId }
      });
  });

  test('should handle invalid session ID', async () => {
    const response = await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer test-api-key-123')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tui.read_frame',
        params: { session_id: 'invalid-session-id' }
      })
      .expect(200);

    assert.strictEqual(response.body.jsonrpc, '2.0');
    assert.ok(response.body.error);
    assert.strictEqual(response.body.error.code, -32603);
    assert(response.body.error.message.includes('Session not found'));
  });
});