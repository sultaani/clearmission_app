import { ButtonHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Size = 'sm' | 'md';

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-forest text-white hover:bg-forest-700 disabled:bg-forest/40',
  secondary: 'bg-white text-ink border border-mist-border hover:bg-mist disabled:opacity-50',
  ghost: 'bg-transparent text-ink hover:bg-mist disabled:opacity-50',
  destructive: 'bg-clay text-white hover:bg-clay/90 disabled:bg-clay/40',
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'text-sm px-3 py-1.5',
  md: 'text-sm px-4 py-2.5',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(({ variant = 'primary', size = 'md', className, ...props }, ref) => (
  <button
    ref={ref}
    className={clsx(
      'inline-flex items-center justify-center gap-2 rounded font-medium cursor-pointer',
      'transition-colors duration-200 disabled:cursor-not-allowed',
      VARIANT_CLASSES[variant],
      SIZE_CLASSES[size],
      className
    )}
    {...props}
  />
));
Button.displayName = 'Button';
