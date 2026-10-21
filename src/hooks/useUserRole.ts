
import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export type AppRole = 'admin' | 'user';

interface UserRoleResponse {
  role: AppRole;
}

export function useUserRole() {
  const { user } = useAuth();
  // AuthProvider rebuilds `user` on every render; key the fetch on the ID so
  // the role is only reloaded when the signed-in user actually changes.
  const userId = user?.id ?? null;
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!userId) {
        setRoles([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const data = await apiRequest<UserRoleResponse>(
          '/api/users/me/role',
        );

        if (!cancelled) {
          setRoles([data.role]);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('useUserRole:', error);
          setRoles([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return {
    roles,
    isAdmin: roles.includes('admin'),
    loading,
  };
}
