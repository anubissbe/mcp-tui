import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { PtyBackend } from '../src/pty-backend.js';
import { SessionManager } from '../src/session-manager.js';

describe('PTY Backend Tests', () => {
  let ptyBackend;
  let sessionManager;

  before(async () => {
    ptyBackend = new PtyBackend();
    sessionManager = new SessionManager(ptyBackend);
  });

  after(async () => {
    // Clean up any remaining sessions
    await sessionManager.cleanup();
  });

  describe('Session Management', () => {
    test('should create a new session with valid parameters', async () => {
      const sessionConfig = {
        command: 'echo',
        args: ['hello'],
        cwd: process.cwd(),
        env: { TEST: 'value' },
        rows: 24,
        cols: 80
      };

      const session = await sessionManager.createSession(sessionConfig);

      assert.ok(session.id);
      assert.strictEqual(session.command, 'echo');
      assert.deepStrictEqual(session.args, ['hello']);
      assert.strictEqual(session.rows, 24);
      assert.strictEqual(session.cols, 80);
      assert.strictEqual(session.status, 'running');

      // Clean up
      await sessionManager.closeSession(session.id);
    });

    test('should reject invalid command', async () => {
      const sessionConfig = {
        command: '/nonexistent/command/that/does/not/exist',
        args: [],
        rows: 24,
        cols: 80
      };

      await assert.rejects(
        async () => await sessionManager.createSession(sessionConfig),
        (error) => {
          assert(error.message.includes('Failed to spawn') || error.message.includes('ENOENT'));
          return true;
        }
      );
    });

    test('should track multiple sessions independently', async () => {
      const session1 = await sessionManager.createSession({
        command: 'sleep',
        args: ['1'],
        rows: 24,
        cols: 80
      });

      const session2 = await sessionManager.createSession({
        command: 'sleep',
        args: ['1'],
        rows: 30,
        cols: 100
      });

      assert.notStrictEqual(session1.id, session2.id);
      assert.strictEqual(session1.rows, 24);
      assert.strictEqual(session2.rows, 30);

      const sessions = sessionManager.getAllSessions();
      assert.strictEqual(sessions.length, 2);

      // Clean up
      await sessionManager.closeSession(session1.id);
      await sessionManager.closeSession(session2.id);
    });

    test('should handle session termination gracefully', async () => {
      const session = await sessionManager.createSession({
        command: 'sleep',
        args: ['0.1'],
        rows: 24,
        cols: 80
      });

      // Wait for natural termination
      await new Promise(resolve => setTimeout(resolve, 200));

      const updatedSession = sessionManager.getSession(session.id);
      assert.strictEqual(updatedSession.status, 'exited');
      assert.ok(typeof updatedSession.exitCode === 'number');
    });
  });

  describe('PTY Operations', () => {
    test('should spawn PTY process with correct environment', async () => {
      const session = await sessionManager.createSession({
        command: 'env',
        args: [],
        env: { CUSTOM_VAR: 'test_value' },
        rows: 24,
        cols: 80
      });

      // Allow process to run and capture output
      await new Promise(resolve => setTimeout(resolve, 100));

      const output = session.getOutput();
      assert(output.includes('CUSTOM_VAR=test_value'));

      await sessionManager.closeSession(session.id);
    });

    test('should handle key input correctly', async () => {
      const session = await sessionManager.createSession({
        command: 'cat',
        args: [],
        rows: 24,
        cols: 80
      });

      // Send input
      await sessionManager.sendKeys(session.id, ['hello', '\r']);

      // Allow processing time
      await new Promise(resolve => setTimeout(resolve, 100));

      const output = session.getOutput();
      assert(output.includes('hello'));

      await sessionManager.closeSession(session.id);
    });

    test('should handle resize operations', async () => {
      const session = await sessionManager.createSession({
        command: 'tput',
        args: ['cols'],
        rows: 24,
        cols: 80
      });

      // Resize the session
      await sessionManager.resizeSession(session.id, 30, 120);

      const updatedSession = sessionManager.getSession(session.id);
      assert.strictEqual(updatedSession.rows, 30);
      assert.strictEqual(updatedSession.cols, 120);

      await sessionManager.closeSession(session.id);
    });

    test('should enforce resource limits', async () => {
      // Test with ulimits for memory/CPU if configured
      const session = await sessionManager.createSession({
        command: 'sleep',
        args: ['0.1'],
        rows: 24,
        cols: 80,
        limits: {
          memory: '50M',
          cpu: '1'
        }
      });

      assert.ok(session.id);

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 200));

      await sessionManager.closeSession(session.id);
    });
  });

  describe('Error Handling', () => {
    test('should handle session not found errors', async () => {
      const nonExistentId = 'non-existent-session-id';

      assert.throws(() => {
        sessionManager.getSession(nonExistentId);
      }, /Session not found/);

      await assert.rejects(
        async () => await sessionManager.sendKeys(nonExistentId, ['test']),
        /Session not found/
      );
    });

    test('should handle PTY spawn failures gracefully', async () => {
      await assert.rejects(
        async () => await sessionManager.createSession({
          command: '',  // Invalid empty command
          rows: 24,
          cols: 80
        }),
        (error) => {
          assert(error.message.includes('Invalid command') || error.message.includes('command must be'));
          return true;
        }
      );
    });

    test('should clean up resources on session close', async () => {
      const session = await sessionManager.createSession({
        command: 'sleep',
        args: ['1'],
        rows: 24,
        cols: 80
      });

      await sessionManager.closeSession(session.id);

      assert.throws(() => {
        sessionManager.getSession(session.id);
      }, /Session not found/);
    });
  });
});