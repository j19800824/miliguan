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
import { login as apiLogin, type AuthUser } from '../services/auth/auth';
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

  // ----- Real-mode credentials state -----
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  const handleMockLogin = () => {
    const user = users.find((u) => u.id === selected);
    if (user) onLogin(user as AuthUser);
  };

  const handleCredentialLogin = async () => {
    if (!account.trim() || !password) {
      setErrorMsg('请填写账号和密码');
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const user = await apiLogin(account.trim(), password);
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
            {useMocks ? '选择您的身份快速进入系统（演示模式）' : '请输入您的工作账号'}
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
              <Text style={styles.fieldLabel}>账号</Text>
              <TextInput
                testID="login-account"
                style={styles.input}
                placeholder="请输入账号"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                value={account}
                onChangeText={setAccount}
                editable={!submitting}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>密码</Text>
              <TextInput
                testID="login-password"
                style={styles.input}
                placeholder="请输入密码"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                editable={!submitting}
              />
            </View>
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
                (submitting || !account.trim() || !password) && styles.loginBtnDisabled,
              ]}
              onPress={handleCredentialLogin}
              disabled={submitting || !account.trim() || !password}
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
            {useMocks ? '演示模式 · 选择角色直接登录' : '使用工作账号登录米粒冠系统'}
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
