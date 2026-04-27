import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KpiCard } from '../../components/KpiCard';
import { SectionHeader } from '../../components/SectionHeader';
import type { ReactElement } from 'react';
import {
  AlertDot, Bell, Chart, Check, Chevron, Clipboard, Coin,
  Package, Sparkle, Store, Users, Wallet,
} from '../../components/Icons';
import { Colors, FontSize, Gradients, Radius, Shadow, Spacing } from '../../constants/theme';
import type { MockUser } from '../../data/mock';
import {
  fetchInventory,
  fetchStores,
  type InventoryItem,
  type StoreItem,
} from '../../services/api';
import { onRealtime } from '../../services/realtime';

interface BranchGMHomeScreenProps {
  user: MockUser;
}

interface QuickAction {
  IconComp: (props: { size?: number; color?: string }) => ReactElement;
  label: string;
  color: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { IconComp: Package,   label: '积分下单', color: '#E8520B' },
  { IconComp: Chart,     label: '库存查询', color: '#F5A827' },
  { IconComp: Clipboard, label: '订单跟踪', color: '#3B82F6' },
  { IconComp: Users,     label: '门店管理', color: '#22C55E' },
];

export function BranchGMHomeScreen({ user }: BranchGMHomeScreenProps) {
  const insets = useSafeAreaInsets();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [stores, setStores] = useState<StoreItem[]>([]);

  useEffect(() => {
    let active = true;
    const reload = () => {
      Promise.all([fetchInventory(), fetchStores()]).then(([inv, st]) => {
        if (!active) return;
        setInventory(inv);
        setStores(st);
      });
    };
    reload();
    const unsubs = [
      onRealtime('writeoff.created', reload),
      onRealtime('purchase.received', reload),
      onRealtime('inventory.warning', reload),
    ];
    return () => {
      active = false;
      unsubs.forEach((u) => u());
    };
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.xl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Top Bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.greeting}>你好，{user.name}</Text>
          <Text style={styles.org}>{user.org}</Text>
        </View>
        {/* Alert badge with Bell icon */}
        <TouchableOpacity style={styles.alertBadge} activeOpacity={0.7}>
          <Bell size={13} color={Colors.primary} />
          <Text style={styles.alertText}>2 待审核</Text>
        </TouchableOpacity>
      </View>

      {/* Points Balance Card — LinearGradient */}
      <LinearGradient
        colors={Gradients.primary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.pointsCard}
      >
        {/* Decorative circles */}
        <View style={styles.decorCircle1} />
        {/* Sparkle watermark */}
        <View style={styles.decorSparkle}>
          <Sparkle size={40} color="rgba(255,255,255,0.25)" />
        </View>

        {/* Content */}
        <View style={styles.pointsContent}>
          <View style={styles.pointsLeft}>
            <View style={styles.pointsLabelRow}>
              <Wallet size={14} color="rgba(255,255,255,0.85)" />
              <Text style={styles.pointsLabel}>可用积分余额</Text>
            </View>
            <Text style={styles.pointsValue}>{(user.points ?? 0).toLocaleString()}</Text>
            <Text style={styles.pointsSub}>本月消耗 23,500 · 回调 8,200</Text>
          </View>
          <TouchableOpacity style={styles.orderBtn} activeOpacity={0.85}>
            <Package size={14} color={Colors.textPrimary} />
            <Text style={styles.orderBtnText}>立即下单</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Quick Actions — SVG icons with per-color tinted bg */}
      <View style={styles.quickCard}>
        {QUICK_ACTIONS.map(({ IconComp, label, color }) => (
          <TouchableOpacity key={label} style={styles.quickItem} activeOpacity={0.7}>
            <View style={[styles.quickIcon, { backgroundColor: `${color}14` }]}>
              <IconComp size={22} color={color} />
            </View>
            <Text style={styles.quickLabel}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* KPI */}
      <View style={styles.kpiRow}>
        <KpiCard
          label="本月核销量"
          labelIcon={<Check size={12} color={Colors.textSecondary} />}
          value="4,820"
          sub="+11.2%"
          trend="up"
        />
        <KpiCard
          label="本月销售额"
          labelIcon={<Coin size={12} color={Colors.textSecondary} />}
          value="¥38.6万"
        />
      </View>

      {/* Inventory */}
      <SectionHeader title="库存概览" action="查看详情" />
      {inventory.map((inv) => (
        <View
          key={inv.sku}
          style={[styles.invRow, inv.warn && styles.invRowWarn]}
        >
          {/* Package icon in tinted container */}
          <View style={[styles.invIcon, { backgroundColor: inv.warn ? Colors.dangerBg : Colors.surfaceSunken }]}>
            <Package size={18} color={inv.warn ? Colors.danger : Colors.primary} />
          </View>
          <View style={styles.invInfo}>
            <Text style={styles.invName}>{inv.sku}</Text>
            {inv.warn && (
              <View style={styles.invWarnTag}>
                <AlertDot size={10} color={Colors.danger} />
                <Text style={styles.invWarnTagText}>库存预警</Text>
              </View>
            )}
          </View>
          <Text style={[styles.invStock, inv.warn && styles.invStockWarn]}>
            {inv.stock.toLocaleString()}{' '}
            <Text style={styles.invStockUnit}>件</Text>
          </Text>
        </View>
      ))}

      {/* Stores */}
      <SectionHeader title="门店状态" action="管理门店" />
      {stores.map((s) => (
        <View key={s.id} style={styles.storeRow}>
          {/* Store SVG icon in semantic-colored container */}
          <View style={[
            styles.storeIconWrap,
            { backgroundColor: s.status === 'warn' ? Colors.warningBg : Colors.successBg },
          ]}>
            <Store size={18} color={s.status === 'warn' ? Colors.warning : Colors.success} />
          </View>
          <View style={styles.storeInfo}>
            <Text style={styles.storeName}>{s.name}</Text>
            <Text style={styles.storeManager}>店长 · {s.manager}</Text>
          </View>
          <View style={styles.storeRight}>
            <Text style={[styles.storeVerify, s.status === 'warn' && { color: Colors.warning }]}>
              {s.verify}
            </Text>
            <Text style={styles.storeVerifyLabel}>今日核销</Text>
          </View>
          <Chevron size={16} color={Colors.textMuted} />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: Spacing.lg, gap: Spacing.md },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  greeting: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  org: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  alertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.bgWarm,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  alertText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '700' },

  // Points card (gradient)
  pointsCard: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    overflow: 'hidden',
    ...Shadow.strong,
  },
  decorCircle1: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -40,
    right: -30,
  },
  decorSparkle: {
    position: 'absolute',
    right: 20,
    top: 20,
  },
  pointsContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pointsLeft: { flex: 1 },
  pointsLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  pointsLabel: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.85)' },
  pointsValue: {
    fontSize: 34,
    fontWeight: '800',
    color: '#fff',
    marginVertical: 4,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  pointsSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.75)' },
  orderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.gold,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    ...Shadow.card,
  },
  orderBtnText: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: 0.3,
  },

  // Quick actions
  quickCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  quickItem: { alignItems: 'center', gap: 6 },
  quickIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '500' },
  kpiRow: { flexDirection: 'row', gap: Spacing.md },

  // Inventory rows
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
  invRowWarn: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.danger,
  },
  invIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invInfo: { flex: 1, flexDirection: 'column', gap: 3 },
  invName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  invWarnTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    backgroundColor: Colors.dangerBg,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  invWarnTagText: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    fontWeight: '600',
  },
  invStock: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
  invStockWarn: { color: Colors.danger },
  invStockUnit: { fontSize: FontSize.xs, fontWeight: '500', color: Colors.textMuted },

  // Store rows
  storeRow: {
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
  storeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeInfo: { flex: 1 },
  storeName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  storeManager: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  storeRight: { alignItems: 'flex-end', marginRight: 4 },
  storeVerify: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
  storeVerifyLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
});
