import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RankingRow } from '../../components/RankingRow';
import { Trophy } from '../../components/Icons';
import { Colors, FontSize, Gradients, Radius, Spacing } from '../../constants/theme';
import { fetchRanking, type RankingEntry } from '../../services/api';

const PERIODS = ['日榜', '月榜', '年榜'] as const;
type Period = typeof PERIODS[number];

const PERIOD_TO_API: Record<Period, 'daily' | 'monthly'> = {
  日榜: 'daily',
  月榜: 'monthly',
  年榜: 'monthly',
};

export function SalesStaffRankingScreen() {
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<Period>('日榜');
  const [ranking, setRanking] = useState<RankingEntry[]>([]);

  useEffect(() => {
    let active = true;
    fetchRanking(PERIOD_TO_API[period] === 'daily' ? 'daily' : 'monthly').then(
      (data) => {
        if (active) setRanking(data);
      },
    );
    return () => {
      active = false;
    };
  }, [period]);

  const me = ranking.find((r) => r.isMe);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Title with Trophy icon */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Trophy size={22} color={Colors.gold} />
          <Text style={styles.title}>积分排行榜</Text>
        </View>
      </View>

      {/* My rank highlight — gradient card */}
      {me && (
        <LinearGradient
          colors={Gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.myRankCard}
        >
          {/* Decorative circle */}
          <View style={styles.myRankCircle} />
          {/* Trophy watermark */}
          <View style={styles.myRankTrophy}>
            <Trophy size={80} color="rgba(255,255,255,0.2)" />
          </View>
          <Text style={styles.myRankLabel}>我的排名</Text>
          <View style={styles.myRankRow}>
            <Text style={styles.myRankNum}>#{me.rank}</Text>
            <View style={styles.myRankInfo}>
              <Text style={styles.myRankName}>{me.name}</Text>
              <Text style={styles.myRankOrg}>{me.org}</Text>
            </View>
            <View style={styles.myRankRight}>
              <Text style={styles.myRankPoints}>{me.points.toLocaleString()}</Text>
              <Text style={styles.myRankUnit}>积分</Text>
            </View>
          </View>
        </LinearGradient>
      )}

      {/* Period Tabs */}
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

      <FlatList
        data={ranking}
        keyExtractor={(item) => String(item.rank)}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <RankingRow
            rank={item.rank}
            name={item.name}
            org={item.org}
            points={item.points}
            isMe={item.isMe}
          />
        )}
      />
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },

  // My rank gradient card
  myRankCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    overflow: 'hidden',
  },
  myRankCircle: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.10)',
    right: -20,
    top: -30,
  },
  myRankTrophy: {
    position: 'absolute',
    right: -10,
    bottom: -10,
  },
  myRankLabel: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 8,
  },
  myRankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  myRankNum: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    color: Colors.goldLight,
    fontVariant: ['tabular-nums'],
  },
  myRankInfo: { flex: 1 },
  myRankName: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: '#fff',
  },
  myRankOrg: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  myRankRight: { alignItems: 'flex-end' },
  myRankPoints: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.goldLight,
    fontVariant: ['tabular-nums'],
  },
  myRankUnit: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 1,
  },

  // Period tabs
  periodRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
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
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
});
