import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  evidence as evidenceApi,
  inspections as inspectionsApi,
  nonConformities as ncApi,
} from '../../../src/api/endpoints';
import { cache, withCache } from '../../../src/offline/cache';
import { useSync } from '../../../src/offline/SyncContext';
import { useAsync } from '../../../src/hooks/useAsync';
import { Badge, Button, Card, ErrorState, LoadingState } from '../../../src/components/ui';
import { ScreenHeader } from '../../../src/components/Header';
import { blockingIssues, currentAnswer, isAnswered } from '../../../src/inspection/answers';
import { label, priorityTone } from '../../../src/labels';
import { confirm, notify } from '../../../src/dialogs';
import { colors, radius, semantic, spacing } from '../../../src/theme/tokens';
import { type } from '../../../src/theme/typography';

const EDITABLE: ReadonlyArray<string> = ['ASSIGNED', 'IN_PROGRESS', 'REJECTED'];

export default function SummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { enqueue, pending, online } = useSync();
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const detail = await withCache(
      () => inspectionsApi.get(id),
      () => cache.getInspection(id),
      (d) => cache.putInspection(d),
    );
    // Evidências e NCs são complementares: se a rede falhar, o resumo ainda
    // serve para conferir as respostas.
    const [photos, ncs] = await Promise.all([
      evidenceApi.list(id).catch(() => []),
      ncApi.list(id).catch(() => []),
    ]);
    return { detail: detail.value, fromCache: detail.fromCache, photos, ncs };
  }, [id]);

  const { data, loading, error, reload } = useAsync(load, [id]);
  const inspection = data?.detail ?? null;
  const items = inspection?.items ?? [];

  // As respostas em fila ainda não estão no snapshot do servidor, então
  // entram aqui para o resumo refletir o que o técnico realmente preencheu.
  const queuedAnswers = Object.fromEntries(
    pending
      .filter((e) => e.operation.kind === 'answer' && e.operation.inspectionId === id)
      .map((e) => {
        const op = e.operation as Extract<typeof e.operation, { kind: 'answer' }>;
        return [op.answer.inspectionItemId, op.answer];
      }),
  );

  const answered = items.filter((i) => isAnswered(i, currentAnswer(i, queuedAnswers[i.id]))).length;
  const conforming = items.filter(
    (i) => currentAnswer(i, queuedAnswers[i.id]).conformity === 'CONFORMING',
  ).length;
  const nonConforming = items.filter(
    (i) => currentAnswer(i, queuedAnswers[i.id]).conformity === 'NON_CONFORMING',
  ).length;
  const notApplicable = items.filter(
    (i) => currentAnswer(i, queuedAnswers[i.id]).conformity === 'NOT_APPLICABLE',
  ).length;

  /**
   * Fotos por item, contando as que ainda estão na fila. A evidência enfileirada
   * carrega o id do item na descrição — é como a câmera as associa enquanto não
   * existe resposta persistida para vinculá-las.
   */
  const evidenceFor = (itemId: string) =>
    pending.filter(
      (e) =>
        e.operation.kind === 'evidence' &&
        e.operation.inspectionId === id &&
        e.operation.description?.includes(itemId),
    ).length;

  const issues = blockingIssues(items, queuedAnswers, evidenceFor);
  const queuedPhotos = pending.filter(
    (e) => e.operation.kind === 'evidence' && e.operation.inspectionId === id,
  ).length;
  const totalPhotos = (data?.photos.length ?? 0) + queuedPhotos;
  const editable = inspection ? EDITABLE.includes(inspection.status) : false;

  const submit = async () => {
    if (issues.length > 0) {
      notify(
        'Checklist incompleto',
        `Há ${issues.length} pendência(s) que impedem o envio. Volte ao checklist e resolva antes de concluir.`,
      );
      return;
    }

    const confirmed = await confirm({
      title: 'Enviar para revisão',
      message: online
        ? 'A inspeção será enviada ao supervisor e não poderá mais ser editada no aplicativo. Confirmar?'
        : 'Você está offline. O envio ficará na fila e acontecerá assim que a rede voltar. Confirmar?',
      confirmText: 'Enviar',
    });
    if (!confirmed) return;

    setSubmitting(true);
    try {
      // Sempre pela fila: garante que o submit chegue depois das respostas e
      // das evidências que o servidor valida.
      await enqueue({ kind: 'submit', inspectionId: id });
      notify(
        'Inspeção concluída',
        online
          ? 'Enviada para revisão do supervisor.'
          : 'Guardada no aparelho. Será enviada quando houver conexão.',
      );
      router.replace('/(tabs)/inspections');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Resumo da Inspeção" subtitle={inspection?.title} />

      {loading && !data ? (
        <View style={styles.pad}>
          <LoadingState />
        </View>
      ) : error && !data ? (
        <View style={styles.pad}>
          <ErrorState message={error} onRetry={reload} />
        </View>
      ) : inspection ? (
        <>
          <ScrollView contentContainerStyle={styles.scroll}>
            {/* Números do fechamento */}
            <View style={styles.statRow}>
              <StatTile value={conforming} label="Conforme" tone="success" />
              <StatTile value={nonConforming} label="Não conforme" tone="danger" />
              <StatTile value={notApplicable} label="N/A" tone="neutral" />
            </View>

            <Card>
              <View style={styles.rowBetween}>
                <Text style={type.titleMd}>Itens respondidos</Text>
                <Text style={[type.dataMono, { fontSize: 15 }]}>
                  {answered}/{items.length}
                </Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.rowBetween}>
                <Text style={type.titleMd}>Evidências anexadas</Text>
                <Text style={[type.dataMono, { fontSize: 15 }]}>{totalPhotos}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.rowBetween}>
                <Text style={type.titleMd}>Não conformidades abertas</Text>
                <Text style={[type.dataMono, { fontSize: 15 }]}>{data?.ncs.length ?? 0}</Text>
              </View>
            </Card>

            {/* Não conformidades registradas */}
            {data && data.ncs.length > 0 ? (
              <View style={{ gap: spacing.xs }}>
                <Text style={type.headlineSm}>Não conformidades</Text>
                {data.ncs.map((nc) => (
                  <Card key={nc.id} accent={semantic.danger.fg}>
                    <View style={styles.rowBetween}>
                      <Text style={[type.titleMd, { flex: 1 }]}>{nc.title}</Text>
                      <Badge tone={priorityTone(nc.severity)}>{label(nc.severity)}</Badge>
                    </View>
                    {nc.description ? (
                      <Text style={[type.bodyMd, styles.muted, { marginTop: 4 }]}>{nc.description}</Text>
                    ) : null}
                  </Card>
                ))}
              </View>
            ) : null}

            {/* Bloqueios */}
            {issues.length > 0 ? (
              <View style={styles.issuesBox}>
                <View style={styles.rowStart}>
                  <Ionicons name="alert-circle" size={20} color={semantic.danger.fg} />
                  <Text style={[type.titleMd, { color: semantic.danger.fg, flex: 1 }]}>
                    {issues.length} pendência(s) impedem o envio
                  </Text>
                </View>
                {issues.slice(0, 8).map(({ item, reason }) => (
                  <View key={item.id} style={styles.issueRow}>
                    <Ionicons name="ellipse" size={6} color={semantic.danger.fg} />
                    <Text style={[type.bodyMd, { flex: 1 }]}>
                      <Text style={type.bodyMdMedium}>{item.itemTitle}</Text> — {reason}
                    </Text>
                  </View>
                ))}
                {issues.length > 8 ? (
                  <Text style={[type.bodyMd, styles.muted]}>e mais {issues.length - 8}...</Text>
                ) : null}
                <Button
                  title="Voltar ao checklist"
                  variant="secondary"
                  icon="arrow-back"
                  onPress={() => router.replace(`/inspection/${id}/checklist`)}
                />
              </View>
            ) : (
              <View style={styles.readyBox}>
                <Ionicons name="checkmark-circle" size={20} color={semantic.success.fg} />
                <Text style={[type.bodyMd, { color: semantic.success.fg, flex: 1 }]}>
                  Checklist completo e sem pendências. Pronto para envio.
                </Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            {editable ? (
              <Button
                title={online ? 'Enviar para Revisão' : 'Concluir (envia ao reconectar)'}
                icon="cloud-upload-outline"
                onPress={() => void submit()}
                loading={submitting}
                disabled={issues.length > 0}
              />
            ) : (
              <View style={styles.rowStart}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.onSurfaceVariant} />
                <Text style={[type.bodyMd, styles.muted, { flex: 1 }]}>
                  Inspeção {label(inspection.status).toLowerCase()} — envio já realizado.
                </Text>
              </View>
            )}
          </View>
        </>
      ) : null}
    </SafeAreaView>
  );
}

function StatTile({
  value,
  label: name,
  tone,
}: {
  value: number;
  label: string;
  tone: 'success' | 'danger' | 'neutral';
}) {
  const c = semantic[tone];
  return (
    <View style={styles.statTile}>
      <Text style={[type.displayLg, { color: c.fg }]}>{value}</Text>
      <Text style={type.labelCaps}>{name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  pad: { padding: spacing.gutter },
  scroll: { padding: spacing.gutter, gap: spacing.md, paddingBottom: spacing.xl },
  muted: { color: colors.onSurfaceVariant },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  rowStart: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  divider: { height: 1, backgroundColor: colors.hairline, marginVertical: spacing.sm },
  statRow: { flexDirection: 'row', gap: spacing.xs },
  statTile: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  issuesBox: {
    backgroundColor: semantic.danger.bg,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  issueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  readyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: semantic.success.bg,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  footer: {
    padding: spacing.gutter,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.surfaceContainerLowest,
  },
});
