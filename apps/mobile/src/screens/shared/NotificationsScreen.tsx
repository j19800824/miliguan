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
import { Colors, FontSize, Radius, Shadow, Spacing } from '../../constants/theme';
import { Bell } from '../../components/Icons';
import {
  fetchNotifications,
  markNotificationRead,
  type NotificationItem,
} from '../../services/api';

export function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<NotificationItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    const data = await fetchNotifications('all').catch(() => []);
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

  const handleRead = async (item: NotificationItem) => {
    if (item.status === 'read') return;
    try {
      await markNotificationRead(item.id);
      setList((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, status: 'read' } : n)),
      );
    } catch {
      /* surface only the visual state on failure */
    }
  };

  const unread = list.filter((n) => n.status === 'unread').length;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={styles.summary}>
        <Bell size={22} color={Colors.primary} />
        <Text style={styles.summaryText}>
          {unread > 0 ? `${unread} 条未读` : '已全部读完'}
        </Text>
      </View>
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => handleRead(item)}
            style={[styles.row, item.status === 'unread' && styles.rowUnread]}
          >
            {item.status === 'unread' && <View style={styles.dot} />}
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.body} numberOfLines={3}>
                {item.body}
              </Text>
              <Text style={styles.time}>
                {new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false })}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>暂无通知</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    margin: Spacing.lg,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  summaryText: { fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: '600' },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
    ...Shadow.card,
  },
  rowUnread: { borderLeftWidth: 3, borderLeftColor: Colors.primary },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    marginTop: 6,
  },
  title: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  body: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 4, lineHeight: 20 },
  time: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 6 },
  empty: { textAlign: 'center', padding: Spacing.xxl, color: Colors.textMuted },
});
