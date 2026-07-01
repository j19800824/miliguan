import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { SectionHeader } from '../../components/SectionHeader';
import {
  Check,
  Chart,
  Clipboard,
  Package,
  Sparkle,
  Trophy,
  X,
} from '../../components/Icons';
import {
  Colors,
  FontSize,
  Gradients,
  Radius,
  Shadow,
  Spacing,
  numericFont,
} from '../../constants/theme';
import { ReplenishmentModal } from '../../components/ReplenishmentModal';
import type { MockUser } from '../../data/mock';
import {
  fetchVerifyRecords,
  fetchTodayStats,
  type VerifyRecord,
  type TodayStats,
} from '../../services/api';
import { onRealtime } from '../../services/realtime';

interface StoreManagerHomeScreenProps {
  user: MockUser;
  onScan?: () => void;
}

export function StoreManagerHomeScreen({ user }: StoreManagerHomeScreenProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const nav = navigation as unknown as { navigate: (n: string, p?: object) => void };

  const [records, setRecords] = useState<VerifyRecord[]>([]);
  const [stats, setStats] = useState<TodayStats>({
    storeVerifyCount: 0,
    myVerifyCount: 0,
    todayPoints: 0,
    totalPoints: 0,
  });
  const [showReplenishment, setShowReplenishment] = useState(false);

  useEffect(() => {
    let active = true;
    const reload = () => {
      Promise.all([fetchVerifyRecords(), fetchTodayStats()]).then(
        ([recs, st]) => {
          if (!active) return;
          setRecords(recs);
          setStats(st);
        },
      );
    };
    reload();
    const unsubs = [
      onRealtime('writeoff.created', reload),
      onRealtime('replenishment.approved', reload),
    ];
    return () => {
      active = false;
      unsubs.forEach((u) => u());
    };
  }, []);

  const recentRecords = records.slice(0, 6);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.xl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.greeting}>{user.name}</Text>
          <Text style={styles.storeName}>{user.org}</Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => nav.navigate('PointsHistory')}
        >
          <LinearGradient
            colors={Gradients.gold}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.pointsBadge}
          >
            <Sparkle size={14} color={Colors.goldDark} />
            <View style={styles.pointsTextWrap}>
              <Text style={styles.pointsNum}>
                {(stats.totalPoints ?? user.points ?? 0).toLocaleString()}
              </Text>
              <Text style={styles.pointsUnit}>积分</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Today Stats — real data */}
      <View style={styles.statsCard}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.storeVerifyCount}</Text>
          <Text style={styles.statLabel}>今日核销</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.myVerifyCount}</Text>
          <Text style={styles.statLabel}>本人核销</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: Colors.gold }]}>
            {stats.todayPoints}
          </Text>
          <Text style={styles.statLabel}>今日积分</Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickCard}>
        <TouchableOpacity
          style={styles.quickItem}
          activeOpacity={0.7}
          onPress={() => nav.navigate('Inventory')}
        >
          <View style={[styles.quickIcon, { backgroundColor: `${Colors.primary}14` }]}>
            <Package size={22} color={Colors.primary} />
          </View>
          <Text style={styles.quickLabel}>库存查询</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickItem}
          activeOpacity={0.7}
          onPress={() => setShowReplenishment(true)}
        >
          <View style={[styles.quickIcon, { backgroundColor: `${Colors.gold}14` }]}>
            <Chart size={22} color={Colors.goldDark} />
          </View>
          <Text style={styles.quickLabel}>申请进货</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickItem}
          activeOpacity={0.7}
          onPress={() => nav.navigate('MyReplenishments')}
        >
          <View style={[styles.quickIcon, { backgroundColor: `${Colors.info}14` }]}>
            <Clipboard size={22} color={Colors.info} />
          </View>
          <Text style={styles.quickLabel}>我的进货单</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickItem}
          activeOpacity={0.7}
          onPress={() => nav.navigate('VerifyHistory')}
        >
          <View style={[styles.quickIcon, { backgroundColor: `${Colors.success}14` }]}>
            <Trophy size={22} color={Colors.success} />
          </View>
          <Text style={styles.quickLabel}>全部核销</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Records */}
      <SectionHeader
        title="今日核销记录"
        action="查看全部"
        onAction={() => nav.navigate('VerifyHistory')}
      />
      {recentRecords.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>暂无核销记录</Text>
        </View>
      ) : (
        recentRecords.map((r) => (
          <View
            key={r.id}
            style={[styles.recordRow, r.status === 'fail' && styles.recordRowFail]}
          >
            <View
              style={[
                styles.recordStatus,
                r.status === 'success' ? styles.statusSuccess : styles.statusFail,
              ]}
            >
              {r.status === 'success' ? (
                <Check size={16} color={Colors.success} />
              ) : (
                <X size={16} color={Colors.danger} />
              )}
            </View>
            <View style={styles.recordInfo}>
              <Text style={styles.recordProduct}>{r.product}</Text>
              <Text style={styles.recordMeta}>
                {r.time} · {r.staff}
              </Text>
            </View>
            {r.status === 'success' ? (
              <Text style={styles.recordPts}>+{r.pts}</Text>
            ) : (
              <Text style={styles.recordFail}>核销失败</Text>
            )}
          </View>
        ))
      )}

      <ReplenishmentModal
        visible={showReplenishment}
        targetLabel="分公司"
        onClose={() => setShowReplenishment(false)}
        onSubmitted={() => setShowReplenishment(false)}
      />
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
  storeName: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    ...Shadow.card,
  },
  pointsTextWrap: { alignItems: 'center' },
  pointsNum: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.textPrimary, ...numericFont },
  pointsUnit: { fontSize: FontSize.xs, color: Colors.textPrimary, opacity: 0.7 },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    ...Shadow.card,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.primary, ...numericFont },
  statLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
  statDivider: { width: 1, backgroundColor: Colors.border },
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
  quickItem: { alignItems: 'center', gap: 6, flex: 1 },
  quickIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '500' },
  empty: { padding: Spacing.lg, alignItems: 'center' },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted },
  recordRow: {
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
  recordRowFail: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.danger,
    backgroundColor: '#FFF8F8',
  },
  recordStatus: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusSuccess: { backgroundColor: Colors.successBg },
  statusFail: { backgroundColor: Colors.dangerBg },
  recordInfo: { flex: 1 },
  recordProduct: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  recordMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  recordPts: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.gold, ...numericFont },
  recordFail: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.danger },
});
