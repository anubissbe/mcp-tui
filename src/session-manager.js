import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

/**
 * Session Manager for managing PTY session lifecycles
 * Handles session creation, tracking, cleanup, and resource management
 */
export class SessionManager extends EventEmitter {
  constructor(ptyBackend, options = {}) {
    super();

    this.ptyBackend = ptyBackend;
    this.sessions = new Map();

    this.options = {
      maxSessions: options.maxSessions || 10,
      sessionTimeout: options.sessionTimeout || 30 * 60 * 1000, // 30 minutes
      cleanupInterval: options.cleanupInterval || 5 * 60 * 1000, // 5 minutes
      ...options
    };

    // Set up periodic cleanup
    this.cleanupTimer = setInterval(() => {
      this._cleanupInactiveSessions();
    }, this.options.cleanupInterval);

    // Set up PTY backend event handlers
    this._setupPtyEventHandlers();
  }

  /**
   * Create a new session
   * @param {Object} config - Session configuration
   * @returns {Object} Session object
   */
  async createSession(config) {
    // Check session limits
    if (this.sessions.size >= this.options.maxSessions) {
      throw new Error(`Maximum number of sessions reached (${this.options.maxSessions})`);
    }

    // Generate unique session ID
    const sessionId = `sess_${randomUUID()}`;

    // Validate configuration
    this._validateSessionConfig(config);

    try {
      // Spawn PTY process
      const processWrapper = this.ptyBackend.spawn(config);

      // Create session object
      const session = {
        id: sessionId,
        command: config.command,
        args: config.args || [],
        env: config.env || {},
        cwd: config.cwd || process.cwd(),
        rows: config.rows || 24,
        cols: config.cols || 80,
        limits: config.limits || {},

        // Process information
        pid: processWrapper.pid,
        processWrapper,

        // Session metadata
        createdAt: new Date().toISOString(),
        lastActivity: Date.now(),
        status: 'running',
        exitCode: null,
        signal: null,

        // Sequence tracking for frame management
        lastSequence: 0,

        // Methods
        getOutput: () => this._getSessionOutput(sessionId),
        getLastActivity: () => this._getSessionLastActivity(sessionId)
      };

      // Store session
      this.sessions.set(sessionId, session);

      this.emit('session-created', {
        sessionId,
        pid: processWrapper.pid,
        command: config.command,
        args: config.args
      });

      return session;

    } catch (error) {
      this.emit('session-create-error', {
        sessionId,
        config,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get a session by ID
   * @param {string} sessionId - Session ID
   * @returns {Object} Session object
   */
  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session;
  }

  /**
   * Get all active sessions
   * @returns {Array} Array of session objects
   */
  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  /**
   * Send keys to a session
   * @param {string} sessionId - Session ID
   * @param {Array<string>} keys - Keys to send
   * @param {number} throttleMs - Throttle delay
   */
  async sendKeys(sessionId, keys, throttleMs = 10) {
    const session = this.getSession(sessionId);

    if (session.status !== 'running') {
      throw new Error(`Cannot send keys to session ${sessionId}: status is ${session.status}`);
    }

    try {
      await this.ptyBackend.sendKeys(session.processWrapper, keys, throttleMs);
      this._updateSessionActivity(sessionId);

      this.emit('keys-sent', {
        sessionId,
        keys,
        timestamp: Date.now()
      });

    } catch (error) {
      this.emit('keys-send-error', {
        sessionId,
        keys,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Resize a session
   * @param {string} sessionId - Session ID
   * @param {number} rows - New row count
   * @param {number} cols - New column count
   */
  async resizeSession(sessionId, rows, cols) {
    const session = this.getSession(sessionId);

    if (session.status !== 'running') {
      throw new Error(`Cannot resize session ${sessionId}: status is ${session.status}`);
    }

    try {
      this.ptyBackend.resize(session.processWrapper, rows, cols);

      // Update session metadata
      session.rows = rows;
      session.cols = cols;
      this._updateSessionActivity(sessionId);

      this.emit('session-resized', {
        sessionId,
        rows,
        cols,
        timestamp: Date.now()
      });

    } catch (error) {
      this.emit('session-resize-error', {
        sessionId,
        rows,
        cols,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Close a session
   * @param {string} sessionId - Session ID
   * @param {string} signal - Signal to send for termination
   */
  async closeSession(sessionId, signal = 'SIGTERM') {
    const session = this.getSession(sessionId);

    try {
      // Kill the process if still running
      if (session.status === 'running') {
        this.ptyBackend.kill(session.processWrapper, signal);
      }

      // Clean up session resources
      this._cleanupSession(sessionId);

      this.emit('session-closed', {
        sessionId,
        signal,
        timestamp: Date.now()
      });

    } catch (error) {
      this.emit('session-close-error', {
        sessionId,
        signal,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get session output
   * @param {string} sessionId - Session ID
   * @param {number} sinceSequence - Get output since this sequence number
   * @returns {Object} Output data with sequence information
   */
  getSessionFrame(sessionId, sinceSequence = 0) {
    const session = this.getSession(sessionId);
    const output = session.processWrapper.output || [];

    // Filter output since the requested sequence
    const relevantOutput = output.slice(sinceSequence);

    // Combine output data
    const combinedOutput = relevantOutput
      .map(item => item.data)
      .join('');

    return {
      sessionId,
      sequence: output.length,
      rows: session.rows,
      cols: session.cols,
      text: combinedOutput,
      cursor: { row: 0, col: 0 }, // Placeholder - will be enhanced with ANSI parsing
      timestamp: Date.now()
    };
  }

  /**
   * Clean up all sessions and resources
   */
  async cleanup() {
    // Clear cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Close all active sessions
    const sessionIds = Array.from(this.sessions.keys());

    for (const sessionId of sessionIds) {
      try {
        await this.closeSession(sessionId, 'SIGKILL');
      } catch (error) {
        console.error(`Error closing session ${sessionId}:`, error);
      }
    }

    this.emit('cleanup-complete', {
      closedSessions: sessionIds.length,
      timestamp: Date.now()
    });
  }

  /**
   * Validate session configuration
   * @private
   */
  _validateSessionConfig(config) {
    if (!config.command) {
      throw new Error('Session configuration must include a command');
    }

    if (config.rows && (config.rows < 1 || config.rows > 1000)) {
      throw new Error('Rows must be between 1 and 1000');
    }

    if (config.cols && (config.cols < 1 || config.cols > 1000)) {
      throw new Error('Columns must be between 1 and 1000');
    }
  }

  /**
   * Update session last activity timestamp
   * @private
   */
  _updateSessionActivity(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }
  }

  /**
   * Get session output (internal method)
   * @private
   */
  _getSessionOutput(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.processWrapper.output) {
      return '';
    }

    return session.processWrapper.output
      .map(item => item.data)
      .join('');
  }

  /**
   * Get session last activity (internal method)
   * @private
   */
  _getSessionLastActivity(sessionId) {
    const session = this.sessions.get(sessionId);
    return session ? session.lastActivity : null;
  }

  /**
   * Clean up inactive sessions
   * @private
   */
  _cleanupInactiveSessions() {
    const now = Date.now();
    const sessionsToCleanup = [];

    for (const [sessionId, session] of this.sessions) {
      const inactiveTime = now - session.lastActivity;

      if (inactiveTime > this.options.sessionTimeout) {
        sessionsToCleanup.push(sessionId);
      }
    }

    for (const sessionId of sessionsToCleanup) {
      console.log(`Cleaning up inactive session: ${sessionId}`);
      this.closeSession(sessionId, 'SIGKILL').catch(console.error);
    }

    if (sessionsToCleanup.length > 0) {
      this.emit('inactive-sessions-cleaned', {
        sessionIds: sessionsToCleanup,
        timestamp: now
      });
    }
  }

  /**
   * Clean up a single session
   * @private
   */
  _cleanupSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'closed';
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Set up PTY backend event handlers
   * @private
   */
  _setupPtyEventHandlers() {
    this.ptyBackend.on('process-exit', (event) => {
      // Find session by PID and update status
      for (const [sessionId, session] of this.sessions) {
        if (session.pid === event.pid) {
          session.status = 'exited';
          session.exitCode = event.exitCode;
          session.signal = event.signal;

          this.emit('session-exited', {
            sessionId,
            pid: event.pid,
            exitCode: event.exitCode,
            signal: event.signal,
            runtime: event.runtime
          });

          // Schedule cleanup after a delay to allow output collection
          setTimeout(() => {
            this._cleanupSession(sessionId);
          }, 5000);

          break;
        }
      }
    });

    this.ptyBackend.on('process-data', (event) => {
      // Update last activity for sessions receiving data
      for (const [sessionId, session] of this.sessions) {
        if (session.pid === event.pid) {
          this._updateSessionActivity(sessionId);

          this.emit('session-data', {
            sessionId,
            pid: event.pid,
            data: event.data,
            timestamp: Date.now()
          });

          break;
        }
      }
    });
  }
}