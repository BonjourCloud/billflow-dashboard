import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { isChunkLoadError, reloadOnceForNewVersion } from '@/lib/chunkReload';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time failures, including lazy pages that cannot be fetched
 * after a new deploy. A stale-chunk error triggers one automatic reload;
 * anything else (or a repeat) shows a message with a manual reload button
 * instead of a blank screen.
 */
export class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkLoadError(error)) {
      reloadOnceForNewVersion();
    } else {
      console.error('Unhandled UI error:', error, info.componentStack);
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const stale = isChunkLoadError(error);
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="glass-card rounded-3xl p-8 max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold">
            {stale ? 'A new version is available' : 'Something went wrong'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {stale
              ? 'BillWill was updated while this page was open. Reload to continue.'
              : 'An unexpected error occurred. Reloading usually fixes it.'}
          </p>
          <Button onClick={() => window.location.reload()}>Reload page</Button>
        </div>
      </div>
    );
  }
}
