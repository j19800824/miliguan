import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Colors } from '../constants/theme';
import { Chart, Trophy, User } from '../components/Icons';
import { BossHomeScreen } from '../screens/boss/BossHomeScreen';
import { SalesStaffRankingScreen } from '../screens/sales-staff/SalesStaffRankingScreen';
import { ProfileScreen } from '../screens/shared/ProfileScreen';
import type { MockUser } from '../data/mock';

const Tab = createBottomTabNavigator();

interface BossNavigatorProps {
  user: MockUser;
  onLogout: () => void;
}

export function BossNavigator({ user, onLogout }: BossNavigatorProps) {
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
        name="BossHome"
        options={{
          title: '经营总览',
          tabBarIcon: ({ color }) => <Chart size={24} color={color} />,
        }}
      >
        {() => <BossHomeScreen user={user} />}
      </Tab.Screen>

      <Tab.Screen
        name="Ranking"
        options={{
          title: '积分排行',
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
