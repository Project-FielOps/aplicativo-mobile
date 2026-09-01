import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useSync } from '../../src/offline/SyncContext';
import { describeOperation, operationIcon } from '../../src/offline/queue';
import { Badge, Button, Card, EmptyState } from '../../src/components/ui';
import { BrandHeader } from '../../src/components/Header';
import { formatRelative } from '../../src/labels';
import { API_HOST } from '../../src/api/config';
import { colors, radius, semantic, spacing } from '../../src/theme/tokens';
import { type } from '../../src/theme/typography';

export default function SyncScreen() {
  const { online, pending, syncing, lastSyncAt, lastError, sync } = useSync();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <BrandHeader />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Status da rede */}
        <View style={styles.networkCard}>
          <View style={styles.rowBetween}>
            <Text style={type.headlineSm}>Status da Rede</Text>
            <Badge tone={online ? 'success' : 'danger'}>{online ? 'Online' : 'Offline'}</Badge>
          </View>

          <Text style={[type.bodyLg, styles.muted, { marginTop: spacing.xs }]}>
            Última sincronização com sucesso: {formatRelative(lastSyncAt)}
          </Text>

          <View style={[styles.rowBetween, { marginTop: spacing.md }]}>
            <Text style={type.dataMono}>Modo offline habilitado</Text>
            <Ionicons
              name={online ? 'cloud-done-outline' : 'cloud-offline-outline'}
              size={22}
              color={online ? colors.outline : semantic.warning.fg}
            />
          </View>
        </View>

        {/* Fila */}
        <View style={styles.rowBetween}>
          <Text style={type.headlineSm}>Fila de Operações</Text>
          <Badge tone={pending.length ? 'info' : 'neutral'}>
            {pending.length === 1 ? '1 item' : `${pending.length} itens`}
          </Badge>
        </View>

        {pending.length === 0 ? (
          <EmptyState
            icon="checkmark-done-outline"
            title="Tudo sincronizado"
            message="Nenhuma operação pendente. O trabalho feito em campo já chegou ao servidor."
          />
        ) : (
          <Card style={{ padding: 0 }}>
            {pending.map((entry, index) => (
              <View
                key={entry.id}
                style={[styles.queueRow, index > 0 && styles.queueRowDivider]}
              >
                <View style={styles.queueIcon}>
                  <Ionicons
                    name={operationIcon(entry.operation) as keyof typeof Ionicons.glyphMap}
                    size={18}
                    color={colors.onSurfaceVariant}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={type.bodyMdMedium}>{describeOperation(entry.operation)}</Text>
                  <Text style={[type.dataMono, styles.muted, { fontSize: 11 }]} numberOfLines={1}>
                    Inspeção {entry.operation.inspectionId.slice(0, 8)}
                  </Text>
                  {entry.lastError ? (
                    <Text style={[type.bodyMd, { color: semantic.warning.fg }]} numberOfLines={2}>
                      {entry.lastError}
                      {entry.attempts > 1 ? ` (${entry.attempts} tentativas)` : ''}
                    </Text>
                  ) : null}
                </View>

                <View
                  style={[
                    styles.queueDot,
                    { backgroundColor: entry.lastError ? semantic.danger.fg : semantic.warning.fg },
                  ]}
                />
              </View>
            ))}
          </Card>
        )}

        {lastError && pending.length === 0 ? (
          <View style={styles.warnBox}>
            <Ionicons name="information-circle-outline" size={18} color={semantic.warning.fg} />
            <Text style={[type.bodyMd, { color: semantic.warning.fg, flex: 1 }]}>{lastError}</Text>
          </View>
        ) : null}

        <Button
          title={syncing ? 'Sincronizando...' : 'Sincronizar Fila Agora'}
          icon="sync"
          onPress={() => void sync()}
          loading={syncing}
          disabled={!online || pending.length === 0}
        />

        {!online ? (
          <Text style={[type.bodyMd, styles.muted, { textAlign: 'center' }]}>
            A fila será enviada sozinha assim que a conexão voltar.
          </Text>
        ) : null}

        {/* Diagnóstico */}
        <View style={styles.diagnostics}>
          <DiagnosticRow label="Operações na fila" value={String(pending.length)} />
          <DiagnosticRow label="Servidor" value={API_HOST} />
          <DiagnosticRow label="Versão do app" value={Constants.expoConfig?.version ?? '1.0.0'} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DiagnosticRow({ label: name, value }: { label: string; value: string }) {
  return (
    <View style={styles.rowBetween}>
      <Text style={[type.dataMono, styles.muted]}>{name}</Text>
      <Text style={[type.dataMono, styles.muted]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.gutter, gap: spacing.md, paddingBottom: spacing.xl },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  muted: { color: colors.onSurfaceVariant },
  networkCard: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  queueRowDivider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  queueIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueDot: { width: 8, height: 8, borderRadius: radius.full },
  warnBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: semantic.warning.bg,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  diagnostics: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 6,
    marginTop: spacing.xs,
  },
});
