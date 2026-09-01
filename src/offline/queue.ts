import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AnswerUpsertRequest, CreateNonConformityRequest } from '../api/types';

/**
 * Fila de mutações pendentes.
 *
 * Inspeção de campo acontece em subsolo, casa de máquinas e área rural — assumir
 * conectividade seria assumir errado. Toda escrita é enfileirada primeiro e
 * drenada quando houver rede, na ordem em que foi criada: a ordem importa porque
 * `submit` só pode chegar ao servidor depois das respostas que ele valida.
 */

const STORAGE_KEY = 'fieldops.syncQueue.v1';

export type QueuedOperation =
  | { kind: 'start'; inspectionId: string }
  | { kind: 'answer'; inspectionId: string; answer: AnswerUpsertRequest }
  | {
      kind: 'evidence';
      inspectionId: string;
      photo: { uri: string; name: string; mimeType: string };
      description?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    }
  | { kind: 'nonConformity'; inspectionId: string; body: CreateNonConformityRequest }
  | { kind: 'submit'; inspectionId: string };

export interface QueueEntry {
  id: string;
  operation: QueuedOperation;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

/** Rótulo curto para a tela de sincronização. */
export function describeOperation(op: QueuedOperation): string {
  switch (op.kind) {
    case 'start':
      return 'Início de inspeção';
    case 'answer':
      return 'Resposta do checklist';
    case 'evidence':
      return 'Evidência fotográfica';
    case 'nonConformity':
      return 'Não conformidade';
    case 'submit':
      return 'Envio da inspeção';
  }
}

export function operationIcon(op: QueuedOperation): string {
  switch (op.kind) {
    case 'start':
      return 'play-circle-outline';
    case 'answer':
      return 'checkbox-outline';
    case 'evidence':
      return 'camera-outline';
    case 'nonConformity':
      return 'warning-outline';
    case 'submit':
      return 'cloud-upload-outline';
  }
}

async function readAll(): Promise<QueueEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueueEntry[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(entries: QueueEntry[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export const queue = {
  list: readAll,

  async enqueue(operation: QueuedOperation): Promise<QueueEntry> {
    const entries = await readAll();
    const entry: QueueEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      operation,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };

    // Uma resposta substitui a anterior do mesmo item: só o último valor
    // digitado interessa, e sem isso a fila cresceria a cada tecla.
    const deduped =
      operation.kind === 'answer'
        ? entries.filter(
            (e) =>
              !(
                e.operation.kind === 'answer' &&
                e.operation.inspectionId === operation.inspectionId &&
                e.operation.answer.inspectionItemId === operation.answer.inspectionItemId
              ),
          )
        : entries;

    await writeAll([...deduped, entry]);
    return entry;
  },

  async remove(id: string): Promise<QueueEntry[]> {
    const entries = await readAll();
    const next = entries.filter((e) => e.id !== id);
    await writeAll(next);
    return next;
  },

  async markFailure(id: string, error: string): Promise<QueueEntry[]> {
    const entries = await readAll();
    const next = entries.map((e) =>
      e.id === id ? { ...e, attempts: e.attempts + 1, lastError: error } : e,
    );
    await writeAll(next);
    return next;
  },

  async clear(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEY);
  },
};
