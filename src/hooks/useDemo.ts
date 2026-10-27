import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export interface DemoStatus {
  /** The server has a demo account configured. */
  enabled: boolean;
  /** The signed-in user is the demo account. */
  isDemoUser: boolean;
}

const OFF: DemoStatus = { enabled: false, isDemoUser: false };

export function useDemo() {
  const { session, loading, signInWithTicket } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const signedIn = Boolean(session);
  const [starting, setStarting] = useState(false);
  const [resetting, setResetting] = useState(false);

  const { data } = useQuery<DemoStatus>({
    queryKey: ['demo-status', signedIn],
    enabled: !loading,
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      apiRequest<DemoStatus>('/api/demo/status', { authenticated: signedIn }),
    // The landing page must keep working if the API is asleep or unreachable.
    retry: false,
  });
  const status = data ?? OFF;

  const startDemo = useCallback(async () => {
    setStarting(true);
    try {
      const { ticket } = await apiRequest<{ ticket: string }>('/api/demo/session', {
        method: 'POST',
        authenticated: false,
      });
      await signInWithTicket(ticket);
      queryClient.clear();
      navigate('/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the demo.');
    } finally {
      setStarting(false);
    }
  }, [navigate, queryClient, signInWithTicket]);

  const resetDemo = useCallback(async () => {
    setResetting(true);
    try {
      await apiRequest('/api/demo/reset', { method: 'POST', body: JSON.stringify({}) });
      await queryClient.invalidateQueries();
      toast.success('Demo data reset');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reset the demo.');
    } finally {
      setResetting(false);
    }
  }, [queryClient]);

  return { status, startDemo, starting, resetDemo, resetting };
}
