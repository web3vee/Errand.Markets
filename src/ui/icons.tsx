import type { SVGProps } from 'react';

const base = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export const IconCheck = (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M3.5 8.5l3 3 6-7" /></svg>);
/** Points "forward" — mirrored automatically in RTL. */
export const IconArrow = ({ className = '', ...p }: SVGProps<SVGSVGElement>) => (
  <svg {...base} className={`rtl:-scale-x-100 ${className}`} {...p}><path d="M3 8h10M9 4l4 4-4 4" /></svg>
);
export const IconChevron = (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M4 6l4 4 4-4" /></svg>);
export const IconMenu = (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M2.5 5h11M2.5 11h11" /></svg>);
export const IconDot = (p: SVGProps<SVGSVGElement>) => (<svg width="8" height="8" viewBox="0 0 8 8" aria-hidden {...p}><circle cx="4" cy="4" r="4" fill="currentColor" /></svg>);
