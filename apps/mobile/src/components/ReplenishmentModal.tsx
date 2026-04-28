import { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors, FontSize, Radius, Shadow, Spacing } from '../constants/theme';
import {
  fetchSkuOptions,
  type SkuOption,
  createReplenishment,
} from '../services/api';

interface Props {
  visible: boolean;
  targetLabel: string;
  onClose: () => void;
  onSubmitted: () => void;
}

interface CartLine {
  sku: SkuOption;
  qty: number;
}

export function ReplenishmentModal({
  visible,
  targetLabel,
  onClose,
  onSubmitted,
}: Props) {
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    fetchSkuOptions()
      .then(setSkus)
      .catch(() => setSkus([]));
    setCart({});
  }, [visible]);

  const setQty = (sku: SkuOption, raw: string) => {
    const qty = parseInt(raw, 10);
    setCart((prev) => {
      const next = { ...prev };
      if (!qty || qty <= 0) delete next[sku.id];
      else next[sku.id] = { sku, qty };
      return next;
    });
  };

  const submit = async () => {
    const items = Object.values(cart).map((c) => ({
      sku_id: c.sku.id,
      quantity: c.qty,
    }));
    if (items.length === 0) {
      Alert.alert('请填写数量');
      return;
    }
    setSubmitting(true);
    try {
      await createReplenishment(items);
      Alert.alert('已提交', '等待审核');
      onSubmitted();
    } catch (e) {
      Alert.alert('提交失败', e instanceof Error ? e.message : '未知错误');
    } finally {
      setSubmitting(false);
    }
  };

  const totalLines = Object.keys(cart).length;
  const totalQty = Object.values(cart).reduce((s, c) => s + c.qty, 0);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>向{targetLabel}进货</Text>
          <TouchableOpacity onPress={onClose} hitSlop={20}>
            <Text style={styles.close}>关闭</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={skus}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const line = cart[item.id];
            return (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.skuName} numberOfLines={2}>
                    {item.label}
                  </Text>
                  <Text style={styles.skuPrice}>
                    单价 {item.price.toFixed(2)} 元
                  </Text>
                </View>
                <TextInput
                  style={styles.qtyInput}
                  keyboardType="number-pad"
                  placeholder="0"
                  value={line ? String(line.qty) : ''}
                  onChangeText={(t) => setQty(item, t)}
                  maxLength={6}
                  testID={`qty-${item.id}`}
                />
                <Text style={styles.unit}>件</Text>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.empty}>暂无可订商品</Text>
          }
        />

        <View style={styles.footer}>
          <Text style={styles.summary}>
            {totalLines} 个 SKU · 共 {totalQty} 件
          </Text>
          <TouchableOpacity
            testID="replenishment-submit"
            style={[
              styles.submitBtn,
              (submitting || totalLines === 0) && styles.submitBtnDisabled,
            ]}
            disabled={submitting || totalLines === 0}
            onPress={submit}
            activeOpacity={0.85}
          >
            <Text style={styles.submitText}>
              {submitting ? '提交中...' : '提交申请'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  close: { fontSize: FontSize.md, color: Colors.textSecondary },
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
    gap: Spacing.sm,
    ...Shadow.card,
  },
  skuName: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  skuPrice: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  qtyInput: {
    width: 70,
    height: 40,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    textAlign: 'center',
    fontSize: FontSize.md,
    color: Colors.textPrimary,
  },
  unit: { fontSize: FontSize.xs, color: Colors.textMuted, width: 24 },
  empty: {
    textAlign: 'center',
    padding: Spacing.xl,
    color: Colors.textMuted,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  summary: { fontSize: FontSize.sm, color: Colors.textSecondary },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    ...Shadow.card,
  },
  submitBtnDisabled: {
    backgroundColor: Colors.textMuted,
    shadowOpacity: 0,
  },
  submitText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
});
