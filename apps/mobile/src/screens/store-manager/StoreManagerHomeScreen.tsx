import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SectionHeader } from '../../components/SectionHeader';
import { Check, QR, Scan, Sparkle, X } from '../../components/Icons';
import { Colors, FontSize, Gradients, Radius, Shadow, Spacing } from '../../constants/theme';
import type { MockUser } from '../../data/mock';
import { fetchVerifyRecords, type VerifyRecord } from '../../services/api';
import { onRealtime } from '../../services/realtime';

interface StoreManagerHomeScreenProps {
  user: MockUser;
  onScan: () => void;
}

export function StoreManagerHomeScreen({ user, onScan }: StoreManagerHomeScreenProps) {
  const insets = useSafeAreaInsets();
  const [records, setRecords] = useState<VerifyRecord[]>([]);

  useEffect(() => {
    let active = true;
    const reload = () => {
      fetchVerifyRecords().then((data) => {
        if (active) setRecords(data);
      });
    };
    reload();
    const unsub = onRealtime('writeoff.created', reload);
    return () => {
      active = false;
      unsub();
    };
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.xl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.greeting}>{user.name}</Text>
          <Text style={styles.storeName}>{user.org}</Text>
        </View>
        {/* Gold gradient points badge */}
        <LinearGradient
          colors={Gradients.gold}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.pointsBadge}
        >
          <Sparkle size={14} color={Colors.goldDark} />
          <View style={styles.pointsTextWrap}>
            <Text style={styles.pointsNum}>{(user.points ?? 0).toLocaleString()}</Text>
            <Text style={styles.pointsUnit}>积分</Text>
          </View>
        </LinearGradient>
      </View>

      {/* Today Stats */}
      <View style={styles.statsCard}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>38</Text>
          <Text style={styles.statLabel}>今日核销</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>12</Text>
          <Text style={styles.statLabel}>本人核销</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: Colors.gold }]}>520</Text>
          <Text style={styles.statLabel}>今日积分</Text>
        </View>
      </View>

      {/* Main Scan CTA — gradient + frosted glass icon */}
      <TouchableOpacity onPress={onScan} activeOpacity={0.85}>
        <LinearGradient
          colors={Gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.scanBtn}
        >
          <View style={styles.scanRadialOverlay} />
          <View style={styles.scanIconWrap}>
            <Scan size={32} color="#fff" />
          </View>
          <Text style={styles.scanTitle}>扫码核销</Text>
          <Text style={styles.scanSub}>扫描商品二维码完成核销</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Ghost button: scan staff barcode */}
      <TouchableOpacity style={styles.staffScanBtn} activeOpacity={0.8}>
        <QR size={20} color={Colors.textSecondary} />
        <Text style={styles.staffScanText}>扫描员工一维码</Text>
      </TouchableOpacity>

      {/* Recent Records */}
      <SectionHeader title="今日核销记录" action="查看全部" />
      {records.map((r) => (
        <View
          key={r.id}
          style={[styles.recordRow, r.status === 'fail' && styles.recordRowFail]}
        >
          {/* Rounded-square status badge with tinted bg */}
          <View
            style={[
              styles.recordStatus,
              r.status === 'success' ? styles.statusSuccess : styles.statusFail,
            ]}
          >
            {r.status === 'success'
              ? <Check size={16} color={Colors.success} />
              : <X size={16} color={Colors.danger} />
            }
          </View>
          <View style={styles.recordInfo}>
            <Text style={styles.recordProduct}>{r.product}</Text>
            <Text style={styles.recordMeta}>{r.time} · {r.staff}</Text>
          </View>
          {/* Show pts instead of barcode */}
          {r.status === 'success' ? (
            <Text style={styles.recordPts}>+{r.pts}</Text>
          ) : (
            <Text style={styles.recordFail}>核销失败</Text>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: Spacing.lg, gap: Spacing.md },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  greeting: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  storeName: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    ...Shadow.card,
  },
  pointsTextWrap: { alignItems: 'center' },
  pointsNum: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
  pointsUnit: { fontSize: FontSize.xs, color: Colors.textPrimary, opacity: 0.7 },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    ...Shadow.card,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.primary, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
  statDivider: { width: 1, backgroundColor: Colors.border },
  scanBtn: {
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    overflow: 'hidden',
    ...Shadow.lift,
    gap: Spacing.sm,
  },
  scanRadialOverlay: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.12)',
    top: -60,
    right: -40,
  },
  scanIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  scanTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
  },
  scanSub: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.85)' },
  staffScanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  staffScanText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textSecondary },
  recordRow: {
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
  recordRowFail: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.danger,
    backgroundColor: '#FFF8F8',
  },
  // Rounded-square (not circle) with tinted background
  recordStatus: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusSuccess: { backgroundColor: Colors.successBg },
  statusFail: { backgroundColor: Colors.dangerBg },
  recordInfo: { flex: 1 },
  recordProduct: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  recordMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  recordPts: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.gold, fontVariant: ['tabular-nums'] },
  recordFail: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.danger },
});
