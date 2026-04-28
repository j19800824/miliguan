import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Colors, FontSize, Radius, Shadow, Spacing } from '../../constants/theme';
import { postVerifyScan, type VerifyScanResult } from '../../services/api';

type ScanState = 'scanning' | 'success' | 'fail';

const SUPPORTED_BARCODES = [
  'qr',
  'ean13',
  'ean8',
  'code39',
  'code128',
  'upc_a',
  'upc_e',
] as const;

export function ScanScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<ScanState>('scanning');
  const [result, setResult] = useState<VerifyScanResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  // Throttle: avoid spamming the API while a barcode lingers in frame.
  const inFlightRef = useRef(false);

  const handleManualSubmit = () => {
    const code = manualCode.trim();
    if (!code) return;
    setManualOpen(false);
    setManualCode('');
    void performScan(code);
  };

  const performScan = async (barcode: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSubmitting(true);
    try {
      const res = await postVerifyScan({ barcode });
      setResult(res);
      setState(res.success ? 'success' : 'fail');
    } catch (err) {
      const message = err instanceof Error ? err.message : '扫码失败';
      setResult({ success: false, message });
      setState('fail');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (state !== 'scanning' || !data) return;
    void performScan(data);
  };

  const handleMockScan = (success: boolean) => {
    void performScan(success ? '6901234567890' : '0000000000000');
  };

  const handleReset = () => {
    setResult(null);
    setState('scanning');
    inFlightRef.current = false;
  };

  // Permission states
  if (!permission) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <Text style={styles.permTitle}>需要相机权限</Text>
        <Text style={styles.permText}>
          扫描商品条码需要授权使用相机。
        </Text>
        <TouchableOpacity
          testID="scan-grant-permission"
          style={styles.permBtn}
          onPress={requestPermission}
          activeOpacity={0.85}
        >
          <Text style={styles.permBtnText}>授权相机</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>扫码核销</Text>
        <TouchableOpacity
          testID="scan-manual-input"
          style={styles.manualBtn}
          onPress={() => setManualOpen(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.manualBtnText}>手动</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={manualOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setManualOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>手动输入条码</Text>
            <TextInput
              testID="scan-manual-input-text"
              value={manualCode}
              onChangeText={setManualCode}
              placeholder="请输入商品条码 / 二维码"
              placeholderTextColor={Colors.textMuted}
              style={styles.modalInput}
              keyboardType="numeric"
              autoFocus
            />
            <View style={styles.modalRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => {
                  setManualOpen(false);
                  setManualCode('');
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.modalBtnGhostText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.modalBtnPrimary,
                  !manualCode.trim() && styles.modalBtnDisabled,
                ]}
                onPress={handleManualSubmit}
                disabled={!manualCode.trim()}
                activeOpacity={0.85}
              >
                <Text style={styles.modalBtnPrimaryText}>提交核销</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.viewfinder}>
        {/* Real camera */}
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          onBarcodeScanned={state === 'scanning' ? handleBarcodeScanned : undefined}
          barcodeScannerSettings={{
            barcodeTypes: [...SUPPORTED_BARCODES],
          }}
        />
        {/* Corner frame overlay */}
        <View pointerEvents="none" style={styles.cornerWrap}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>
        <Text style={styles.hint}>将商品条码对准方框扫描</Text>
        {submitting && (
          <View style={styles.submittingPill}>
            <ActivityIndicator color="#fff" size="small" />
            <Text style={styles.submittingText}>核销中…</Text>
          </View>
        )}
      </View>

      {state === 'success' && (
        <View style={styles.resultCard}>
          <View style={[styles.resultIcon, styles.resultSuccess]}>
            <Text style={styles.resultIconText}>✓</Text>
          </View>
          <View style={styles.resultInfo}>
            <Text style={styles.resultTitle}>核销成功</Text>
            <Text style={styles.resultProduct}>
              {result?.product?.name ?? '—'}
            </Text>
            <View style={styles.resultMeta}>
              <Text style={styles.resultMetaItem}>
                SKU: {result?.product?.sku ?? '—'}
              </Text>
              <Text style={styles.resultMetaItem}>
                回调积分: +{result?.product?.points ?? 0}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            testID="scan-continue"
            style={styles.continueBtn}
            onPress={handleReset}
            activeOpacity={0.8}
          >
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
            <Text style={[styles.resultTitle, { color: Colors.danger }]}>
              核销失败
            </Text>
            <Text style={styles.resultProduct}>
              {result?.message ?? '未识别商品或已核销'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.continueBtn, { backgroundColor: Colors.danger }]}
            onPress={handleReset}
            activeOpacity={0.8}
          >
            <Text style={styles.continueBtnText}>重新扫码</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Demo trigger row — preserved for Maestro E2E and quick manual testing */}
      {state === 'scanning' && !submitting && (
        <View style={styles.demoRow}>
          <Text style={styles.demoHint}>演示触发：</Text>
          <TouchableOpacity
            testID="scan-mock-success"
            style={styles.demoBtn}
            onPress={() => handleMockScan(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.demoBtnText}>✓ 模拟成功</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="scan-mock-fail"
            style={[styles.demoBtn, styles.demoBtnFail]}
            onPress={() => handleMockScan(false)}
            activeOpacity={0.8}
          >
            <Text style={[styles.demoBtnText, { color: Colors.danger }]}>
              ✗ 模拟失败
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1117' },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerTitle: { fontSize: FontSize.xl, fontWeight: '700', color: '#fff' },
  manualBtn: {
    paddingHorizontal: 14,
    height: 32,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  manualBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadow.lift,
  },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  modalInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
  },
  modalRow: { flexDirection: 'row', gap: Spacing.sm },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  modalBtnGhost: { backgroundColor: Colors.surfaceSunken, borderWidth: 1, borderColor: Colors.border },
  modalBtnGhostText: { color: Colors.textSecondary, fontSize: FontSize.md, fontWeight: '700' },
  modalBtnPrimary: { backgroundColor: Colors.primary },
  modalBtnPrimaryText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
  modalBtnDisabled: { backgroundColor: Colors.textMuted, opacity: 0.6 },

  // Permission screen
  permTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: '#fff',
    marginBottom: Spacing.sm,
  },
  permText: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  permBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    ...Shadow.strong,
  },
  permBtnText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '700',
  },

  viewfinder: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  cornerWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: Colors.primary,
  },
  cornerTL: {
    top: '50%',
    left: '50%',
    marginTop: -130,
    marginLeft: -130,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: Radius.sm,
  },
  cornerTR: {
    top: '50%',
    right: '50%',
    marginTop: -130,
    marginRight: -130,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: Radius.sm,
  },
  cornerBL: {
    bottom: '50%',
    left: '50%',
    marginBottom: -130,
    marginLeft: -130,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: Radius.sm,
  },
  cornerBR: {
    bottom: '50%',
    right: '50%',
    marginBottom: -130,
    marginRight: -130,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: Radius.sm,
  },
  hint: {
    position: 'absolute',
    bottom: '20%',
    alignSelf: 'center',
    color: 'rgba(255,255,255,0.85)',
    fontSize: FontSize.sm,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  submittingPill: {
    position: 'absolute',
    top: Spacing.md,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  submittingText: { color: '#fff', fontSize: FontSize.sm },

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
  resultProduct: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  resultMeta: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  resultMetaItem: { fontSize: FontSize.xs, color: Colors.textSecondary },
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
