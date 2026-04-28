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
import { Sparkle } from '../../components/Icons';
import {
  fetchPointsHistory,
  type PointsHistoryEntry,
} from '../../services/api';

export function PointsHistoryScreen() {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<PointsHistoryEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    const data = await fetchPointsHistory(100).catch(() => []);
    setList(data);
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

  const totalIn = list
    .filter((e) => e.direction === 'in')
    .reduce((sum, e) => sum + e.amount, 0);

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={styles.summary}>
        <Sparkle size={28} color={Colors.gold} />
        <View style={{ flex: 1, marginLeft: Spacing.md }}>
          <Text style={styles.summaryLabel}>累计回积分</Text>
          <Text style={styles.summaryValue}>+{totalIn.toLocaleString()}</Text>
        </View>
      </View>
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.product}>{item.productName}</Text>
              <Text style={styles.meta}>
                {item.time} · {item.source}
                {item.storeName ? ` · ${item.storeName}` : ''}
                {item.operator ? ` · ${item.operator}` : ''}
              </Text>
            </View>
            <Text
              style={[
                styles.amount,
                item.direction === 'in' ? styles.amountIn : styles.amountOut,
              ]}
            >
              {item.direction === 'in' ? '+' : '−'}
              {item.amount}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>暂无积分变动</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    margin: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  summaryLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  summaryValue: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    color: Colors.gold,
    marginTop: 2,
    ...numericFont,
  },
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
    ...Shadow.card,
  },
  product: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  meta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 },
  amount: { fontSize: FontSize.lg, fontWeight: '800', ...numericFont },
  amountIn: { color: Colors.success },
  amountOut: { color: Colors.danger },
  empty: { textAlign: 'center', padding: Spacing.xxl, color: Colors.textMuted },
});
