import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import {
  Colors,
  FontSize,
  Radius,
  Shadow,
  Spacing,
  numericFont,
} from '../../constants/theme';
import { fetchOrderDetail, type OrderDetail } from '../../services/api';
import { formatDateTime } from '../../utils/format';

interface RouteParams {
  id: string;
}

const STATUS_COLOR: Record<string, string> = {
  待审核: Colors.warning,
  已通过: Colors.success,
  已完成: Colors.success,
  已取消: Colors.danger,
  已驳回: Colors.danger,
};

export function OrderDetailScreen() {
  const route = useRoute();
  const { id } = (route.params ?? {}) as RouteParams;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchOrderDetail(id)
      .then((d) => setOrder(d))
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>订单不存在或无权查看</Text>
      </View>
    );
  }

  const color = STATUS_COLOR[order.status] ?? Colors.textSecondary;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <Text style={styles.orderNo}>{order.orderNo}</Text>
        <View style={[styles.badge, { backgroundColor: `${color}20` }]}>
          <Text style={[styles.badgeText, { color }]}>{order.status}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>客户信息</Text>
        <Row label="客户" value={order.memberName || '散客'} />
        {order.memberPhone ? (
          <Row label="电话" value={order.memberPhone} />
        ) : null}
        <Row label="销售员" value={order.salesStaffName} />
        <Row label="门店" value={order.storeName || order.companyName} />
        <Row
          label="下单时间"
          value={formatDateTime(order.createdAt)}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>商品明细 · {order.items.length} 项</Text>
        {order.items.map((it) => (
          <View key={it.id} style={styles.item}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{it.productName}</Text>
              <Text style={styles.itemSpec}>
                {it.skuCode} · {it.spec ?? ''} {it.unit ?? ''}
              </Text>
              {it.writeoffStatus ? (
                <View
                  style={[
                    styles.writeTag,
                    {
                      backgroundColor:
                        it.writeoffStatus === '已核销'
                          ? Colors.successBg
                          : Colors.bgWarm,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.writeTagText,
                      {
                        color:
                          it.writeoffStatus === '已核销'
                            ? Colors.success
                            : Colors.primary,
                      },
                    ]}
                  >
                    {it.writeoffStatus}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.itemRight}>
              <Text style={styles.qty}>×{it.quantity}</Text>
              <Text style={styles.price}>
                ¥{(it.unitPrice * it.quantity).toFixed(2)}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>订单合计</Text>
        <Text style={styles.totalValue}>
          ¥{order.totalAmount.toLocaleString()}
        </Text>
      </View>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
    ...Shadow.card,
  },
  orderNo: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    fontFamily: 'monospace',
  },
  badge: { borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  badgeText: { fontSize: FontSize.sm, fontWeight: '700' },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
    ...Shadow.card,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs + 2,
  },
  rowLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  rowValue: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: '600' },
  item: {
    flexDirection: 'row',
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    gap: Spacing.sm,
  },
  itemName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  itemSpec: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  itemRight: { alignItems: 'flex-end' },
  qty: { fontSize: FontSize.sm, color: Colors.textSecondary, ...numericFont },
  price: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, marginTop: 4, ...numericFont },
  writeTag: {
    alignSelf: 'flex-start',
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  writeTagText: { fontSize: FontSize.xs, fontWeight: '600' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Colors.bgWarm,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  totalLabel: { fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: '600' },
  totalValue: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.gold,
    ...numericFont,
  },
  empty: { fontSize: FontSize.md, color: Colors.textMuted },
});
