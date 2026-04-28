import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Colors } from '../constants/theme';
import { Home, Clipboard, Package, Trophy, User } from '../components/Icons';
import { BranchGMHomeScreen } from '../screens/branch-gm/BranchGMHomeScreen';
import { BranchGMOrdersScreen } from '../screens/branch-gm/BranchGMOrdersScreen';
import { SalesStaffRankingScreen } from '../screens/sales-staff/SalesStaffRankingScreen';
import { ProfileScreen } from '../screens/shared/ProfileScreen';
import { InventoryScreen } from '../screens/shared/InventoryScreen';
import { PointsHistoryScreen } from '../screens/shared/PointsHistoryScreen';
import { VerifyHistoryScreen } from '../screens/shared/VerifyHistoryScreen';
import { NotificationsScreen } from '../screens/shared/NotificationsScreen';
import { MyReplenishmentsScreen } from '../screens/shared/MyReplenishmentsScreen';
import { StoresScreen } from '../screens/shared/StoresScreen';
import { StoreDetailScreen } from '../screens/shared/StoreDetailScreen';
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
        name="BranchHome"
        options={{
          title: '首页',
          tabBarIcon: ({ color }) => <Home size={24} color={color} />,
          tabBarButtonTestID: 'tab-home',
        }}
      >
        {() => <BranchGMHomeScreen user={user} />}
      </Tab.Screen>

      <Tab.Screen
        name="Inventory"
        options={{
          title: '库存',
          tabBarIcon: ({ color }) => <Package size={24} color={color} />,
          tabBarButtonTestID: 'tab-inventory',
        }}
      >
        {() => <InventoryScreen user={user} />}
      </Tab.Screen>

      <Tab.Screen
        name="Orders"
        options={{
          title: '积分订单',
          tabBarIcon: ({ color }) => <Clipboard size={24} color={color} />,
          tabBarButtonTestID: 'tab-orders',
        }}
        component={BranchGMOrdersScreen}
      />

      <Tab.Screen
        name="Ranking"
        options={{
          title: '排行榜',
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

export function BranchGMNavigator({ user, onLogout }: NavProps) {
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
        name="MyReplenishments"
        component={MyReplenishmentsScreen}
        options={{ headerShown: true, title: '我的进货单' }}
      />
      <Stack.Screen
        name="Stores"
        component={StoresScreen}
        options={{ headerShown: true, title: '门店管理' }}
      />
      <Stack.Screen
        name="StoreDetail"
        component={StoreDetailScreen}
        options={{ headerShown: true, title: '门店详情' }}
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
