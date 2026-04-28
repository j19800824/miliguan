import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, FontSize, Radius, Shadow, Spacing, numericFont } from '../../constants/theme';
import { Building, Chevron } from '../../components/Icons';
import { fetchBranches, type Branch } from '../../services/api';

export function BranchListScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [list, setList] = useState<Branch[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    const data = await fetchBranches().catch(() => []);
    setList(data);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.85}
            onPress={() =>
              (navigation as unknown as { navigate: (n: string, p: object) => void }).navigate(
                'BranchDetail',
                { id: item.id, name: item.name },
              )
            }
          >
            <View style={styles.rankBubble}>
              <Text style={styles.rankNum}>{item.rank}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                核销 {item.verify.toLocaleString()} · 积分{' '}
                {item.points.toLocaleString()}
              </Text>
            </View>
            <View style={styles.right}>
              <Text style={styles.sales}>¥{item.sales}</Text>
              <Text
                style={[
                  styles.trend,
                  item.trend === 'up' ? styles.trendUp : styles.trendDown,
                ]}
              >
                {item.trend === 'up' ? '↑' : '↓'}
              </Text>
            </View>
            <Chevron size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>暂无分公司</Text>}
        ListHeaderComponent={
          <View style={styles.headerRow}>
            <Building size={20} color={Colors.primary} />
            <Text style={styles.headerText}>分公司全部排行（30 天）</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  list: { padding: Spacing.lg },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  headerText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
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
  rankBubble: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rankNum: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textSecondary, ...numericFont },
  name: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  meta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  right: { alignItems: 'flex-end', marginRight: 4 },
  sales: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, ...numericFont },
  trend: { fontSize: FontSize.sm, fontWeight: '700', marginTop: 2 },
  trendUp: { color: Colors.success },
  trendDown: { color: Colors.danger },
  empty: { textAlign: 'center', padding: Spacing.xxl, color: Colors.textMuted },
});
