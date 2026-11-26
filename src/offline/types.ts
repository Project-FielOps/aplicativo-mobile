import type { AnswerUpsertRequest, CreateNonConformityRequest } from '../api/types';

/**
 * Tudo o que o técnico faz em campo vira uma operação da outbox. A operação é gravada no
 * SQLite antes de qualquer tentativa de rede e só sai de lá quando o servidor confirma.
 */
export type QueuedOperation =
  | { kind: 'start'; inspectionId: string }
  | { kind: 'reopen'; inspectionId: string }
  | { kind: 'answer'; inspectionId: string; answer: AnswerUpsertRequest }
  | {
      kind: 'evidence';
      inspectionId: string;
      photo: { uri: string; name: string; mimeType: string };
      /** Item do checklist a que a foto pertence (o servidor liga à resposta do item). */
      itemId?: string | null;
      /** operationId da NC criada no aparelho a que a foto pertence. */
      nonConformityOperationId?: string | null;
      description?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    }
  | { kind: 'nonConformity'; inspectionId: string; body: CreateNonConformityRequest }
  | { kind: 'submit'; inspectionId: string };

/**
 * `pending`: aguardando envio (ou reenvio após falha de rede).
 * `conflict`: o servidor recusou. Fica guardada e visível até o técnico decidir — nunca é
 * descartada sozinha (ADR-008).
 */
export type EntryState = 'pending' | 'conflict';

export interface QueueEntry {
  /** UUID gerado no aparelho; é o `operationId` idempotente enviado à API. */
  id: string;
  userId: string;
  operation: QueuedOperation;
  createdAt: string;
  attempts: number;
  state: EntryState;
  lastError?: string;
  lastCode?: string;
}

/** Estado de sincronização de uma inspeção no aparelho, separado do status oficial. */
export type SyncStatus = 'synced' | 'pending' | 'conflict';
