export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class Throttle {
  private nextSlot = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly intervalMs: number) {}

  wait(): Promise<void> {
    const turn = this.queue.then(async () => {
      const delay = this.nextSlot - Date.now();
      if (delay > 0) await sleep(delay);
      this.nextSlot = Date.now() + this.intervalMs;
    });
    this.queue = turn;
    return turn;
  }
}
