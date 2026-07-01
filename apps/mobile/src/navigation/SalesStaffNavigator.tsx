import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View } from 'react-native';
import { Colors } from '../constants/theme';
import { Home, Scan, Trophy, User } from '../components/Icons';
import { SalesStaffHomeScreen } from '../screens/sales-staff/SalesStaffHomeScreen';
import { ScanScreen } from '../screens/store-manager/ScanScreen';
import { SalesStaffRankingScreen } from '../screens/sales-staff/SalesStaffRankingScreen';
import { ProfileScreen } from '../screens/shared/ProfileScreen';
import { PointsHistoryScreen } from '../screens/shared/PointsHistoryScreen';
import { VerifyHistoryScreen } from '../screens/shared/VerifyHistoryScreen';
import { NotificationsScreen } from '../screens/shared/NotificationsScreen';
import { MyOrdersScreen } from '../screens/shared/MyOrdersScreen';
import { SettingsScreen } from '../screens/shared/SettingsScreen';
import { HelpScreen } from '../screens/shared/HelpScreen';
import { ChangePasswordScreen } from '../screens/shared/ChangePasswordScreen';
import { OrderDetailScreen } from '../screens/shared/OrderDetailScreen';
import { PaymentScreen } from '../screens/shared/PaymentScreen';
import type { MockUser } from '../data/mock';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

interface NavProps {
  user: MockUser;
  onLogout: () => void;
}

function ScanTabIcon({ focused }: { focused: boolean }) {
  return (
    <View
      style={{
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: focused ? Colors.primaryDark : Colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 8,
      }}
    >
      <Scan size={26} color="#fff" />
    </View>
  );
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
        name="StaffHome"
        options={{
          title: '首页',
          tabBarIcon: ({ color }) => <Home size={24} color={color} />,
          tabBarButtonTestID: 'tab-home',
        }}
      >
        {(props) => (
          <SalesStaffHomeScreen
            user={user}
            onScan={() => props.navigation.navigate('Scan')}
          />
        )}
      </Tab.Screen>

      <Tab.Screen
        name="Scan"
        options={{
          title: '扫码',
          tabBarIcon: ({ focused }) => <ScanTabIcon focused={focused} />,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '700', color: Colors.primary, marginTop: 2 },
          tabBarButtonTestID: 'tab-scan',
        }}
        component={ScanScreen}
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

export function SalesStaffNavigator({ user, onLogout }: NavProps) {
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
        name="MyOrders"
        component={MyOrdersScreen}
        options={{ headerShown: true, title: '核销订单' }}
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
      <Stack.Screen
        name="Payment"
        component={PaymentScreen}
        options={{ headerShown: true, title: '收款' }}
      />
    </Stack.Navigator>
  );
}
