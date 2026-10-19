import { useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NotificationItem } from '@/data/notifications';
import { apiRequest } from '@/lib/api';
import { toast } from 'sonner';

export function useNotificationStore() {
  const queryClient = useQueryClient();

  const {
    data: notificationsData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<NotificationItem[]>({
    queryKey: ['notifications'],
    queryFn: () => apiRequest<NotificationItem[]>('/api/notifications'),
    refetchInterval: 60000, // poll every 60s for timely background reminders
  });

  const notifications = useMemo(
    () => (notificationsData ?? []).filter((n) => !n.isDismissed),
    [notificationsData],
  );

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications],
  );

  const markReadMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest<NotificationItem>(`/api/notifications/${id}/read`, {
        method: 'PATCH',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update notification');
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ success: boolean; updatedCount: number }>(
        '/api/notifications/read-all',
        { method: 'PATCH' },
      ),
    onSuccess: () => {
      toast.success('All notifications marked as read');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to mark all as read');
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest<NotificationItem>(`/api/notifications/${id}/dismiss`, {
        method: 'PATCH',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to dismiss notification');
    },
  });

  const markAsRead = useCallback(
    (id: string) => {
      markReadMutation.mutate(id);
    },
    [markReadMutation],
  );

  const markAllAsRead = useCallback(() => {
    markAllReadMutation.mutate();
  }, [markAllReadMutation]);

  const dismiss = useCallback(
    (id: string) => {
      dismissMutation.mutate(id);
    },
    [dismissMutation],
  );

  return {
    notifications,
    unreadCount,
    isLoading,
    isError,
    error,
    refetch,
    markAsRead,
    markAllAsRead,
    dismiss,
    isMarkingRead: markReadMutation.isPending,
    isMarkingAllRead: markAllReadMutation.isPending,
    isDismissing: dismissMutation.isPending,
  };
}
