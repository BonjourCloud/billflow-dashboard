
import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export type AppRole = 'admin' | 'user';

interface UserRoleResponse {
  role: AppRole;
}

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
  }, [user]);

  return {
    roles,
    isAdmin: roles.includes('admin'),
    loading,
  };
}
