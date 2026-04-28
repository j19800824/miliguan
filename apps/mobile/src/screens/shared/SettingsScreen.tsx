import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  Colors,
  FontSize,
  Radius,
  Shadow,
  Spacing,
} from '../../constants/theme';
import { Chevron, Settings as SettingsIcon } from '../../components/Icons';

interface Row {
  label: string;
  value?: string;
  onPress?: () => void;
}

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const nav = navigation as unknown as { navigate: (n: string) => void };

  const rows: Row[] = [
    {
      label: '修改密码',
      onPress: () => nav.navigate('ChangePassword'),
    },
    {
      label: '清除缓存',
      onPress: () => Alert.alert('已清除', '应用缓存已清空'),
    },
    {
      label: '版本',
      value: 'v1.0.0',
    },
    {
      label: '关于米粒冠',
      onPress: () =>
        Alert.alert('米粒冠', '选米做饭 · 就选米粒冠\n\n© 2026 米粒冠'),
    },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.lg }]}
    >
      <View style={styles.header}>
        <SettingsIcon size={28} color={Colors.primary} />
        <Text style={styles.headerText}>账号与应用设置</Text>
      </View>

      <View style={styles.card}>
        {rows.map((row, i) => (
          <TouchableOpacity
            key={row.label}
            style={[
              styles.row,
              i < rows.length - 1 && styles.rowBorder,
            ]}
            disabled={!row.onPress}
            activeOpacity={row.onPress ? 0.7 : 1}
            onPress={row.onPress}
          >
            <Text style={styles.label}>{row.label}</Text>
            {row.value ? (
              <Text style={styles.value}>{row.value}</Text>
            ) : (
              <Chevron size={18} color={Colors.textMuted} />
            )}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  headerText: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  label: { fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: '600' },
  value: { fontSize: FontSize.sm, color: Colors.textMuted },
});
