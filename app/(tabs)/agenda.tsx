import { useCallback, useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/auth/AuthContext';
import { useSync } from '../../src/offline/SyncContext';
import {
  inspections as inspectionsApi,
  sites as sitesApi,
} from '../../src/api/endpoints';
import { useAsync } from '../../src/hooks/useAsync';
import { Badge, Card, EmptyState, ErrorState, LoadingState } from '../../src/components/ui';
import { BrandHeader } from '../../src/components/Header';
import { label, priorityTone, toneColors } from '../../src/labels';
import { addressOf, canNavigate, openInMaps } from '../../src/maps';
import { colors, radius, semantic, spacing, touchTarget } from '../../src/theme/tokens';
import { type } from '../../src/theme/typography';
import type { InspectionSummary, Site } from '../../src/api/types';

/**
 * Agenda do técnico.
 *
 * Só mostra trabalho que ainda depende dele: concluída a inspeção — enviada
 * para revisão, ou aprovada — ela sai da lista. É o que separa a agenda da aba
 * de inspeções, que guarda o histórico completo. Reprovada volta a aparecer,
 * porque o supervisor devolveu a tarefa.
 */

/** Estados em que a bola está com o supervisor, não com o técnico. */
const OFF_THE_AGENDA: ReadonlyArray<string> = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'CANCELED',
  'DRAFT',
];

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Dias inteiros entre hoje e a data — negativo no passado. */
function daysFromToday(iso: string | null): number | null {
  if (!iso) return null;
  const day = startOfDay(new Date(iso));
  const today = startOfDay(new Date());
  return Math.round((day - today) / 86_400_000);
}

function groupTitle(offset: number | null): string {
  if (offset === null) return 'Sem data definida';
  if (offset < 0) return 'Atrasadas';
  if (offset === 0) return 'Hoje';
  if (offset === 1) return 'Amanhã';
  if (offset < 7) return 'Esta semana';
  return 'Mais adiante';
}

/** Ordem de exibição dos grupos: o que atrasou primeiro, o distante por último. */
const GROUP_ORDER = ['Atrasadas', 'Hoje', 'Amanhã', 'Esta semana', 'Mais adiante', 'Sem data definida'];

function timeOf(iso: string | null): string {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

export default function AgendaScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { online, pending } = useSync();

  const load = useCallback(async () => {
    const page = await inspectionsApi.list({
      technicianId: user?.id,
      size: 100,
      sort: 'scheduledFor,asc',
    });

    // Os locais carregam junto porque a agenda promete levar o técnico até o
    // ativo: sem coordenada não há rota, e descobrir isso só ao tocar no botão
    // seria tarde. Um pedido por local distinto, não por inspeção.
    const pendingOnes = page.content.filter((i) => !OFF_THE_AGENDA.includes(i.status));
    const siteIds = [...new Set(pendingOnes.map((i) => i.siteId).filter(Boolean))] as string[];
    const loaded = await Promise.all(
      siteIds.map((id) => sitesApi.get(id).catch(() => null)),
    );

    const sites = new Map<string, Site>();
    loaded.forEach((site) => {
      if (site) sites.set(site.id, site);
    });

    return { inspections: pendingOnes, sites };
  }, [user?.id]);

  const { data, loading, error, reload } = useAsync(load, [user?.id]);

  const groups = useMemo(() => {
    const items = data?.inspections ?? [];
    const byTitle = new Map<string, InspectionSummary[]>();

    items.forEach((item) => {
      const title = groupTitle(daysFromToday(item.scheduledFor));
      const bucket = byTitle.get(title);
      if (bucket) bucket.push(item);
      else byTitle.set(title, [item]);
    });

    return GROUP_ORDER.filter((title) => byTitle.has(title)).map((title) => ({
      title,
      items: byTitle.get(title)!,
    }));
  }, [data]);

  const total = data?.inspections.length ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <BrandHeader />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={reload}
            tintColor={colors.primaryContainer}
          />
        }
      >
        <View>
          <Text style={type.labelCaps}>Minha agenda</Text>
          <Text style={[type.headlineMd, { marginTop: 2 }]}>
            {total === 0 ? 'Nada pendente' : `${total} ${total === 1 ? 'tarefa' : 'tarefas'}`}
          </Text>
          <Text style={[type.bodyMd, styles.muted]}>
            Some da agenda ao ser enviada para revisão.
          </Text>
        </View>

        {!online ? (
          <View style={styles.offline}>
            <Ionicons name="cloud-offline-outline" size={18} color={semantic.warning.fg} />
            <Text style={[type.bodyMd, { color: semantic.warning.fg, flex: 1 }]}>
              Offline{pending.length > 0 ? ` · ${pending.length} na fila` : ''} — a agenda mostra o
              último estado sincronizado.
            </Text>
          </View>
        ) : null}

        {loading && !data ? (
          <LoadingState />
        ) : error && !data ? (
          <ErrorState message={error} onRetry={reload} />
        ) : total === 0 ? (
          <EmptyState
            icon="checkmark-done-outline"
            title="Agenda vazia"
            message="Nenhuma inspeção pendente para você. Tarefas enviadas para revisão saem daqui automaticamente."
          />
        ) : (
          groups.map((group) => (
            <View key={group.title} style={styles.group}>
              <View style={styles.groupHeader}>
                <Text style={type.labelCaps}>{group.title}</Text>
                <View style={styles.groupCount}>
                  <Text style={[type.dataMono, styles.groupCountText]}>{group.items.length}</Text>
                </View>
              </View>

              {group.items.map((item) => (
                <AgendaCard
                  key={item.id}
                  item={item}
                  site={item.siteId ? data?.sites.get(item.siteId) ?? null : null}
                  late={group.title === 'Atrasadas'}
                  onOpen={() => router.push(`/inspection/${item.id}`)}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function AgendaCard({
  item,
  site,
  late,
  onOpen,
}: {
  item: InspectionSummary;
  site: Site | null;
  late: boolean;
  onOpen: () => void;
}) {
  const tone = priorityTone(item.priority);
  const accent = toneColors(tone).fg;
  const navigable = canNavigate(site);
  const address = addressOf(site);

  return (
    <Card accent={accent} style={styles.card}>
      <Pressable accessibilityRole="button" onPress={onOpen}>
        <View style={styles.cardTop}>
          <View style={styles.time}>
            <Text style={[type.dataMono, styles.timeText]}>{timeOf(item.scheduledFor)}</Text>
            <Text style={[type.bodyMd, styles.muted]}>{dayLabel(item.scheduledFor)}</Text>
          </View>

          <View style={styles.cardBody}>
            <View style={styles.badges}>
              <Badge tone={tone}>{label(item.priority)}</Badge>
              {item.status === 'IN_PROGRESS' ? <Badge tone="warning">Em andamento</Badge> : null}
              {item.status === 'REJECTED' ? <Badge tone="danger">Reprovada</Badge> : null}
              {late ? <Badge tone="danger">Atrasada</Badge> : null}
            </View>

            <Text style={[type.bodyLg, styles.title]}>{item.title}</Text>

            {item.equipmentName ? (
              <View style={styles.metaRow}>
                <Ionicons name="hardware-chip-outline" size={14} color={colors.onSurfaceVariant} />
                <Text style={[type.bodyMd, styles.muted]} numberOfLines={1}>
                  {item.equipmentName}
                </Text>
              </View>
            ) : null}

            {item.siteName ? (
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={14} color={colors.onSurfaceVariant} />
                <Text style={[type.bodyMd, styles.muted]} numberOfLines={1}>
                  {address ? `${item.siteName} · ${address}` : item.siteName}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir rota no mapa"
          disabled={!navigable}
          onPress={() => site && void openInMaps(site)}
          style={({ pressed }) => [
            styles.action,
            styles.actionGhost,
            !navigable && styles.actionDisabled,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons
            name="navigate-outline"
            size={18}
            color={navigable ? colors.primaryContainer : colors.outline}
          />
          <Text
            style={[
              type.bodyMdMedium,
              { color: navigable ? colors.primaryContainer : colors.outline },
            ]}
          >
            Como chegar
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={onOpen}
          style={({ pressed }) => [styles.action, styles.actionPrimary, pressed && { opacity: 0.9 }]}
        >
          <Text style={[type.bodyMdMedium, { color: '#ffffff' }]}>
            {item.status === 'IN_PROGRESS' ? 'Continuar' : 'Abrir'}
          </Text>
          <Ionicons name="arrow-forward" size={18} color="#ffffff" />
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.gutter, gap: spacing.lg, paddingBottom: spacing.xl },
  muted: { color: colors.onSurfaceVariant },

  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: semantic.warning.bg,
    borderRadius: radius.md,
    padding: spacing.sm,
  },

  group: { gap: spacing.sm },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  groupCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  groupCountText: { fontSize: 12, color: colors.onSurfaceVariant },

  card: { gap: spacing.sm },
  cardTop: { flexDirection: 'row', gap: spacing.sm },
  time: { width: 56, gap: 2 },
  timeText: { fontSize: 16, color: colors.primaryContainer },
  cardBody: { flex: 1, gap: 4 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  title: { marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  actions: { flexDirection: 'row', gap: spacing.xs },
  action: {
    flex: 1,
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
  },
  actionGhost: {
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  actionDisabled: { opacity: 0.5 },
  actionPrimary: { backgroundColor: colors.primary },
});
