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
import {
  fetchReplenishmentDetail,
  type ReplenishmentDetail,
} from '../../services/api';

interface RouteParams {
  id: string;
}

const STATUS_COLOR: Record<string, string> = {
  待审核: Colors.warning,
  待入库: Colors.warning,
  已通过: Colors.success,
  已入库: Colors.success,
  已驳回: Colors.danger,
};

export function ReplenishmentDetailScreen() {
  const route = useRoute();
  const { id } = (route.params ?? {}) as RouteParams;
  const [detail, setDetail] = useState<ReplenishmentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchReplenishmentDetail(id)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>进货单不存在或无权查看</Text>
      </View>
    );
  }

  const color = STATUS_COLOR[detail.status] ?? Colors.textSecondary;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.orderNo}>{detail.orderNo}</Text>
          <Text style={styles.routeText}>
            {detail.storeName
              ? `${detail.storeName} 向 ${detail.companyName} 进货`
              : `${detail.companyName} 向总部进货`}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: `${color}20` }]}>
          <Text style={[styles.badgeText, { color }]}>{detail.status}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>进货概况</Text>
        <InfoRow label="审核状态" value={detail.approvalStatus} />
        <InfoRow label="库存入库" value={detail.stockReceived ? '已入库' : '未入库'} />
        <InfoRow label="订货额扣减" value={detail.quotaDeducted ? '已扣减' : '未扣减'} />
        <InfoRow label="订货额消耗" value={detail.totalAmount.toLocaleString()} />
        <InfoRow label="商品数量" value={`${detail.totalQty} 件`} />
        <InfoRow label="创建时间" value={detail.createdAt || '-'} />
        {detail.remark ? <InfoRow label="备注" value={detail.remark} /> : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>进货明细 · {detail.items.length} 项</Text>
        {detail.items.map((item) => (
          <View key={item.id} style={styles.item}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.productName}</Text>
              <Text style={styles.itemMeta}>
                {item.skuCode} · {item.spec || '默认规格'}
              </Text>
            </View>
            <View style={styles.itemRight}>
              <Text style={styles.qty}>×{item.quantity}</Text>
              <Text style={styles.subtotal}>{item.subtotal.toLocaleString()}</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, gap: Spacing.md },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  orderNo: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.textPrimary,
    fontFamily: 'monospace',
  },
  routeText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  badge: { borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  badgeText: { fontSize: FontSize.sm, fontWeight: '700' },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: 6,
  },
  infoLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  item: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  itemName: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  itemMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 3 },
  itemRight: { alignItems: 'flex-end' },
  qty: { fontSize: FontSize.sm, color: Colors.textSecondary, ...numericFont },
  subtotal: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.gold,
    marginTop: 4,
    ...numericFont,
  },
  empty: { fontSize: FontSize.md, color: Colors.textMuted },
});
