import { delay } from "@railgun-community/shared-models";

export const printLn = (singleLineDisplay: string) => {
  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);
  process.stdout.write(singleLineDisplay);
};
export class ProgressBar {
  currentText;
  currentCount = 0;
  running = false;
  countdownSeconds: number;
  startTimeMs: number;
  constructor(initialText: string, countdownSeconds = 0) {
    this.countdownSeconds = countdownSeconds;
    this.startTimeMs = Date.now();
    this.currentText = initialText;
    console.log(initialText);
  }

  complete = () => {
    this.running = false;
    this.currentCount = 0;
    console.log("");
  };

  runProgress = async (runLoop = true) => {
    if (!this.running) {
      return;
    }
    const bufferCount = (this.currentCount % 3) + 1;
    const bufferEnd = "".padEnd(bufferCount, ".");
    let newDisplay = this.currentText;
    if (this.countdownSeconds > 0) {
      const elapsed = (Date.now() - this.startTimeMs) / 1000;
      const remaining = Math.max(0, this.countdownSeconds - elapsed);
      newDisplay += ` (${Math.ceil(remaining)}s)`;
    }
    newDisplay += bufferEnd;
    printLn(newDisplay);
    if (runLoop) {
      this.currentCount++;
      await delay(1000);
      this.runProgress();
    }
  };

  updateProgress = (message: string, progress: number): void => {
    this.currentText = `${message}  |  [${progress.toFixed(2)}%]`;
    if (!this.running) {
      this.running = true;
      this.runProgress();
    } else {
      this.runProgress(false);
    }
  };
}
