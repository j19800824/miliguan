import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Colors } from '../constants/theme';
import { Home, Clipboard, Trophy, User } from '../components/Icons';
import { BranchGMHomeScreen } from '../screens/branch-gm/BranchGMHomeScreen';
import { BranchGMOrdersScreen } from '../screens/branch-gm/BranchGMOrdersScreen';
import { SalesStaffRankingScreen } from '../screens/sales-staff/SalesStaffRankingScreen';
import { ProfileScreen } from '../screens/shared/ProfileScreen';
import type { MockUser } from '../data/mock';

const Tab = createBottomTabNavigator();

interface BranchGMNavigatorProps {
  user: MockUser;
  onLogout: () => void;
}

export function BranchGMNavigator({ user, onLogout }: BranchGMNavigatorProps) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.tabBarActive,
        tabBarInactiveTintColor: Colors.tabBarInactive,
        tabBarStyle: {
          backgroundColor: Colors.tabBar,
          borderTopColor: Colors.tabBarBorder,
          borderTopWidth: 1,
          paddingBottom: 4,
          height: 60,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
      }}
    >
      <Tab.Screen
        name="BranchHome"
        options={{
          title: '首页',
          tabBarIcon: ({ color }) => <Home size={24} color={color} />,
        }}
      >
        {() => <BranchGMHomeScreen user={user} />}
      </Tab.Screen>

      <Tab.Screen
        name="Orders"
        options={{
          title: '积分订单',
          tabBarIcon: ({ color }) => <Clipboard size={24} color={color} />,
        }}
        component={BranchGMOrdersScreen}
      />

      <Tab.Screen
        name="Ranking"
        options={{
          title: '排行榜',
          tabBarIcon: ({ color }) => <Trophy size={24} color={color} />,
        }}
        component={SalesStaffRankingScreen}
      />

      <Tab.Screen
        name="Profile"
        options={{
          title: '我的',
          tabBarIcon: ({ color }) => <User size={24} color={color} />,
        }}
      >
        {() => <ProfileScreen user={user} onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
