'use client';
import { useState, useRef, useEffect } from 'react';

export default function Tooltip({ text, children, block }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function close(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const Tag = block ? 'div' : 'span';

  return (
    <Tag
      ref={ref}
      className={`relative ${block ? 'block' : 'inline-block'} cursor-help`}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
    >
      {children}
      {open && (
        <span className="pointer-events-none absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 sm:w-72 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700/60 text-xs text-zinc-300 leading-relaxed shadow-xl animate-toast">
          {text}
        </span>
      )}
    </Tag>
  );
}
