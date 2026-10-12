import { Ban } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";

type CancelConfirmationProps = {
  open: boolean;
  itemLabel: string;
  itemName: string;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function CancelConfirmation({
  open,
  itemLabel,
  itemName,
  pending = false,
  onOpenChange,
  onConfirm,
}: CancelConfirmationProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark {itemLabel} as cancelled?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong className="text-foreground">{itemName}</strong> will be shown in red and cannot be
            selected for new work. You can restore it later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep active</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "destructive" })}
            disabled={pending}
            onClick={onConfirm}
          >
            <Ban /> {pending ? "Cancelling…" : "Mark cancelled"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
