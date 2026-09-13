import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/contexts/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';
import MissingConfigScreen from './src/screens/MissingConfigScreen';
import { isSupabaseConfigured } from './src/lib/supabase';

export default function App() {
  if (!isSupabaseConfigured) {
    return <MissingConfigScreen />;
  }

  return (
    <AuthProvider>
      <RootNavigator />
      <StatusBar style="auto" />
    </AuthProvider>
  );
}
