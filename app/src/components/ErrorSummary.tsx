import { useEffect, useRef } from 'react';

export function ErrorSummary({ message }: { message: string | null }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message]);

  if (!message) return null;

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="rounded border border-clay bg-clay-50 px-4 py-3 text-sm text-clay focus:outline-none"
    >
      <p className="font-medium">There&apos;s a problem</p>
      <p className="mt-0.5">{message}</p>
    </div>
  );
}
