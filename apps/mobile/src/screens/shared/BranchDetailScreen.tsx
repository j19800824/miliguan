import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Colors, FontSize, Radius, Shadow, Spacing, numericFont } from '../../constants/theme';
import { Building } from '../../components/Icons';
import { fetchBranchSummary, type BranchSummary } from '../../services/api';

interface RouteParams {
  id: string;
  name?: string;
}

export function BranchDetailScreen() {
  const route = useRoute();
  const { id } = (route.params ?? {}) as RouteParams;
  const [summary, setSummary] = useState<BranchSummary | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchBranchSummary(id)
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [id]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Building size={32} color={Colors.primary} />
        </View>
        <View style={{ flex: 1, marginLeft: Spacing.md }}>
          <Text style={styles.name}>{summary?.name ?? '加载中...'}</Text>
          {summary?.code ? (
            <Text style={styles.code}>编号 {summary.code}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>订货额度</Text>
        <View style={styles.row}>
          <Text style={styles.label}>可用</Text>
          <Text style={[styles.value, styles.valueAccent]}>
            ¥{(summary?.availableQuota ?? 0).toLocaleString()}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>总额</Text>
          <Text style={styles.value}>
            ¥{(summary?.totalQuota ?? 0).toLocaleString()}
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{summary?.storeCount ?? 0}</Text>
          <Text style={styles.statLabel}>门店数</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>
            ¥{(summary?.salesLast30 ?? 0).toLocaleString()}
          </Text>
          <Text style={styles.statLabel}>30 天销售</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{summary?.inventoryQty ?? 0}</Text>
          <Text style={styles.statLabel}>库存总量</Text>
        </View>
        <View
          style={[
            styles.stat,
            (summary?.lowStockCount ?? 0) > 0 && styles.statWarn,
          ]}
        >
          <Text
            style={[
              styles.statValue,
              (summary?.lowStockCount ?? 0) > 0 && { color: Colors.danger },
            ]}
          >
            {summary?.lowStockCount ?? 0}
          </Text>
          <Text style={styles.statLabel}>低库存</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, gap: Spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.textPrimary },
  code: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 4 },
  section: {
    backgroundColor: Colors.surface,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm },
  label: { fontSize: FontSize.sm, color: Colors.textSecondary },
  value: { fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: '600', ...numericFont },
  valueAccent: { color: Colors.primary, fontWeight: '800' },
  statsRow: { flexDirection: 'row', gap: Spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: Colors.surface,
    padding: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    ...Shadow.card,
  },
  statWarn: { borderColor: Colors.danger, backgroundColor: Colors.dangerBg },
  statValue: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary, ...numericFont },
  statLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
});
