import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth/AuthContext';
import { HttpError, OfflineError } from '../src/api/client';
import { Button, Field, StatusDot } from '../src/components/ui';
import { colors, elevation, radius, semantic, spacing } from '../src/theme/tokens';
import { type } from '../src/theme/typography';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [hidePassword, setHidePassword] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Informe e-mail e senha.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await signIn(email, password);
      router.replace('/(tabs)');
    } catch (e) {
      if (e instanceof OfflineError) {
        setError('Sem conexão com o servidor. Verifique a rede e tente de novo.');
      } else if (e instanceof HttpError && e.status === 401) {
        setError('E-mail ou senha inválidos.');
      } else if (e instanceof HttpError) {
        setError(e.message);
      } else {
        setError('Não foi possível entrar. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Marca */}
          <View style={styles.brand}>
            <Text style={type.headlineMd}>Autenticação</Text>
            <View style={styles.statusLine}>
              <StatusDot ok />
              <Text style={type.labelCaps}>FieldOps · Precision System</Text>
            </View>
          </View>

          {/* Cartão */}
          <View style={styles.card}>
            <View style={styles.cardEdge} />

            <Field
              label="E-mail corporativo"
              placeholder="voce@empresa.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
            />

            <View>
              <Field
                label="Senha"
                placeholder="••••••••"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={hidePassword}
                autoCapitalize="none"
                textContentType="password"
                onSubmitEditing={submit}
                returnKeyType="go"
                style={{ paddingRight: 52 }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={hidePassword ? 'Mostrar senha' : 'Ocultar senha'}
                onPress={() => setHidePassword((v) => !v)}
                style={styles.eye}
                hitSlop={12}
              >
                <Ionicons
                  name={hidePassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.outline}
                />
              </Pressable>
            </View>

            {error ? (
              <View style={styles.error}>
                <Ionicons name="alert-circle-outline" size={18} color={semantic.danger.fg} />
                <Text style={[type.bodyMd, styles.errorText]}>{error}</Text>
              </View>
            ) : null}

            <Button
              title="Acessar Plataforma"
              iconRight="arrow-forward"
              onPress={submit}
              loading={loading}
              style={{ marginTop: spacing.xs }}
            />
          </View>

          <Text style={[type.bodyMd, styles.footnote]}>
            Acesso restrito a pessoal autorizado · Todas as ações são auditadas
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.gutter,
    gap: spacing.lg,
  },
  brand: { alignItems: 'center', gap: spacing.sm },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
    overflow: 'hidden',
    ...elevation.level2,
  },
  // Aresta de marca no topo do cartão, como no protótipo.
  cardEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: colors.primaryContainer,
  },
  eye: { position: 'absolute', right: spacing.md, top: 40, padding: 4 },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: semantic.danger.bg,
    borderColor: 'rgba(186, 26, 26, 0.2)',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  errorText: { color: semantic.danger.fg, flex: 1 },
  footnote: { textAlign: 'center', color: colors.onSurfaceVariant, opacity: 0.8 },
});
