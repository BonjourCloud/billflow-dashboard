import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface DuplicateBillDialogProps {
  /** The server's explanation of what matched; null when there is no duplicate to confirm. */
  message: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Asks the user whether to add a bill the server flagged as a likely duplicate. */
export function DuplicateBillDialog({ message, onConfirm, onCancel }: DuplicateBillDialogProps) {
  return (
    <AlertDialog open={message !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent className="glass-card border-border/40">
        <AlertDialogHeader>
          <AlertDialogTitle>This looks like a duplicate</AlertDialogTitle>
          <AlertDialogDescription>
            {message} Add it anyway only if it is a separate bill.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Don't add</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Add anyway</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
