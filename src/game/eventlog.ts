/** Milestone 2: player action phrases. Stub for M1. */
export class EventLog {
  private items: string[] = [];

  push(phrase: string): void {
    if (this.items[this.items.length - 1] === phrase) return;
    this.items.push(phrase);
    if (this.items.length > 5) this.items.shift();
  }

  list(): string[] {
    return [...this.items];
  }

  clear(): void {
    this.items = [];
  }
}
