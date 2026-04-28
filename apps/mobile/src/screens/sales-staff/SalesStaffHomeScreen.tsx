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
import { Sparkle, Trophy, User, Check, X } from '../../components/Icons';
import {
  Colors,
  FontSize,
  Gradients,
  Radius,
  Shadow,
  Spacing,
  numericFont,
} from '../../constants/theme';
import type { MockUser } from '../../data/mock';
import {
  fetchVerifyRecords,
  fetchTodayStats,
  type VerifyRecord,
  type TodayStats,
} from '../../services/api';
import { onRealtime } from '../../services/realtime';

interface SalesStaffHomeScreenProps {
  user: MockUser;
  onScan?: () => void;
}

export function SalesStaffHomeScreen({ user }: SalesStaffHomeScreenProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const nav = navigation as unknown as { navigate: (n: string, p?: object) => void };

  const [records, setRecords] = useState<VerifyRecord[]>([]);
  const [stats, setStats] = useState<TodayStats>({
    storeVerifyCount: 0,
    myVerifyCount: 0,
    todayPoints: 0,
  });

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
    const unsub = onRealtime('writeoff.created', reload);
    return () => {
      active = false;
      unsub();
    };
  }, []);

  const myRecords = records
    .filter((r) => r.staff === user.name)
    .slice(0, 6);

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
          <Text style={styles.greeting}>你好，{user.name}</Text>
          <Text style={styles.orgName}>{user.org}</Text>
        </View>
        <TouchableOpacity activeOpacity={0.85} onPress={() => nav.navigate('Ranking')}>
          <LinearGradient
            colors={Gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.rankBadge}
          >
            <Trophy size={16} color="#fff" />
            <View>
              <Text style={styles.rankNum}>#3</Text>
              <Text style={styles.rankLabel}>今日排名</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Points Card — tap to view history */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => nav.navigate('PointsHistory')}
      >
        <View style={styles.pointsCard}>
          <LinearGradient
            colors={Gradients.gold}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.pointsLeft}
          >
            <View style={styles.sparkleWrap}>
              <Sparkle size={64} color="rgba(255,255,255,0.35)" />
            </View>
            <Text style={styles.pointsLabel}>我的积分</Text>
            <Text style={styles.pointsValue}>
              {(user.points ?? 0).toLocaleString()}
            </Text>
            <Text style={styles.pointsSubText}>点击查看变动记录</Text>
          </LinearGradient>
          <View style={styles.pointsRight}>
            <View style={styles.pointsItem}>
              <Text style={styles.pointsItemVal}>{stats.myVerifyCount}</Text>
              <Text style={styles.pointsItemLabel}>今日核销</Text>
            </View>
            <View style={styles.pointsDivider} />
            <View style={styles.pointsItem}>
              <Text style={[styles.pointsItemVal, { color: Colors.success }]}>
                +{stats.todayPoints}
              </Text>
              <Text style={styles.pointsItemLabel}>今日积分</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>

      {/* Quick Actions */}
      <View style={styles.quickCard}>
        <TouchableOpacity
          style={styles.quickItem}
          activeOpacity={0.7}
          onPress={() => nav.navigate('PointsHistory')}
        >
          <View style={[styles.quickIcon, { backgroundColor: `${Colors.gold}14` }]}>
            <Sparkle size={22} color={Colors.goldDark} />
          </View>
          <Text style={styles.quickLabel}>积分明细</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickItem}
          activeOpacity={0.7}
          onPress={() => nav.navigate('VerifyHistory')}
        >
          <View style={[styles.quickIcon, { backgroundColor: `${Colors.success}14` }]}>
            <Check size={22} color={Colors.success} />
          </View>
          <Text style={styles.quickLabel}>我的核销</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickItem}
          activeOpacity={0.7}
          onPress={() => nav.navigate('Ranking')}
        >
          <View style={[styles.quickIcon, { backgroundColor: `${Colors.primary}14` }]}>
            <Trophy size={22} color={Colors.primary} />
          </View>
          <Text style={styles.quickLabel}>排行榜</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickItem}
          activeOpacity={0.7}
          onPress={() => nav.navigate('Profile')}
        >
          <View style={[styles.quickIcon, { backgroundColor: `${Colors.info}14` }]}>
            <User size={22} color={Colors.info} />
          </View>
          <Text style={styles.quickLabel}>个人中心</Text>
        </TouchableOpacity>
      </View>

      {/* My records */}
      <SectionHeader
        title="我的核销记录"
        action="全部记录"
        onAction={() => nav.navigate('VerifyHistory')}
      />
      {myRecords.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>暂无核销记录</Text>
        </View>
      ) : (
        myRecords.map((r) => (
          <View
            key={r.id}
            style={[styles.recordRow, r.status === 'fail' && styles.recordFail]}
          >
            <View
              style={[
                styles.statusBubble,
                r.status === 'success' ? styles.bubbleSuccess : styles.bubbleFail,
              ]}
            >
              {r.status === 'success' ? (
                <Check size={14} color={Colors.success} />
              ) : (
                <X size={14} color={Colors.danger} />
              )}
            </View>
            <View style={styles.recordInfo}>
              <Text style={styles.recordName}>{r.product}</Text>
              <Text style={styles.recordTime}>{r.time}</Text>
            </View>
            {r.status === 'success' ? (
              <Text style={styles.recordPts}>+{r.pts}</Text>
            ) : (
              <Text style={styles.recordStatusErr}>核销失败</Text>
            )}
          </View>
        ))
      )}
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
  orgName: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    ...Shadow.card,
  },
  rankNum: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff' },
  rankLabel: { fontSize: 10, color: 'rgba(255,255,255,0.85)' },
  pointsCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.card,
  },
  pointsLeft: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sparkleWrap: { position: 'absolute', right: -8, bottom: -4 },
  pointsLabel: { fontSize: FontSize.sm, color: Colors.textPrimary, opacity: 0.75 },
  pointsValue: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginTop: 4,
    ...numericFont,
  },
  pointsSubText: { fontSize: FontSize.xs, color: Colors.textPrimary, opacity: 0.6, marginTop: 2 },
  pointsRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: Spacing.md,
  },
  pointsDivider: { width: 1, height: 32, backgroundColor: Colors.border },
  pointsItem: { alignItems: 'center' },
  pointsItemVal: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.primary,
    ...numericFont,
  },
  pointsItemLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
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
  recordFail: { borderLeftWidth: 3, borderLeftColor: Colors.danger },
  statusBubble: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleSuccess: { backgroundColor: Colors.successBg },
  bubbleFail: { backgroundColor: Colors.dangerBg },
  recordInfo: { flex: 1 },
  recordName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  recordTime: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  recordPts: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.goldDark, ...numericFont },
  recordStatusErr: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.danger },
});
