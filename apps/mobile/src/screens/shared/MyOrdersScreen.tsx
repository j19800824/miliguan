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
import { fetchMyOrders, type MeOrderRow } from '../../services/api/me-orders';

const STATUS_COLOR: Record<string, string> = {
  待审核: Colors.warning,
  已通过: Colors.success,
  已完成: Colors.success,
  已取消: Colors.danger,
  已驳回: Colors.danger,
};

export function MyOrdersScreen() {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<MeOrderRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    const data = await fetchMyOrders().catch(() => []);
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

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => {
          const color = STATUS_COLOR[item.status] ?? Colors.textSecondary;
          return (
            <View style={styles.row}>
              <View style={styles.head}>
                <Text style={styles.orderNo}>{item.orderNo}</Text>
                <View style={[styles.badge, { backgroundColor: `${color}20` }]}>
                  <Text style={[styles.badgeText, { color }]}>{item.status}</Text>
                </View>
              </View>
              <Text style={styles.store}>{item.storeName}</Text>
              <View style={styles.foot}>
                <Text style={styles.itemCount}>{item.itemCount} 件商品</Text>
                <Text style={styles.amount}>
                  ¥{item.totalAmount.toLocaleString()}
                </Text>
              </View>
              <Text style={styles.time}>
                {new Date(item.createdAt).toLocaleString('zh-CN', {
                  hour12: false,
                })}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>暂无订单</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  list: { padding: Spacing.lg },
  row: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
    ...Shadow.card,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  orderNo: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontFamily: 'monospace',
  },
  badge: {
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: { fontSize: FontSize.xs, fontWeight: '700' },
  store: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  foot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  itemCount: { fontSize: FontSize.sm, color: Colors.textSecondary },
  amount: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.gold,
    ...numericFont,
  },
  time: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.xs },
  empty: { textAlign: 'center', padding: Spacing.xxl, color: Colors.textMuted },
});
