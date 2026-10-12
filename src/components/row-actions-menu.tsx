import { MoreVertical, Pencil } from "lucide-react";
import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type RowAction = {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
};

export function RowActionsMenu({
  editLabel,
  onEdit,
  actions,
  onTriggerPosition,
}: {
  editLabel: string;
  onEdit: () => void;
  actions: RowAction[];
  onTriggerPosition?: ((top: number) => void) | undefined;
}) {
  return (
    <div className="ro-row-actions">
      <button className="icon-button" title={editLabel} aria-label={editLabel} onClick={onEdit}>
        <Pencil size={14} />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="icon-button"
            title="More actions"
            aria-label="More actions"
            onClick={(event) => onTriggerPosition?.(event.currentTarget.getBoundingClientRect().top)}
          >
            <MoreVertical size={15} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="row-actions-menu">
          {actions.map((action) => (
              <DropdownMenuItem
                key={action.label}
                disabled={action.disabled ?? false}
                onSelect={() => action.onSelect()}
                className={action.danger ? "row-action-danger" : undefined}
              >
                <span className="row-action-icon">{action.icon}</span>
                {action.label}
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
