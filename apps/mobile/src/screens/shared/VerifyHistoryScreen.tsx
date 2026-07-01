import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  Colors,
  FontSize,
  Radius,
  Shadow,
  Spacing,
  numericFont,
} from '../../constants/theme';
import { VerifyOrderCard } from '../../components/VerifyOrderCard';
import {
  fetchVerifyRecords,
  type VerifyRecord,
} from '../../services/api';

export function VerifyHistoryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const nav = navigation as unknown as { navigate: (n: string, p?: object) => void };
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
          <VerifyOrderCard
            record={item}
            onPress={() => nav.navigate('OrderDetail', { id: item.orderId })}
          />
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
  empty: { textAlign: 'center', padding: Spacing.xxl, color: Colors.textMuted },
});
