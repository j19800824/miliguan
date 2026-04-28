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
import { Chevron, Store } from '../../components/Icons';
import { fetchStores, type StoreItem } from '../../services/api';

export function StoresScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [list, setList] = useState<StoreItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    const data = await fetchStores().catch(() => []);
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
                'StoreDetail',
                { id: item.id, name: item.name },
              )
            }
          >
            <View
              style={[
                styles.iconWrap,
                {
                  backgroundColor:
                    item.status === 'warn' ? Colors.warningBg : Colors.successBg,
                },
              ]}
            >
              <Store
                size={20}
                color={item.status === 'warn' ? Colors.warning : Colors.success}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>店长 · {item.manager}</Text>
            </View>
            <View style={styles.right}>
              <Text style={[styles.verify, item.status === 'warn' && { color: Colors.warning }]}>
                {item.verify}
              </Text>
              <Text style={styles.verifyLabel}>今日核销</Text>
            </View>
            <Chevron size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>暂无门店</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  list: { padding: Spacing.lg },
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
  iconWrap: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  meta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  right: { alignItems: 'flex-end', marginRight: 4 },
  verify: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, ...numericFont },
  verifyLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  empty: { textAlign: 'center', padding: Spacing.xxl, color: Colors.textMuted },
});
