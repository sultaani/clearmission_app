import clsx from 'clsx';

type Tone = 'forest' | 'amber' | 'gold' | 'clay' | 'slate' | 'neutral';

const TONE_CLASSES: Record<Tone, string> = {
  forest: 'bg-forest-50 text-forest-700',
  amber: 'bg-amber-50 text-amber',
  gold: 'bg-gold-50 text-gold',
  clay: 'bg-clay-50 text-clay',
  slate: 'bg-slate-50 text-slate',
  neutral: 'bg-mist text-ink/70',
};

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center rounded px-2 py-0.5 text-xs font-medium', TONE_CLASSES[tone])}>
      {children}
    </span>
  );
}

export function paymentStatusTone(status: string): Tone {
  if (status === 'paid') return 'forest';
  if (status === 'partial') return 'amber';
  return 'clay'; // unpaid
}
