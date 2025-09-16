import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

/**
 * Process utilities for enhanced process management and cleanup
 */
export class ProcessUtils {
  /**
   * Validate if a command exists and is executable
   * @param {string} command - Command to validate
   * @returns {Promise<boolean>} True if command exists and is executable
   */
  static async validateCommand(command) {
    if (!command || typeof command !== 'string') {
      return false;
    }

    return new Promise((resolve) => {
      const whichCommand = os.platform() === 'win32' ? 'where' : 'which';

      const proc = spawn(whichCommand, [command], {
        stdio: 'pipe',
        windowsHide: true
      });

      let found = false;

      proc.on('exit', (code) => {
        resolve(found || code === 0);
      });

      proc.on('error', () => {
        resolve(false);
      });

      proc.stdout.on('data', () => {
        found = true;
      });

      // Timeout after 2 seconds
      setTimeout(() => {
        proc.kill();
        resolve(false);
      }, 2000);
    });
  }

  /**
   * Get process information by PID
   * @param {number} pid - Process ID
   * @returns {Promise<Object|null>} Process information or null if not found
   */
  static async getProcessInfo(pid) {
    try {
      if (os.platform() === 'win32') {
        return await this._getProcessInfoWindows(pid);
      } else {
        return await this._getProcessInfoUnix(pid);
      }
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if a process is still running
   * @param {number} pid - Process ID
   * @returns {Promise<boolean>} True if process is running
   */
  static async isProcessRunning(pid) {
    try {
      // On Unix-like systems, sending signal 0 checks if process exists
      if (os.platform() !== 'win32') {
        process.kill(pid, 0);
        return true;
      }

      // On Windows, use tasklist
      const info = await this.getProcessInfo(pid);
      return info !== null;

    } catch (error) {
      // ESRCH means process doesn't exist
      return error.code !== 'ESRCH';
    }
  }

  /**
   * Kill a process tree (process and all its children)
   * @param {number} pid - Root process ID
   * @param {string} signal - Signal to send (default: SIGTERM)
   * @returns {Promise<void>}
   */
  static async killProcessTree(pid, signal = 'SIGTERM') {
    if (os.platform() === 'win32') {
      return this._killProcessTreeWindows(pid);
    } else {
      return this._killProcessTreeUnix(pid, signal);
    }
  }

  /**
   * Get child processes of a given PID
   * @param {number} parentPid - Parent process ID
   * @returns {Promise<Array<number>>} Array of child PIDs
   */
  static async getChildProcesses(parentPid) {
    try {
      if (os.platform() === 'win32') {
        return await this._getChildProcessesWindows(parentPid);
      } else {
        return await this._getChildProcessesUnix(parentPid);
      }
    } catch (error) {
      console.error('Error getting child processes:', error);
      return [];
    }
  }

  /**
   * Set up process cleanup on application exit
   * @param {Array<number>} pids - PIDs to clean up
   */
  static setupCleanupHandlers(pids = []) {
    const cleanup = async (signal) => {
      console.log(`Received ${signal}, cleaning up processes...`);

      for (const pid of pids) {
        try {
          await this.killProcessTree(pid, 'SIGKILL');
        } catch (error) {
          console.error(`Error killing process ${pid}:`, error);
        }
      }

      process.exit(0);
    };

    // Handle various exit signals
    process.on('SIGINT', () => cleanup('SIGINT'));
    process.on('SIGTERM', () => cleanup('SIGTERM'));
    process.on('SIGUSR2', () => cleanup('SIGUSR2')); // nodemon restart

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      cleanup('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled rejection:', reason);
      cleanup('unhandledRejection');
    });
  }

  /**
   * Create a secure environment for process execution
   * @param {Object} customEnv - Custom environment variables
   * @returns {Object} Secure environment object
   */
  static createSecureEnvironment(customEnv = {}) {
    // Base secure environment
    const secureEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME || os.homedir(),
      USER: process.env.USER || os.userInfo().username,
      TERM: 'xterm-256color',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8'
    };

    // Platform-specific additions
    if (os.platform() === 'win32') {
      secureEnv.USERPROFILE = process.env.USERPROFILE;
      secureEnv.APPDATA = process.env.APPDATA;
      secureEnv.LOCALAPPDATA = process.env.LOCALAPPDATA;
    } else {
      secureEnv.SHELL = process.env.SHELL || '/bin/bash';
    }

    // Merge with custom environment (custom takes precedence)
    return { ...secureEnv, ...customEnv };
  }

  // Private platform-specific methods

  /**
   * Get process info on Unix-like systems
   * @private
   */
  static async _getProcessInfoUnix(pid) {
    try {
      const statPath = `/proc/${pid}/stat`;
      const cmdlinePath = `/proc/${pid}/cmdline`;

      const [statData, cmdlineData] = await Promise.all([
        fs.readFile(statPath, 'utf8').catch(() => null),
        fs.readFile(cmdlinePath, 'utf8').catch(() => null)
      ]);

      if (!statData) return null;

      const statFields = statData.split(' ');

      return {
        pid: parseInt(statFields[0]),
        command: cmdlineData ? cmdlineData.split('\0')[0] : statFields[1],
        state: statFields[2],
        ppid: parseInt(statFields[3]),
        startTime: parseInt(statFields[21])
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get process info on Windows
   * @private
   */
  static async _getProcessInfoWindows(pid) {
    return new Promise((resolve) => {
      const proc = spawn('tasklist', ['/fi', `PID eq ${pid}`, '/fo', 'csv'], {
        stdio: 'pipe',
        windowsHide: true
      });

      let output = '';
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('exit', (code) => {
        if (code !== 0) {
          resolve(null);
          return;
        }

        const lines = output.split('\n');
        if (lines.length < 2) {
          resolve(null);
          return;
        }

        // Parse CSV output
        const fields = lines[1].split(',').map(field => field.replace(/"/g, ''));

        resolve({
          pid: parseInt(fields[1]),
          command: fields[0],
          sessionName: fields[2],
          memUsage: fields[4]
        });
      });

      proc.on('error', () => resolve(null));
    });
  }

  /**
   * Kill process tree on Unix-like systems
   * @private
   */
  static async _killProcessTreeUnix(pid, signal) {
    try {
      // Get all child processes
      const children = await this._getChildProcessesUnix(pid);

      // Kill children first
      for (const childPid of children) {
        try {
          process.kill(childPid, signal);
        } catch (error) {
          // Ignore ESRCH (process not found)
          if (error.code !== 'ESRCH') {
            console.error(`Error killing child process ${childPid}:`, error);
          }
        }
      }

      // Kill parent process
      process.kill(pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') {
        throw error;
      }
    }
  }

  /**
   * Kill process tree on Windows
   * @private
   */
  static async _killProcessTreeWindows(pid) {
    return new Promise((resolve, reject) => {
      const proc = spawn('taskkill', ['/F', '/T', '/PID', pid.toString()], {
        stdio: 'pipe',
        windowsHide: true
      });

      proc.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to kill process tree for PID ${pid}`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Get child processes on Unix-like systems
   * @private
   */
  static async _getChildProcessesUnix(parentPid) {
    return new Promise((resolve, reject) => {
      const proc = spawn('pgrep', ['-P', parentPid.toString()], {
        stdio: 'pipe'
      });

      let output = '';
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('exit', (code) => {
        if (code === 0) {
          const pids = output.trim().split('\n')
            .filter(line => line.trim())
            .map(line => parseInt(line.trim()))
            .filter(pid => !isNaN(pid));

          resolve(pids);
        } else {
          resolve([]); // No children found
        }
      });

      proc.on('error', () => resolve([]));
    });
  }

  /**
   * Get child processes on Windows
   * @private
   */
  static async _getChildProcessesWindows(parentPid) {
    return new Promise((resolve) => {
      const proc = spawn('wmic', [
        'process',
        'where',
        `ParentProcessId=${parentPid}`,
        'get',
        'ProcessId',
        '/format:csv'
      ], {
        stdio: 'pipe',
        windowsHide: true
      });

      let output = '';
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('exit', () => {
        const lines = output.split('\n');
        const pids = [];

        for (const line of lines) {
          const fields = line.split(',');
          if (fields.length >= 2 && fields[1] && fields[1] !== 'ProcessId') {
            const pid = parseInt(fields[1].trim());
            if (!isNaN(pid)) {
              pids.push(pid);
            }
          }
        }

        resolve(pids);
      });

      proc.on('error', () => resolve([]));
    });
  }
}