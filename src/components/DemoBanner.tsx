import { RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/hooks/useDemo';

/** Shown on every signed-in page while the demo account is in use. */
export function DemoBanner() {
  const { signOut } = useAuth();
  const { status, resetDemo, resetting } = useDemo();

  if (!status.isDemoUser) return null;

  return (
    <div
      role="status"
      className="mb-4 flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>
          <strong>Demo account.</strong> All data here is sample data, shared with other
          visitors and reset every day. Feel free to add, edit and delete anything.
        </span>
      </p>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="outline" onClick={resetDemo} disabled={resetting} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" />
          {resetting ? 'Resetting…' : 'Reset demo data'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => signOut()}>
          Exit demo
        </Button>
      </div>
    </div>
  );
}
