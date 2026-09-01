import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { inspections as inspectionsApi } from '../../../src/api/endpoints';
import { cache, withCache } from '../../../src/offline/cache';
import { useSync } from '../../../src/offline/SyncContext';
import { useAsync } from '../../../src/hooks/useAsync';
import { Badge, Button, Card, ErrorState, LoadingState, ProgressBar } from '../../../src/components/ui';
import { ScreenHeader } from '../../../src/components/Header';
import { ChecklistItem } from '../../../src/inspection/ChecklistItem';
import { currentAnswer, groupSections, isAnswered } from '../../../src/inspection/answers';
import { colors, radius, semantic, spacing } from '../../../src/theme/tokens';
import { type } from '../../../src/theme/typography';
import type { AnswerUpsertRequest, ItemSnapshot } from '../../../src/api/types';

const EDITABLE: ReadonlyArray<string> = ['ASSIGNED', 'IN_PROGRESS', 'REJECTED'];

export default function ChecklistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { enqueue, pending, online } = useSync();

  const [drafts, setDrafts] = useState<Record<string, AnswerUpsertRequest>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const load = useCallback(
    () =>
      withCache(
        () => inspectionsApi.get(id),
        () => cache.getInspection(id),
        (detail) => cache.putInspection(detail),
      ),
    [id],
  );

  const { data, loading, error, reload } = useAsync(load, [id]);
  const inspection = data?.value ?? null;
  const fromCache = data?.fromCache ?? false;

  const sections = useMemo(() => groupSections(inspection?.items ?? []), [inspection]);
  const allItems = inspection?.items ?? [];

  const answeredCount = allItems.filter((item) =>
    isAnswered(item, currentAnswer(item, drafts[item.id])),
  ).length;

  const editable = inspection ? EDITABLE.includes(inspection.status) : false;

  /** Fotos ainda na fila para este item, para o contador do painel vermelho. */
  const queuedPhotos = useCallback(
    (itemId: string) =>
      pending.filter(
        (e) =>
          e.operation.kind === 'evidence' &&
          e.operation.inspectionId === id &&
          e.operation.description?.includes(itemId),
      ).length,
    [pending, id],
  );

  const updateAnswer = useCallback(
    (item: ItemSnapshot, patch: Partial<AnswerUpsertRequest>) => {
      setDrafts((prev) => {
        const base = currentAnswer(item, prev[item.id]);
        const next: AnswerUpsertRequest = { ...base, ...patch, inspectionItemId: item.id };
        // Toda alteração vai para a fila; ela deduplica por item, então digitar
        // não infla a fila e o último valor é o que chega ao servidor.
        void enqueue({ kind: 'answer', inspectionId: id, answer: next });
        return { ...prev, [item.id]: next };
      });
    },
    [enqueue, id],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Checklist de Execução" subtitle={inspection?.title} />

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
          {/* Progresso */}
          <View style={styles.progressBar}>
            <View style={styles.progressTop}>
              <Text style={[type.headlineSm, { flex: 1 }]}>
                {inspection.status === 'IN_PROGRESS' ? 'Inspeção em andamento' : inspection.title}
              </Text>
              <View style={styles.countBadge}>
                <Text style={[type.dataMono, { color: colors.onSecondaryContainer }]}>
                  {answeredCount}/{allItems.length} respondidos
                </Text>
              </View>
            </View>
            <ProgressBar
              value={answeredCount}
              total={allItems.length}
              color={answeredCount === allItems.length ? semantic.success.fg : colors.primaryContainer}
            />
          </View>

          {(fromCache || !online) && (
            <View style={styles.offlineStrip}>
              <Ionicons name="cloud-offline-outline" size={16} color={semantic.warning.fg} />
              <Text style={[type.bodyMd, { color: semantic.warning.fg, flex: 1 }]}>
                Trabalhando offline. Suas respostas ficam salvas no aparelho e sobem sozinhas.
              </Text>
            </View>
          )}

          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {!editable ? (
              <View style={styles.lockedBox}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.onSurfaceVariant} />
                <Text style={[type.bodyMd, styles.muted, { flex: 1 }]}>
                  Esta inspeção já foi enviada. O checklist está em modo somente leitura.
                </Text>
              </View>
            ) : null}

            {sections.map((section) => {
              const key = `${section.order}-${section.title}`;
              const sectionAnswered = section.items.filter((item) =>
                isAnswered(item, currentAnswer(item, drafts[item.id])),
              ).length;
              const complete = sectionAnswered === section.items.length;
              const isCollapsed = collapsed[key] ?? complete;

              return (
                <Card
                  key={key}
                  style={styles.sectionCard}
                  accent={!isCollapsed ? colors.primaryContainer : undefined}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: !isCollapsed }}
                    onPress={() => setCollapsed((prev) => ({ ...prev, [key]: !isCollapsed }))}
                    style={styles.sectionHeader}
                  >
                    <View
                      style={[
                        styles.sectionIcon,
                        { backgroundColor: complete ? semantic.success.bg : semantic.info.bg },
                      ]}
                    >
                      <Ionicons
                        name={complete ? 'checkmark' : 'construct-outline'}
                        size={18}
                        color={complete ? semantic.success.fg : semantic.info.fg}
                      />
                    </View>

                    <Text style={[type.titleMd, { flex: 1 }]}>{section.title}</Text>

                    <Text
                      style={[
                        type.dataMono,
                        { color: complete ? semantic.success.fg : colors.primaryContainer },
                      ]}
                    >
                      {sectionAnswered}/{section.items.length}
                    </Text>
                    <Ionicons
                      name={isCollapsed ? 'chevron-down' : 'chevron-up'}
                      size={20}
                      color={colors.onSurfaceVariant}
                    />
                  </Pressable>

                  {!isCollapsed ? (
                    <View>
                      {section.description ? (
                        <Text style={[type.bodyMd, styles.muted, { marginTop: spacing.base }]}>
                          {section.description}
                        </Text>
                      ) : null}

                      {section.items.map((item, itemIndex) => (
                        <ChecklistItem
                          key={item.id}
                          index={itemIndex + 1}
                          item={item}
                          draft={drafts[item.id]}
                          disabled={!editable}
                          photoCount={queuedPhotos(item.id)}
                          onChange={(patch) => updateAnswer(item, patch)}
                          onAddPhoto={() =>
                            router.push(`/camera?inspectionId=${id}&itemId=${item.id}`)
                          }
                          onOpenNonConformity={() =>
                            router.push(
                              `/inspection/${id}/non-conformity?itemId=${item.id}&title=${encodeURIComponent(item.itemTitle)}`,
                            )
                          }
                        />
                      ))}
                    </View>
                  ) : null}
                </Card>
              );
            })}

            {sections.length === 0 ? (
              <Card>
                <Text style={[type.bodyMd, styles.muted]}>
                  Este modelo de inspeção não tem itens publicados.
                </Text>
              </Card>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.footerMeta}>
              <Badge tone={answeredCount === allItems.length ? 'success' : 'info'}>
                {answeredCount === allItems.length ? 'Checklist completo' : 'Em preenchimento'}
              </Badge>
              {pending.length > 0 ? (
                <Text style={[type.bodyMd, styles.muted]}>{pending.length} na fila</Text>
              ) : null}
            </View>
            <Button
              title="Revisar e Concluir"
              iconRight="arrow-forward"
              onPress={() => router.push(`/inspection/${id}/summary`)}
            />
          </View>
        </>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  pad: { padding: spacing.gutter },
  scroll: { padding: spacing.gutter, gap: spacing.sm, paddingBottom: spacing.xl },
  muted: { color: colors.onSurfaceVariant },
  progressBar: {
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    gap: spacing.xs,
  },
  progressTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  countBadge: {
    backgroundColor: colors.secondaryContainer,
    borderRadius: radius.base,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
  },
  offlineStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: semantic.warning.bg,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.xs,
  },
  sectionCard: { padding: spacing.sm, paddingHorizontal: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  footer: {
    padding: spacing.gutter,
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.surfaceContainerLowest,
  },
  footerMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
