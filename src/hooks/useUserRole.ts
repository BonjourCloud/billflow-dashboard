
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
  // The user ID the current `roles` belong to. Deriving `loading` from it
  // during render (instead of a separate flag set in the effect) prevents a
  // stale "loaded, no roles" result in the render where a user first appears,
  // e.g. when Clerk finishes loading on a direct visit to /admin. That stale
  // render made AdminRoute redirect admins to /dashboard.
  const [resolvedFor, setResolvedFor] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!userId) {
        setRoles([]);
        setResolvedFor(null);
        return;
      }

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
          setResolvedFor(userId);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const loading = resolvedFor !== userId;
  const currentRoles = loading ? [] : roles;

  return {
    roles: currentRoles,
    isAdmin: currentRoles.includes('admin'),
    loading,
  };
}
