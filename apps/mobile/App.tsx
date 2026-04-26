import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { LoginScreen } from './src/screens/LoginScreen';
import { BossNavigator } from './src/navigation/BossNavigator';
import { BranchGMNavigator } from './src/navigation/BranchGMNavigator';
import { StoreManagerNavigator } from './src/navigation/StoreManagerNavigator';
import { SalesStaffNavigator } from './src/navigation/SalesStaffNavigator';
import type { MockUser } from './src/data/mock';

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [user, setUser] = useState<MockUser | null>(null);

  // Alibaba PuHuiTi (free for commercial use) — primary on Android,
  // overrideable on iOS too if you want consistent cross-platform glyphs.
  const [fontsLoaded] = useFonts({
    'AlibabaPuHuiTi-Regular': require('./assets/fonts/Alibaba-PuHuiTi-Regular.ttf'),
    'AlibabaPuHuiTi-Medium': require('./assets/fonts/Alibaba-PuHuiTi-Medium.ttf'),
    'AlibabaPuHuiTi-Bold': require('./assets/fonts/Alibaba-PuHuiTi-Bold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  const handleLogout = () => setUser(null);

  if (!user) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <LoginScreen onLogin={setUser} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer>
        {user.role === 'boss' && (
          <BossNavigator user={user} onLogout={handleLogout} />
        )}
        {user.role === 'branch_gm' && (
          <BranchGMNavigator user={user} onLogout={handleLogout} />
        )}
        {user.role === 'store_manager' && (
          <StoreManagerNavigator user={user} onLogout={handleLogout} />
        )}
        {user.role === 'sales_staff' && (
          <SalesStaffNavigator user={user} onLogout={handleLogout} />
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
