import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import {
  Colors,
  FontSize,
  Radius,
  Shadow,
  Spacing,
  numericFont,
} from '../../constants/theme';
import { Check, Sparkle } from '../../components/Icons';
import {
  createPayment,
  fetchPayment,
  mockPay,
  type CreatePaymentResponse,
  type PaymentDetail,
} from '../../services/api/payments';
import { onRealtime } from '../../services/realtime';

interface RouteParams {
  writeoffId?: string;
  productName?: string;
  amount?: number;
}

const POLL_INTERVAL_MS = 3_000;
const COUNTDOWN_SECONDS = 5 * 60;

const RECIPIENT_LABEL: Record<string, string> = {
  hq: '总部',
  company: '分公司',
  store: '门店',
  sales_staff: '销售员',
};

export function PaymentScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const nav = navigation as unknown as { goBack: () => void };
  const route = useRoute();
  const params = (route.params ?? {}) as RouteParams;

  const [creating, setCreating] = useState(true);
  const [payment, setPayment] = useState<CreatePaymentResponse | null>(null);
  const [detail, setDetail] = useState<PaymentDetail | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mockSubmitting, setMockSubmitting] = useState(false);
  const stoppedRef = useRef(false);

  const reloadDetail = useCallback(async (id: string) => {
    try {
      const d = await fetchPayment(id);
      setDetail(d);
      if (d.status === '已支付' || d.status === '已分账') {
        stoppedRef.current = true;
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '查询失败');
    }
  }, []);

  // 1. Create payment on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await createPayment({
          sourceType: params.writeoffId ? 'writeoff' : 'standalone',
          sourceId: params.writeoffId,
          amount: params.amount,
          subject: params.productName ?? '米粒冠门店核销',
        });
        if (cancelled) return;
        setPayment(res);
        // First detail load
        await reloadDetail(res.id);
      } catch (e) {
        if (!cancelled) {
          setErrorMsg(e instanceof Error ? e.message : '创建支付失败');
        }
      } finally {
        if (!cancelled) setCreating(false);
      }
    })();
    return () => {
      cancelled = true;
      stoppedRef.current = true;
    };
  }, [params.writeoffId, params.amount, params.productName, reloadDetail]);

  // 2. Poll while pending.
  useEffect(() => {
    if (!payment || stoppedRef.current) return;
    const t = setInterval(() => {
      if (stoppedRef.current) {
        clearInterval(t);
        return;
      }
      void reloadDetail(payment.id);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [payment, reloadDetail]);

  // 3. Realtime "payment.success" — flips us to success state immediately.
  useEffect(() => {
    if (!payment) return;
    const unsub = onRealtime('payment.success', (event) => {
      const data = event.data as { orderId?: string } | undefined;
      if (data?.orderId === payment.id) {
        stoppedRef.current = true;
        void reloadDetail(payment.id);
      }
    });
    return () => unsub();
  }, [payment, reloadDetail]);

  // 4. Countdown.
  useEffect(() => {
    if (!payment || detail?.status === '已支付' || detail?.status === '已分账') {
      return;
    }
    const t = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [payment, detail?.status]);

  const handleMockPay = async () => {
    if (!payment) return;
    setMockSubmitting(true);
    try {
      await mockPay(payment.id);
      await reloadDetail(payment.id);
    } catch (e) {
      Alert.alert('模拟支付失败', e instanceof Error ? e.message : '');
    } finally {
      setMockSubmitting(false);
    }
  };

  if (creating || !payment) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>正在生成支付订单...</Text>
        {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}
      </View>
    );
  }

  const paid =
    detail?.status === '已支付' ||
    detail?.status === '已分账' ||
    detail?.paidAt != null;

  if (paid && detail) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing.lg },
        ]}
      >
        <View style={styles.successBadge}>
          <View style={styles.successIcon}>
            <Check size={32} color="#fff" />
          </View>
          <Text style={styles.successTitle}>支付完成</Text>
          <Text style={styles.successAmount}>
            实收 ¥{detail.paidAmount.toFixed(2)}
          </Text>
          <Text style={styles.orderNo}>{detail.orderNo}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Sparkle size={16} color={Colors.gold} />
            <Text style={styles.cardTitle}>分账明细</Text>
          </View>
          {detail.splits.length === 0 ? (
            <Text style={styles.empty}>暂无分账记录</Text>
          ) : (
            detail.splits.map((s) => (
              <View key={s.id} style={styles.splitRow}>
                <Text style={styles.splitLabel}>
                  {RECIPIENT_LABEL[s.recipientType] ?? s.recipientType}
                </Text>
                <Text style={styles.splitAmount}>
                  ¥{s.amount.toFixed(2)}
                </Text>
              </View>
            ))
          )}
        </View>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => nav.goBack()}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>完成</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // Pending state — show QR + countdown.
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + Spacing.lg },
      ]}
    >
      <View style={styles.amountCard}>
        <Text style={styles.amountLabel}>应付金额</Text>
        <Text style={styles.amountValue}>¥{payment.amount.toFixed(2)}</Text>
        {params.productName ? (
          <Text style={styles.productName}>{params.productName}</Text>
        ) : null}
      </View>

      <View style={styles.qrCard}>
        {payment.mockMode ? (
          <View style={styles.mockBadge}>
            <Text style={styles.mockBadgeText}>演示模式</Text>
            <Text style={styles.mockBadgeSub}>
              收钱吧未配置，点击下方按钮模拟付款成功
            </Text>
          </View>
        ) : (
          <>
            <QRCode value={payment.qrCode} size={220} />
            <Text style={styles.qrHint}>请客户用微信 / 支付宝扫码付款</Text>
          </>
        )}
        <Text style={styles.countdown}>
          倒计时 {Math.floor(secondsLeft / 60)}:
          {String(secondsLeft % 60).padStart(2, '0')}
        </Text>
      </View>

      {payment.mockMode && (
        <TouchableOpacity
          style={[styles.primaryBtn, mockSubmitting && styles.btnDisabled]}
          onPress={handleMockPay}
          disabled={mockSubmitting}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>
            {mockSubmitting ? '处理中...' : '模拟付款成功'}
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.ghostBtn}
        onPress={() => nav.goBack()}
        activeOpacity={0.85}
      >
        <Text style={styles.ghostBtnText}>关闭订单</Text>
      </TouchableOpacity>

      <Text style={styles.orderNoFooter}>订单号 {payment.orderNo}</Text>
      {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.lg, gap: Spacing.md },
  loadingText: {
    marginTop: Spacing.md,
    color: Colors.textSecondary,
    fontSize: FontSize.md,
  },
  error: {
    color: Colors.danger,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginTop: Spacing.md,
  },

  amountCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  amountLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  amountValue: {
    fontSize: 44,
    fontWeight: '800',
    color: Colors.primary,
    marginTop: 4,
    ...numericFont,
  },
  productName: {
    marginTop: Spacing.sm,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: '600',
  },

  qrCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
    ...Shadow.card,
  },
  qrHint: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
  mockBadge: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.warningBg,
    borderRadius: Radius.md,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  mockBadgeText: { fontSize: FontSize.md, color: Colors.warning, fontWeight: '700' },
  mockBadgeSub: { fontSize: FontSize.xs, color: Colors.warning, textAlign: 'center' },
  countdown: {
    fontSize: FontSize.lg,
    color: Colors.danger,
    fontWeight: '700',
    ...numericFont,
  },

  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    ...Shadow.card,
  },
  btnDisabled: { backgroundColor: Colors.textMuted, shadowOpacity: 0 },
  primaryBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
  ghostBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  ghostBtnText: { color: Colors.textSecondary, fontSize: FontSize.md, fontWeight: '600' },
  orderNoFooter: {
    textAlign: 'center',
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontFamily: 'monospace',
  },

  successBadge: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.success,
    gap: Spacing.sm,
    ...Shadow.card,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.success,
  },
  successAmount: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.textPrimary,
    ...numericFont,
  },
  orderNo: { fontSize: FontSize.xs, color: Colors.textMuted, fontFamily: 'monospace' },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
    ...Shadow.card,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  splitLabel: { fontSize: FontSize.sm, color: Colors.textPrimary },
  splitAmount: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: '700',
    ...numericFont,
  },
  empty: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center' },
});
