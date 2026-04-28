import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View } from 'react-native';
import { Colors } from '../constants/theme';
import { Home, Package, Scan, Trophy, User } from '../components/Icons';
import { StoreManagerHomeScreen } from '../screens/store-manager/StoreManagerHomeScreen';
import { ScanScreen } from '../screens/store-manager/ScanScreen';
import { SalesStaffRankingScreen } from '../screens/sales-staff/SalesStaffRankingScreen';
import { ProfileScreen } from '../screens/shared/ProfileScreen';
import { InventoryScreen } from '../screens/shared/InventoryScreen';
import { PointsHistoryScreen } from '../screens/shared/PointsHistoryScreen';
import { VerifyHistoryScreen } from '../screens/shared/VerifyHistoryScreen';
import { NotificationsScreen } from '../screens/shared/NotificationsScreen';
import { MyReplenishmentsScreen } from '../screens/shared/MyReplenishmentsScreen';
import { MyOrdersScreen } from '../screens/shared/MyOrdersScreen';
import { SettingsScreen } from '../screens/shared/SettingsScreen';
import { HelpScreen } from '../screens/shared/HelpScreen';
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
        name="StoreHome"
        options={{
          title: '首页',
          tabBarIcon: ({ color }) => <Home size={24} color={color} />,
          tabBarButtonTestID: 'tab-home',
        }}
      >
        {(props) => (
          <StoreManagerHomeScreen
            user={user}
            onScan={() => props.navigation.navigate('Scan')}
          />
        )}
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

export function StoreManagerNavigator({ user, onLogout }: NavProps) {
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
    </Stack.Navigator>
  );
}
