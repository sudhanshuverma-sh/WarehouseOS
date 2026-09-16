import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Columns3, GripVertical, Maximize2, Minimize2, RotateCcw } from 'lucide-react';
import {
  EMPTY_LAYOUT,
  arrange,
  dropKey,
  isCustomised,
  loadLayout,
  moveKey,
  saveLayout,
  toggleHidden,
  type ColumnLayout,
} from '../../lib/table/columnLayout';
import { Popover } from './Popover';

/**
 * Shared table controls: arrange columns, hide the ones you do not need,
 * and open the table full screen.
 *
 * Every table keeps its own layout under its own storage key, remembered
 * for next time. Columns can be dragged by their header or moved with the
 * buttons in the Columns menu, which is the same thing done from the
 * keyboard.
 */

export interface TableColumnInfo {
  key: string;
  label: string;
}

export function useColumnLayout(storageKey: string, keys: string[]) {
  const [layout, setLayout] = useState<ColumnLayout>(() => loadLayout(storageKey));
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  // Each table (and each form inside Records) has its own saved layout.
  const loadedFor = useRef(storageKey);
  useEffect(() => {
    if (loadedFor.current === storageKey) return;
    loadedFor.current = storageKey;
    setLayout(loadLayout(storageKey));
  }, [storageKey]);

  const apply = (next: ColumnLayout) => {
    setLayout(next);
    saveLayout(storageKey, next);
  };

  const move = (key: string, step: -1 | 1) => apply({ ...layout, order: moveKey(layout.order, keys, key, step) });
  const toggle = (key: string) => apply(toggleHidden(layout, key, keys));
  const reset = () => apply(EMPTY_LAYOUT);

  /** Spread onto a <th> to let it be dragged into another position. */
  const dragProps = (key: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setDragging(key);
      e.dataTransfer.effectAllowed = 'move';
      // Firefox only starts a drag when something is set.
      e.dataTransfer.setData('text/plain', key);
    },
    onDragOver: (e: React.DragEvent) => {
      if (!dragging || dragging === key) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setOver(key);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const from = dragging ?? e.dataTransfer.getData('text/plain');
      if (from && from !== key) apply({ ...layout, order: dropKey(layout.order, keys, from, key) });
      setDragging(null);
      setOver(null);
    },
    onDragEnd: () => {
      setDragging(null);
      setOver(null);
    },
    className: `${dragging === key ? 'opacity-50' : ''} ${over === key ? 'bg-slate-200' : ''}`,
  });

  return { layout, move, toggle, reset, dragProps, customised: isCustomised(layout) };
}

/** Columns in this table's arranged order, hidden ones removed. */
export const visibleColumns = arrange;

const MENU_ITEM = 'flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs';

export const ColumnsMenu: React.FC<{
  columns: TableColumnInfo[];
  layout: ColumnLayout;
  onMove: (key: string, step: -1 | 1) => void;
  onToggle: (key: string) => void;
  onReset: () => void;
  customised: boolean;
}> = ({ columns, layout, onMove, onToggle, onReset, customised }) => {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  // The menu lists every column, in the order the table shows them.
  const ordered = useMemo(() => {
    const shown = arrange(columns, { ...layout, hidden: [] });
    return shown.map((c) => ({ ...c, hidden: layout.hidden.includes(c.key) }));
  }, [columns, layout]);
  const hiddenCount = layout.hidden.length;

  return (
    <div className="inline-block">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        title="Choose and arrange columns"
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 active:scale-[0.98] transition cursor-pointer"
      >
        <Columns3 className="w-3.5 h-3.5" />
        Columns
        {hiddenCount > 0 && <span className="font-mono text-[11px] text-slate-500">{ordered.length - hiddenCount}/{ordered.length}</span>}
      </button>

      <Popover open={open} onClose={() => setOpen(false)} anchor={trigger} align="right" width={288} label="Columns">
        <div className="max-h-96 overflow-y-auto p-2">
          <p className="px-2 py-1 text-[11px] text-slate-500">Drag a header, or move columns here.</p>
          <ul>
            {ordered.map((c, i) => (
              <li key={c.key} className={`${MENU_ITEM} hover:bg-slate-50`}>
                <label className="flex-1 min-w-0 flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!c.hidden}
                    onChange={() => onToggle(c.key)}
                    className="w-3.5 h-3.5 rounded border-slate-300 accent-[var(--color-ink)] cursor-pointer"
                  />
                  <span className={`truncate ${c.hidden ? 'text-slate-400' : 'text-slate-800'}`} title={c.label}>
                    {c.label}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => onMove(c.key, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${c.label} left`}
                  className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onMove(c.key, 1)}
                  disabled={i === ordered.length - 1}
                  aria-label={`Move ${c.label} right`}
                  className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
          {customised && (
            <button
              type="button"
              onClick={onReset}
              className="mt-1 w-full inline-flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset columns
            </button>
          )}
        </div>
      </Popover>
    </div>
  );
};

/** The grip shown in a draggable header. */
export const DragHandle: React.FC = () => (
  <GripVertical className="w-3 h-3 shrink-0 text-slate-300 cursor-grab active:cursor-grabbing" aria-hidden />
);

export const ExpandButton: React.FC<{ expanded: boolean; onToggle: () => void }> = ({ expanded, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={expanded}
    title={expanded ? 'Leave full screen (Esc)' : 'Full screen'}
    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 active:scale-[0.98] transition cursor-pointer"
  >
    {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
    <span className="hidden sm:inline">{expanded ? 'Exit full screen' : 'Full screen'}</span>
  </button>
);

/**
 * Wraps a table so it can fill the window. Expanded, it is the page: the
 * app's own scroll is locked, and Esc puts it back.
 */
export const TableFullscreen: React.FC<{ expanded: boolean; onCollapse: () => void; children: React.ReactNode }> = ({
  expanded,
  onCollapse,
  children,
}) => {
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCollapse();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [expanded, onCollapse]);

  if (!expanded) return <>{children}</>;
  return (
    <div className="fixed inset-0 z-40 bg-(--color-floor) p-3 sm:p-4 overflow-auto flex flex-col" role="region" aria-label="Table, full screen">
      {children}
    </div>
  );
};
