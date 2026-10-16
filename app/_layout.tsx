import { Slot, useRouter, useSegments, SplashScreen } from 'expo-router';
import { AuthProvider, useAuth } from '../lib/auth';
import { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { injectPwaMetaTags } from '../lib/pwaMeta';
import { initPwaInstallListener } from '../lib/pwaInstall';
import '../global.css';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { initialized, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [resumingSession, setResumingSession] = useState(false);
  // Tracks whether we've already done the one-time "resume an existing session"
  // check below, so it never fires again for the rest of this app session.
  const hasCheckedInitialSession = useRef(false);

  useEffect(() => {
    if (!initialized) return;

    const inAuthGroup = segments[0] === '(app)' || segments[0] === '(admin)';

    if (!user && inAuthGroup) {
      // Redirect to login if unauthenticated but trying to access protected routes
      router.replace('/');
      return;
    }

    // Only ever run the block below once, the very first time this effect fires
    // after the initial session check completes. Without this guard, it would
    // also fire every time `user` flips from null to set during a fresh,
    // interactive login -- racing against the login screen's own role check and
    // redirect (app/index.tsx), which already owns that flow end-to-end and can
    // reject a wrong-portal login. Losing that race mid-login is what was
    // causing some logins to silently sign back out.
    if (hasCheckedInitialSession.current) return;
    hasCheckedInitialSession.current = true;

    if (user && !inAuthGroup) {
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
    initPwaInstallListener();
  }, []);

  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
