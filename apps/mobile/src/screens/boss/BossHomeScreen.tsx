import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { KpiCard } from '../../components/KpiCard';
import { SectionHeader } from '../../components/SectionHeader';
import { AlertDot, Bell, Check, Coin, Flame, Package, Sparkle } from '../../components/Icons';
import { Colors, FontSize, Radius, Shadow, Spacing } from '../../constants/theme';
import type { MockUser } from '../../data/mock';
import {
  fetchKpi,
  fetchBranches,
  type Kpi,
  type Branch,
} from '../../services/api';
import { onRealtime } from '../../services/realtime';

const PERIODS = ['日榜', '月榜', '年榜'] as const;
type Period = typeof PERIODS[number];

const RANK_COLORS = [Colors.primary, Colors.gold, Colors.logoBrown];

interface BossHomeScreenProps {
  user: MockUser;
}

export function BossHomeScreen({ user }: BossHomeScreenProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const nav = navigation as unknown as { navigate: (n: string, p?: object) => void };
  const [period, setPeriod] = useState<Period>('月榜');
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    let active = true;
    const reload = () => {
      Promise.all([fetchKpi(), fetchBranches()]).then(([k, b]) => {
        if (!active) return;
        setKpi(k);
        setBranches(b);
      });
    };
    reload();
    const unsubs = [
      onRealtime('writeoff.created', reload),
      onRealtime('purchase.approved', reload),
      onRealtime('purchase.received', reload),
      onRealtime('replenishment.submitted', reload),
      onRealtime('replenishment.approved', reload),
    ];
    return () => {
      active = false;
      unsubs.forEach((u) => u());
    };
  }, []);

  if (!kpi) return null;

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
          <Text style={styles.greeting}>你好，{user.name} 👋</Text>
          <Text style={styles.orgName}>{user.org}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.bellWrap}
            activeOpacity={0.7}
            onPress={() => nav.navigate('Notifications')}
          >
            <Bell size={20} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.pointsBadge}
            activeOpacity={0.85}
            onPress={() => nav.navigate('PointsHistory')}
          >
            <Sparkle size={14} color={Colors.goldDark} />
            <Text style={styles.pointsBadgeText}>积分</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* KPI Row 1 — tap to drill */}
      <View style={styles.kpiRow}>
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={0.85}
          onPress={() => nav.navigate('Branches')}
        >
          <KpiCard
            label="总销售额"
            labelIcon={<Coin size={12} color="rgba(255,255,255,0.85)" />}
            value={`¥${kpi.totalSales}`}
            sub={kpi.salesGrowth}
            accent
            trend="up"
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={0.85}
          onPress={() => nav.navigate('VerifyHistory')}
        >
          <KpiCard
            label="总核销量"
            labelIcon={<Check size={12} color={Colors.textSecondary} />}
            value={kpi.totalVerify}
            sub={kpi.verifyGrowth}
            trend="up"
          />
        </TouchableOpacity>
      </View>

      {/* KPI Row 2 */}
      <View style={styles.kpiRow}>
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={0.85}
          onPress={() => nav.navigate('PointsHistory')}
        >
          <KpiCard
            label="积分回调"
            labelIcon={<Sparkle size={12} color={Colors.goldDark} />}
            value={kpi.totalPoints}
            gold
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={0.85}
          onPress={() => nav.navigate('Branches')}
        >
          <KpiCard
            label="库存总量"
            labelIcon={<Package size={12} color={Colors.textSecondary} />}
            value={kpi.totalInventory}
          />
        </TouchableOpacity>
      </View>

      {/* Period Selector */}
      <View style={styles.periodRow}>
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.periodBtn, period === p && styles.periodBtnActive]}
            onPress={() => setPeriod(p)}
            activeOpacity={0.8}
          >
            <Text style={[styles.periodText, period === p && styles.periodTextActive]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Branch Ranking */}
      <SectionHeader
        title={`分公司 ${period}`}
        action="查看全部"
        onAction={() => nav.navigate('Branches')}
      />
      {branches.map((b) => {
        const isTop3 = b.rank <= 3;
        const rankColor = isTop3 ? RANK_COLORS[b.rank - 1] : Colors.textSecondary;
        return (
          <TouchableOpacity
            key={b.id}
            style={styles.branchCard}
            activeOpacity={0.85}
            onPress={() => nav.navigate('BranchDetail', { id: b.id, name: b.name })}
          >
            {/* Square rank bubble */}
            <View
              style={[
                styles.branchRank,
                isTop3
                  ? { backgroundColor: rankColor, borderColor: rankColor }
                  : { backgroundColor: Colors.surfaceSunken, borderColor: Colors.border },
              ]}
            >
              <Text style={[styles.branchRankNum, { color: isTop3 ? '#fff' : Colors.textSecondary }]}>
                {b.rank}
              </Text>
            </View>
            <View style={styles.branchInfo}>
              <Text style={styles.branchName}>{b.name}</Text>
              <View style={styles.branchStats}>
                <Check size={11} color={Colors.textSecondary} />
                <Text style={styles.branchStat}>{b.verify.toLocaleString()}</Text>
                <Text style={styles.branchStatDot}>·</Text>
                <Sparkle size={11} color={Colors.gold} />
                <Text style={[styles.branchStat, { color: Colors.gold }]}>
                  {b.points.toLocaleString()}
                </Text>
              </View>
            </View>
            <View style={styles.branchSales}>
              <Text style={styles.branchSalesValue}>¥{b.sales}</Text>
              <Text style={[styles.branchTrend, b.trend === 'up' ? styles.trendUp : styles.trendDown]}>
                {b.trend === 'up' ? '↑' : '↓'}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}

      {/* Warning Cards */}
      <SectionHeader title="库存预警" />
      <View style={[styles.warnCard, styles.warnDanger]}>
        <View style={[styles.warnIconWrap, { backgroundColor: Colors.dangerBg }]}>
          <AlertDot size={18} color={Colors.danger} />
        </View>
        <Text style={styles.warnText}>华北分公司 · 低GI免煮米 2kg 库存仅剩 86 件</Text>
      </View>
      <View style={[styles.warnCard, styles.warnWarning]}>
        <View style={[styles.warnIconWrap, { backgroundColor: Colors.warningBg }]}>
          <Flame size={18} color={Colors.warning} />
        </View>
        <Text style={styles.warnText}>西北分公司 · 核销率本月下降 18%，建议关注</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: Spacing.lg, gap: Spacing.md },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  greeting: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  orgName: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bellWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgWarm,
    borderWidth: 1,
    borderColor: Colors.gold,
  },
  pointsBadgeText: { fontSize: 12, fontWeight: '700', color: Colors.goldDark },
  kpiRow: { flexDirection: 'row', gap: Spacing.md },
  periodRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  periodBtn: { flex: 1, paddingVertical: 8, borderRadius: Radius.md, alignItems: 'center' },
  periodBtnActive: { backgroundColor: Colors.primary },
  periodText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  periodTextActive: { color: '#fff' },
  branchCard: {
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
  branchRank: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  branchRankNum: { fontSize: FontSize.sm, fontWeight: '700' },
  branchInfo: { flex: 1, marginLeft: Spacing.md },
  branchName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  branchStats: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  branchStat: { fontSize: FontSize.xs, color: Colors.textSecondary },
  branchStatDot: { fontSize: FontSize.xs, color: Colors.textMuted },
  branchSales: { alignItems: 'flex-end' },
  branchSalesValue: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  branchTrend: { fontSize: FontSize.sm, fontWeight: '700', marginTop: 2 },
  trendUp: { color: Colors.success },
  trendDown: { color: Colors.danger },
  warnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    marginBottom: Spacing.sm,
    ...Shadow.card,
    gap: Spacing.sm,
  },
  warnDanger: { borderLeftColor: Colors.danger },
  warnWarning: { borderLeftColor: Colors.warning },
  warnIconWrap: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warnText: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 20 },
});
