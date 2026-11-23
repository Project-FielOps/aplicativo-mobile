import type { AnswerUpsertRequest, CreateNonConformityRequest } from '../api/types';
import { getDatabase } from './database';

export type QueuedOperation =
  | { kind: 'start'; inspectionId: string }
  | { kind: 'answer'; inspectionId: string; answer: AnswerUpsertRequest }
  | { kind: 'evidence'; inspectionId: string; photo: { uri: string; name: string; mimeType: string }; description?: string | null; latitude?: number | null; longitude?: number | null }
  | { kind: 'nonConformity'; inspectionId: string; body: CreateNonConformityRequest }
  | { kind: 'submit'; inspectionId: string };

export interface QueueEntry { id: string; operation: QueuedOperation; createdAt: string; attempts: number; lastError?: string }

export function describeOperation(op: QueuedOperation): string { switch (op.kind) { case 'start': return 'Início de inspeção'; case 'answer': return 'Resposta do checklist'; case 'evidence': return 'Evidência fotográfica'; case 'nonConformity': return 'Não conformidade'; case 'submit': return 'Envio da inspeção'; } }
export function operationIcon(op: QueuedOperation): string { switch (op.kind) { case 'start': return 'play-circle-outline'; case 'answer': return 'checkbox-outline'; case 'evidence': return 'camera-outline'; case 'nonConformity': return 'warning-outline'; case 'submit': return 'cloud-upload-outline'; } }

export const queue = {
  async list(): Promise<QueueEntry[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ id: string; operation: string; created_at: string; attempts: number; last_error: string | null }>('SELECT id, operation, created_at, attempts, last_error FROM sync_queue ORDER BY created_at, id');
    return rows.map((row) => ({ id: row.id, operation: JSON.parse(row.operation) as QueuedOperation, createdAt: row.created_at, attempts: row.attempts, lastError: row.last_error ?? undefined }));
  },
  async enqueue(operation: QueuedOperation): Promise<QueueEntry> {
    const db = await getDatabase();
    const entry: QueueEntry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, operation, createdAt: new Date().toISOString(), attempts: 0 };
    await db.withTransactionAsync(async () => {
      if (operation.kind === 'answer') {
        const previous = await db.getAllAsync<{ id: string }>("SELECT id FROM sync_queue WHERE json_extract(operation, '$.kind') = 'answer' AND json_extract(operation, '$.inspectionId') = ? AND json_extract(operation, '$.answer.inspectionItemId') = ?", operation.inspectionId, operation.answer.inspectionItemId);
        for (const row of previous) await db.runAsync('DELETE FROM sync_queue WHERE id = ?', row.id);
      }
      await db.runAsync('INSERT INTO sync_queue (id, operation, created_at, attempts) VALUES (?, ?, ?, 0)', entry.id, JSON.stringify(operation), entry.createdAt);
    });
    return entry;
  },
  async remove(id: string): Promise<QueueEntry[]> { const db = await getDatabase(); await db.runAsync('DELETE FROM sync_queue WHERE id = ?', id); return queue.list(); },
  async markFailure(id: string, error: string): Promise<QueueEntry[]> { const db = await getDatabase(); await db.runAsync('UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?', error, id); return queue.list(); },
  async clear(): Promise<void> { const db = await getDatabase(); await db.runAsync('DELETE FROM sync_queue'); },
};
