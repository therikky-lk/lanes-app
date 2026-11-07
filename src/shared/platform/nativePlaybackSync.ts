/** Coalesce bridge ticks and discard the historical backlog on foregrounding. */
export class NativePlaybackSync<T extends { sequence?: number }> {
  private visible = true;
  private syncing = false;
  private epoch = 0;
  private sequence = -1;
  private pending: T | null = null;
  private deferred: T | null = null;
  private applying = false;

  constructor(
    private read: () => Promise<T>,
    private apply: (state: T, isCurrent: () => boolean) => Promise<void> | void,
    private onError: (error: unknown) => void,
  ) {}

  public isCurrent(state: T): boolean {
    return this.visible && !this.syncing && (state.sequence == null || state.sequence >= this.sequence);
  }

  public push(state: T): void {
    if (!this.visible) return;
    if (this.syncing) {
      if (!this.deferred || (state.sequence ?? 0) >= (this.deferred.sequence ?? 0)) this.deferred = state;
      return;
    }
    if (state.sequence != null && state.sequence <= this.sequence) return;
    this.sequence = state.sequence ?? this.sequence;
    this.pending = state;
    if (!this.applying) void this.drain();
  }

  private async drain(): Promise<void> {
    this.applying = true;
    try {
      while (this.pending && this.visible && !this.syncing) {
        const state = this.pending;
        const epoch = this.epoch;
        this.pending = null;
        await this.apply(state, () => epoch === this.epoch && this.isCurrent(state));
      }
    } catch (error) {
      this.onError(error);
    } finally {
      this.applying = false;
    }
  }

  public invalidate(): void {
    this.epoch++;
    this.syncing = false;
    this.pending = null;
    this.deferred = null;
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    this.invalidate();
    if (visible) void this.refresh();
  }

  public async refresh(): Promise<void> {
    if (!this.visible) return;
    const epoch = ++this.epoch;
    this.syncing = true;
    this.pending = null;
    this.deferred = null;
    try {
      const snapshot = await this.read();
      if (epoch !== this.epoch || !this.visible) return;
      const latest = this.deferred as T | null;
      this.syncing = false;
      this.deferred = null;
      this.push(latest && (latest.sequence ?? -1) > (snapshot.sequence ?? -1) ? latest : snapshot);
    } catch (error) {
      if (epoch !== this.epoch) return;
      this.syncing = false;
      const latest = this.deferred;
      this.deferred = null;
      if (latest) this.push(latest);
      this.onError(error);
    }
  }
}
