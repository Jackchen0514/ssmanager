import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

const LOG_BUFFER_SIZE = 500;
const CRASH_RESTART_DELAY_MS = 2000;

class ProcessSupervisor extends EventEmitter {
  constructor() {
    super();
    this.child = null;
    this.logs = [];
    this.startedAt = null;
    this.stoppedManually = false;
    this.restartTimer = null;
  }

  _log(line) {
    const entry = `[${new Date().toISOString()}] ${line}`;
    this.logs.push(entry);
    if (this.logs.length > LOG_BUFFER_SIZE) this.logs.shift();
    this.emit('log', entry);
  }

  status() {
    return {
      running: this.child !== null,
      pid: this.child?.pid ?? null,
      startedAt: this.startedAt,
    };
  }

  getLogs(tail = 200) {
    return this.logs.slice(-tail);
  }

  start(binaryPath, args) {
    if (this.child) {
      throw new Error('ssmanager process is already running');
    }
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    this.stoppedManually = false;
    this._log(`starting: ${binaryPath} ${args.join(' ')}`);

    const child = spawn(binaryPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.child = child;
    this.startedAt = new Date().toISOString();

    child.stdout.on('data', (buf) => this._log(buf.toString('utf8').trimEnd()));
    child.stderr.on('data', (buf) => this._log(buf.toString('utf8').trimEnd()));

    child.on('error', (err) => {
      this._log(`process error: ${err.message}`);
    });

    child.on('exit', (code, signal) => {
      this._log(`process exited (code=${code}, signal=${signal})`);
      this.child = null;
      this.startedAt = null;

      if (!this.stoppedManually) {
        this._log(`unexpected exit, restarting in ${CRASH_RESTART_DELAY_MS}ms`);
        this.restartTimer = setTimeout(() => {
          try {
            this.start(binaryPath, args);
          } catch (err) {
            this._log(`auto-restart failed: ${err.message}`);
          }
        }, CRASH_RESTART_DELAY_MS);
      }
    });

    return this.status();
  }

  stop() {
    if (!this.child) {
      throw new Error('ssmanager process is not running');
    }
    this.stoppedManually = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this._log('stopping process');
    this.child.kill('SIGTERM');
  }

  restart(binaryPath, args) {
    if (this.child) {
      this.stoppedManually = true;
      this.child.once('exit', () => this.start(binaryPath, args));
      this.child.kill('SIGTERM');
    } else {
      this.start(binaryPath, args);
    }
  }
}

export const processSupervisor = new ProcessSupervisor();
