import { forwardRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, shadow, space, typography } from '../lib/theme';

export function Screen({
  children,
  scroll = false,
  style,
  ...rest
}: ViewProps & { scroll?: boolean }) {
  const Contenido = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <Contenido
        {...(scroll
          ? { contentContainerStyle: [styles.screenBody, style], keyboardShouldPersistTaps: 'handled' as const }
          : { style: [styles.screenBody, { flex: 1 }, style] })}
        {...(rest as object)}
      >
        {children}
      </Contenido>
    </SafeAreaView>
  );
}

export function Card({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.card, shadow, style]} {...rest}>
      {children}
    </View>
  );
}

type ButtonProps = Omit<PressableProps, 'children'> & {
  title: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  // Para casos puntuales (p.ej. los botones de "Detras de la barra" en Perfil)
  // que necesitan un color de texto distinto al del variant, sin crear uno
  // nuevo solo para ese sitio.
  textStyle?: StyleProp<TextStyle>;
};

export function Button({
  title,
  variant = 'primary',
  loading = false,
  disabled,
  style,
  textStyle,
  ...rest
}: ButtonProps) {
  const inactivo = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactivo, busy: loading }}
      disabled={inactivo}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${variant}`],
        pressed && !inactivo && styles.buttonPressed,
        inactivo && styles.buttonDisabled,
        typeof style === 'function' ? undefined : style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' || variant === 'ghost' ? colors.ink : colors.white} />
      ) : (
        <Text style={[styles.buttonText, styles[`buttonText_${variant}`], textStyle]}>{title}</Text>
      )}
    </Pressable>
  );
}

type FieldProps = TextInputProps & { label: string; error?: string | null; hint?: string };

export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, error, hint, style, ...rest },
  ref,
) {
  return (
    <View style={styles.field}>
      {label ? <Text style={typography.overline}>{label}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.inkFaint}
        style={[styles.input, !!error && styles.inputError, style]}
        {...rest}
      />
      {hint !== undefined && !error ? <Text style={typography.muted}>{hint}</Text> : null}
      {error ? <Text style={typography.error}>{error}</Text> : null}
    </View>
  );
});

export function Banner({ tone, children }: { tone: 'error' | 'info' | 'success'; children: string }) {
  return (
    <View style={[styles.banner, styles[`banner_${tone}`]]}>
      <Text style={[typography.body, styles.bannerText]}>{children}</Text>
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.empty}>
      <Text style={typography.sectionTitle}>{title}</Text>
      <Text style={[typography.muted, styles.emptyBody]}>{body}</Text>
    </View>
  );
}

export function Loading({ label = 'Cargando...' }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.beer} size="large" />
      <Text style={typography.muted}>{label}</Text>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  screenBody: { padding: space.lg, gap: space.lg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.md,
  },
  button: {
    minHeight: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    borderWidth: 1,
  },
  button_primary: { backgroundColor: colors.beer, borderColor: colors.beerDark },
  button_secondary: { backgroundColor: colors.card, borderColor: colors.borderStrong },
  button_ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  button_danger: { backgroundColor: colors.danger, borderColor: colors.danger },
  buttonPressed: { opacity: 0.82 },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { fontSize: 16, fontWeight: '700' },
  buttonText_primary: { color: colors.white },
  buttonText_secondary: { color: colors.ink },
  buttonText_ghost: { color: colors.beerDark },
  buttonText_danger: { color: colors.white },
  field: { gap: space.xs },
  input: {
    minHeight: 48,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: 16,
    color: colors.ink,
  },
  inputError: { borderColor: colors.danger },
  banner: { borderRadius: radius.md, padding: space.md, borderWidth: 1 },
  banner_error: { backgroundColor: colors.stampSoft, borderColor: colors.danger },
  banner_info: { backgroundColor: colors.paperDeep, borderColor: colors.border },
  banner_success: { backgroundColor: '#DCEBE1', borderColor: colors.green },
  bannerText: { fontSize: 14 },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl },
  emptyBody: { textAlign: 'center', maxWidth: 320 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
  divider: { height: 1, backgroundColor: colors.border },
});
