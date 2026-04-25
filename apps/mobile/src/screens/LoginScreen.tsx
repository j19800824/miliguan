import { useEffect, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Crown, Building, Store, User } from '../components/Icons';
import { fetchUsers, type User as ApiUser } from '../services/api';
import type { MockUser, Role } from '../data/mock';
import { Colors, FontSize, Radius, Shadow, Spacing } from '../constants/theme';

interface LoginScreenProps {
  onLogin: (user: MockUser) => void;
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
  const [selected, setSelected] = useState<string | null>(null);
  const [users, setUsers] = useState<ApiUser[]>([]);

  useEffect(() => {
    let active = true;
    fetchUsers().then((data) => {
      if (active) setUsers(data);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleLogin = () => {
    const user = users.find((u) => u.id === selected);
    if (user) onLogin(user);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
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
        <Text style={styles.subtitle}>选择您的身份快速进入系统</Text>
      </View>

      {/* Role Cards */}
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
              style={[
                styles.roleCard,
                isSelected && { borderColor: accent, borderWidth: 2, backgroundColor: `${accent}08` },
              ]}
              onPress={() => setSelected(user.id)}
              activeOpacity={0.75}
            >
              {/* Avatar — rounded square with role-colored border + SVG icon */}
              <View style={[
                styles.avatar,
                {
                  backgroundColor: `${accent}14`,
                  borderColor: `${accent}33`,
                },
              ]}>
                <RoleIcon role={user.role} color={accent} />
              </View>

              {/* Info */}
              <View style={styles.roleInfo}>
                <Text style={styles.userName}>{user.name}</Text>
                <Text style={[styles.roleLabel, { color: accent }]}>{user.roleLabel}</Text>
                <Text style={styles.orgName}>{user.org}</Text>
              </View>

              {/* Check circle */}
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

      {/* Login Button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        <TouchableOpacity
          style={[styles.loginBtn, !selected && styles.loginBtnDisabled]}
          onPress={handleLogin}
          disabled={!selected}
          activeOpacity={0.8}
        >
          <Text style={styles.loginBtnText}>进入系统</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>演示模式 · 选择角色直接登录</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
