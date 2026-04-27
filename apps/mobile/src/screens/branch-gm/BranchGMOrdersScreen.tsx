import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, Radius, Shadow, Spacing } from '../../constants/theme';
import { fetchOrders, type Order } from '../../services/api';
import { NewOrderModal } from '../../components/NewOrderModal';

const TABS = ['全部', '待确认', '已完成'] as const;
type Tab = typeof TABS[number];

const STATUS_COLOR: Record<string, string> = {
  已完成: Colors.success,
  待确认: Colors.warning,
  已取消: Colors.danger,
};

export function BranchGMOrdersScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('全部');
  const [orders, setOrders] = useState<Order[]>([]);
  const [modalVisible, setModalVisible] = useState(false);

  const reload = useCallback(() => {
    let active = true;
    fetchOrders().then((data) => {
      if (active) setOrders(data);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return reload();
  }, [reload]);

  const filtered = tab === '全部' ? orders : orders.filter((o) => o.status === tab);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>积分订单</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={styles.orderCard}>
            <View style={styles.orderHeader}>
              <Text style={styles.orderId}>{item.id}</Text>
              <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLOR[item.status]}20` }]}>
                <Text style={[styles.statusText, { color: STATUS_COLOR[item.status] }]}>
                  {item.status}
                </Text>
              </View>
            </View>
            <View style={styles.orderBody}>
              <Text style={styles.skuText}>{item.sku}</Text>
              <Text style={styles.qtyText}>×{item.qty}</Text>
            </View>
            <View style={styles.orderFooter}>
              <Text style={styles.dateText}>{item.date}</Text>
              <View style={styles.pointsRow}>
                <Text style={styles.pointsLabel}>消耗积分</Text>
                <Text style={styles.pointsValue}>{item.points.toLocaleString()}</Text>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>暂无订单</Text>
          </View>
        }
      />

      <NewOrderModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onCreated={reload}
      />

      {/* New Order Button */}
      <View style={[styles.fab, { bottom: insets.bottom + Spacing.lg }]}>
        <TouchableOpacity
          testID="new-order-fab"
          style={styles.fabBtn}
          activeOpacity={0.85}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.fabText}>+ 新建积分订单</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  tabTextActive: { color: '#fff' },
  list: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 100,
    gap: Spacing.md,
  },
  orderCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  orderId: { fontSize: FontSize.xs, color: Colors.textMuted, fontFamily: 'monospace' },
  statusBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusText: { fontSize: FontSize.xs, fontWeight: '700' },
  orderBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  skuText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  qtyText: { fontSize: FontSize.md, color: Colors.textSecondary },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  dateText: { fontSize: FontSize.xs, color: Colors.textMuted },
  pointsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pointsLabel: { fontSize: FontSize.xs, color: Colors.textSecondary },
  pointsValue: { fontSize: FontSize.md, fontWeight: '800', color: Colors.gold },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: FontSize.md, color: Colors.textMuted },
  fab: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
  },
  fabBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.strong,
  },
  fabText: { fontSize: FontSize.md, fontWeight: '700', color: '#fff' },
});
