'use client';

import { useEffect, useState } from 'react';

/** Stage 2 review aid only: switches the homepage between direction A and B. Removed once a direction is chosen. */
export function DirectionToggle({ label, a, b }: { label: string; a: string; b: string }) {
  const [dir, setDir] = useState<'a' | 'b'>('a');
  useEffect(() => {
    setDir(document.documentElement.dataset.direction === 'b' ? 'b' : 'a');
  }, []);
  const pick = (d: 'a' | 'b') => {
    document.documentElement.dataset.direction = d;
    try {
      localStorage.setItem('em_dir', d);
    } catch {}
    const url = new URL(location.href);
    url.searchParams.set('direction', d);
    history.replaceState(null, '', url);
    setDir(d);
  };
  return (
    <aside
      aria-label={label}
      className="fixed bottom-4 start-1/2 z-40 flex -translate-x-1/2 gap-1 rounded-full border border-line bg-surface p-1 shadow-[0_8px_24px_-12px_rgb(0_0_0/0.35)] rtl:translate-x-1/2"
    >
      {(['a', 'b'] as const).map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={dir === d}
          onClick={() => pick(d)}
          className={`min-h-11 whitespace-nowrap rounded-full px-4 text-small font-medium transition-colors duration-[var(--duration-fast)] ${dir === d ? 'bg-ink text-bg' : 'text-ink-2 hover:text-ink'}`}
        >
          {d === 'a' ? a : b}
        </button>
      ))}
    </aside>
  );
}
