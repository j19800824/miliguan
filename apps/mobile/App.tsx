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
import { bootstrapApiClient } from './src/services/api/client';
import { bootstrapAuth, logout as apiLogout, type AuthUser } from './src/services/auth/auth';
import { registerPushToken, unregisterPushToken } from './src/services/push';
import { replayQueue, startQueueReplayWatcher } from './src/services/api/queue';
import { startRealtime, stopRealtime } from './src/services/realtime';

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [fontsLoaded] = useFonts({
    'AlibabaPuHuiTi-Regular': require('./assets/fonts/Alibaba-PuHuiTi-Regular.ttf'),
    'AlibabaPuHuiTi-Medium': require('./assets/fonts/Alibaba-PuHuiTi-Medium.ttf'),
    'AlibabaPuHuiTi-Bold': require('./assets/fonts/Alibaba-PuHuiTi-Bold.ttf'),
  });

  // Restore session from secure storage on launch.
  useEffect(() => {
    let active = true;
    (async () => {
      await bootstrapApiClient();
      const restored = await bootstrapAuth();
      if (active) {
        setUser(restored);
        setAuthReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Once the network is back, replay any queued writes; also try once at boot.
  useEffect(() => {
    void replayQueue();
    const unsub = startQueueReplayWatcher();
    return () => unsub();
  }, []);

  // After login, register push token + open the realtime SSE stream.
  useEffect(() => {
    if (user) {
      void registerPushToken();
      void startRealtime();
    } else {
      stopRealtime();
    }
  }, [user]);

  useEffect(() => {
    if (fontsLoaded && authReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, authReady]);

  if (!fontsLoaded || !authReady) return null;

  const handleLogout = async () => {
    stopRealtime();
    await unregisterPushToken();
    await apiLogout();
    setUser(null);
  };

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
