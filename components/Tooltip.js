'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export default function Tooltip({ text, children, block }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);

  const updatePos = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({
      top: rect.top,
      left: rect.left + rect.width / 2,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    function close(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', close);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [open, updatePos]);

  const Tag = block ? 'div' : 'span';

  return (
    <Tag
      ref={ref}
      className={`${block ? 'block' : 'inline-block'} cursor-help`}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
    >
      {children}
      {open && pos && typeof document !== 'undefined' && createPortal(
        <span
          className="pointer-events-none fixed z-[9999] w-56 sm:w-72 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700/60 text-xs text-zinc-300 leading-relaxed shadow-xl animate-toast whitespace-pre-line"
          style={{
            top: pos.top - 8,
            left: pos.left,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {text}
        </span>,
        document.body
      )}
    </Tag>
  );
}
