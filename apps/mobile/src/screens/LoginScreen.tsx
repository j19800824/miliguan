import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Crown, Building, Store, User } from '../components/Icons';
import { fetchUsers, type User as ApiUser } from '../services/api';
import { shouldUseMocks } from '../services/api/client';
import { login as apiLogin, sendLoginCode, type AuthUser } from '../services/auth/auth';
import type { Role } from '../data/mock';
import { Colors, FontSize, Radius, Shadow, Spacing } from '../constants/theme';

interface LoginScreenProps {
  onLogin: (user: AuthUser) => void;
}

const ROLE_ACCENT: Record<Role, string> = {
  boss: Colors.roleBoss,
  branch_gm: Colors.roleBranch,
  store_manager: Colors.roleStore,
  sales_staff: Colors.roleSales,
};

function RoleIcon({ role, color }: { role: Role; color: string }) {
  const props = { size: 26, color };
  if (role === 'boss') return <Crown {...props} />;
  if (role === 'branch_gm') return <Building {...props} />;
  if (role === 'store_manager') return <Store {...props} />;
  return <User {...props} />;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const insets = useSafeAreaInsets();
  const useMocks = shouldUseMocks();

  // ----- Mock-mode role picker state -----
  const [selected, setSelected] = useState<string | null>(null);
  const [users, setUsers] = useState<ApiUser[]>([]);

  // ----- Real-mode OTP state -----
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);

  const phoneValid = /^1\d{10}$/.test(phone.trim());

  useEffect(() => {
    if (!useMocks) return;
    let active = true;
    fetchUsers().then((data) => {
      if (active) setUsers(data);
    });
    return () => {
      active = false;
    };
  }, [useMocks]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleMockLogin = () => {
    const user = users.find((u) => u.id === selected);
    if (user) onLogin(user as AuthUser);
  };

  const handleSendCode = async () => {
    setErrorMsg(null);
    setNoticeMsg(null);
    if (!phoneValid) {
      setErrorMsg('请输入有效的 11 位手机号');
      return;
    }
    setSending(true);
    try {
      const result = await sendLoginCode(phone.trim());
      setCountdown(result.resendAfter);
      setNoticeMsg(result.message);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '验证码发送失败');
    } finally {
      setSending(false);
    }
  };

  const handleCredentialLogin = async () => {
    if (!phoneValid || code.trim().length < 4) {
      setErrorMsg('请填写手机号和验证码');
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const user = await apiLogin(phone.trim(), code.trim());
      onLogin(user);
    } catch (err) {
      const message = err instanceof Error ? err.message : '登录失败';
      setErrorMsg(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.inner, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <Image
              source={require('../../assets/logo-final.png')}
              style={styles.logoImg}
              resizeMode="contain"
            />
            <View>
              <Text style={styles.brandName}>米粒冠</Text>
              <Text style={styles.brandSlogan}>选米做饭 · 就选米粒冠</Text>
            </View>
          </View>
          <Text style={styles.welcome}>欢迎登录</Text>
          <Text style={styles.subtitle}>
            {useMocks ? '选择您的身份快速进入系统（演示模式）' : '请输入手机号获取短信验证码登录'}
          </Text>
        </View>

        {/* Body */}
        {useMocks ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.cardList}
            showsVerticalScrollIndicator={false}
          >
            {users.map((user) => {
              const isSelected = selected === user.id;
              const accent = ROLE_ACCENT[user.role];
              return (
                <TouchableOpacity
                  key={user.id}
                  testID={`login-role-${user.role}`}
                  style={[
                    styles.roleCard,
                    isSelected && {
                      borderColor: accent,
                      borderWidth: 2,
                      backgroundColor: `${accent}08`,
                    },
                  ]}
                  onPress={() => setSelected(user.id)}
                  activeOpacity={0.75}
                >
                  <View
                    style={[
                      styles.avatar,
                      {
                        backgroundColor: `${accent}14`,
                        borderColor: `${accent}33`,
                      },
                    ]}
                  >
                    <RoleIcon role={user.role} color={accent} />
                  </View>
                  <View style={styles.roleInfo}>
                    <Text style={styles.userName}>{user.name}</Text>
                    <Text style={[styles.roleLabel, { color: accent }]}>
                      {user.roleLabel}
                    </Text>
                    <Text style={styles.orgName}>{user.org}</Text>
                  </View>
                  {isSelected ? (
                    <View style={[styles.check, { backgroundColor: accent }]}>
                      <Text style={styles.checkMark}>✓</Text>
                    </View>
                  ) : (
                    <View style={styles.checkEmpty} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.formList}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>手机号</Text>
              <TextInput
                testID="login-phone"
                style={styles.input}
                placeholder="请输入 11 位手机号"
                placeholderTextColor={Colors.textMuted}
                keyboardType="number-pad"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={11}
                value={phone}
                onChangeText={(text) => setPhone(text.replace(/\D/g, ''))}
                editable={!submitting}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>验证码</Text>
              <View style={styles.codeRow}>
                <TextInput
                  testID="login-code"
                  style={[styles.input, styles.codeInput]}
                  placeholder="请输入验证码"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={code}
                  onChangeText={(text) => setCode(text.replace(/\D/g, ''))}
                  editable={!submitting}
                />
                <TouchableOpacity
                  testID="login-send-code"
                  style={[
                    styles.sendCodeBtn,
                    (!phoneValid || sending || countdown > 0) && styles.sendCodeBtnDisabled,
                  ]}
                  onPress={handleSendCode}
                  disabled={!phoneValid || sending || countdown > 0}
                  activeOpacity={0.8}
                >
                  <Text style={styles.sendCodeText}>
                    {countdown > 0 ? `${countdown}s` : sending ? '发送中' : '获取验证码'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            {noticeMsg && (
              <Text testID="login-notice" style={styles.noticeText}>
                {noticeMsg}
              </Text>
            )}
            {errorMsg && (
              <Text testID="login-error" style={styles.errorText}>
                {errorMsg}
              </Text>
            )}
          </ScrollView>
        )}

        {/* Submit */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
          {useMocks ? (
            <TouchableOpacity
              testID="login-submit"
              style={[styles.loginBtn, !selected && styles.loginBtnDisabled]}
              onPress={handleMockLogin}
              disabled={!selected}
              activeOpacity={0.8}
            >
              <Text style={styles.loginBtnText}>进入系统</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              testID="login-submit"
              style={[
                styles.loginBtn,
                (submitting || !phoneValid || code.trim().length < 4) && styles.loginBtnDisabled,
              ]}
              onPress={handleCredentialLogin}
              disabled={submitting || !phoneValid || code.trim().length < 4}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.loginBtnText}>登录</Text>
              )}
            </TouchableOpacity>
          )}
          <Text style={styles.hint}>
            {useMocks ? '演示模式 · 选择角色直接登录' : '使用手机号 + 短信验证码登录米粒冠系统'}
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  inner: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  logoImg: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
  },
  brandName: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  brandSlogan: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    letterSpacing: 0.4,
  },
  welcome: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  scroll: {
    flex: 1,
  },
  cardList: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  formList: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.lg,
  },
  field: {
    gap: Spacing.xs,
  },
  fieldLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  input: {
    height: 48,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  codeInput: {
    flex: 1,
  },
  sendCodeBtn: {
    height: 48,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 96,
  },
  sendCodeBtnDisabled: {
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  sendCodeText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.primary,
  },
  noticeText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  errorText: {
    fontSize: FontSize.sm,
    color: Colors.danger,
    textAlign: 'center',
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  roleInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  userName: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  roleLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginTop: 2,
  },
  orgName: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  check: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkEmpty: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  checkMark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  loginBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.strong,
  },
  loginBtnDisabled: {
    backgroundColor: Colors.textMuted,
    shadowOpacity: 0,
    elevation: 0,
  },
  loginBtnText: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  hint: {
    textAlign: 'center',
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
  },
});
