import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing } from '../../constants/theme';
import { VerifyOrderCard } from '../../components/VerifyOrderCard';
import { fetchMyOrders, type MeOrderRow } from '../../services/api/me-orders';

export function MyOrdersScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const nav = navigation as unknown as { navigate: (n: string, p?: object) => void };
  const [list, setList] = useState<MeOrderRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    const data = await fetchMyOrders().catch(() => []);
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
          <VerifyOrderCard
            record={{
              id: item.id,
              orderId: item.orderId,
              orderNo: item.orderNo,
              product: '核销订单',
              barcode: item.orderNo,
              time: item.createdAt,
              createdAt: item.createdAt,
              staff: '',
              status: item.status === '异常' || item.status === '已取消' ? 'fail' : 'success',
              pts: item.points,
              amount: item.totalAmount,
              itemCount: item.itemCount,
              storeName: item.storeName,
            }}
            onPress={() => nav.navigate('OrderDetail', { id: item.orderId })}
          />
        )}
        ListEmptyComponent={<Text style={styles.empty}>暂无核销订单</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  list: { padding: Spacing.lg },
  empty: { textAlign: 'center', padding: Spacing.xxl, color: Colors.textMuted },
});
