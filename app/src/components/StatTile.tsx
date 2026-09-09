import clsx from 'clsx';

type Tone = 'forest' | 'amber' | 'gold' | 'clay' | 'slate';

const TONE_TEXT: Record<Tone, string> = {
  forest: 'text-forest-700',
  amber: 'text-amber',
  gold: 'text-gold',
  clay: 'text-clay',
  slate: 'text-slate',
};

export function StatTile({
  label,
  value,
  tone = 'forest',
  icon,
}: {
  label: string;
  value: string;
  tone?: Tone;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-mist-border bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink/60">{label}</span>
        {icon && <span className={TONE_TEXT[tone]}>{icon}</span>}
      </div>
      <span className={clsx('tabular-nums text-2xl font-bold', TONE_TEXT[tone])}>{value}</span>
    </div>
  );
}
