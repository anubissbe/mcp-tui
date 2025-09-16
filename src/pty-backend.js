import pty from 'node-pty';
import { EventEmitter } from 'events';
import path from 'path';
import os from 'os';

/**
 * PTY Backend for spawning and managing pseudo-terminal processes
 * Supports local execution with resource limits and monitoring
 */
export class PtyBackend extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      shell: options.shell || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/bash'),
      encoding: options.encoding || 'utf8',
      useConpty: os.platform() === 'win32' && (options.useConpty ?? true),
      experimentalUseConpty: os.platform() === 'win32',
      ...options
    };
  }

  /**
   * Spawn a new PTY process
   * @param {Object} config - Configuration for the PTY process
   * @param {string} config.command - Command to execute
   * @param {Array} config.args - Command arguments
   * @param {Object} config.env - Environment variables
   * @param {string} config.cwd - Working directory
   * @param {number} config.rows - Terminal rows
   * @param {number} config.cols - Terminal columns
   * @param {Object} config.limits - Resource limits
   * @returns {Object} PTY process instance with metadata
   */
  spawn(config) {
    const {
      command,
      args = [],
      env = {},
      cwd = process.cwd(),
      rows = 24,
      cols = 80,
      limits = {}
    } = config;

    // Validate command
    if (!command || typeof command !== 'string' || command.trim() === '') {
      throw new Error('Invalid command: command must be a non-empty string');
    }

    // Merge environment variables
    const processEnv = {
      ...process.env,
      ...env,
      TERM: env.TERM || 'xterm-256color'
    };

    // Validate working directory
    let resolvedCwd;
    try {
      resolvedCwd = path.resolve(cwd);
    } catch (error) {
      throw new Error(`Invalid working directory: ${error.message}`);
    }

    try {
      // Spawn PTY process
      const ptyProcess = pty.spawn(command, args, {
        name: 'xterm-color',
        cols,
        rows,
        cwd: resolvedCwd,
        env: processEnv,
        encoding: this.options.encoding,
        useConpty: this.options.useConpty,
        experimentalUseConpty: this.options.experimentalUseConpty
      });

      // Create process wrapper with metadata
      const processWrapper = {
        pid: ptyProcess.pid,
        ptyProcess,
        command,
        args,
        env: processEnv,
        cwd: resolvedCwd,
        rows,
        cols,
        limits,
        output: [],
        startTime: Date.now(),
        status: 'running',
        exitCode: null,
        signal: null
      };

      // Set up event handlers
      this._setupProcessHandlers(ptyProcess, processWrapper);

      // Apply resource limits if specified
      if (Object.keys(limits).length > 0) {
        this._applyResourceLimits(ptyProcess.pid, limits);
      }

      this.emit('process-spawned', {
        pid: ptyProcess.pid,
        command,
        args
      });

      return processWrapper;

    } catch (error) {
      const errorMsg = `Failed to spawn process '${command}': ${error.message}`;
      this.emit('spawn-error', { command, args, error: errorMsg });
      throw new Error(errorMsg);
    }
  }

  /**
   * Send input to a PTY process
   * @param {Object} processWrapper - Process wrapper from spawn()
   * @param {Array<string>} keys - Array of keys to send
   * @param {number} throttleMs - Throttle delay between keys
   */
  async sendKeys(processWrapper, keys, throttleMs = 10) {
    if (!processWrapper || !processWrapper.ptyProcess) {
      throw new Error('Invalid process wrapper');
    }

    if (processWrapper.status !== 'running') {
      throw new Error('Cannot send keys to non-running process');
    }

    for (const key of keys) {
      try {
        // Convert special key names to appropriate sequences
        const keySequence = this._convertKeyToSequence(key);
        processWrapper.ptyProcess.write(keySequence);

        // Throttle key sending to prevent overwhelming the process
        if (throttleMs > 0 && keys.indexOf(key) < keys.length - 1) {
          await new Promise(resolve => setTimeout(resolve, throttleMs));
        }
      } catch (error) {
        this.emit('key-send-error', {
          pid: processWrapper.pid,
          key,
          error: error.message
        });
        throw error;
      }
    }
  }

  /**
   * Resize a PTY process
   * @param {Object} processWrapper - Process wrapper from spawn()
   * @param {number} rows - New row count
   * @param {number} cols - New column count
   */
  resize(processWrapper, rows, cols) {
    if (!processWrapper || !processWrapper.ptyProcess) {
      throw new Error('Invalid process wrapper');
    }

    if (processWrapper.status !== 'running') {
      throw new Error('Cannot resize non-running process');
    }

    try {
      processWrapper.ptyProcess.resize(cols, rows);
      processWrapper.rows = rows;
      processWrapper.cols = cols;

      this.emit('process-resized', {
        pid: processWrapper.pid,
        rows,
        cols
      });
    } catch (error) {
      this.emit('resize-error', {
        pid: processWrapper.pid,
        rows,
        cols,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Terminate a PTY process
   * @param {Object} processWrapper - Process wrapper from spawn()
   * @param {string} signal - Signal to send (default: SIGTERM)
   */
  kill(processWrapper, signal = 'SIGTERM') {
    if (!processWrapper || !processWrapper.ptyProcess) {
      throw new Error('Invalid process wrapper');
    }

    try {
      if (processWrapper.status === 'running') {
        processWrapper.ptyProcess.kill(signal);
        this.emit('process-killed', {
          pid: processWrapper.pid,
          signal
        });
      }
    } catch (error) {
      this.emit('kill-error', {
        pid: processWrapper.pid,
        signal,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Set up event handlers for a PTY process
   * @private
   */
  _setupProcessHandlers(ptyProcess, processWrapper) {
    // Handle output data
    ptyProcess.onData((data) => {
      processWrapper.output.push({
        timestamp: Date.now(),
        data: data.toString()
      });

      this.emit('process-data', {
        pid: ptyProcess.pid,
        data: data.toString()
      });
    });

    // Handle process exit
    ptyProcess.onExit((exitCode, signal) => {
      processWrapper.status = 'exited';
      processWrapper.exitCode = exitCode;
      processWrapper.signal = signal;
      processWrapper.endTime = Date.now();

      this.emit('process-exit', {
        pid: ptyProcess.pid,
        exitCode,
        signal,
        runtime: processWrapper.endTime - processWrapper.startTime
      });
    });
  }

  /**
   * Convert key names to terminal sequences
   * @private
   */
  _convertKeyToSequence(key) {
    // Handle special keys
    const specialKeys = {
      'ENTER': '\r',
      'TAB': '\t',
      'BACKSPACE': '\b',
      'DELETE': '\x7f',
      'ESCAPE': '\x1b',
      'UP': '\x1b[A',
      'DOWN': '\x1b[B',
      'RIGHT': '\x1b[C',
      'LEFT': '\x1b[D',
      'HOME': '\x1b[H',
      'END': '\x1b[F',
      'PAGEUP': '\x1b[5~',
      'PAGEDOWN': '\x1b[6~',
      'F1': '\x1b[OP',
      'F2': '\x1b[OQ',
      'F3': '\x1b[OR',
      'F4': '\x1b[OS',
      'F5': '\x1b[15~',
      'F6': '\x1b[17~',
      'F7': '\x1b[18~',
      'F8': '\x1b[19~',
      'F9': '\x1b[20~',
      'F10': '\x1b[21~',
      'F11': '\x1b[23~',
      'F12': '\x1b[24~'
    };

    // Handle Ctrl combinations
    if (key.startsWith('CTRL+')) {
      const ctrlKey = key.substring(5).toLowerCase();
      if (ctrlKey.length === 1 && ctrlKey >= 'a' && ctrlKey <= 'z') {
        return String.fromCharCode(ctrlKey.charCodeAt(0) - 'a'.charCodeAt(0) + 1);
      }
    }

    return specialKeys[key.toUpperCase()] || key;
  }

  /**
   * Apply resource limits to a process (Linux only)
   * @private
   */
  _applyResourceLimits(pid, limits) {
    if (os.platform() !== 'linux') {
      console.warn('Resource limits are only supported on Linux');
      return;
    }

    // This is a placeholder for resource limit implementation
    // In production, you would use cgroups or ulimits
    console.log(`Applying resource limits to PID ${pid}:`, limits);
  }
}