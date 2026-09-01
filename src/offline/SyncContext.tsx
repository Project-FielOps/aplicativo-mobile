import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { HttpError, OfflineError } from '../api/client';
import { evidence as evidenceApi, inspections as inspectionsApi, nonConformities as ncApi } from '../api/endpoints';
import { queue, type QueueEntry, type QueuedOperation } from './queue';

/**
 * Estado de conectividade e drenagem da fila.
 *
 * Regra de descarte: erro 4xx que não seja 401/408/429 é permanente (a operação
 * é inválida — item já respondido, inspeção já enviada) e sai da fila, senão ela
 * entupiria para sempre. Erro de rede ou 5xx é transitório e permanece.
 */

interface SyncState {
  online: boolean;
  pending: QueueEntry[];
  syncing: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  enqueue: (operation: QueuedOperation) => Promise<void>;
  sync: () => Promise<void>;
  refreshPending: () => Promise<void>;
}

const SyncContext = createContext<SyncState | null>(null);

function isPermanentFailure(error: unknown): boolean {
  if (!(error instanceof HttpError)) return false;
  const { status } = error;
  if (status === 401 || status === 408 || status === 429) return false;
  return status >= 400 && status < 500;
}

async function runOperation(op: QueuedOperation): Promise<void> {
  switch (op.kind) {
    case 'start':
      await inspectionsApi.start(op.inspectionId);
      return;
    case 'answer':
      await inspectionsApi.saveAnswer(op.inspectionId, op.answer);
      return;
    case 'evidence':
      await evidenceApi.upload(op.inspectionId, op.photo, {
        description: op.description,
        latitude: op.latitude,
        longitude: op.longitude,
      });
      return;
    case 'nonConformity':
      await ncApi.create(op.inspectionId, op.body);
      return;
    case 'submit':
      await inspectionsApi.submit(op.inspectionId);
      return;
  }
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState<QueueEntry[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const syncingRef = useRef(false);

  const refreshPending = useCallback(async () => {
    setPending(await queue.list());
  }, []);

  useEffect(() => {
    void refreshPending();
  }, [refreshPending]);

  const sync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setLastError(null);

    try {
      let entries = await queue.list();

      for (const entry of entries) {
        try {
          await runOperation(entry.operation);
          entries = await queue.remove(entry.id);
        } catch (error) {
          if (isPermanentFailure(error)) {
            // Inválida no servidor: guardar não adianta, mas o técnico precisa saber.
            const message = error instanceof HttpError ? error.message : 'Operação recusada.';
            setLastError(message);
            entries = await queue.remove(entry.id);
            continue;
          }

          const message =
            error instanceof OfflineError
              ? 'Sem conexão com o servidor.'
              : error instanceof Error
                ? error.message
                : 'Falha desconhecida.';
          entries = await queue.markFailure(entry.id, message);
          setLastError(message);
          // Erro transitório: parar preserva a ordem das operações seguintes.
          break;
        }
      }

      setPending(entries);
      if (entries.length === 0) setLastSyncAt(new Date().toISOString());
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  // Voltou a rede: drena sozinho, sem o técnico precisar lembrar.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOnline = Boolean(state.isConnected && state.isInternetReachable !== false);
      setOnline((was) => {
        if (!was && isOnline) void sync();
        return isOnline;
      });
    });
    return () => unsubscribe();
  }, [sync]);

  const enqueue = useCallback(
    async (operation: QueuedOperation) => {
      await queue.enqueue(operation);
      await refreshPending();
      if (online) void sync();
    },
    [online, refreshPending, sync],
  );

  const value = useMemo<SyncState>(
    () => ({ online, pending, syncing, lastSyncAt, lastError, enqueue, sync, refreshPending }),
    [online, pending, syncing, lastSyncAt, lastError, enqueue, sync, refreshPending],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncState {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync precisa estar dentro de <SyncProvider>.');
  return ctx;
}
