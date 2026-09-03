import { Slot, useRouter, useSegments, SplashScreen } from 'expo-router';
import { AuthProvider, useAuth } from '../lib/auth';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { injectPwaMetaTags } from '../lib/pwaMeta';
import '../global.css';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { initialized, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [resumingSession, setResumingSession] = useState(false);

  useEffect(() => {
    if (!initialized) return;

    const inAuthGroup = segments[0] === '(app)' || segments[0] === '(admin)';

    if (!user && inAuthGroup) {
      // Redirect to login if unauthenticated but trying to access protected routes
      router.replace('/');
    } else if (user && !inAuthGroup) {
      // Already have a valid persisted session (e.g. reopening the installed home-screen
      // app after closing it) -- skip straight past the login form to the right portal
      // instead of making them log in again every time.
      setResumingSession(true);
      (async () => {
        const { data } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
        router.replace(data?.role === 'ADMIN' ? '/(admin)/dashboard' : '/(app)/home');
        setResumingSession(false);
      })();
    }
  }, [user, initialized, segments]);

  if (!initialized || resumingSession) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-900">
        <ActivityIndicator size="large" color="#0284c7" />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
    injectPwaMetaTags();
  }, []);

  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
