import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View } from 'react-native';
import { Colors } from '../constants/theme';
import { Home, Scan, Trophy, User } from '../components/Icons';
import { StoreManagerHomeScreen } from '../screens/store-manager/StoreManagerHomeScreen';
import { ScanScreen } from '../screens/store-manager/ScanScreen';
import { SalesStaffRankingScreen } from '../screens/sales-staff/SalesStaffRankingScreen';
import { ProfileScreen } from '../screens/shared/ProfileScreen';
import type { MockUser } from '../data/mock';

const Tab = createBottomTabNavigator();

interface StoreManagerNavigatorProps {
  user: MockUser;
  onLogout: () => void;
}

// Raised scan button for the center tab
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

export function StoreManagerNavigator({ user, onLogout }: StoreManagerNavigatorProps) {
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
        name="Scan"
        options={{
          title: '扫码',
          tabBarIcon: ({ focused }) => <ScanTabIcon focused={focused} />,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '700', color: Colors.primary, marginTop: 2 },
        }}
        component={ScanScreen}
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
