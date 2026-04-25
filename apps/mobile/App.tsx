import { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LoginScreen } from './src/screens/LoginScreen';
import { BossNavigator } from './src/navigation/BossNavigator';
import { BranchGMNavigator } from './src/navigation/BranchGMNavigator';
import { StoreManagerNavigator } from './src/navigation/StoreManagerNavigator';
import { SalesStaffNavigator } from './src/navigation/SalesStaffNavigator';
import type { MockUser } from './src/data/mock';

export default function App() {
  const [user, setUser] = useState<MockUser | null>(null);

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
