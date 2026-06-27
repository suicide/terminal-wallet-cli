import { stopEngine } from "../engine/engine";
import { rimrafSync } from "rimraf";
import path from "path";
import configDefaults from "../config/config-defaults";
import { stopWakuClient } from "../waku/connect-waku";
import { appendToDebugLog } from "../util/logger";
import fs from "fs";

export const RAILGUN_HEADER = `
 ███████████ ██████████ ███████████   ██████   ██████ █████ ██████   █████   █████████   █████      
░█░░░███░░░█░░███░░░░░█░░███░░░░░███ ░░██████ ██████ ░░███ ░░██████ ░░███   ███░░░░░███ ░░███       
░   ░███  ░  ░███  █ ░  ░███    ░███  ░███░█████░███  ░███  ░███░███ ░███  ░███    ░███  ░███       
    ░███     ░██████    ░██████████   ░███░░███ ░███  ░███  ░███░░███░███  ░███████████  ░███       
    ░███     ░███░░█    ░███░░░░░███  ░███ ░░░  ░███  ░███  ░███ ░░██████  ░███░░░░░███  ░███       
    ░███     ░███ ░   █ ░███    ░███  ░███      ░███  ░███  ░███  ░░█████  ░███    ░███  ░███      █
    █████    ██████████ █████   █████ █████     █████ █████ █████  ░░█████ █████   █████ ███████████
   ░░░░░    ░░░░░░░░░░ ░░░░░   ░░░░░ ░░░░░     ░░░░░ ░░░░░ ░░░░░    ░░░░░ ░░░░░   ░░░░░ ░░░░░░░░░░░ 
`;

export const clearConsoleBuffer = async () => {
  process.stdout.write("\u{033}[2J\u001b[H\u001b[2J\u001b[3J");
};

const killEngineAndWaku = async () => {
  await stopWakuClient();
  await stopEngine();
};

export const processDestroyExit = async () => {
  console.log("Deleting Database And Keychains");
  await killEngineAndWaku();

  const { databasePath, artifactPath, keyChainPath } = configDefaults.engine;

  const fullDBPath = path.join(process.cwd(), databasePath);
  const fullArtifactPath = path.join(process.cwd(), artifactPath);
  const fullKeyChainPath = path.join(process.cwd(), keyChainPath);

  rimrafSync(fullDBPath);
  rimrafSync(fullArtifactPath);
  rimrafSync(fullKeyChainPath);

  clearConsoleBuffer();
  console.log("Goodbye. :(");
};

export const processSafeExit = async () => {
  await killEngineAndWaku();
  process.exit(0);
};

process.on("SIGINT", async () => {
  console.clear();
  await processSafeExit();
});

let unhandledRejectionCount = 0;

process.on("unhandledRejection", (err: Error | string) => {
  const stack = err instanceof Error ? err.stack : undefined;
  const message = typeof err === "string" ? err : (err as Error).message ?? String(err);
  if (message.indexOf("could not coalesce") !== -1) {
    appendToDebugLog("unhandledRejection:coalesce", message);
    return;
  }
  unhandledRejectionCount++;
  const fullError = stack ?? message;
  process.stderr.write(`\n\x1b[31m[Unhandled Rejection #${unhandledRejectionCount}]\x1b[0m ${fullError}\n`);
  appendToDebugLog("unhandledRejection", `${message}\n${stack ?? ""}`);
});

process.on("uncaughtException", (err: Error | string) => {
  const stack = err instanceof Error ? err.stack : undefined;
  const message = typeof err === "string" ? err : (err as Error).message ?? String(err);
  if (message.indexOf("already held by process") !== -1) {
    appendToDebugLog("uncaughtException:alreadyHeld", message);
    return;
  }
  const fullError = stack ?? message;
  process.stderr.write(`\n\x1b[31m[Uncaught Exception]\x1b[0m ${fullError}\n`);
  appendToDebugLog("uncaughtException", `${message}\n${stack ?? ""}`);
  process.exit(1);
});

let receivedCrashSignal = false;

process.on("SIGABRT", () => {
  receivedCrashSignal = true;
  const msg = `[FATAL] SIGABRT received — likely V8 out-of-memory (abort)\n`;
  process.stderr.write(`\n\x1b[31m${msg}\x1b[0m`);
  appendToDebugLog("SIGABRT", msg.trim());
  process.report?.writeReport?.();
  process.exit(134);
});

process.on("SIGSEGV", () => {
  receivedCrashSignal = true;
  const msg = `[FATAL] SIGSEGV received — native segmentation fault\n`;
  process.stderr.write(`\n\x1b[31m${msg}\x1b[0m`);
  appendToDebugLog("SIGSEGV", msg.trim());
  process.report?.writeReport?.();
  process.exit(139);
});

process.on("SIGTERM", async () => {
  const msg = `SIGTERM received — shutting down\n`;
  process.stderr.write(`\n\x1b[33m${msg}\x1b[0m`);
  appendToDebugLog("SIGTERM", msg.trim());
  await processSafeExit();
});

process.on("exit", (code) => {
  if (code !== 0 && !receivedCrashSignal) {
    fs.writeSync(
      process.stderr.fd,
      `\n\x1b[31m[FATAL] Process exited with code ${code}\x1b[0m\n`,
    );
    appendToDebugLog("exit", `Process exited with code ${code}`);
  }
});

appendToDebugLog("STARTUP", "Signal handlers registered (SIGABRT, SIGSEGV, SIGTERM, exit)");

export const setConsoleTitle = (
  titleMessage = "🛡️ TERMINAL WALLET - CLI for 0x and 0zk addresses",
) => {
  if (process.platform == "win32") {
    process.title = titleMessage;
  } else {
    process.stdout.write("\x1b]2;" + titleMessage + "\x1b\x5c");
  }
};

export const printLogo = () => {
  console.log(RAILGUN_HEADER);
};

export const resizeWindow = (width: number, heigth: number) => {
  process.stdout.write(`\u{033}[8;${heigth};${width}t`);
};
