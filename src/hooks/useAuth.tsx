import { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/types/database';

type UserRole = Database['public']['Tables']['users_extended']['Row']['role'];

export interface ExtendedUser {
  user: User;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export function useAuth() {
  const [user, setUser] = useState<ExtendedUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active sessions
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchUserExtended(session.user);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchUserExtended(session.user);
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserExtended = async (authUser: User) => {
    try {
      const { data, error } = await supabase
        .from('users_extended')
        .select('*')
        .eq('auth_user_id', authUser.id)
        .single();

      if (error) throw error;

      if (data) {
        setUser({
          user: authUser,
          firstName: (data as any).first_name,
          lastName: (data as any).last_name,
          role: (data as any).role,
        });
      }
    } catch (error) {
      console.error('Error fetching user extended data:', error);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return { user, loading, signOut };
}
