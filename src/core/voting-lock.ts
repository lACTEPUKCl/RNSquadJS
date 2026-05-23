export class VotingLock {
  private holder: string | null = null;

  tryAcquire(owner: string): boolean {
    if (this.holder !== null) return false;
    this.holder = owner;
    return true;
  }

  release(owner?: string): void {
    if (owner === undefined || this.holder === owner) {
      this.holder = null;
    }
  }

  get isActive(): boolean {
    return this.holder !== null;
  }

  get owner(): string | null {
    return this.holder;
  }
}
