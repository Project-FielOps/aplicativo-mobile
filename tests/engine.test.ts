/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpError, OfflineError } from '../src/api/errors';
import { backoffDelay, runSync, sortForSync, type OutboxStore, type PushOperation, type SyncTransport } from '../src/offline/engine';
import { localState, withPendingAnswers } from '../src/offline/overlay';
import type { QueueEntry, QueuedOperation } from '../src/offline/types';

let seq = 0;
const entry = (operation: QueuedOperation, extra: Partial<QueueEntry> = {}): QueueEntry => ({
  id: `op-${++seq}`, userId: 'tech', operation, createdAt: new Date(seq).toISOString(), attempts: 0, state: 'pending', ...extra,
});
const photo = { uri: 'file:///evidence/x.jpg', name: 'x.jpg', mimeType: 'image/jpeg' };

function memoryStore(entries: QueueEntry[]): OutboxStore & { entries: QueueEntry[] } {
  return {
    entries,
    async list() { return [...this.entries]; },
    async remove(id) { this.entries = this.entries.filter((e) => e.id !== id); },
    async markTransient(id, message) { this.entries = this.entries.map((e) => (e.id === id ? { ...e, attempts: e.attempts + 1, lastError: message } : e)); },
    async markConflict(id, code, message) { this.entries = this.entries.map((e) => (e.id === id ? { ...e, state: 'conflict', lastCode: code, lastError: message } : e)); },
  };
}

/** Servidor falso com idempotência por operationId, como a API real. */
function fakeServer(reject: (op: PushOperation) => string | null = () => null) {
  const applied = new Set<string>();
  const calls: string[] = [];
  const transport: SyncTransport = {
    async push(_device, ops) {
      calls.push(`push:${ops.map((o) => o.type).join(',')}`);
      return ops.map((op) => {
        if (applied.has(op.operationId)) return { operationId: op.operationId, status: 'ALREADY_APPLIED', code: null };
        const code = reject(op);
        if (code) return { operationId: op.operationId, status: 'CONFLICT', code };
        applied.add(op.operationId);
        return { operationId: op.operationId, status: 'APPLIED', code: null };
      });
    },
    async uploadEvidence(e) { calls.push('upload'); applied.add(e.id); },
  };
  return { transport, applied, calls };
}

test('fotos sobem depois das respostas e o envio vai por último, sozinho', async () => {
  const store = memoryStore([
    entry({ kind: 'start', inspectionId: 'A' }),
    entry({ kind: 'evidence', inspectionId: 'A', photo, itemId: 'i1' }),
    entry({ kind: 'submit', inspectionId: 'A' }),
    entry({ kind: 'answer', inspectionId: 'A', answer: { inspectionItemId: 'i1', conformity: 'NON_CONFORMING' } }),
  ]);
  const server = fakeServer();
  const report = await runSync(store, server.transport, 'device');
  assert.deepEqual(server.calls, ['push:INSPECTION_START,ANSWER_UPSERT', 'upload', 'push:INSPECTION_SUBMIT']);
  assert.equal(report.sent, 4);
  assert.equal(store.entries.length, 0);
});

test('reenvio após resposta perdida não duplica nada no servidor', async () => {
  const ops = [entry({ kind: 'nonConformity', inspectionId: 'A', body: { title: 'Vazamento', severity: 'HIGH' } })];
  const server = fakeServer();
  await runSync(memoryStore([...ops]), server.transport, 'device');
  // O aparelho não recebeu a confirmação e manda de novo a mesma operação.
  const store = memoryStore([...ops]);
  await runSync(store, server.transport, 'device');
  assert.equal(server.applied.size, 1);
  assert.equal(store.entries.length, 0);
});

test('falha de rede preserva a fila inteira, na ordem, para tentar depois', async () => {
  const store = memoryStore([entry({ kind: 'start', inspectionId: 'A' }), entry({ kind: 'submit', inspectionId: 'A' })]);
  const transport: SyncTransport = { push: async () => { throw new OfflineError(); }, uploadEvidence: async () => undefined };
  const report = await runSync(store, transport, 'device');
  assert.equal(report.transientError, 'Sem conexão com o servidor.');
  assert.equal(store.entries.length, 2);
  assert.equal(store.entries[0].attempts, 1);
  assert.ok(store.entries.every((e) => e.state === 'pending'));
});

test('recusa do servidor não apaga o trabalho e segura o resto da inspeção', async () => {
  const store = memoryStore([
    entry({ kind: 'answer', inspectionId: 'A', answer: { inspectionItemId: 'i1', valueText: 'x' } }),
    entry({ kind: 'submit', inspectionId: 'A' }),
    entry({ kind: 'answer', inspectionId: 'B', answer: { inspectionItemId: 'i9', valueText: 'y' } }),
  ]);
  const server = fakeServer((op) => (op.entityId === 'A' ? 'INSPECTION_LOCKED' : null));
  const report = await runSync(store, server.transport, 'device');
  assert.equal(report.conflicts, 1);
  const a = store.entries.filter((e) => e.operation.inspectionId === 'A');
  assert.equal(a.length, 2, 'resposta recusada e envio continuam no aparelho');
  assert.equal(a.find((e) => e.operation.kind === 'answer')?.state, 'conflict');
  assert.equal(a.find((e) => e.operation.kind === 'submit')?.state, 'pending');
  assert.ok(!server.calls.includes('push:INSPECTION_SUBMIT'), 'envio não sai por cima de um conflito');
  assert.equal(store.entries.some((e) => e.operation.inspectionId === 'B'), false, 'outra inspeção segue normalmente');
});

test('erro 4xx no upload de foto vira conflito em vez de sumir', async () => {
  const store = memoryStore([entry({ kind: 'evidence', inspectionId: 'A', photo })]);
  const transport: SyncTransport = {
    push: async () => [],
    uploadEvidence: async () => { throw new HttpError(422, { code: 'EVIDENCE_LIMIT_EXCEEDED' } as never, 'limite'); },
  };
  await runSync(store, transport, 'device');
  assert.equal(store.entries[0].state, 'conflict');
  assert.equal(store.entries[0].lastCode, 'EVIDENCE_LIMIT_EXCEEDED');
});

test('ordenação por fase é estável e o backoff dobra até 16s', () => {
  const a1 = entry({ kind: 'answer', inspectionId: 'A', answer: { inspectionItemId: '1' } });
  const a2 = entry({ kind: 'answer', inspectionId: 'A', answer: { inspectionItemId: '2' } });
  const s = entry({ kind: 'start', inspectionId: 'A' });
  assert.deepEqual(sortForSync([a1, s, a2]).map((e) => e.id), [s.id, a1.id, a2.id]);
  assert.deepEqual([1, 2, 3, 4, 5, 9].map((n) => backoffDelay(n, () => 0)), [1000, 2000, 4000, 8000, 16000, 16000]);
});

test('o aparelho mostra o que está na fila sem trocar o status oficial', () => {
  const pending = [
    entry({ kind: 'start', inspectionId: 'A' }),
    entry({ kind: 'answer', inspectionId: 'A', answer: { inspectionItemId: 'i1', valueText: 'feito offline' } }),
    entry({ kind: 'submit', inspectionId: 'A' }),
  ];
  const state = localState('ASSIGNED', 'A', pending);
  assert.equal(state.localStatus, 'IN_PROGRESS');
  assert.equal(state.pendingSubmit, true);
  assert.equal(state.syncStatus, 'pending');
  const detail = withPendingAnswers({ id: 'A', status: 'ASSIGNED', items: [{ id: 'i1', answer: null }] } as never, pending);
  assert.equal(detail.status, 'ASSIGNED');
  assert.equal(detail.items[0].answer?.valueText, 'feito offline');
});
