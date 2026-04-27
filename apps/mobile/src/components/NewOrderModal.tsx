import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { fetchSkuOptions, createOrder, type SkuOption } from '../services/api/skus';
import { Colors, FontSize, Radius, Shadow, Spacing } from '../constants/theme';

interface NewOrderModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function NewOrderModal({ visible, onClose, onCreated }: NewOrderModalProps) {
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qty, setQty] = useState<string>('1');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoading(true);
    setError(null);
    fetchSkuOptions()
      .then((data) => {
        if (!active) return;
        setSkus(data);
        setSelectedId(data[0]?.id ?? null);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : '加载 SKU 失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [visible]);

  const handleSubmit = async () => {
    if (!selectedId) {
      setError('请选择 SKU');
      return;
    }
    const quantity = Number(qty);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('数量必须大于 0');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await createOrder([{ sku_id: selectedId, quantity }]);
      if (!res.ok) {
        setError(res.message ?? '下单失败');
        return;
      }
      onCreated();
      onClose();
      // reset
      setQty('1');
    } catch (err) {
      setError(err instanceof Error ? err.message : '下单失败');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedSku = skus.find((s) => s.id === selectedId);
  const totalPoints = selectedSku ? selectedSku.price * (Number(qty) || 0) : 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} testID="new-order-cancel">
            <Text style={styles.headerCancel}>取消</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>新建积分订单</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.sectionLabel}>选择 SKU</Text>
          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : skus.length === 0 ? (
            <Text style={styles.emptyText}>暂无可下单 SKU</Text>
          ) : (
            <View style={styles.skuList}>
              {skus.map((sku) => {
                const active = sku.id === selectedId;
                return (
                  <TouchableOpacity
                    key={sku.id}
                    testID={`new-order-sku-${sku.id}`}
                    style={[styles.skuRow, active && styles.skuRowActive]}
                    onPress={() => setSelectedId(sku.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.skuRadio}>
                      {active ? <View style={styles.skuRadioDot} /> : null}
                    </View>
                    <View style={styles.skuInfo}>
                      <Text
                        style={[styles.skuLabel, active && styles.skuLabelActive]}
                        numberOfLines={2}
                      >
                        {sku.label}
                      </Text>
                      <Text style={styles.skuPrice}>{sku.price.toLocaleString()} 积分/件</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>数量</Text>
          <TextInput
            testID="new-order-qty"
            style={styles.qtyInput}
            keyboardType="numeric"
            value={qty}
            onChangeText={setQty}
            editable={!submitting}
          />

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>预计消耗积分</Text>
            <Text style={styles.summaryValue}>
              {totalPoints.toLocaleString()}
            </Text>
          </View>

          {error && (
            <Text testID="new-order-error" style={styles.errorText}>
              {error}
            </Text>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            testID="new-order-submit"
            style={[
              styles.submitBtn,
              (submitting || !selectedId) && styles.submitBtnDisabled,
            ]}
            onPress={handleSubmit}
            disabled={submitting || !selectedId}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>提交订单</Text>
            )}
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  headerCancel: { fontSize: FontSize.md, color: Colors.textSecondary },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  body: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  sectionLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  loadingBox: { paddingVertical: Spacing.lg, alignItems: 'center' },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
  skuList: { gap: Spacing.sm },
  skuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  skuRowActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.bgWarm,
  },
  skuRadio: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    borderWidth: 2,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skuRadioDot: {
    width: 10,
    height: 10,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
  skuInfo: { flex: 1 },
  skuLabel: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: '500' },
  skuLabelActive: { color: Colors.primary, fontWeight: '700' },
  skuPrice: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 4,
  },
  qtyInput: {
    height: 48,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  summaryCard: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...Shadow.card,
  },
  summaryLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  summaryValue: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.gold,
  },
  errorText: {
    marginTop: Spacing.md,
    fontSize: FontSize.sm,
    color: Colors.danger,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.strong,
  },
  submitBtnDisabled: {
    backgroundColor: Colors.textMuted,
    shadowOpacity: 0,
    elevation: 0,
  },
  submitText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
});
