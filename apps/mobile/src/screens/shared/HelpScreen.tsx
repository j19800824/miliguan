import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Colors,
  FontSize,
  Radius,
  Shadow,
  Spacing,
} from '../../constants/theme';
import { Help as HelpIcon } from '../../components/Icons';

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: '怎么扫码核销商品？',
    a: '进入「扫码」tab，将摄像头对准商品条码或 QR 码即可。也可以点击右上角手动输入条码。',
  },
  {
    q: '门店缺货怎么补货？',
    a: '进入「库存」tab，点击右上角「向分公司进货」，选择 SKU 和数量提交即可。审核通过后库存自动更新。',
  },
  {
    q: '积分变动在哪查看？',
    a: '在首页右上角点积分按钮，或在「我的」-「积分明细」查看完整流水。',
  },
  {
    q: '消息通知没收到？',
    a: '请在系统设置允许米粒冠 App 推送通知。也可在「我的」-「消息通知」查看历史消息。',
  },
  {
    q: '忘记密码怎么办？',
    a: '请联系管理员重置密码，或在「我的」-「设置」-「修改密码」自助修改。',
  },
];

const SUPPORT_PHONE = '400-823-1818';

export function HelpScreen() {
  const insets = useSafeAreaInsets();

  const handleCallSupport = () => {
    const url = `tel:${SUPPORT_PHONE}`;
    Linking.canOpenURL(url).then((ok) => {
      if (ok) Linking.openURL(url);
      else Alert.alert('客服热线', SUPPORT_PHONE);
    });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
    >
      <View style={styles.header}>
        <HelpIcon size={28} color={Colors.warning} />
        <Text style={styles.headerText}>帮助与反馈</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>常见问题</Text>
        {FAQ.map((item, i) => (
          <View key={i} style={[styles.faqItem, i < FAQ.length - 1 && styles.faqItemBorder]}>
            <Text style={styles.faqQ}>Q：{item.q}</Text>
            <Text style={styles.faqA}>{item.a}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>联系客服</Text>
        <TouchableOpacity
          style={styles.contactBtn}
          onPress={handleCallSupport}
          activeOpacity={0.85}
        >
          <Text style={styles.contactBtnText}>拨打客服热线</Text>
          <Text style={styles.contactBtnPhone}>{SUPPORT_PHONE}</Text>
        </TouchableOpacity>
        <Text style={styles.note}>工作时间：周一至周日 9:00 - 21:00</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  headerText: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    ...Shadow.card,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  faqItem: { paddingVertical: Spacing.sm },
  faqItemBorder: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  faqQ: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  faqA: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginTop: 4,
  },
  contactBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    ...Shadow.card,
  },
  contactBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
  contactBtnPhone: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontWeight: '800',
    marginTop: 4,
  },
  note: {
    textAlign: 'center',
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
  },
});
