import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  X,
  AlertCircle,
  Clock,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotificationStore } from '@/hooks/useNotificationStore';
import { NotificationItem } from '@/data/notifications';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    isLoading,
    isError,
    refetch,
    markAsRead,
    markAllAsRead,
    dismiss,
    isMarkingAllRead,
  } = useNotificationStore();

  const handleNotificationClick = (item: NotificationItem) => {
    if (!item.isRead) {
      markAsRead(item._id);
    }
    if (item.billId) {
      setOpen(false);
      navigate(`/bill/${item.billId}`);
    }
  };

  const handleDismiss = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    dismiss(id);
  };

  const handleMarkRead = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    markAsRead(id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-xl active:scale-95 transition-transform"
          title="Notifications"
          aria-label={`Notifications (${unreadCount} unread)`}
        >
          <Bell className="w-4 h-4 text-foreground" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center animate-in fade-in zoom-in-75 duration-200"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="glass-card border-border/40 w-[350px] sm:w-[400px] p-0 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/20 bg-secondary/30">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm text-foreground">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                {unreadCount} unread
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={isMarkingAllRead}
              onClick={() => markAllAsRead()}
              className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1 px-2 active:scale-95"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Mark all read</span>
            </Button>
          )}
        </div>

        {/* Content Body */}
        {isLoading && notifications.length === 0 ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-secondary/60 shrink-0" />
                <div className="flex-1 space-y-1.5 pt-0.5">
                  <div className="h-3.5 bg-secondary/60 rounded w-3/4" />
                  <div className="h-2.5 bg-secondary/40 rounded w-5/6" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="p-6 text-center space-y-2">
            <p className="text-xs text-destructive">
              Failed to load notifications
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-1.5 text-xs h-7"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </Button>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <div className="w-10 h-10 rounded-2xl bg-secondary/50 text-muted-foreground flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-5 h-5 text-primary" />
            </div>
            <p className="font-medium text-xs text-foreground">
              You're all caught up!
            </p>
            <p className="text-[11px] text-muted-foreground max-w-[220px] mx-auto">
              Upcoming bill due dates and overdue reminders will appear here.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[360px]">
            <div className="divide-y divide-border/10">
              {notifications.map((item) => {
                const isOverdue = item.type === 'overdue';
                const IconComponent = isOverdue ? AlertCircle : Clock;
                const iconCls = isOverdue
                  ? 'text-destructive bg-destructive/10'
                  : 'text-amber-500 bg-amber-500/10';

                return (
                  <div
                    key={item._id}
                    onClick={() => handleNotificationClick(item)}
                    className={`group p-3.5 flex items-start gap-3 hover:bg-secondary/40 cursor-pointer transition-colors relative ${
                      !item.isRead ? 'bg-primary/5' : ''
                    }`}
                  >
                    {/* Urgency Icon */}
                    <div
                      className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center mt-0.5 ${iconCls}`}
                    >
                      <IconComponent className="w-4 h-4" />
                    </div>

                    {/* Notification Details */}
                    <div className="flex-1 min-w-0 pr-14">
                      <div className="flex items-center gap-1.5">
                        <p
                          className={`text-xs truncate ${
                            !item.isRead
                              ? 'font-semibold text-foreground'
                              : 'font-medium text-muted-foreground'
                          }`}
                        >
                          {item.title}
                        </p>
                        {item.planId && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-primary/10 text-primary border border-primary/20 shrink-0">
                            EMI
                          </span>
                        )}
                        {!item.isRead && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-primary shrink-0"
                            title="Unread"
                          />
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                        {item.message}
                      </p>
                    </div>

                    {/* Action Controls */}
                    <div className="absolute right-2 top-2 flex items-center gap-0.5">
                      {!item.isRead && (
                        <button
                          type="button"
                          onClick={(e) => handleMarkRead(e, item._id)}
                          title="Mark as read"
                          aria-label="Mark as read"
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 active:scale-95 transition-all"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleDismiss(e, item._id)}
                        title="Dismiss"
                        aria-label="Dismiss notification"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 active:scale-95 transition-all"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
