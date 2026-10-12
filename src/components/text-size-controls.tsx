import { Minus, Plus, Redo2, RotateCcw, Undo2 } from "lucide-react";

import { columnScale, SCALE_STEP, type TextScaleController } from "@/lib/text-scale";

type Props = {
  controller: TextScaleController;
  /** Column id of the box the user last clicked, if any. */
  targetId: string | null;
  /** Friendly name of that box, shown next to the buttons. */
  targetLabel: string | null;
};

/** Text size stepper for the selected box, with undo / redo of size changes. */
export function TextSizeControls({ controller, targetId, targetLabel }: Props) {
  const percent = Math.round(columnScale(controller.scales, targetId) * 100);
  return (
    <div className="text-size-controls">
      <span className="text-size-label">Text size</span>
      <div className="text-size-buttons">
        <button
          type="button"
          className="icon-button tsz-plus"
           title="Increase column text size"
          disabled={!targetId}
          onClick={() => targetId && controller.bump(targetId, SCALE_STEP)}
        >
          <Plus size={14} strokeWidth={3} />
        </button>
        <span className="text-size-value">{targetId ? `${percent}%` : "—"}</span>
        <button
          type="button"
          className="icon-button tsz-minus"
           title="Decrease column text size"
          disabled={!targetId}
          onClick={() => targetId && controller.bump(targetId, -SCALE_STEP)}
        >
          <Minus size={14} strokeWidth={3} />
        </button>
        <button
          type="button"
          className="icon-button"
           title="Reset column text size"
          disabled={!targetId}
          onClick={() => targetId && controller.resetColumn(targetId)}
        >
          <RotateCcw size={13} />
        </button>
        <button
          type="button"
          className="icon-button"
          title="Undo size change"
          disabled={!controller.canUndo}
          onClick={controller.undo}
        >
          <Undo2 size={14} />
        </button>
        <button
          type="button"
          className="icon-button"
          title="Redo size change"
          disabled={!controller.canRedo}
          onClick={controller.redo}
        >
          <Redo2 size={14} />
        </button>
      </div>
      <small className="text-size-hint">
        {targetId ? targetLabel ?? "Selected column" : "—"}
      </small>
    </div>
  );
}
