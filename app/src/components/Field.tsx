import { InputHTMLAttributes, SelectHTMLAttributes, forwardRef, useId } from 'react';
import clsx from 'clsx';

type FieldProps = { label: string; error?: string; hint?: string };

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & FieldProps
>(({ label, error, hint, id, className, ...props }, ref) => {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const errorId = `${fieldId}-error`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        className={clsx(
          'w-full min-w-0 rounded border px-3 py-2 text-sm text-ink placeholder:text-ink/40',
          'focus:outline-none focus-visible:outline-2 focus-visible:outline-forest',
          error ? 'border-clay' : 'border-mist-border',
          className
        )}
        {...props}
      />
      {hint && !error && <span className="text-xs text-ink/60">{hint}</span>}
      {error && (
        <span id={errorId} role="alert" className="text-xs text-clay">
          {error}
        </span>
      )}
    </div>
  );
});
Input.displayName = 'Input';

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & FieldProps
>(({ label, error, id, className, children, ...props }, ref) => {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <select
        ref={ref}
        id={fieldId}
        aria-invalid={!!error}
        className={clsx(
          'w-full min-w-0 rounded border px-3 py-2 text-sm text-ink bg-white',
          'focus:outline-none focus-visible:outline-2 focus-visible:outline-forest',
          error ? 'border-clay' : 'border-mist-border',
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error && <span role="alert" className="text-xs text-clay">{error}</span>}
    </div>
  );
});
Select.displayName = 'Select';
