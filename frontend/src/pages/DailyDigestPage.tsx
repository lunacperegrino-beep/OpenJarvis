import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  Database,
  FileAudio,
  History,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import {
  digestAudioUrl,
  fetchChannelOverview,
  fetchDigestHistory,
  fetchDigestSchedule,
  fetchTodayDigest,
  generateDigest,
  sendChannelMessage,
  updateDigestSchedule,
  type ChannelOverview,
  type DigestArtifact,
  type DigestSchedule,
} from '../lib/api';

interface DigestSnapshot {
  today: DigestArtifact | null;
  history: DigestArtifact[];
  schedule: DigestSchedule | null;
  channels: ChannelOverview | null;
  errors: {
    today?: string;
    history?: string;
    schedule?: string;
    channels?: string;
  };
}

const EMPTY_SNAPSHOT: DigestSnapshot = {
  today: null,
  history: [],
  schedule: null,
  channels: null,
  errors: {},
};

const QUICK_TIMES = ['06:00', '07:30', '08:00'];
const COMMON_TIMEZONES = ['Europe/Lisbon', 'UTC', 'America/Los_Angeles', 'America/New_York'];
const LOCAL_TIMEZONE =
  typeof Intl !== 'undefined'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    : 'UTC';

export function DailyDigestPage() {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<DigestSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [sendingDigest, setSendingDigest] = useState(false);
  const [selectedGeneratedAt, setSelectedGeneratedAt] = useState<string | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [cronValue, setCronValue] = useState('0 6 * * *');
  const [timeValue, setTimeValue] = useState('06:00');
  const [timezoneValue, setTimezoneValue] = useState(LOCAL_TIMEZONE);
  const [sendTarget, setSendTarget] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    const [today, history, schedule, channels] = await Promise.allSettled([
      fetchTodayDigest(),
      fetchDigestHistory(12),
      fetchDigestSchedule(),
      fetchChannelOverview(),
    ]);

    const next: DigestSnapshot = {
      today: settledValue(today) ?? null,
      history: settledValue(history) ?? [],
      schedule: settledValue(schedule) ?? null,
      channels: settledValue(channels) ?? null,
      errors: {
        today: settledError(today),
        history: settledError(history),
        schedule: settledError(schedule),
        channels: settledError(channels),
      },
    };

    setSnapshot(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!snapshot.schedule) return;
    setScheduleEnabled(snapshot.schedule.enabled);
    setCronValue(snapshot.schedule.cron);
    setTimeValue(timeFromCron(snapshot.schedule.cron) ?? '06:00');
    setTimezoneValue(snapshot.schedule.timezone || LOCAL_TIMEZONE);
  }, [snapshot.schedule]);

  useEffect(() => {
    const firstTarget = snapshot.channels?.bridge.channels[0] ?? '';
    setSendTarget((current) => current || firstTarget);
  }, [snapshot.channels]);

  const digestOptions = useMemo(() => {
    const byGeneratedAt = new Map<string, DigestArtifact>();
    if (snapshot.today) byGeneratedAt.set(snapshot.today.generated_at, snapshot.today);
    for (const item of snapshot.history) byGeneratedAt.set(item.generated_at, item);
    return Array.from(byGeneratedAt.values()).sort(
      (a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime(),
    );
  }, [snapshot.today, snapshot.history]);

  const activeDigest = useMemo(() => {
    if (!digestOptions.length) return null;
    if (selectedGeneratedAt) {
      const selected = digestOptions.find((item) => item.generated_at === selectedGeneratedAt);
      if (selected) return selected;
    }
    return snapshot.today ?? digestOptions[0];
  }, [digestOptions, selectedGeneratedAt, snapshot.today]);

  const todaySelected = Boolean(
    activeDigest && snapshot.today && activeDigest.generated_at === snapshot.today.generated_at,
  );
  const channelTargets = snapshot.channels?.bridge.channels ?? [];
  const hasErrors = Object.values(snapshot.errors).some(Boolean);

  const runGenerate = async () => {
    setGenerating(true);
    try {
      const result = await generateDigest();
      if (result.artifact) setSelectedGeneratedAt(result.artifact.generated_at);
      toast.success('Digest generated');
      await refresh();
    } catch (err) {
      toast.error('Digest generation failed', { description: errorMessage(err) });
    } finally {
      setGenerating(false);
    }
  };

  const saveSchedule = async () => {
    setSavingSchedule(true);
    try {
      const next = await updateDigestSchedule(scheduleEnabled, cronValue.trim(), timezoneValue.trim());
      setSnapshot((current) => ({ ...current, schedule: next }));
      toast.success(scheduleEnabled ? 'Digest schedule saved' : 'Digest schedule disabled');
    } catch (err) {
      toast.error('Could not update schedule', { description: errorMessage(err) });
    } finally {
      setSavingSchedule(false);
    }
  };

  const updateTime = (value: string) => {
    setTimeValue(value);
    setCronValue(cronFromTime(value));
  };

  const copyDigest = async () => {
    if (!activeDigest?.text) return;
    await navigator.clipboard.writeText(activeDigest.text);
    toast.success('Digest copied');
  };

  const sendDigest = async () => {
    if (!activeDigest?.text || !sendTarget.trim()) return;
    setSendingDigest(true);
    try {
      await sendChannelMessage(sendTarget.trim(), activeDigest.text);
      toast.success(`Digest sent to ${sendTarget}`);
    } catch (err) {
      toast.error('Could not send digest', { description: errorMessage(err) });
    } finally {
      setSendingDigest(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ background: 'var(--color-accent-subtle)', color: 'var(--color-accent)' }}
            >
              <CalendarDays size={20} />
            </div>
            <div>
              <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
                Daily Brief
              </h1>
              <div className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {activeDigest ? `Latest ${formatDate(activeDigest.generated_at)}` : 'No digest loaded'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <HeaderButton icon={Database} label="Sources" onClick={() => navigate('/data-sources')} />
            <HeaderButton icon={MessageSquare} label="Channels" onClick={() => navigate('/channels')} />
            <button
              type="button"
              onClick={refresh}
              disabled={loading || generating}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer"
              style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
                opacity: loading ? 0.75 : 1,
              }}
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Refresh
            </button>
            <button
              type="button"
              onClick={runGenerate}
              disabled={generating}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer"
              style={{
                background: 'var(--color-accent)',
                border: '1px solid var(--color-accent)',
                color: 'var(--color-on-accent)',
                opacity: generating ? 0.75 : 1,
              }}
            >
              {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              Generate Now
            </button>
          </div>
        </header>

        {hasErrors && (
          <Notice icon={AlertTriangle} title="Some digest checks could not run">
            {Object.entries(snapshot.errors)
              .filter(([, value]) => Boolean(value))
              .map(([key, value]) => `${key}: ${value}`)
              .join('  ')}
          </Notice>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={History}
            label="History"
            value={digestOptions.length}
            detail={digestOptions.length === 1 ? 'saved digest' : 'saved digests'}
          />
          <MetricCard
            icon={Clock3}
            label="Schedule"
            value={snapshot.schedule?.enabled ? 'On' : 'Off'}
            detail={describeCron(snapshot.schedule?.cron)}
          />
          <MetricCard
            icon={Database}
            label="Sources"
            value={activeDigest?.sources_used.length ?? 0}
            detail="included in selected brief"
          />
          <MetricCard
            icon={FileAudio}
            label="Audio"
            value={activeDigest?.audio_available ? 'Ready' : 'None'}
            detail={activeDigest?.voice_used || 'No voice metadata'}
          />
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Panel
            title={activeDigest ? formatDigestTitle(activeDigest) : 'Today'}
            icon={CalendarDays}
            action={
              activeDigest ? (
                <button
                  type="button"
                  onClick={copyDigest}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer"
                  style={{
                    background: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  <Copy size={12} />
                  Copy
                </button>
              ) : null
            }
          >
            {loading && !activeDigest ? (
              <LoadingRow label="Loading digest..." />
            ) : activeDigest ? (
              <div className="flex flex-col gap-4">
                {activeDigest.audio_available && todaySelected && (
                  <audio
                    controls
                    src={`${digestAudioUrl()}?ts=${encodeURIComponent(activeDigest.generated_at)}`}
                    className="w-full"
                  />
                )}
                <div className="prose prose-sm max-w-none" style={{ color: 'var(--color-text)' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeDigest.text}</ReactMarkdown>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="No digest for today"
                detail="Generate one now or enable a daily schedule."
              />
            )}
          </Panel>

          <div className="flex flex-col gap-5">
            <Panel title="Schedule" icon={Clock3}>
              <div className="flex flex-col gap-3">
                <label className="flex items-center justify-between gap-3 text-sm" style={{ color: 'var(--color-text)' }}>
                  <span>Enabled</span>
                  <input
                    type="checkbox"
                    checked={scheduleEnabled}
                    onChange={(event) => setScheduleEnabled(event.target.checked)}
                    className="h-4 w-4 accent-[var(--color-accent)]"
                  />
                </label>

                <label className="flex flex-col gap-1.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  Time
                  <input
                    type="time"
                    value={timeValue}
                    onChange={(event) => updateTime(event.target.value)}
                    className="rounded-lg px-3 py-2 text-sm outline-none"
                    style={{
                      background: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                  />
                </label>

                <div className="flex flex-wrap gap-1.5">
                  {QUICK_TIMES.map((time) => (
                    <button
                      key={time}
                      type="button"
                      onClick={() => updateTime(time)}
                      className="rounded-md px-2 py-1 text-xs transition-colors cursor-pointer"
                      style={{
                        background: timeValue === time ? 'var(--color-accent-subtle)' : 'var(--color-bg-secondary)',
                        border: '1px solid var(--color-border)',
                        color: timeValue === time ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                      }}
                    >
                      {time}
                    </button>
                  ))}
                </div>

                <label className="flex flex-col gap-1.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  Cron
                  <input
                    value={cronValue}
                    onChange={(event) => setCronValue(event.target.value)}
                    className="rounded-lg px-3 py-2 font-mono text-xs outline-none"
                    style={{
                      background: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                  />
                </label>

                <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  {describeCron(cronValue)}
                  {snapshot.schedule?.timezone ? ` · ${snapshot.schedule.timezone}` : ''}
                </div>

                <label className="flex flex-col gap-1.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  Timezone
                  <input
                    list="digest-timezones"
                    value={timezoneValue}
                    onChange={(event) => setTimezoneValue(event.target.value)}
                    className="rounded-lg px-3 py-2 text-sm outline-none"
                    style={{
                      background: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                  />
                  <datalist id="digest-timezones">
                    {Array.from(new Set([LOCAL_TIMEZONE, ...COMMON_TIMEZONES])).map((timezone) => (
                      <option key={timezone} value={timezone} />
                    ))}
                  </datalist>
                </label>

                <button
                  type="button"
                  onClick={saveSchedule}
                  disabled={savingSchedule}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer"
                  style={{
                    background: 'var(--color-accent)',
                    border: '1px solid var(--color-accent)',
                    color: 'var(--color-on-accent)',
                    opacity: savingSchedule ? 0.75 : 1,
                  }}
                >
                  {savingSchedule ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  Save Schedule
                </button>
              </div>
            </Panel>

            <Panel title="Send" icon={Send}>
              <div className="flex flex-col gap-3">
                {channelTargets.length > 0 ? (
                  <>
                    <select
                      value={sendTarget}
                      onChange={(event) => setSendTarget(event.target.value)}
                      className="rounded-lg px-3 py-2 text-sm outline-none"
                      style={{
                        background: 'var(--color-bg-secondary)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text)',
                      }}
                    >
                      {channelTargets.map((target) => (
                        <option key={target} value={target}>
                          {target}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={sendDigest}
                      disabled={!activeDigest || sendingDigest}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer"
                      style={{
                        background: 'var(--color-bg-secondary)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text)',
                        opacity: !activeDigest || sendingDigest ? 0.65 : 1,
                      }}
                    >
                      {sendingDigest ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                      Send Digest
                    </button>
                  </>
                ) : (
                  <EmptyState
                    icon={MessageSquare}
                    title="No active channel targets"
                    detail="Set up a messaging channel before sending briefs."
                  />
                )}
              </div>
            </Panel>

            <Panel title="Sources" icon={Database}>
              {activeDigest?.sources_used.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {activeDigest.sources_used.map((source) => (
                    <span
                      key={source}
                      className="rounded-md px-2 py-1 text-xs"
                      style={{
                        background: 'var(--color-bg-secondary)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      {sourceLabel(source)}
                    </span>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Database} title="No source metadata" detail="Generated briefs will list sources here when available." />
              )}
            </Panel>
          </div>
        </div>

        <Panel title="History" icon={History}>
          {loading && digestOptions.length === 0 ? (
            <LoadingRow label="Loading digest history..." />
          ) : digestOptions.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {digestOptions.map((digest) => {
                const selected = activeDigest?.generated_at === digest.generated_at;
                return (
                  <button
                    key={digest.generated_at}
                    type="button"
                    onClick={() => setSelectedGeneratedAt(digest.generated_at)}
                    className="rounded-lg px-3 py-3 text-left transition-colors cursor-pointer"
                    style={{
                      background: selected ? 'var(--color-accent-subtle)' : 'var(--color-bg-secondary)',
                      border: selected ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{formatDate(digest.generated_at)}</span>
                      {digest.audio_available && <FileAudio size={13} style={{ color: 'var(--color-accent)' }} />}
                    </div>
                    <div className="line-clamp-3 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      {plainPreview(digest.text)}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={History} title="No saved digests" detail="Generated briefs will appear here." />
          )}
        </Panel>
      </div>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-lg"
      style={{
        background: 'var(--color-bg-primary)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div
        className="flex items-center justify-between gap-3 border-b px-4 py-3"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
          <Icon size={15} style={{ color: 'var(--color-accent)' }} />
          {title}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  detail: string;
}) {
  return (
    <div
      className="rounded-lg px-4 py-3"
      style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)' }}
    >
      <div className="mb-2 flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
        <Icon size={14} />
        {label}
      </div>
      <div className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
        {value}
      </div>
      <div className="mt-1 truncate text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
        {detail}
      </div>
    </div>
  );
}

function HeaderButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer"
      style={{
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-text-secondary)',
      }}
    >
      <Icon size={13} />
      {label}
    </button>
  );
}

function EmptyState({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-lg px-3 py-3"
      style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
    >
      <Icon size={16} style={{ color: 'var(--color-text-tertiary)' }} />
      <div>
        <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
          {title}
        </div>
        <div className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {detail}
        </div>
      </div>
    </div>
  );
}

function LoadingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
      <Loader2 size={15} className="animate-spin" />
      {label}
    </div>
  );
}

function Notice({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section
      className="rounded-lg px-4 py-3"
      style={{
        background: 'color-mix(in srgb, var(--color-warning) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-warning) 22%, transparent)',
      }}
    >
      <div className="mb-1 flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--color-text)' }}>
        <Icon size={14} style={{ color: 'var(--color-warning)' }} />
        {title}
      </div>
      <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
        {children}
      </div>
    </section>
  );
}

function settledValue<T>(result: PromiseSettledResult<T>): T | undefined {
  return result.status === 'fulfilled' ? result.value : undefined;
}

function settledError<T>(result: PromiseSettledResult<T>): string | undefined {
  return result.status === 'rejected' ? errorMessage(result.reason) : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDigestTitle(digest: DigestArtifact): string {
  const parts = [formatDate(digest.generated_at)];
  if (digest.model_used) parts.push(digest.model_used);
  return parts.join(' · ');
}

function describeCron(cron?: string): string {
  if (!cron) return 'No schedule';
  const time = timeFromCron(cron);
  if (time) return `Daily ${time}`;
  return cron;
}

function timeFromCron(cron: string): string | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  if (parts[2] !== '*' || parts[3] !== '*' || parts[4] !== '*') return null;
  const minute = Number(parts[0]);
  const hour = Number(parts[1]);
  if (!Number.isInteger(minute) || !Number.isInteger(hour)) return null;
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function cronFromTime(value: string): string {
  const [hour = '6', minute = '0'] = value.split(':');
  return `${Number(minute)} ${Number(hour)} * * *`;
}

function sourceLabel(source: string): string {
  return source
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function plainPreview(text: string): string {
  return text
    .replace(/[#*_`>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}
