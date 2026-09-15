import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/auth/AuthContext';
import { useSync } from '../../src/offline/SyncContext';
import { inspections as inspectionsApi } from '../../src/api/endpoints';
import { useAsync } from '../../src/hooks/useAsync';
import { Badge, Card, EmptyState, ErrorState, LoadingState } from '../../src/components/ui';
import { BrandHeader } from '../../src/components/Header';
import { formatDateTime, label, priorityTone, statusTone } from '../../src/labels';
import { colors, radius, semantic, spacing } from '../../src/theme/tokens';
import { type } from '../../src/theme/typography';
import type { InspectionSummary } from '../../src/api/types';

/**
 * Os filtros seguem o ciclo de vida da inspeção, na ordem em que ela anda:
 * pendente com o técnico, em andamento, na mão do supervisor, encerrada. É
 * onde o técnico vê para onde foi o que ele enviou — some da agenda, aparece
 * em "Em análise" e termina em "Concluídas".
 */
type FilterKey = 'all' | 'pending' | 'inProgress' | 'inReview' | 'done';

/** Aguardando revisão do supervisor: saiu do campo, ainda não foi decidida. */
const IN_REVIEW: ReadonlyArray<string> = ['SUBMITTED', 'UNDER_REVIEW'];

/** Ciclo encerrado. Reprovada não entra: volta para o técnico corrigir. */
const DONE: ReadonlyArray<string> = ['APPROVED'];

/** Ainda depende do técnico. */
const PENDING: ReadonlyArray<string> = ['ASSIGNED', 'REJECTED'];

export default function InspectionsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { online } = useSync();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(
    () => inspectionsApi.list({ technicianId: user?.id, size: 100 }),
    [user?.id],
  );
  const { data, loading, error, reload } = useAsync(load, [user?.id]);

  const all = useMemo(() => data?.content ?? [], [data]);

  const counts = useMemo(
    () => ({
      all: all.length,
      pending: all.filter((i) => PENDING.includes(i.status)).length,
      inProgress: all.filter((i) => i.status === 'IN_PROGRESS').length,
      inReview: all.filter((i) => IN_REVIEW.includes(i.status)).length,
      done: all.filter((i) => DONE.includes(i.status)).length,
    }),
    [all],
  );

  const visible = useMemo(() => {
    const byFilter = all.filter((i) => {
      if (filter === 'pending') return PENDING.includes(i.status);
      if (filter === 'inProgress') return i.status === 'IN_PROGRESS';
      if (filter === 'inReview') return IN_REVIEW.includes(i.status);
      if (filter === 'done') return DONE.includes(i.status);
      return true;
    });

    const q = search.trim().toLowerCase();
    if (!q) return byFilter;
    return byFilter.filter((i) =>
      [i.title, i.equipmentName, i.siteName, i.clientName]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q)),
    );
  }, [all, filter, search]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <BrandHeader />

      <View style={styles.controls}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.outline} />
          <TextInput
            placeholder="Buscar por ativo, local ou título..."
            placeholderTextColor={colors.outline}
            value={search}
            onChangeText={setSearch}
            style={[type.bodyMd, styles.searchInput]}
            returnKeyType="search"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={10} accessibilityLabel="Limpar busca">
              <Ionicons name="close-circle" size={18} color={colors.outline} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <FilterChip label="Todas" count={counts.all} active={filter === 'all'} onPress={() => setFilter('all')} />
          <FilterChip
            label="Pendentes"
            count={counts.pending}
            active={filter === 'pending'}
            onPress={() => setFilter('pending')}
          />
          <FilterChip
            label="Em andamento"
            count={counts.inProgress}
            active={filter === 'inProgress'}
            onPress={() => setFilter('inProgress')}
          />
          <FilterChip
            label="Em análise"
            count={counts.inReview}
            active={filter === 'inReview'}
            onPress={() => setFilter('inReview')}
          />
          <FilterChip
            label="Concluídas"
            count={counts.done}
            active={filter === 'done'}
            onPress={() => setFilter('done')}
          />
        </ScrollView>
      </View>

      {loading && !data ? (
        <View style={styles.pad}>
          <LoadingState />
        </View>
      ) : error && !data ? (
        <View style={styles.pad}>
          <ErrorState message={error} onRetry={reload} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.primaryContainer} />
          }
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          ListEmptyComponent={
            <EmptyState
              icon="clipboard-outline"
              title="Nenhuma inspeção encontrada"
              message={
                search || filter !== 'all'
                  ? 'Ajuste a busca ou o filtro para ver outras inspeções.'
                  : 'Você não tem inspeções atribuídas no momento.'
              }
            />
          }
          renderItem={({ item }) => (
            <InspectionCard
              inspection={item}
              online={online}
              onPress={() => router.push(`/inspection/${item.id}`)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function FilterChip({
  label: text,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.85 }]}
    >
      <Text style={[type.bodyMdMedium, active && { color: '#ffffff' }]}>{text}</Text>
      <View style={[styles.chipCount, active && styles.chipCountActive]}>
        <Text style={[type.labelCaps, { color: active ? '#ffffff' : colors.onSurfaceVariant }]}>{count}</Text>
      </View>
    </Pressable>
  );
}

function InspectionCard({
  inspection,
  online,
  onPress,
}: {
  inspection: InspectionSummary;
  online: boolean;
  onPress: () => void;
}) {
  const accent =
    inspection.priority === 'CRITICAL'
      ? semantic.danger.fg
      : inspection.status === 'IN_PROGRESS'
        ? semantic.warning.fg
        : colors.primaryContainer;

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.9 }}>
      <Card accent={accent}>
        <View style={styles.cardTop}>
          {/* Código do ativo em monoespaçada: é dado técnico, não prosa. */}
          <View style={styles.codeChip}>
            <Text style={type.dataMono} numberOfLines={1}>
              {inspection.equipmentName ?? inspection.templateTitle ?? 'INSPEÇÃO'}
            </Text>
          </View>
          <Badge tone={priorityTone(inspection.priority)}>{label(inspection.priority)}</Badge>
          <View style={{ flex: 1 }} />
          <Ionicons
            name={online ? 'cloud-done-outline' : 'cloud-offline-outline'}
            size={18}
            color={online ? colors.outlineVariant : semantic.warning.fg}
          />
        </View>

        <Text style={[type.titleMd, { marginTop: spacing.xs }]}>{inspection.title}</Text>

        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={14} color={colors.onSurfaceVariant} />
          <Text style={[type.bodyMd, styles.muted]} numberOfLines={1}>
            {[inspection.siteName, inspection.clientName].filter(Boolean).join(' • ') || 'Local não informado'}
          </Text>
        </View>

        <View style={styles.cardFooter}>
          <Badge tone={statusTone(inspection.status)}>{label(inspection.status)}</Badge>
          <View style={{ flex: 1 }} />
          <Text style={[type.bodyMd, styles.muted]}>{formatDateTime(inspection.scheduledFor)}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.outlineVariant} />
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  controls: { padding: spacing.gutter, gap: spacing.sm },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  searchInput: { flex: 1, paddingVertical: 0 },
  chips: { flexDirection: 'row', gap: spacing.xs, paddingRight: spacing.gutter },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipCount: {
    minWidth: 22,
    alignItems: 'center',
    borderRadius: radius.base,
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  chipCountActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  list: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.xl },
  pad: { padding: spacing.gutter },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  codeChip: {
    maxWidth: '55%',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.base,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  muted: { color: colors.onSurfaceVariant },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
});
