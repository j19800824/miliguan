import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, FontSize, Radius, Shadow, Spacing, numericFont } from '../constants/theme';
import type { VerifyRecord } from '../services/api';
import { formatDateTime, formatMoney } from '../utils/format';
import { Check, X } from './Icons';

interface Props {
  record: VerifyRecord;
  onPress?: () => void;
}

export function VerifyOrderCard({ record, onPress }: Props) {
  const success = record.status === 'success';
  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.85 : 1}
      onPress={onPress}
      style={[styles.row, !success && styles.rowFail]}
    >
      <View style={[styles.statusIcon, success ? styles.iconSuccess : styles.iconFail]}>
        {success ? <Check size={16} color={Colors.success} /> : <X size={16} color={Colors.danger} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.orderNo}>{record.orderNo}</Text>
        <Text style={styles.meta}>
          {formatMoney(record.amount)} · {formatDateTime(record.createdAt || record.time)}
        </Text>
        <Text style={styles.subMeta}>
          {record.storeName || '门店'} · {record.staff || '-'} · {record.itemCount} 件商品
        </Text>
      </View>
      {success ? (
        <View style={styles.pointsWrap}>
          <Text style={styles.pts}>+{record.pts}</Text>
          <Text style={styles.ptsLabel}>积分</Text>
        </View>
      ) : (
        <Text style={styles.failLabel}>失败</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
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
  rowFail: { borderLeftWidth: 3, borderLeftColor: Colors.danger },
  statusIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSuccess: { backgroundColor: Colors.successBg },
  iconFail: { backgroundColor: Colors.dangerBg },
  orderNo: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.textPrimary,
    fontFamily: 'monospace',
  },
  meta: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  subMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 3,
  },
  pointsWrap: { alignItems: 'flex-end' },
  pts: { fontSize: FontSize.md, fontWeight: '800', color: Colors.gold, ...numericFont },
  ptsLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  failLabel: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.danger },
});
