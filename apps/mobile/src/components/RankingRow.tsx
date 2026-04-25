import { StyleSheet, Text, View } from 'react-native';
import { Trophy } from './Icons';
import { Colors, FontSize, Radius, Shadow, Spacing } from '../constants/theme';

interface RankingRowProps {
  rank: number;
  name: string;
  org: string;
  points: number;
  isMe?: boolean;
}

const RANK_COLORS = [Colors.primary, Colors.gold, Colors.logoBrown];

export function RankingRow({ rank, name, org, points, isMe }: RankingRowProps) {
  const isTop3 = rank <= 3;
  const rankColor = isTop3 ? RANK_COLORS[rank - 1] : Colors.textSecondary;

  return (
    <View style={[styles.row, isMe && styles.rowMe]}>
      {/* Rank bubble — Trophy icon for top 3, number for rest */}
      {isTop3 ? (
        <View style={[styles.rankBubble, { backgroundColor: `${rankColor}22`, borderColor: 'transparent' }]}>
          <Trophy size={16} color={rankColor} />
        </View>
      ) : (
        <View style={[styles.rankBubble, { backgroundColor: Colors.surfaceSunken, borderColor: Colors.border }]}>
          <Text style={[styles.rankNum, { color: Colors.textSecondary }]}>
            {rank}
          </Text>
        </View>
      )}

      {/* Name + org */}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, isMe && styles.nameMe]}>{name}</Text>
          {isMe && (
            <View style={styles.meTag}>
              <Text style={styles.meTagText}>我</Text>
            </View>
          )}
        </View>
        <Text style={styles.org}>{org}</Text>
      </View>

      {/* Points */}
      <View style={styles.pointsWrap}>
        <Text style={[styles.points, isMe && styles.pointsMe]}>
          {points.toLocaleString()}
        </Text>
        <Text style={styles.unit}>积分</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  rowMe: {
    backgroundColor: Colors.bgWarm,
    borderColor: Colors.primary,
    borderWidth: 1.5,
  },
  rankBubble: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  rankNum: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  info: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  name: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  nameMe: {
    color: Colors.primary,
  },
  meTag: {
    backgroundColor: Colors.bgWarm,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  meTagText: {
    fontSize: 10,
    color: Colors.primary,
    fontWeight: '700',
  },
  org: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  pointsWrap: {
    alignItems: 'flex-end',
  },
  points: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.gold,
  },
  pointsMe: {
    color: Colors.primary,
  },
  unit: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
});
