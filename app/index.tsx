import { Redirect } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '../src/auth/AuthContext';
import { colors } from '../src/theme/tokens';

/**
 * Porta de entrada: espera a restauração da sessão antes de decidir o destino,
 * senão o técnico veria um piscar da tela de login a cada abertura do app.
 */
export default function Index() {
  const { user, restoring } = useAuth();

  if (restoring) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primaryContainer} size="large" />
      </View>
    );
  }

  return <Redirect href={user ? '/(tabs)' : '/login'} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
