import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Database,
  Loader2,
  MessageSquare,
  PlugZap,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  Wifi,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  fetchChannelOverview,
  sendChannelMessage,
  type ChannelOverview,
  type ChannelOverviewBinding,
  type ChannelOverviewItem,
} from '../lib/api';
import { useAppStore } from '../lib/store';

type ChannelState = 'active' | 'configured' | 'bound' | 'available' | 'missing';

const PRIORITY_ORDER = ['sendblue', 'slack', 'telegram', 'signal', 'whatsapp', 'discord', 'teams'];

const CHANNEL_NOTES: Record<string, { setup: string; test: string; desktop: 'full' | 'manual' | 'partial' }> = {
  sendblue: {
    setup: 'Desktop has a SendBlue wizard for iMessage and SMS. Bind it to an agent from Agents or Data Sources.',
    test: 'SendBlue supports direct test messages once credentials and a sender number are configured.',
    desktop: 'full',
  },
  slack: {
    setup: 'Desktop has a Slack setup flow for Socket Mode in the agent messaging tab.',
    test: 'Slack replies work through the Slack daemon after bot and app tokens are saved.',
    desktop: 'full',
  },
  telegram: {
    setup: 'Backend adapter exists, but desktop setup is not wired yet. Configure bot_token in config for now.',
    test: 'Use the CLI channel command or future desktop setup to verify a chat id.',
    desktop: 'manual',
  },
  signal: {
    setup: 'Backend adapter exists for signal-cli REST. Desktop setup is not wired yet.',
    test: 'Requires signal-cli REST URL and sender phone number.',
    desktop: 'manual',
  },
  whatsapp: {
    setup: 'Backend adapter exists for Meta WhatsApp Cloud API. Desktop setup is not wired yet.',
    test: 'Requires access token and phone number id.',
    desktop: 'manual',
  },
  discord: {
    setup: 'Backend adapter exists. Desktop setup and listener controls are not wired yet.',
    test: 'Requires a Discord bot token and channel target.',
    desktop: 'manual',
  },
  teams: {
    setup: 'Backend adapter exists for Microsoft Teams Bot Framework. Desktop setup is not wired yet.',
    test: 'Requires app id, app password, and service URL.',
    desktop: 'manual',
  },
};

export function ChannelsPage() {
  const navigate = useNavigate();
  const setSelectedAgentId = useAppStore((s) => s.setSelectedAgentId);
  const [overview, setOverview] = useState<ChannelOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [testTarget, setTestTarget] = useState('');
  const [testMessage, setTestMessage] = useState('OpenJarvis channel test');
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await fetchChannelOverview();
      setOverview(next);
      setTestTarget((current) => current || next.bridge.channels[0] || '');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 20000);
    return () => clearInterval(interval);
  }, [refresh]);

  const priorityChannels = useMemo(() => {
    const byType = new Map((overview?.supported ?? []).map((item) => [item.type, item]));
    return PRIORITY_ORDER.map((type) => byType.get(type)).filter((item): item is ChannelOverviewItem => Boolean(item));
  }, [overview]);

  const otherChannels = useMemo(
    () => (overview?.supported ?? []).filter((item) => !PRIORITY_ORDER.includes(item.type)),
    [overview],
  );

  const metrics = useMemo(() => {
    const supported = overview?.supported ?? [];
    return {
      active: supported.filter((item) => item.active).length,
      configured: supported.filter((item) => item.configured).length,
      bound: overview?.bindings.length ?? 0,
      targets: overview?.bridge.channels.length ?? 0,
    };
  }, [overview]);

  const openAgent = (agentId: string) => {
    setSelectedAgentId(agentId);
    navigate('/agents');
  };

  const runTest = async () => {
    if (!testTarget.trim() || !testMessage.trim()) return;
    setSending(true);
    try {
      await sendChannelMessage(testTarget.trim(), testMessage.trim());
      toast.success(`Sent test message to ${testTarget}`);
    } catch (err) {
      toast.error('Channel test failed', { description: errorMessage(err) });
    } finally {
      setSending(false);
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
              <MessageSquare size={20} />
            </div>
            <div>
              <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
                Messaging Channels
              </h1>
              <div className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {overview ? `Last checked ${formatClock(overview.checked_at)}` : 'Loading channel status...'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <HeaderButton icon={Bot} label="Agents" onClick={() => navigate('/agents')} />
            <HeaderButton icon={Database} label="Data Sources" onClick={() => navigate('/data-sources')} />
            <HeaderButton icon={Settings} label="Settings" onClick={() => navigate('/settings')} />
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer"
              style={{
                background: 'var(--color-accent)',
                border: '1px solid var(--color-accent)',
                color: 'var(--color-on-accent)',
                opacity: loading ? 0.75 : 1,
              }}
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Refresh
            </button>
          </div>
        </header>

        {error && (
          <Notice tone="error" icon={XCircle} title="Could not load channel overview">
            {error}
          </Notice>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Wifi} label="Active Adapters" value={metrics.active} detail={overview?.bridge.status ?? 'unknown'} />
          <MetricCard icon={ShieldCheck} label="Configured" value={metrics.configured} detail="Credentials present" />
          <MetricCard icon={Bot} label="Agent Bindings" value={metrics.bound} detail="Channels attached to agents" />
          <MetricCard icon={MessageSquare} label="Targets" value={metrics.targets} detail="Sendable bridge targets" />
        </div>

        <Panel title="Bridge Status" icon={PlugZap}>
          {loading && !overview ? (
            <LoadingRow label="Checking channel bridge..." />
          ) : overview ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-lg px-3 py-3" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                    Runtime Bridge
                  </div>
                  <StatusPill status={overview.bridge.status} state={overview.bridge.configured ? 'active' : 'missing'} />
                </div>
                <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {overview.bridge.configured
                    ? `${overview.bridge.active_adapters.length} active adapter(s): ${overview.bridge.active_adapters.join(', ') || 'none'}`
                    : 'No channel bridge is currently configured.'}
                </div>
                {overview.bridge.message && (
                  <div className="mt-2 break-words text-xs" style={{ color: 'var(--color-warning)' }}>
                    {overview.bridge.message}
                  </div>
                )}
              </div>

              <div className="rounded-lg px-3 py-3" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
                <div className="mb-2 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  Test Active Channel
                </div>
                {overview.bridge.channels.length === 0 ? (
                  <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    No sendable channel targets are available yet.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <select
                      value={testTarget}
                      onChange={(event) => setTestTarget(event.target.value)}
                      className="rounded-lg px-3 py-2 text-xs outline-none"
                      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                    >
                      {overview.bridge.channels.map((channel) => (
                        <option key={channel} value={channel}>{channel}</option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <input
                        value={testMessage}
                        onChange={(event) => setTestMessage(event.target.value)}
                        className="min-w-0 flex-1 rounded-lg px-3 py-2 text-xs outline-none"
                        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                      />
                      <button
                        type="button"
                        onClick={runTest}
                        disabled={sending || !testTarget.trim() || !testMessage.trim()}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium cursor-pointer disabled:opacity-40"
                        style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
                      >
                        {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                        Send
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <EmptyText>No channel status available.</EmptyText>
          )}
        </Panel>

        <Panel title="Priority Channels" icon={MessageSquare}>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {priorityChannels.map((channel) => (
              <ChannelCard
                key={channel.type}
                channel={channel}
                onSetup={() => navigate(channel.type === 'sendblue' || channel.type === 'slack' ? '/data-sources' : '/settings')}
              />
            ))}
          </div>
        </Panel>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <Panel title="Agent Bindings" icon={Bot}>
            {(overview?.bindings.length ?? 0) === 0 ? (
              <EmptyText>No agents are bound to messaging channels yet.</EmptyText>
            ) : (
              <div className="flex flex-col gap-2">
                {overview?.bindings.map((binding) => (
                  <BindingRow key={binding.id} binding={binding} onOpenAgent={() => openAgent(binding.agent_id)} />
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Other Registered Adapters" icon={PlugZap}>
            {otherChannels.length === 0 ? (
              <EmptyText>No additional adapters reported.</EmptyText>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {otherChannels.slice(0, 16).map((channel) => (
                  <div
                    key={channel.type}
                    className="flex min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2"
                    style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
                  >
                    <span className="min-w-0 truncate text-xs font-medium" style={{ color: 'var(--color-text)' }}>
                      {channel.name}
                    </span>
                    <StatusPill status={stateLabel(channelState(channel))} state={channelState(channel)} />
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
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

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <section
      className="rounded-lg px-4 py-3"
      style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
    >
      <div className="mb-2 flex items-center gap-2">
        <Icon size={15} style={{ color: 'var(--color-accent)' }} />
        <span className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
          {label}
        </span>
      </div>
      <div className="text-2xl font-semibold leading-none" style={{ color: 'var(--color-text)' }}>
        {value}
      </div>
      <div className="mt-1 truncate text-xs" title={detail} style={{ color: 'var(--color-text-tertiary)' }}>
        {detail}
      </div>
    </section>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-lg"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <Icon size={15} style={{ color: 'var(--color-accent)' }} />
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
          {title}
        </h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function ChannelCard({ channel, onSetup }: { channel: ChannelOverviewItem; onSetup: () => void }) {
  const state = channelState(channel);
  const note = CHANNEL_NOTES[channel.type];
  const missing = channel.missing_fields.map(fieldLabel);
  return (
    <article
      className="rounded-lg px-4 py-3"
      style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            {channel.name}
          </div>
          <div className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            {channel.registered ? 'Backend adapter registered' : 'Backend adapter missing'}
          </div>
        </div>
        <StatusPill status={stateLabel(state)} state={state} />
      </div>

      <div className="mb-3 text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
        {note?.setup ?? 'Adapter is registered in OpenJarvis, but no curated desktop setup flow exists yet.'}
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <MiniStat label="Fields" value={`${channel.present_fields.length}/${channel.required_fields.length}`} />
        <MiniStat label="Bindings" value={String(channel.bound_agents)} />
        <MiniStat label="Desktop" value={note?.desktop ?? 'manual'} />
      </div>

      {missing.length > 0 && (
        <div className="mb-3 rounded px-2 py-1.5 text-[11px]" style={{ background: 'var(--color-bg)', color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)' }}>
          Missing: {missing.join(', ')}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <MiniButton icon={Settings} label={note?.desktop === 'full' ? 'Open setup' : 'Config'} onClick={onSetup} />
        {note?.test && <MiniHint>{note.test}</MiniHint>}
      </div>
    </article>
  );
}

function BindingRow({ binding, onOpenAgent }: { binding: ChannelOverviewBinding; onOpenAgent: () => void }) {
  const target = binding.config_preview.target || 'No target';
  return (
    <article
      className="rounded-lg px-3 py-3"
      style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <button type="button" onClick={onOpenAgent} className="min-w-0 text-left cursor-pointer">
          <div className="truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            {binding.agent_name || binding.agent_id}
          </div>
          <div className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            {binding.channel_type} - {target}
          </div>
        </button>
        <StatusPill status={binding.routing_mode || 'bound'} state="bound" />
      </div>
      <div className="flex flex-wrap gap-1 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
        {binding.config_preview.visible_keys.map((key) => (
          <span key={key} className="rounded px-1.5 py-0.5" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
            {fieldLabel(key)}
          </span>
        ))}
        {binding.config_preview.secret_keys.length > 0 && (
          <span className="rounded px-1.5 py-0.5" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
            {binding.config_preview.secret_keys.length} secret field(s)
          </span>
        )}
      </div>
    </article>
  );
}

function StatusPill({ status, state }: { status: string; state: ChannelState }) {
  const color = stateColor(state);
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
    >
      {status}
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded px-2 py-1.5" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
      <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
        {label}
      </div>
      <div className="truncate text-xs font-semibold" title={value} style={{ color: 'var(--color-text)' }}>
        {value}
      </div>
    </div>
  );
}

function MiniButton({
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
      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors cursor-pointer"
      style={{
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-text-secondary)',
      }}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

function MiniHint({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center px-1 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
      {children}
    </span>
  );
}

function Notice({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: 'error' | 'warning';
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  const color = tone === 'error' ? 'var(--color-error)' : 'var(--color-warning)';
  return (
    <section
      className="rounded-lg px-4 py-3"
      style={{
        background: `color-mix(in srgb, ${color} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 22%, transparent)`,
      }}
    >
      <div className="mb-1 flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--color-text)' }}>
        <Icon size={14} style={{ color }} />
        {title}
      </div>
      <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
        {children}
      </div>
    </section>
  );
}

function LoadingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
      <Loader2 size={14} className="animate-spin" />
      {label}
    </div>
  );
}

function EmptyText({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg px-3 py-8 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
      {children}
    </div>
  );
}

function channelState(channel: ChannelOverviewItem): ChannelState {
  if (channel.active) return 'active';
  if (channel.configured) return 'configured';
  if (channel.bound_agents > 0) return 'bound';
  if (channel.registered) return 'available';
  return 'missing';
}

function stateLabel(state: ChannelState): string {
  if (state === 'active') return 'active';
  if (state === 'configured') return 'configured';
  if (state === 'bound') return 'bound';
  if (state === 'available') return 'available';
  return 'missing';
}

function stateColor(state: ChannelState): string {
  if (state === 'active') return 'var(--color-success)';
  if (state === 'configured') return 'var(--color-accent)';
  if (state === 'bound') return 'var(--color-warning)';
  if (state === 'available') return 'var(--color-text-tertiary)';
  return 'var(--color-error)';
}

function fieldLabel(value: string): string {
  return value.replace(/_/g, ' ');
}

function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
