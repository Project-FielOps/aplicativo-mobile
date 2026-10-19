import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useAuth } from '../../src/auth/AuthContext';
import { useSync } from '../../src/offline/SyncContext';
import { Avatar, BrandHeader } from '../../src/components/Header';
import { Badge, Button, Card } from '../../src/components/ui';
import { API_HOST } from '../../src/api/config';
import { label } from '../../src/labels';
import { confirm } from '../../src/dialogs';
import { colors, radius, spacing } from '../../src/theme/tokens';
import { type } from '../../src/theme/typography';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { pending, online } = useSync();

  const confirmSignOut = () => {
    // Sair com fila pendente descartaria trabalho feito em campo, então o
    // aviso precisa ser explícito sobre o que se perde.
    const message =
      pending.length > 0
        ? `Você tem ${pending.length} operação(ões) ainda não enviada(s). Se sair agora, esse trabalho permanece no aparelho, mas só será enviado no próximo login.`
        : 'Deseja encerrar a sessão neste aparelho?';

    void confirm({
      title: 'Sair da conta',
      message,
      confirmText: 'Sair',
      destructive: true,
    }).then((yes) => {
      if (yes) void signOut().then(() => router.replace('/login'));
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <BrandHeader />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card style={styles.identity}>
          <Avatar size={64} />
          <Text style={[type.headlineSm, { marginTop: spacing.sm }]}>{user?.name}</Text>
          <Text style={[type.dataMono, styles.muted]}>{user?.email}</Text>
          <View style={{ marginTop: spacing.xs }}>
            <Badge tone="info">{label(user?.role)}</Badge>
          </View>
        </Card>

        <Card>
          <Text style={[type.labelCaps, { marginBottom: spacing.xs }]}>Sessão</Text>
          <Row icon="server-outline" label="Servidor" value={API_HOST} />
          <Row
            icon={online ? 'cloud-done-outline' : 'cloud-offline-outline'}
            label="Conexão"
            value={online ? 'Online' : 'Offline'}
          />
          <Row
            icon="sync-outline"
            label="Fila pendente"
            value={pending.length === 0 ? 'Vazia' : `${pending.length} operação(ões)`}
          />
          <Row icon="phone-portrait-outline" label="Versão" value={Constants.expoConfig?.version ?? '1.0.0'} />
        </Card>

        <Card>
          <Text style={[type.labelCaps, { marginBottom: spacing.xs }]}>Permissões neste perfil</Text>
          <Text style={[type.bodyMd, styles.muted]}>
            Como {label(user?.role)}, você executa inspeções atribuídas a você: iniciar, responder o
            checklist, anexar evidências, registrar não conformidades e enviar para revisão.
            Agendamento e aprovação são feitos pelo supervisor na interface administrativa.
          </Text>
        </Card>

        <Button title="Sair da conta" variant="secondary" icon="log-out-outline" onPress={confirmSignOut} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon,
  label: name,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={16} color={colors.onSurfaceVariant} />
      </View>
      <Text style={[type.bodyMd, { flex: 1 }]}>{name}</Text>
      <Text style={[type.dataMono, styles.muted]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.gutter, gap: spacing.md, paddingBottom: spacing.xl },
  identity: { alignItems: 'center', paddingVertical: spacing.lg },
  muted: { color: colors.onSurfaceVariant },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.base,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
