import { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/types/database';

type UserRole = Database['public']['Tables']['user_roles']['Row']['role'];

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
      const { data: userData, error: userError } = await supabase
        .from('users_extended')
        .select('*')
        .eq('auth_user_id', authUser.id)
        .single();

      if (userError) throw userError;

      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', authUser.id)
        .single();

      if (roleError) throw roleError;

      if (userData && roleData) {
        setUser({
          user: authUser,
          firstName: (userData as any).first_name,
          lastName: (userData as any).last_name,
          role: roleData.role,
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
