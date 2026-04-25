import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SectionHeader } from '../../components/SectionHeader';
import { Chevron, QR, Scan, Sparkle, Trophy } from '../../components/Icons';
import { Colors, FontSize, Gradients, Radius, Shadow, Spacing } from '../../constants/theme';
import { MOCK_VERIFY_RECORDS, type MockUser } from '../../data/mock';

interface SalesStaffHomeScreenProps {
  user: MockUser;
  onScan: () => void;
}

export function SalesStaffHomeScreen({ user, onScan }: SalesStaffHomeScreenProps) {
  const insets = useSafeAreaInsets();
  const myRecords = MOCK_VERIFY_RECORDS.filter(
    (r) => r.staff === user.name || r.staff === '陈小丽',
  );

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
          <Text style={styles.greeting}>你好，{user.name}</Text>
          <Text style={styles.orgName}>{user.org}</Text>
        </View>
        {/* Orange gradient rank badge */}
        <LinearGradient
          colors={Gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.rankBadge}
        >
          <Trophy size={16} color="#fff" />
          <View>
            <Text style={styles.rankNum}>#3</Text>
            <Text style={styles.rankLabel}>今日排名</Text>
          </View>
        </LinearGradient>
      </View>

      {/* Points Card — split: gold gradient left + white right */}
      <View style={styles.pointsCard}>
        <LinearGradient
          colors={Gradients.gold}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.pointsLeft}
        >
          {/* Sparkle watermark */}
          <View style={styles.sparkleWrap}>
            <Sparkle size={64} color="rgba(255,255,255,0.35)" />
          </View>
          <Text style={styles.pointsLabel}>我的积分</Text>
          <Text style={styles.pointsValue}>{(user.points ?? 0).toLocaleString()}</Text>
          <Text style={styles.pointsSubText}>可兑换奖励</Text>
        </LinearGradient>
        <View style={styles.pointsRight}>
          <View style={styles.pointsItem}>
            <Text style={styles.pointsItemVal}>12</Text>
            <Text style={styles.pointsItemLabel}>今日核销</Text>
          </View>
          <View style={styles.pointsDivider} />
          <View style={styles.pointsItem}>
            {/* Today's points in success green per design */}
            <Text style={[styles.pointsItemVal, { color: Colors.success }]}>+240</Text>
            <Text style={styles.pointsItemLabel}>今日积分</Text>
          </View>
        </View>
      </View>

      {/* Scan CTA — horizontal gradient with frosted icon */}
      <TouchableOpacity onPress={onScan} activeOpacity={0.85}>
        <LinearGradient
          colors={Gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.scanBtn}
        >
          <View style={styles.scanRadialOverlay} />
          <View style={styles.scanIconWrap}>
            <Scan size={26} color="#fff" />
          </View>
          <View style={styles.scanTextWrap}>
            <Text style={styles.scanTitle}>扫码核销</Text>
            <Text style={styles.scanSub}>点击开始扫描商品</Text>
          </View>
          <Chevron size={22} color="rgba(255,255,255,0.7)" />
        </LinearGradient>
      </TouchableOpacity>

      {/* Staff bind ghost button */}
      <TouchableOpacity style={styles.staffBtn} activeOpacity={0.8}>
        <QR size={20} color={Colors.textSecondary} />
        <Text style={styles.staffBtnText}>扫描一维码绑定销售记录</Text>
      </TouchableOpacity>

      {/* My records */}
      <SectionHeader title="我的核销记录" action="全部记录" />
      {myRecords.map((r) => (
        <View
          key={r.id}
          style={[styles.recordRow, r.status === 'fail' && styles.recordFail]}
        >
          <View
            style={[
              styles.dot,
              r.status === 'success' ? styles.dotSuccess : styles.dotFail,
            ]}
          />
          <View style={styles.recordInfo}>
            <Text style={styles.recordName}>{r.product}</Text>
            <Text style={styles.recordTime}>{r.time}</Text>
          </View>
          {/* Show pts in goldDark for success, or error label */}
          {r.status === 'success' ? (
            <Text style={styles.recordPts}>+{r.pts}</Text>
          ) : (
            <Text style={styles.recordStatusErr}>核销失败</Text>
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
  orgName: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    ...Shadow.card,
  },
  rankNum: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff' },
  rankLabel: { fontSize: 10, color: 'rgba(255,255,255,0.85)' },
  pointsCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.card,
  },
  pointsLeft: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sparkleWrap: {
    position: 'absolute',
    right: -8,
    bottom: -4,
  },
  pointsLabel: { fontSize: FontSize.sm, color: Colors.textPrimary, opacity: 0.75 },
  pointsValue: { fontSize: FontSize.xxxl, fontWeight: '800', color: Colors.textPrimary, marginTop: 4, fontVariant: ['tabular-nums'] },
  pointsSubText: { fontSize: FontSize.xs, color: Colors.textPrimary, opacity: 0.6, marginTop: 2 },
  pointsRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: Spacing.md,
  },
  pointsDivider: { width: 1, height: 32, backgroundColor: Colors.border },
  pointsItem: { alignItems: 'center' },
  pointsItemVal: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.primary, fontVariant: ['tabular-nums'] },
  pointsItemLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
    overflow: 'hidden',
    ...Shadow.strong,
  },
  scanRadialOverlay: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.12)',
    right: -20,
    top: -30,
  },
  scanIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanTextWrap: { flex: 1 },
  scanTitle: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff' },
  scanSub: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  staffBtn: {
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
  staffBtnText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textSecondary },
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
  recordFail: { borderLeftWidth: 3, borderLeftColor: Colors.danger },
  dot: { width: 8, height: 8, borderRadius: Radius.full },
  dotSuccess: { backgroundColor: Colors.success },
  dotFail: { backgroundColor: Colors.danger },
  recordInfo: { flex: 1 },
  recordName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  recordTime: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  recordPts: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.goldDark, fontVariant: ['tabular-nums'] },
  recordStatusErr: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.danger },
});
