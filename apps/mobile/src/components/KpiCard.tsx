import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ArrowDown, ArrowUp } from './Icons';
import { Colors, FontSize, Radius, Shadow, Spacing } from '../constants/theme';

interface KpiCardProps {
  label: string;
  labelIcon?: ReactElement;
  value: string;
  sub?: string;
  accent?: boolean;
  gold?: boolean;
  trend?: 'up' | 'down';
}

export function KpiCard({ label, labelIcon, value, sub, accent, gold, trend }: KpiCardProps) {
  const trendColor = trend === 'up' ? Colors.success : Colors.danger;
  const trendOnAccent = 'rgba(255,255,255,0.9)';

  return (
    <View style={[styles.card, accent && styles.cardAccent, gold && styles.cardGold]}>
      <View style={styles.labelRow}>
        {labelIcon}
        <Text style={[styles.label, accent && styles.labelOnAccent]}>
          {label}
        </Text>
      </View>
      <Text style={[styles.value, accent && styles.valueOnAccent]}>
        {value}
      </Text>
      {sub ? (
        <View style={styles.subRow}>
          {trend === 'up' && (
            <ArrowUp size={11} color={accent ? trendOnAccent : trendColor} />
          )}
          {trend === 'down' && (
            <ArrowDown size={11} color={accent ? trendOnAccent : trendColor} />
          )}
          <Text
            style={[
              styles.sub,
              accent && styles.subOnAccent,
              !accent && trend === 'up' && styles.subUp,
              !accent && trend === 'down' && styles.subDown,
            ]}
          >
            {sub}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  cardAccent: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryDark,
  },
  cardGold: {
    backgroundColor: Colors.gold,
    borderColor: Colors.goldDark,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 4,
  },
  label: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  labelOnAccent: {
    color: 'rgba(255,255,255,0.85)',
  },
  value: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  valueOnAccent: {
    color: '#FFFFFF',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  sub: {
    fontSize: FontSize.xs,
    color: Colors.success,
    fontWeight: '600',
  },
  subOnAccent: {
    color: 'rgba(255,255,255,0.9)',
  },
  subUp: {
    color: Colors.success,
  },
  subDown: {
    color: Colors.danger,
  },
});
