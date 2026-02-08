import fs from 'fs';
import path from 'path';

const DEBUG_LOG_PATH = path.join(process.cwd(), 'debug.log');

export const appendToDebugLog = (namespace: string, log: string) => {
  try {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(DEBUG_LOG_PATH, `${timestamp} [${namespace}] ${log}\n`);
  } catch (err) {
    // ignore
  }
}

export default class Logger {
  namespace: string;

  constructor(namespace: string) {
    this.namespace = namespace;
  }

  log(obj: any) {
    console.log(`terminal-cli:${this.namespace}: ${obj}`);
  }
  warn(obj: any) {
    console.warn(`terminal-cli:WARN:${this.namespace}: ${obj}`);
  }
  error(obj: Error) {
    console.error(`terminal-cli:ERROR:${this.namespace}: ${obj}`);
  }
}
