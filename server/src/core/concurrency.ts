/** 简单信号量：限制全局同时执行的角色数 */
export class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];
  private max: number;

  constructor(max: number) {
    this.max = max;
  }

  setMax(max: number): void {
    this.max = Math.max(1, max);
    this.drain();
  }

  get size(): number {
    return this.active;
  }

  async acquire(): Promise<() => void> {
    if (this.active < this.max) {
      this.active++;
      return () => this.release();
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    return () => this.release();
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1);
    this.drain();
  }

  private drain(): void {
    while (this.active < this.max && this.queue.length > 0) {
      const next = this.queue.shift();
      next?.();
    }
  }
}

/** 角色级互斥锁：同一角色同一时刻只允许一条游戏连接 */
export class RoleLock {
  private readonly holders = new Map<string, Promise<void>>();

  isLocked(roleId: string): boolean {
    return this.holders.has(roleId);
  }

  async acquire(roleId: string): Promise<() => void> {
    while (this.holders.has(roleId)) {
      await this.holders.get(roleId);
    }
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.holders.set(roleId, gate);
    return () => {
      if (this.holders.get(roleId) === gate) {
        this.holders.delete(roleId);
      }
      release();
    };
  }
}
