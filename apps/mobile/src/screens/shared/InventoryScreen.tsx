import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
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
import { Package, AlertDot } from '../../components/Icons';
import {
  fetchStoreInventory,
  fetchInventory,
  fetchReplenishments,
  fetchPendingReplenishments,
  approveReplenishment,
  type StoreInventoryItem,
  type InventoryItem,
  type ReplenishmentRow,
  type PendingReplenishment,
} from '../../services/api';
import { onRealtime } from '../../services/realtime';
import { ReplenishmentModal } from '../../components/ReplenishmentModal';
import type { MockUser } from '../../data/mock';

interface Props {
  user: MockUser & { storeId?: string; companyId?: string };
}

interface InventoryRow {
  id: string;
  productName: string;
  spec: string;
  unit: string;
  quantity: number;
  warn: boolean;
}

function adaptStoreRow(item: StoreInventoryItem): InventoryRow {
  return {
    id: item.id,
    productName: item.productName,
    spec: item.spec ?? '',
    unit: item.unit ?? '件',
    quantity: item.quantity,
    warn: item.warn,
  };
}

function adaptCompanyRow(item: InventoryItem, idx: number): InventoryRow {
  return {
    id: `${item.sku}-${idx}`,
    productName: item.sku,
    spec: '',
    unit: '件',
    quantity: item.stock,
    warn: item.warn,
  };
}

export function InventoryScreen({ user }: Props) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const nav = navigation as unknown as { navigate: (n: string, p?: object) => void };
  const isStore = Boolean(user.storeId);

  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [myReplenishments, setMyReplenishments] = useState<ReplenishmentRow[]>([]);
  const [pendingFromStores, setPendingFromStores] = useState<PendingReplenishment[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    if (isStore) {
      const [inv, my] = await Promise.all([
        fetchStoreInventory(),
        fetchReplenishments(),
      ]);
      setRows(inv.map(adaptStoreRow));
      setMyReplenishments(my);
      setPendingFromStores([]);
    } else {
      const [inv, my, pending] = await Promise.all([
        fetchInventory(),
        fetchReplenishments(),
        fetchPendingReplenishments(),
      ]);
      setRows(inv.map(adaptCompanyRow));
      setMyReplenishments(my);
      setPendingFromStores(pending);
    }
  }, [isStore]);

  useEffect(() => {
    void reload();
    const unsubs = [
      onRealtime('replenishment.submitted', () => void reload()),
      onRealtime('replenishment.approved', () => void reload()),
      onRealtime('inventory.warning', () => void reload()),
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

  const handleApprove = async (
    item: PendingReplenishment,
    decision: '通过' | '驳回',
  ) => {
    try {
      await approveReplenishment(item.id, decision);
      await reload();
    } catch (e) {
      Alert.alert('审核失败', e instanceof Error ? e.message : '未知错误');
    }
  };

  const outOfStockCount = rows.filter((r) => r.quantity === 0).length;
  const lowCount = rows.filter((r) => r.warn && r.quantity > 0).length;
  const pendingCount = myReplenishments.filter(
    (r) => r.status === '待审核',
  ).length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{isStore ? '门店库存' : '分公司库存'}</Text>
        <TouchableOpacity
          testID="replenishment-create"
          style={styles.createBtn}
          onPress={() => setShowModal(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.createBtnText}>
            {isStore ? '+ 向分公司进货' : '+ 向总部进货'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{rows.length}</Text>
          <Text style={styles.statLabel}>SKU 总数</Text>
        </View>
        <View style={[styles.statCard, lowCount > 0 && styles.statCardWarn]}>
          <Text style={[styles.statValue, lowCount > 0 && styles.statValueWarn]}>
            {lowCount}
          </Text>
          <Text style={styles.statLabel}>低库存</Text>
          <Text style={styles.statHint}>
            {outOfStockCount > 0 ? `${outOfStockCount} 个缺货` : '按预警库存判断'}
          </Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{pendingCount}</Text>
          <Text style={styles.statLabel}>待审请求</Text>
        </View>
      </View>

      {!isStore && pendingFromStores.length > 0 && (
        <View style={styles.pendingSection}>
          <Text style={styles.sectionTitle}>待审核 · 门店补货请求</Text>
          {pendingFromStores.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.pendingCard}
              activeOpacity={0.85}
              onPress={() => nav.navigate('ReplenishmentDetail', { id: p.id })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.pendingStore}>{p.storeName}</Text>
                <Text style={styles.pendingMeta}>
                  {p.orderNo} · {p.totalQty} 件
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionApprove]}
                onPress={(event) => {
                  event.stopPropagation();
                  void handleApprove(p, '通过');
                }}
                testID={`approve-${p.id}`}
              >
                <Text style={styles.actionApproveText}>通过</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionReject]}
                onPress={(event) => {
                  event.stopPropagation();
                  void handleApprove(p, '驳回');
                }}
                testID={`reject-${p.id}`}
              >
                <Text style={styles.actionRejectText}>驳回</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => (
          <View style={[styles.invRow, item.warn && styles.invRowWarn]}>
            <View
              style={[
                styles.invIcon,
                {
                  backgroundColor: item.warn
                    ? Colors.dangerBg
                    : Colors.surfaceSunken,
                },
              ]}
            >
              <Package
                size={18}
                color={item.warn ? Colors.danger : Colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.invName}>{item.productName}</Text>
              {item.spec ? (
                <Text style={styles.invSpec}>{item.spec}</Text>
              ) : null}
              {item.quantity === 0 ? (
                <View style={styles.warnTag}>
                  <AlertDot size={10} color={Colors.danger} />
                  <Text style={styles.warnTagText}>缺货</Text>
                </View>
              ) : item.warn ? (
                <View style={styles.warnTag}>
                  <AlertDot size={10} color={Colors.danger} />
                  <Text style={styles.warnTagText}>低于预警库存</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.invQty, item.warn && styles.invQtyWarn]}>
              {item.quantity} <Text style={styles.invUnit}>{item.unit}</Text>
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>暂无库存数据</Text>
        }
      />

      <ReplenishmentModal
        visible={showModal}
        targetLabel={isStore ? '分公司' : '总部'}
        onClose={() => setShowModal(false)}
        onSubmitted={async () => {
          setShowModal(false);
          await reload();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  createBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    ...Shadow.card,
  },
  createBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
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
  statCardWarn: { borderColor: Colors.danger, backgroundColor: Colors.dangerBg },
  statValue: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.textPrimary,
    ...numericFont,
  },
  statValueWarn: { color: Colors.danger },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statHint: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  pendingSection: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.warning,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
    ...Shadow.card,
  },
  pendingStore: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  pendingMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  actionBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  actionApprove: { backgroundColor: Colors.primary },
  actionReject: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  actionApproveText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  actionRejectText: {
    color: Colors.danger,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  invRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
    ...Shadow.card,
  },
  invRowWarn: { borderLeftWidth: 3, borderLeftColor: Colors.danger },
  invIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invName: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  invSpec: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  warnTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    backgroundColor: Colors.dangerBg,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  warnTagText: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    fontWeight: '600',
  },
  invQty: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    ...numericFont,
  },
  invQtyWarn: { color: Colors.danger },
  invUnit: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    color: Colors.textMuted,
  },
  empty: {
    textAlign: 'center',
    padding: Spacing.xl,
    color: Colors.textMuted,
  },
});
