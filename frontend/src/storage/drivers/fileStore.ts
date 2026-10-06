// JSON-file RowStore for Node harnesses (durability across "restarts" via
// atomic write+rename). NEVER imported by app code — Metro must not bundle
// node:fs. Same method semantics as the expo-sqlite driver.
import { promises as fs } from "node:fs";
import path from "node:path";
import type { OutboxInsert, OutboxRecord, OutboxStatus, RowStore } from "../store";

interface FileShape {
  seq: number;
  outbox: OutboxRecord[];
  cache: Record<string, string>;
  meta: Record<string, string>;
}

const blank = (): FileShape => ({ seq: 0, outbox: [], cache: {}, meta: {} });

export async function openFileStore(filePath: string): Promise<RowStore> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  async function load(): Promise<FileShape> {
    try {
      return JSON.parse(await fs.readFile(filePath, "utf8")) as FileShape;
    } catch {
      return blank();
    }
  }
  // Serialize all mutations through a promise chain (single-writer).
  let gate: Promise<unknown> = Promise.resolve();
  function mutate<T>(fn: (s: FileShape) => T): Promise<T> {
    const run = gate.then(async () => {
      const state = await load();
      const out = fn(state);
      const tmp = `${filePath}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(state));
      await fs.rename(tmp, filePath);
      return out;
    });
    gate = run.catch(() => undefined);
    return run as Promise<T>;
  }
  const byTime = (a: OutboxRecord, b: OutboxRecord) =>
    a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : a.id - b.id;

  return {
    insertOutbox: (row: OutboxInsert) =>
      mutate((s) => {
        if (s.outbox.some((r) => r.clientEventId === row.clientEventId)) {
          throw Object.assign(new Error("UNIQUE client_event_id"), { code: "UNIQUE" });
        }
        s.seq += 1;
        s.outbox.push({ ...row, id: s.seq, status: "PENDING", attemptCount: 0, lastAttemptAt: null, lastError: null, syncedAt: null });
        return s.seq;
      }),
    listByStatuses: async (statuses: OutboxStatus[]) => {
      const s = await load();
      return s.outbox.filter((r) => statuses.includes(r.status)).sort(byTime);
    },
    getByClientEventId: async (clientEventId: string) => {
      const s = await load();
      return s.outbox.find((r) => r.clientEventId === clientEventId) ?? null;
    },
    updateOutbox: (id: number, patch: Partial<OutboxRecord>) =>
      mutate((s) => {
        const rec = s.outbox.find((r) => r.id === id);
        if (rec) Object.assign(rec, patch);
      }).then(() => undefined),
    countByStatus: async (status: OutboxStatus) => {
      const s = await load();
      return s.outbox.filter((r) => r.status === status).length;
    },
    listFailed: async () => {
      const s = await load();
      return s.outbox.filter((r) => r.status === "FAILED").sort(byTime);
    },
    getCache: async (key: string) => (await load()).cache[key] ?? null,
    setCache: (key: string, json: string) =>
      mutate((s) => {
        s.cache[key] = json;
      }).then(() => undefined),
    getMeta: async (key: string) => (await load()).meta[key] ?? null,
    setMeta: (key: string, value: string) =>
      mutate((s) => {
        s.meta[key] = value;
      }).then(() => undefined),
    clearAll: () => mutate(() => blank()).then(() => undefined),
    close: async () => undefined,
  };
}
