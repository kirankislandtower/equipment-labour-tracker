import { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  initialized: boolean;
  // The users-table role (ADMIN/FOREMAN/ENGINEER/DRIVER), fetched alongside the
  // auth user -- null until that fetch resolves, even if `user` is already set.
  role: string | null;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  initialized: false,
  role: null,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [initialized, setInitialized] = useState<boolean>(false);

  const loadRole = async (userId: string | undefined) => {
    if (!userId) {
      setRole(null);
      return;
    }
    const { data } = await supabase.from('users').select('role').eq('id', userId).maybeSingle();
    setRole(data?.role ?? null);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      loadRole(session?.user?.id).finally(() => setInitialized(true));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        loadRole(session?.user?.id);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, user, initialized, role }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
