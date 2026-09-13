import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import MapScreen from '../screens/MapScreen';
import PassportScreen from '../screens/PassportScreen';
import ScanScreen from '../screens/ScanScreen';
import AdminRoutesScreen from '../screens/admin/AdminRoutesScreen';
import AdminBarsScreen from '../screens/admin/AdminBarsScreen';
import AdminBarQrScreen from '../screens/admin/AdminBarQrScreen';
import type { AdminStackParamList, UserTabParamList } from './types';

const Tab = createBottomTabNavigator<UserTabParamList>();
const AdminStack = createNativeStackNavigator<AdminStackParamList>();

function AdminNavigator() {
  return (
    <AdminStack.Navigator>
      <AdminStack.Screen name="AdminRoutes" component={AdminRoutesScreen} options={{ title: 'Rutas' }} />
      <AdminStack.Screen name="AdminBars" component={AdminBarsScreen} />
      <AdminStack.Screen name="AdminBarQr" component={AdminBarQrScreen} />
    </AdminStack.Navigator>
  );
}

function TabIcon({ label }: { label: string }) {
  return <Text style={styles.tabIcon}>{label}</Text>;
}

function AppTabs() {
  const { isAdmin, signOut } = useAuth();
  return (
    <Tab.Navigator screenOptions={{ headerRight: () => <SignOutButton onPress={signOut} /> }}>
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{ title: 'Mapa', tabBarIcon: () => <TabIcon label="🗺️" /> }}
      />
      <Tab.Screen
        name="Scan"
        component={ScanScreen}
        options={{ title: 'Sellar', tabBarIcon: () => <TabIcon label="📷" />, headerShown: false }}
      />
      <Tab.Screen
        name="Passport"
        component={PassportScreen}
        options={{ title: 'Compostelana', tabBarIcon: () => <TabIcon label="📖" /> }}
      />
      {isAdmin && (
        <Tab.Screen
          name="Admin"
          component={AdminNavigator}
          options={{ title: 'Admin', tabBarIcon: () => <TabIcon label="⚙️" />, headerShown: false }}
        />
      )}
    </Tab.Navigator>
  );
}

function SignOutButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.signOut}>
      <Text style={styles.signOutText}>Salir</Text>
    </Pressable>
  );
}

export default function RootNavigator() {
  const { session } = useAuth();

  if (session === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <NavigationContainer>{session ? <AppTabs /> : <LoginScreen />}</NavigationContainer>;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabIcon: { fontSize: 20 },
  signOut: { marginRight: 12 },
  signOutText: { color: '#b8860b', fontWeight: '600' },
});
