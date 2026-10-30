import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface RowAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  tone?: 'default' | 'warn' | 'danger';
}

const TONE: Record<NonNullable<RowAction['tone']>, string> = {
  default: 'text-muted-foreground hover:text-foreground',
  warn: 'text-amber-500/80 hover:text-amber-500',
  danger: 'text-destructive/80 hover:text-destructive',
};

/**
 * Edit / delete style buttons for a list row. Always visible: hover-only
 * buttons cannot be found on a touch screen. Each has an accessible name and a
 * tooltip, and the touch target is larger on small screens.
 */
export function RowActions({ actions, className }: { actions: RowAction[]; className?: string }) {
  return (
    <div className={cn('flex justify-end gap-1', className)}>
      {actions.map(({ label, icon: Icon, onClick, tone = 'default' }) => (
        <Button
          key={label}
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          title={label}
          className={cn('h-10 w-10 md:h-8 md:w-8 active:scale-95', TONE[tone])}
          onClick={onClick}
        >
          <Icon className="w-4 h-4 md:w-3.5 md:h-3.5" />
        </Button>
      ))}
    </div>
  );
}
