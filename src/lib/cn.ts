import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: ['display', 'h1', 'h2', 'h3', 'lead', 'body', 'small', 'micro'] }] } },
});
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
