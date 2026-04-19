import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type AppRole = 'admin' | 'user';

export function useUserRole() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user) {
        setRoles([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
      if (cancelled) return;
      if (error) {
        console.warn('useUserRole:', error.message);
        setRoles([]);
      } else {
        setRoles((data ?? []).map((r: { role: AppRole }) => r.role));
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [user]);

  return {
    roles,
    isAdmin: roles.includes('admin'),
    loading,
  };
}
