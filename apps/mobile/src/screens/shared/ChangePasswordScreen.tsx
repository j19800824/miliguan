import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Colors,
  FontSize,
  Radius,
  Shadow,
  Spacing,
} from '../../constants/theme';
import { changePassword } from '../../services/api';

export function ChangePasswordScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const nav = navigation as unknown as { goBack: () => void };
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!current) return Alert.alert('请输入当前密码');
    if (!next || next.length < 6) return Alert.alert('新密码至少 6 位');
    if (next !== confirm) return Alert.alert('两次新密码不一致');
    setSubmitting(true);
    try {
      await changePassword(current, next);
      Alert.alert('修改成功', '请妥善保管新密码', [
        { text: '好的', onPress: () => nav.goBack() },
      ]);
    } catch (e) {
      Alert.alert('修改失败', e instanceof Error ? e.message : '未知错误');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
      >
        <View style={styles.card}>
          <Text style={styles.label}>当前密码</Text>
          <TextInput
            value={current}
            onChangeText={setCurrent}
            secureTextEntry
            placeholder="输入当前密码"
            placeholderTextColor={Colors.textMuted}
            style={styles.input}
            testID="cp-current"
          />

          <Text style={styles.label}>新密码</Text>
          <TextInput
            value={next}
            onChangeText={setNext}
            secureTextEntry
            placeholder="至少 6 位"
            placeholderTextColor={Colors.textMuted}
            style={styles.input}
            testID="cp-next"
          />

          <Text style={styles.label}>确认新密码</Text>
          <TextInput
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            placeholder="再次输入新密码"
            placeholderTextColor={Colors.textMuted}
            style={styles.input}
            testID="cp-confirm"
          />
        </View>

        <TouchableOpacity
          style={[styles.btn, submitting && styles.btnDisabled]}
          onPress={submit}
          disabled={submitting}
          activeOpacity={0.85}
          testID="cp-submit"
        >
          <Text style={styles.btnText}>
            {submitting ? '提交中...' : '保存修改'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.note}>
          忘记密码？请联系管理员重置（默认密码 123456）。
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, gap: Spacing.md },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
    ...Shadow.card,
  },
  label: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: Spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
  },
  btn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    ...Shadow.card,
  },
  btnDisabled: { backgroundColor: Colors.textMuted, shadowOpacity: 0 },
  btnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
  note: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
});
