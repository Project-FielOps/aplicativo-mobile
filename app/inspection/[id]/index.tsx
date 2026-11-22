import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { equipment as equipmentApi, inspections as inspectionsApi } from '../../../src/api/endpoints';
import { useAsync } from '../../../src/hooks/useAsync';
import { useSync } from '../../../src/offline/SyncContext';
import { useVerification } from '../../../src/inspection/verification';
import { Badge, Button, Card, DataRow, ErrorState, LoadingState } from '../../../src/components/ui';
import { ScreenHeader } from '../../../src/components/Header';
import { formatDateTime, label, priorityTone, statusTone } from '../../../src/labels';
import { notify } from '../../../src/dialogs';
import { colors, radius, semantic, spacing } from '../../../src/theme/tokens';
import { type } from '../../../src/theme/typography';

const OPEN_STATES: ReadonlyArray<string> = ['ASSIGNED', 'IN_PROGRESS', 'REJECTED'];

export default function InspectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { online, enqueue } = useSync();
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    const inspection = await inspectionsApi.get(id);
    // O detalhe traz só o nome do ativo; a ficha técnica exige o cadastro.
    const asset = inspection.equipmentId
      ? await equipmentApi.get(inspection.equipmentId).catch(() => null)
      : null;
    return { inspection, asset };
  }, [id]);

  const { data, loading, error, reload } = useAsync(load, [id]);
  const inspection = data?.inspection ?? null;
  const asset = data?.asset ?? null;

  const { verified } = useVerification(id, inspection?.equipmentId ?? null);

  const start = async () => {
    if (!inspection) return;
    setStarting(true);
    try {
      if (online) {
        await inspectionsApi.start(inspection.id);
      } else {
        // Offline: enfileira e segue para o checklist. A inspeção só muda de
        // estado no servidor quando a rede voltar, mas o técnico não fica parado.
        await enqueue({ kind: 'start', inspectionId: inspection.id });
      }
      router.push(`/inspection/${inspection.id}/checklist`);
    } catch (e) {
      notify('Não foi possível iniciar', e instanceof Error ? e.message : 'Tente novamente.');
    } finally {
      setStarting(false);
    }
  };

  const running = inspection?.status === 'IN_PROGRESS';
  const canWork = inspection ? OPEN_STATES.includes(inspection.status) : false;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Detalhes da Inspeção" subtitle={inspection?.templateTitle ?? undefined} />

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
          <ScrollView
            contentContainerStyle={styles.scroll}
            refreshControl={
              <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.primaryContainer} />
            }
          >
            {/* Identificação */}
            <View>
              <Text style={type.dataMono}>#{inspection.id.slice(0, 8).toUpperCase()}</Text>
              <View style={styles.titleRow}>
                <Text style={[type.headlineMd, { flex: 1 }]}>{inspection.title}</Text>
                <Badge tone={statusTone(inspection.status)}>{label(inspection.status)}</Badge>
              </View>
              <View style={styles.badgeRow}>
                <Badge tone={priorityTone(inspection.priority)}>
                  {`Prioridade ${label(inspection.priority)}`}
                </Badge>
              </View>
            </View>

            {/* Ficha do ativo */}
            <Card>
              <View style={styles.assetHeader}>
                <View style={styles.assetIcon}>
                  <Ionicons name="hardware-chip-outline" size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={type.headlineSm}>{inspection.equipmentName ?? 'Sem ativo vinculado'}</Text>
                  <Text style={[type.bodyMd, styles.muted]}>
                    {[inspection.siteName, inspection.clientName].filter(Boolean).join(' • ') || '—'}
                  </Text>
                </View>
              </View>

              {asset ? (
                <>
                  <View style={styles.dataStrip}>
                    <DataRow label="Fabricante" value={asset.manufacturer} />
                    <DataRow label="Modelo" value={asset.model} />
                    <DataRow label="Série" value={asset.serialNumber} />
                    <DataRow label="Patrimônio" value={asset.assetNumber} />
                  </View>

                  <Button
                    title="Histórico do ativo"
                    variant="ghost"
                    icon="time-outline"
                    onPress={() => router.push(`/inspection/${inspection.id}/history`)}
                  />
                </>
              ) : null}
            </Card>

            {/* Portão de verificação */}
            {inspection.equipmentId && canWork ? (
              verified ? (
                <View style={styles.verifiedBox}>
                  <Ionicons name="checkmark-circle" size={20} color={semantic.success.fg} />
                  <Text style={[type.bodyMd, { color: semantic.success.fg, flex: 1 }]}>
                    Ativo verificado no local por QR Code.
                  </Text>
                </View>
              ) : (
                <View style={styles.gateBox}>
                  <View style={styles.gateHeader}>
                    <Ionicons name="qr-code-outline" size={20} color={semantic.danger.fg} />
                    <Text style={[type.titleMd, { color: semantic.danger.fg }]}>
                      Equipamento não verificado
                    </Text>
                  </View>
                  <Text style={[type.bodyMd, styles.muted]}>
                    É obrigatória a verificação in loco do ativo antes de iniciar os procedimentos de
                    teste.
                  </Text>
                  <Button
                    title="Escanear QR Code do Ativo"
                    icon="camera-outline"
                    variant="secondary"
                    onPress={() =>
                      router.push(
                        `/scanner?inspectionId=${inspection.id}&expectedEquipmentId=${inspection.equipmentId}`,
                      )
                    }
                    style={styles.dashedButton}
                  />
                </View>
              )
            ) : null}

            {/* Instruções prévias */}
            {inspection.instructions ? (
              <Card>
                <Text style={[type.labelCaps, { marginBottom: spacing.xs }]}>Instruções Prévias</Text>
                <View style={styles.instructionRow}>
                  <Ionicons name="information-circle-outline" size={20} color={colors.onSurfaceVariant} />
                  <Text style={[type.bodyLg, { flex: 1 }]}>{inspection.instructions}</Text>
                </View>
                {inspection.supervisorName ? (
                  <View style={styles.supervisorRow}>
                    <View style={styles.supervisorAvatar}>
                      <Ionicons name="person" size={14} color="#ffffff" />
                    </View>
                    <View>
                      <Text style={type.bodyMdMedium}>{inspection.supervisorName}</Text>
                      <Text style={[type.bodyMd, styles.muted]}>Supervisor responsável</Text>
                    </View>
                  </View>
                ) : null}
              </Card>
            ) : null}

            {/* Agenda */}
            <Card>
              <Text style={[type.labelCaps, { marginBottom: spacing.xs }]}>Agenda</Text>
              <View style={styles.dataStrip}>
                <DataRow label="Agendada para" value={formatDateTime(inspection.scheduledFor)} />
                <DataRow label="Iniciada em" value={formatDateTime(inspection.startedAtServer)} />
                <DataRow label="Modelo" value={inspection.templateTitle} />
                <DataRow
                  label="Versão"
                  value={inspection.templateVersionNumber ? `v${inspection.templateVersionNumber}` : null}
                />
              </View>
            </Card>

            {inspection.status === 'REJECTED' && inspection.canceledReason ? (
              <View style={styles.rejectedBox}>
                <Ionicons name="alert-circle-outline" size={20} color={semantic.danger.fg} />
                <Text style={[type.bodyMd, { color: semantic.danger.fg, flex: 1 }]}>
                  Reprovada pelo supervisor: {inspection.canceledReason}
                </Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Ação principal fixa */}
          <View style={styles.footer}>
            {canWork ? (
              <Button
                title={running ? 'Continuar Checklist' : 'Iniciar Inspeção Técnica'}
                icon={running ? 'list-outline' : 'play'}
                onPress={running ? () => router.push(`/inspection/${inspection.id}/checklist`) : start}
                loading={starting}
                disabled={Boolean(inspection.equipmentId) && verified === false}
              />
            ) : (
              <View style={styles.closedNote}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.onSurfaceVariant} />
                <Text style={[type.bodyMd, styles.muted, { flex: 1 }]}>
                  Esta inspeção está {label(inspection.status).toLowerCase()} e não aceita mais edição
                  pelo aplicativo.
                </Text>
              </View>
            )}
          </View>
        </>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.gutter, gap: spacing.md, paddingBottom: spacing.xl },
  pad: { padding: spacing.gutter },
  muted: { color: colors.onSurfaceVariant },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  assetHeader: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  assetIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dataStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  verifiedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: semantic.success.bg,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  gateBox: {
    backgroundColor: semantic.danger.bg,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  gateHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dashedButton: { borderStyle: 'dashed', borderWidth: 2, borderColor: colors.primaryContainer },
  instructionRow: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' },
  supervisorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  supervisorAvatar: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectedBox: {
    flexDirection: 'row',
    gap: spacing.xs,
    backgroundColor: semantic.danger.bg,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  footer: {
    padding: spacing.gutter,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.surfaceContainerLowest,
  },
  closedNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
