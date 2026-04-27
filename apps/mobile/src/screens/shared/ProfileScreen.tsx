import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pickAndUploadAvatar } from '../../services/upload';
import {
  Bell,
  Building,
  Chart,
  Chevron,
  Clipboard,
  Crown,
  Help,
  Settings,
  Store,
  User,
} from '../../components/Icons';
import type { ReactElement } from 'react';
import type { IconProps } from '../../components/Icons';
import { Colors, FontSize, Radius, Shadow, Spacing } from '../../constants/theme';
import type { MockUser, Role } from '../../data/mock';

interface ProfileScreenProps {
  user: MockUser;
  onLogout: () => void;
}

// Role accent colors
const ROLE_COLOR: Record<Role, string> = {
  boss: Colors.roleBoss,
  branch_gm: Colors.roleBranch,
  store_manager: Colors.roleStore,
  sales_staff: Colors.roleSales,
};

// Role avatar icon (SVG)
function RoleAvatar({ role, color }: { role: Role; color: string }) {
  const props: IconProps = { size: 28, color };
  if (role === 'boss') return <Crown {...props} />;
  if (role === 'branch_gm') return <Building {...props} />;
  if (role === 'store_manager') return <Store {...props} />;
  return <User {...props} />;
}

// Menu items — per-item color for tinted icon bg
interface MenuItem {
  IconComp: (props: IconProps) => ReactElement;
  label: string;
  sub: string;
  color: string;
  badge?: string;
}

const MENU_ITEMS: MenuItem[] = [
  { IconComp: Clipboard, label: '我的订单',  sub: '查看积分订单记录',   color: Colors.primary },
  { IconComp: Chart,     label: '积分明细',  sub: '积分获取与消费记录', color: Colors.gold },
  { IconComp: Bell,      label: '消息通知',  sub: '系统通知与提醒',     color: Colors.info, badge: '2' },
  { IconComp: Settings,  label: '设置',      sub: '账号与应用设置',     color: Colors.textSecondary },
  { IconComp: Help,      label: '帮助与反馈', sub: '使用帮助与意见反馈', color: Colors.warning },
];

export function ProfileScreen({ user, onLogout }: ProfileScreenProps) {
  const insets = useSafeAreaInsets();
  const roleColor = ROLE_COLOR[user.role];
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    (user as { avatarUrl?: string }).avatarUrl || null,
  );
  const [uploading, setUploading] = useState(false);

  const handleChangeAvatar = async () => {
    if (uploading) return;
    setUploading(true);
    try {
      const next = await pickAndUploadAvatar();
      if (next) setAvatarUrl(next);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '上传失败';
      Alert.alert('头像更新失败', msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top, paddingBottom: insets.bottom + Spacing.lg },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>个人中心</Text>
      </View>

      {/* Profile Card */}
      <View style={styles.profileCard}>
        {/* Tap to change — opens image picker, uploads via OSS, saves URL. */}
        <TouchableOpacity
          testID="profile-avatar"
          onPress={handleChangeAvatar}
          activeOpacity={0.8}
          style={[
            styles.avatarWrap,
            {
              backgroundColor: `${roleColor}14`,
              borderColor: `${roleColor}33`,
            },
          ]}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <RoleAvatar role={user.role} color={roleColor} />
          )}
          {uploading && (
            <View style={styles.avatarUploading}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.info}>
          <Text style={styles.name}>{user.name}</Text>
          <View style={[styles.roleBadge, { backgroundColor: `${roleColor}14`, borderColor: `${roleColor}33` }]}>
            <Text style={[styles.roleBadgeText, { color: roleColor }]}>{user.roleLabel}</Text>
          </View>
          <Text style={styles.org}>{user.org}</Text>
        </View>

        {user.points != null && (
          <View style={styles.pointsWrap}>
            <Text style={styles.pointsValue}>{user.points.toLocaleString()}</Text>
            <Text style={styles.pointsLabel}>积分</Text>
          </View>
        )}
      </View>

      {/* Menu */}
      <View style={styles.menuCard}>
        {MENU_ITEMS.map((item, i) => (
          <TouchableOpacity
            key={item.label}
            style={[styles.menuRow, i < MENU_ITEMS.length - 1 && styles.menuRowBorder]}
            activeOpacity={0.7}
          >
            {/* Per-item color tinted icon bg */}
            <View style={[styles.menuIconWrap, { backgroundColor: `${item.color}14` }]}>
              <item.IconComp size={20} color={item.color} />
            </View>
            <View style={styles.menuText}>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Text style={styles.menuSub}>{item.sub}</Text>
            </View>
            {item.badge && (
              <View style={styles.menuBadge}>
                <Text style={styles.menuBadgeText}>{item.badge}</Text>
              </View>
            )}
            <Chevron size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Logout */}
      <View style={styles.logoutWrap}>
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout} activeOpacity={0.8}>
          <Text style={styles.logoutText}>退出登录</Text>
        </TouchableOpacity>
      </View>

      {/* Logo mark */}
      <View style={styles.logoWrap}>
        <Image
          source={require('../../../assets/logo-final.png')}
          style={styles.logoImg}
          resizeMode="contain"
        />
        <View>
          <Text style={styles.logoName}>米粒冠</Text>
          <Text style={styles.logoSlogan}>选米做饭 · 就选米粒冠</Text>
        </View>
        <Text style={styles.version}>v1.0.0</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: Spacing.lg, gap: Spacing.md },
  header: { paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  // Rounded square (not circle) with role-tinted bg + border
  avatarWrap: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  avatarUploading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, marginLeft: Spacing.md },
  name: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  roleBadge: {
    alignSelf: 'flex-start',
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
    borderWidth: 1,
  },
  roleBadgeText: { fontSize: FontSize.xs, fontWeight: '700' },
  org: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 4 },
  pointsWrap: { alignItems: 'flex-end' },
  pointsValue: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.goldDark, fontVariant: ['tabular-nums'] },
  pointsLabel: { fontSize: FontSize.xs, color: Colors.textMuted },

  menuCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.card,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    gap: Spacing.md,
  },
  menuRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: { flex: 1 },
  menuLabel: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  menuSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 },
  menuBadge: {
    backgroundColor: Colors.danger,
    borderRadius: Radius.full,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  menuBadgeText: { fontSize: 10, color: '#fff', fontWeight: '700' },

  logoutWrap: { paddingTop: Spacing.sm },
  logoutBtn: {
    height: 48,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.danger },

  logoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    opacity: 0.6,
  },
  logoImg: { width: 24, height: 24, borderRadius: 4 },
  logoName: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.textPrimary, letterSpacing: 0.8 },
  logoSlogan: { fontSize: 9, color: Colors.textSecondary, letterSpacing: 0.5, marginTop: 1 },
  version: { fontSize: FontSize.xs, color: Colors.textMuted, marginLeft: Spacing.sm },
});
