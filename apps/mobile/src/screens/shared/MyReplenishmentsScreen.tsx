import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
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
import {
  fetchReplenishments,
  type ReplenishmentRow,
} from '../../services/api';
import { onRealtime } from '../../services/realtime';
import { formatDateTime } from '../../utils/format';

const STATUS_COLOR: Record<string, string> = {
  待审核: Colors.warning,
  已通过: Colors.success,
  已入库: Colors.success,
  已驳回: Colors.danger,
};

export function MyReplenishmentsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const nav = navigation as unknown as { navigate: (n: string, p?: object) => void };
  const [list, setList] = useState<ReplenishmentRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    const data = await fetchReplenishments().catch(() => []);
    setList(data);
  }, []);

  useEffect(() => {
    void reload();
    const unsubs = [
      onRealtime('replenishment.submitted', () => void reload()),
      onRealtime('replenishment.approved', () => void reload()),
    ];
    return () => unsubs.forEach((u) => u());
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
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.85}
              onPress={() => nav.navigate('ReplenishmentDetail', { id: item.id })}
            >
              <View style={styles.header}>
                <Text style={styles.orderNo}>{item.orderNo}</Text>
                <View style={[styles.badge, { backgroundColor: `${color}20` }]}>
                  <Text style={[styles.badgeText, { color }]}>{item.status}</Text>
                </View>
              </View>
              <View style={styles.detail}>
                <Text style={styles.qty}>{item.totalQty} 件</Text>
                <Text style={styles.amount}>
                  ¥{item.totalAmount.toLocaleString()}
                </Text>
              </View>
              <Text style={styles.date}>
                {formatDateTime(item.createdAt)}
              </Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>暂无进货单</Text>}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  orderNo: { fontSize: FontSize.xs, color: Colors.textMuted, fontFamily: 'monospace' },
  badge: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: FontSize.xs, fontWeight: '700' },
  detail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  qty: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary, ...numericFont },
  amount: { fontSize: FontSize.md, fontWeight: '800', color: Colors.gold, ...numericFont },
  date: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.sm },
  empty: { textAlign: 'center', padding: Spacing.xxl, color: Colors.textMuted },
});
