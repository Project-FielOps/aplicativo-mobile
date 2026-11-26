import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../auth/AuthContext';
import { meta } from './database';
import { backoffDelay, MAX_AUTOMATIC_RETRIES, runSync } from './engine';
import { deletePhoto, persistPhoto } from './photos';
import { queue } from './queue';
import { refreshFromServer } from './refresh';
import { session, uuid } from './session';
import { apiTransport } from './transport';
import type { QueueEntry, QueuedOperation } from './types';

/**
 * Estado de conectividade e drenagem da outbox.
 *
 * Nada é descartado sozinho: o que o servidor recusa fica como `conflict`, visível na aba
 * Sincronização, até o técnico tentar de novo ou descartar explicitamente. Falha de rede
 * mantém a fila e reagenda com backoff (1s…16s, até 5 tentativas automáticas); a volta da
 * rede e o botão "Sincronizar agora" sempre disparam uma nova rodada.
 */
interface SyncState {
  online: boolean;
  /** Todas as entradas do técnico (pendentes e em conflito). */
  pending: QueueEntry[];
  conflicts: QueueEntry[];
  syncing: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  enqueue: (operation: QueuedOperation) => Promise<string | null>;
  sync: () => Promise<void>;
  retry: (id: string) => Promise<void>;
  discard: (id: string) => Promise<void>;
  refreshPending: () => Promise<void>;
}

const SyncContext = createContext<SyncState | null>(null);

async function deviceId(): Promise<string> {
  let id = await meta.get('deviceId');
  if (!id) {
    id = uuid();
    await meta.set('deviceId', id);
  }
  return id;
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState<QueueEntry[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const syncingRef = useRef(false);
  const failures = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onlineRef = useRef(true);

  const refreshPending = useCallback(async () => {
    setPending(await queue.list());
  }, []);

  const sync = useCallback(async () => {
    if (syncingRef.current || !session.userId) return;
    syncingRef.current = true;
    setSyncing(true);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    const before = await queue.list().catch(() => [] as QueueEntry[]);
    try {
      const report = await runSync(queue, apiTransport, await deviceId());
      if (report.transientError) {
        failures.current += 1;
        setLastError(report.transientError);
        if (failures.current <= MAX_AUTOMATIC_RETRIES && onlineRef.current) {
          retryTimer.current = setTimeout(() => void sync(), backoffDelay(failures.current));
        }
      } else {
        failures.current = 0;
        setLastError(report.conflicts > 0 ? 'Há operações recusadas pelo servidor. Revise na aba Sincronização.' : null);
        await refreshFromServer().catch(() => undefined);
        setLastSyncAt(new Date().toISOString());
      }
    } catch (error) {
      setLastError(error instanceof Error ? error.message : 'Falha ao sincronizar.');
    } finally {
      // Fotos confirmadas no servidor saem do diretório de documentos.
      const after = await queue.list();
      const remaining = new Set(after.map((e) => e.id));
      for (const entry of before) {
        if (!remaining.has(entry.id) && entry.operation.kind === 'evidence') deletePhoto(entry.operation.photo.uri);
      }
      setPending(after);
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  const syncRef = useRef(sync);
  syncRef.current = sync;

  // Troca de usuário: fila e cache passam a ser os dele.
  useEffect(() => {
    session.set(user?.id ?? null);
    failures.current = 0;
    void refreshPending().then(() => {
      if (user && onlineRef.current) void syncRef.current();
    });
  }, [user, refreshPending]);

  // Voltou a rede: drena sozinho, sem o técnico precisar lembrar.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOnline = Boolean(state.isConnected && state.isInternetReachable !== false);
      const was = onlineRef.current;
      onlineRef.current = isOnline;
      setOnline(isOnline);
      if (!was && isOnline) {
        failures.current = 0;
        void syncRef.current();
      }
    });
    return () => unsubscribe();
  }, []);

  const enqueue = useCallback(
    async (operation: QueuedOperation) => {
      const id = uuid();
      let op = operation;
      if (op.kind === 'evidence') op = { ...op, photo: { ...op.photo, uri: persistPhoto(op.photo.uri, id) } };
      const entry = await queue.enqueue(id, op);
      await refreshPending();
      if (onlineRef.current) void syncRef.current();
      return entry?.id ?? null;
    },
    [refreshPending],
  );

  const retry = useCallback(
    async (id: string) => {
      await queue.retry(id);
      await refreshPending();
      failures.current = 0;
      void syncRef.current();
    },
    [refreshPending],
  );

  const discard = useCallback(
    async (id: string) => {
      const entry = pending.find((e) => e.id === id);
      await queue.remove(id);
      if (entry?.operation.kind === 'evidence') deletePhoto(entry.operation.photo.uri);
      await refreshPending();
    },
    [pending, refreshPending],
  );

  const manualSync = useCallback(async () => {
    failures.current = 0;
    await syncRef.current();
  }, []);

  const conflicts = useMemo(() => pending.filter((e) => e.state === 'conflict'), [pending]);

  const value = useMemo<SyncState>(
    () => ({ online, pending, conflicts, syncing, lastSyncAt, lastError, enqueue, sync: manualSync, retry, discard, refreshPending }),
    [online, pending, conflicts, syncing, lastSyncAt, lastError, enqueue, manualSync, retry, discard, refreshPending],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncState {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync precisa estar dentro de <SyncProvider>.');
  return ctx;
}
