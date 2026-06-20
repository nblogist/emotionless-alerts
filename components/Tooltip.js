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
    const left = Math.max(160, Math.min(rect.left + rect.width / 2, window.innerWidth - 160));
    const showBelow = rect.top < 200;
    setPos({
      top: showBelow ? rect.bottom + 8 : rect.top - 8,
      left,
      below: showBelow,
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
      className={`${block ? 'block' : 'inline-block'} cursor-help group/tip`}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
    >
      {children}
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          className="pointer-events-none fixed z-[9999] w-72 sm:w-80 px-3.5 py-2.5 rounded-xl text-xs text-zinc-200 leading-relaxed shadow-2xl animate-toast whitespace-pre-line"
          style={{
            position: 'fixed',
            zIndex: 99999,
            top: pos.top,
            left: pos.left,
            transform: `translate(-50%, ${pos.below ? '0%' : '-100%'})`,
            backgroundColor: '#1e1e24',
            border: '1px solid rgba(82, 82, 91, 0.7)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.3)',
          }}
        >
          {text}
        </div>,
        document.body
      )}
    </Tag>
  );
}
