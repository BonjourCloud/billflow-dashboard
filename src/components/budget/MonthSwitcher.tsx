import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MonthSwitcherProps {
  label: string;
  isCurrent: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function MonthSwitcher({ label, isCurrent, onPrev, onNext, onToday }: MonthSwitcherProps) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Select month">
      <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onPrev} aria-label="Previous month">
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <span className="min-w-[8.5rem] text-center text-sm font-medium" aria-live="polite">
        {label}
      </span>
      <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onNext} aria-label="Next month">
        <ChevronRight className="w-4 h-4" />
      </Button>
      {!isCurrent && (
        <Button variant="outline" size="sm" className="h-9 ml-1" onClick={onToday}>
          This month
        </Button>
      )}
    </div>
  );
}
