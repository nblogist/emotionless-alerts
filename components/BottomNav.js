'use client';
import Link from 'next/link';

export default function BottomNav({ active, portfolioId }) {
  const pid = portfolioId || '';

  const items = [
    { href: `/?portfolio=${pid}`, key: 'dashboard', label: 'Dashboard', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M22 12h-4l-3 9L9 3l-3 9H2"/> },
    { href: `/transactions?portfolio=${pid}`, key: 'transactions', label: 'Portfolio', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/> },
    { href: `/settings?portfolio=${pid}`, key: 'settings', label: 'Settings', icon: <><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></> },
  ];

  return (
    <nav className="sm:hidden fixed left-0 right-0 z-30 pb-safe" style={{ bottom: 0 }}>
      <div className="mx-3 mb-2 glass-strong rounded-2xl shadow-xl shadow-black/30">
        <div className="flex items-center justify-around py-2.5">
          {items.map((item) => {
            const isActive = item.key === active;
            const Wrapper = isActive ? 'div' : Link;
            const props = isActive ? {} : { href: item.href };
            return (
              <Wrapper key={item.key} {...props} className={`flex flex-col items-center gap-1 px-4 py-1 rounded-xl transition-all duration-200 ${isActive ? 'text-emerald-400' : 'text-zinc-500 active:text-zinc-300 active:bg-zinc-800/40'}`}>
                <div className="relative">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={isActive ? 2.5 : 1.8}>
                    {item.icon}
                  </svg>
                  {isActive && (
                    <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-400" />
                  )}
                </div>
                <span className={`text-[10px] ${isActive ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
              </Wrapper>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
