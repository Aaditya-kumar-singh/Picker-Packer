// Reachability, not just WiFi: the backend answering /health is ONLINE;
// reachable-but-broken is SERVER_UNREACHABLE; nothing reachable is OFFLINE.
// Transport-agnostic: the app injects an RN AppState watcher, Node harnesses
// drive it manually. This module never imports react-native.
export type ConnectivityState = "CHECKING" | "ONLINE" | "OFFLINE" | "SERVER_UNREACHABLE";

export interface ConnectivityDeps {
  probe: () => Promise<"ONLINE" | "OFFLINE" | "SERVER_UNREACHABLE">;
  pollMs?: number;
  onForeground?: (cb: () => void) => () => void;
}

export function defaultProbe(apiBaseUrl: string, timeoutMs = 5000): () => Promise<ConnectivityState> {
  return async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(`${apiBaseUrl}/health`, { signal: ctrl.signal });
      if (r.ok) return "ONLINE";
      if (r.status >= 500) return "SERVER_UNREACHABLE";
      return "ONLINE"; // reachable server, odd status — still reachable
    } catch {
      return "OFFLINE";
    } finally {
      clearTimeout(t);
    }
  };
}

export class Connectivity {
  private state: ConnectivityState = "OFFLINE";
  private listeners = new Set<(s: ConnectivityState) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopFg: (() => void) | null = null;
  private checking = false;

  // NOTE: no TS parameter properties (Node strip-only mode must load this).
  private readonly deps: ConnectivityDeps;
  constructor(deps: ConnectivityDeps) {
    this.deps = deps;
  }

  get(): ConnectivityState {
    return this.state;
  }

  subscribe(cb: (s: ConnectivityState) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private emit(s: ConnectivityState): void {
    if (s === this.state) return;
    this.state = s;
    for (const cb of this.listeners) cb(s);
  }

  async checkNow(): Promise<ConnectivityState> {
    if (this.checking) return this.state;
    this.checking = true;
    try {
      this.emit(await this.deps.probe());
    } finally {
      this.checking = false;
    }
    return this.state;
  }

  // Test/harness override (e.g. simulated network loss).
  set(s: ConnectivityState): void {
    this.emit(s);
  }

  start(): void {
    void this.checkNow();
    if (this.deps.pollMs) {
      this.timer = setInterval(() => {
        void this.checkNow();
      }, this.deps.pollMs);
    }
    if (this.deps.onForeground) {
      this.stopFg = this.deps.onForeground(() => {
        void this.checkNow();
      });
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stopFg?.();
    this.stopFg = null;
  }
}
