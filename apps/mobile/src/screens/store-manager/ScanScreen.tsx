import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, Radius, Shadow, Spacing } from '../../constants/theme';

type ScanState = 'scanning' | 'success' | 'fail';

const MOCK_PRODUCT = {
  name: '低GI免煮米 2kg',
  barcode: '6901234567890',
  sku: 'MLG-2KG-001',
  category: '主粮',
  points: 60,
};

export function ScanScreen() {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<ScanState>('scanning');

  const handleMockScan = (success: boolean) => {
    setState(success ? 'success' : 'fail');
  };

  const handleReset = () => {
    setState('scanning');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>扫码核销</Text>
        <TouchableOpacity style={styles.flashBtn}>
          <Text style={styles.flashIcon}>⚡</Text>
        </TouchableOpacity>
      </View>

      {/* Viewfinder */}
      <View style={styles.viewfinder}>
        {/* Mock camera background */}
        <View style={styles.cameraMock}>
          <Text style={styles.cameraMockText}>📷{'\n'}相机取景区域</Text>
        </View>

        {/* Corner frames */}
        <View style={[styles.corner, styles.cornerTL]} />
        <View style={[styles.corner, styles.cornerTR]} />
        <View style={[styles.corner, styles.cornerBL]} />
        <View style={[styles.corner, styles.cornerBR]} />

        {/* Scan line animation hint */}
        <View style={styles.scanLine} />

        <Text style={styles.hint}>将商品二维码对准方框内扫描</Text>
      </View>

      {/* Result Card */}
      {state === 'success' && (
        <View style={styles.resultCard}>
          <View style={[styles.resultIcon, styles.resultSuccess]}>
            <Text style={styles.resultIconText}>✓</Text>
          </View>
          <View style={styles.resultInfo}>
            <Text style={styles.resultTitle}>核销成功</Text>
            <Text style={styles.resultProduct}>{MOCK_PRODUCT.name}</Text>
            <View style={styles.resultMeta}>
              <Text style={styles.resultMetaItem}>SKU: {MOCK_PRODUCT.sku}</Text>
              <Text style={styles.resultMetaItem}>回调积分: +{MOCK_PRODUCT.points}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.continueBtn} onPress={handleReset} activeOpacity={0.8}>
            <Text style={styles.continueBtnText}>继续扫码</Text>
          </TouchableOpacity>
        </View>
      )}

      {state === 'fail' && (
        <View style={[styles.resultCard, styles.resultCardFail]}>
          <View style={[styles.resultIcon, styles.resultFail]}>
            <Text style={styles.resultIconText}>✗</Text>
          </View>
          <View style={styles.resultInfo}>
            <Text style={[styles.resultTitle, { color: Colors.danger }]}>核销失败</Text>
            <Text style={styles.resultProduct}>未识别商品或已核销</Text>
            <Text style={styles.resultBarcode}>条码：0000000000000</Text>
          </View>
          <TouchableOpacity style={[styles.continueBtn, { backgroundColor: Colors.danger }]} onPress={handleReset} activeOpacity={0.8}>
            <Text style={styles.continueBtnText}>重新扫码</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Mock buttons for demo */}
      {state === 'scanning' && (
        <View style={styles.demoRow}>
          <Text style={styles.demoHint}>演示触发：</Text>
          <TouchableOpacity style={styles.demoBtn} onPress={() => handleMockScan(true)} activeOpacity={0.8}>
            <Text style={styles.demoBtnText}>✓ 模拟成功</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.demoBtn, styles.demoBtnFail]} onPress={() => handleMockScan(false)} activeOpacity={0.8}>
            <Text style={[styles.demoBtnText, { color: Colors.danger }]}>✗ 模拟失败</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1117' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerTitle: { fontSize: FontSize.xl, fontWeight: '700', color: '#fff' },
  flashBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashIcon: { fontSize: 18 },
  viewfinder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cameraMock: {
    width: 260,
    height: 260,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  cameraMockText: {
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    fontSize: FontSize.md,
    lineHeight: 28,
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: Colors.primary,
  },
  cornerTL: { top: '50%', left: '50%', marginTop: -130, marginLeft: -130, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: Radius.sm },
  cornerTR: { top: '50%', right: '50%', marginTop: -130, marginRight: -130, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: Radius.sm },
  cornerBL: { bottom: '50%', left: '50%', marginBottom: -130, marginLeft: -130, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: Radius.sm },
  cornerBR: { bottom: '50%', right: '50%', marginBottom: -130, marginRight: -130, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: Radius.sm },
  scanLine: {
    position: 'absolute',
    width: 220,
    height: 2,
    backgroundColor: Colors.primary,
    opacity: 0.7,
    borderRadius: 1,
  },
  hint: {
    position: 'absolute',
    bottom: '30%',
    color: 'rgba(255,255,255,0.6)',
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  resultCard: {
    backgroundColor: Colors.surface,
    margin: Spacing.lg,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.success,
    ...Shadow.strong,
  },
  resultCardFail: { borderColor: Colors.danger },
  resultIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultSuccess: { backgroundColor: Colors.success },
  resultFail: { backgroundColor: Colors.danger },
  resultIconText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  resultInfo: { flex: 1 },
  resultTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.success },
  resultProduct: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.textPrimary, marginTop: 2 },
  resultMeta: { flexDirection: 'row', gap: Spacing.md, marginTop: 4, flexWrap: 'wrap' },
  resultMetaItem: { fontSize: FontSize.xs, color: Colors.textSecondary },
  resultBarcode: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 },
  continueBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  continueBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },
  demoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    flexWrap: 'wrap',
  },
  demoHint: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.4)' },
  demoBtn: {
    backgroundColor: `${Colors.success}20`,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.success,
  },
  demoBtnFail: {
    backgroundColor: `${Colors.danger}15`,
    borderColor: Colors.danger,
  },
  demoBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.success },
});
