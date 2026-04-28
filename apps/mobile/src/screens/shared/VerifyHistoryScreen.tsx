import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Colors,
  FontSize,
  Radius,
  Shadow,
  Spacing,
  numericFont,
} from '../../constants/theme';
import { Check, X } from '../../components/Icons';
import {
  fetchVerifyRecords,
  type VerifyRecord,
} from '../../services/api';

export function VerifyHistoryScreen() {
  const insets = useSafeAreaInsets();
  const [records, setRecords] = useState<VerifyRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    const data = await fetchVerifyRecords().catch(() => []);
    setRecords(data);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  };

  const successCount = records.filter((r) => r.status === 'success').length;
  const failCount = records.length - successCount;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: Colors.success }]}>
            {successCount}
          </Text>
          <Text style={styles.statLabel}>成功</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: Colors.danger }]}>
            {failCount}
          </Text>
          <Text style={styles.statLabel}>失败</Text>
        </View>
      </View>

      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => (
          <View style={[styles.row, item.status !== 'success' && styles.rowFail]}>
            <View
              style={[
                styles.statusIcon,
                item.status === 'success' ? styles.iconSuccess : styles.iconFail,
              ]}
            >
              {item.status === 'success' ? (
                <Check size={16} color={Colors.success} />
              ) : (
                <X size={16} color={Colors.danger} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.product}>{item.product}</Text>
              <Text style={styles.meta}>
                {item.time} · {item.staff} · {item.barcode}
              </Text>
            </View>
            {item.status === 'success' ? (
              <Text style={styles.pts}>+{item.pts}</Text>
            ) : (
              <Text style={styles.failLabel}>失败</Text>
            )}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>暂无核销记录</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    ...Shadow.card,
  },
  statValue: { fontSize: FontSize.xxl, fontWeight: '800', ...numericFont },
  statLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    ...Shadow.card,
  },
  rowFail: { borderLeftWidth: 3, borderLeftColor: Colors.danger },
  statusIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSuccess: { backgroundColor: Colors.successBg },
  iconFail: { backgroundColor: Colors.dangerBg },
  product: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  meta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  pts: { fontSize: FontSize.md, fontWeight: '700', color: Colors.gold, ...numericFont },
  failLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.danger },
  empty: { textAlign: 'center', padding: Spacing.xxl, color: Colors.textMuted },
});
