import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Colors } from '../constants/theme';
import { Chart, Trophy, User } from '../components/Icons';
import { BossHomeScreen } from '../screens/boss/BossHomeScreen';
import { SalesStaffRankingScreen } from '../screens/sales-staff/SalesStaffRankingScreen';
import { ProfileScreen } from '../screens/shared/ProfileScreen';
import { PointsHistoryScreen } from '../screens/shared/PointsHistoryScreen';
import { VerifyHistoryScreen } from '../screens/shared/VerifyHistoryScreen';
import { NotificationsScreen } from '../screens/shared/NotificationsScreen';
import { BranchListScreen } from '../screens/shared/BranchListScreen';
import { BranchDetailScreen } from '../screens/shared/BranchDetailScreen';
import { MyOrdersScreen } from '../screens/shared/MyOrdersScreen';
import { SettingsScreen } from '../screens/shared/SettingsScreen';
import { HelpScreen } from '../screens/shared/HelpScreen';
import { ChangePasswordScreen } from '../screens/shared/ChangePasswordScreen';
import { OrderDetailScreen } from '../screens/shared/OrderDetailScreen';
import type { MockUser } from '../data/mock';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

interface NavProps {
  user: MockUser;
  onLogout: () => void;
}

function MainTabs({ user, onLogout }: NavProps) {
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
          tabBarButtonTestID: 'tab-home',
        }}
      >
        {() => <BossHomeScreen user={user} />}
      </Tab.Screen>

      <Tab.Screen
        name="Ranking"
        options={{
          title: '积分排行',
          tabBarIcon: ({ color }) => <Trophy size={24} color={color} />,
          tabBarButtonTestID: 'tab-ranking',
        }}
        component={SalesStaffRankingScreen}
      />

      <Tab.Screen
        name="Profile"
        options={{
          title: '我的',
          tabBarIcon: ({ color }) => <User size={24} color={color} />,
          tabBarButtonTestID: 'tab-profile',
        }}
      >
        {() => <ProfileScreen user={user} onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export function BossNavigator({ user, onLogout }: NavProps) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs">
        {() => <MainTabs user={user} onLogout={onLogout} />}
      </Stack.Screen>
      <Stack.Screen
        name="PointsHistory"
        component={PointsHistoryScreen}
        options={{ headerShown: true, title: '积分变动' }}
      />
      <Stack.Screen
        name="VerifyHistory"
        component={VerifyHistoryScreen}
        options={{ headerShown: true, title: '核销记录' }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ headerShown: true, title: '消息通知' }}
      />
      <Stack.Screen
        name="Branches"
        component={BranchListScreen}
        options={{ headerShown: true, title: '全部分公司' }}
      />
      <Stack.Screen
        name="BranchDetail"
        component={BranchDetailScreen}
        options={{ headerShown: true, title: '分公司详情' }}
      />
      <Stack.Screen
        name="MyOrders"
        component={MyOrdersScreen}
        options={{ headerShown: true, title: '我的订单' }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ headerShown: true, title: '设置' }}
      />
      <Stack.Screen
        name="Help"
        component={HelpScreen}
        options={{ headerShown: true, title: '帮助与反馈' }}
      />
      <Stack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{ headerShown: true, title: '修改密码' }}
      />
      <Stack.Screen
        name="OrderDetail"
        component={OrderDetailScreen}
        options={{ headerShown: true, title: '订单详情' }}
      />
    </Stack.Navigator>
  );
}
