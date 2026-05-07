import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  History,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import {
  fetchAgentTasks,
  fetchAgentTraces,
  fetchErrorAgents,
  fetchManagedAgents,
  pauseManagedAgent,
  recoverManagedAgent,
  resumeManagedAgent,
  runManagedAgent,
  type AgentTask,
  type AgentTrace,
  type ManagedAgent,
} from '../lib/api';
import { useAppStore } from '../lib/store';

type ActionKind = 'run' | 'pause' | 'resume' | 'recover';

interface AgentTaskRow extends AgentTask {
  agent_name: string;
  agent_status: ManagedAgent['status'];
}

interface AgentTraceRow extends AgentTrace {
  agent_id: string;
  agent_name: string;
}

interface ActivitySnapshot {
  agents: ManagedAgent[];
  tasks: AgentTaskRow[];
  traces: AgentTraceRow[];
  errorAgents: ManagedAgent[];
  errors: string[];
}

const EMPTY_SNAPSHOT: ActivitySnapshot = {
  agents: [],
  tasks: [],
  traces: [],
  errorAgents: [],
  errors: [],
};

const AGENT_STATUS_COLORS: Record<string, string> = {
  idle: 'var(--color-success)',
  running: 'var(--color-accent)',
  paused: 'var(--color-text-tertiary)',
  error: 'var(--color-error)',
  archived: 'var(--color-text-tertiary)',
  needs_attention: 'var(--color-warning)',
  budget_exceeded: 'var(--color-warning)',
  stalled: 'var(--color-warning)',
};

const TASK_STATUS_COLORS: Record<string, string> = {
  pending: 'var(--color-warning)',
  active: 'var(--color-accent)',
  completed: 'var(--color-success)',
  failed: 'var(--color-error)',
};

export function BackgroundTasksPage() {
  const navigate = useNavigate();
  const setManagedAgents = useAppStore((s) => s.setManagedAgents);
  const setSelectedAgentId = useAppStore((s) => s.setSelectedAgentId);
  const [snapshot, setSnapshot] = useState<ActivitySnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const errors: string[] = [];

    try {
      const agents = await fetchManagedAgents();
      setManagedAgents(agents);

      const [taskResults, traceResults, errorAgentResult] = await Promise.all([
        Promise.allSettled(
          agents.map(async (agent) => ({
            agent,
            tasks: await fetchAgentTasks(agent.id),
          })),
        ),
        Promise.allSettled(
          agents.map(async (agent) => ({
            agent,
            traces: await fetchAgentTraces(agent.id, 10),
          })),
        ),
        fetchErrorAgents().then(
          (agents) => ({ status: 'fulfilled' as const, value: agents }),
          (reason) => ({ status: 'rejected' as const, reason }),
        ),
      ]);

      const tasks: AgentTaskRow[] = [];
      for (const result of taskResults) {
        if (result.status === 'fulfilled') {
          tasks.push(
            ...result.value.tasks.map((task) => ({
              ...task,
              agent_name: result.value.agent.name,
              agent_status: result.value.agent.status,
            })),
          );
        } else {
          errors.push(errorMessage(result.reason));
        }
      }

      const traces: AgentTraceRow[] = [];
      for (const result of traceResults) {
        if (result.status === 'fulfilled') {
          traces.push(
            ...result.value.traces.map((trace) => ({
              ...trace,
              agent_id: result.value.agent.id,
              agent_name: result.value.agent.name,
            })),
          );
        } else {
          errors.push(errorMessage(result.reason));
        }
      }
      if (errorAgentResult.status === 'rejected') {
        errors.push(errorMessage(errorAgentResult.reason));
      }

      setSnapshot({
        agents,
        tasks: tasks.sort((a, b) => b.created_at - a.created_at),
        traces: traces.sort((a, b) => b.started_at - a.started_at),
        errorAgents: errorAgentResult.status === 'fulfilled' ? errorAgentResult.value : [],
        errors: Array.from(new Set(errors)).slice(0, 4),
      });
      setLastChecked(Date.now());
    } catch (err) {
      setSnapshot({
        ...EMPTY_SNAPSHOT,
        errors: [errorMessage(err)],
      });
    } finally {
      setLoading(false);
    }
  }, [setManagedAgents]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [refresh]);

  const metrics = useMemo(() => {
    const running = snapshot.agents.filter((agent) => agent.status === 'running').length;
    const scheduled = snapshot.agents.filter((agent) => {
      const type = agent.schedule_type || String(agent.config?.schedule_type || 'manual');
      return type !== 'manual';
    }).length;
    const activeTasks = snapshot.tasks.filter((task) => task.status === 'active' || task.status === 'pending').length;
    const failedRuns = snapshot.traces.filter((trace) => trace.outcome !== 'success').length;
    return { running, scheduled, activeTasks, failedRuns };
  }, [snapshot]);

  const recentTasks = snapshot.tasks.slice(0, 10);
  const recentTraces = snapshot.traces.slice(0, 12);

  const openAgent = (agentId: string) => {
    setSelectedAgentId(agentId);
    navigate('/agents');
  };

  const runAction = async (agent: ManagedAgent, action: ActionKind) => {
    const actionKey = `${action}:${agent.id}`;
    setBusyAction(actionKey);
    try {
      if (action === 'run') {
        await runManagedAgent(agent.id);
        toast.success(`Started ${agent.name}`);
      } else if (action === 'pause') {
        await pauseManagedAgent(agent.id);
        toast.success(`Paused ${agent.name}`);
      } else if (action === 'resume') {
        await resumeManagedAgent(agent.id);
        toast.success(`Resumed ${agent.name}`);
      } else {
        await recoverManagedAgent(agent.id);
        toast.success(`Recovered ${agent.name}`);
      }
      await refresh();
    } catch (err) {
      toast.error(`Could not ${action} ${agent.name}`, {
        description: errorMessage(err),
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{
                background: 'var(--color-accent-subtle)',
                color: 'var(--color-accent)',
              }}
            >
              <History size={20} />
            </div>
            <div>
              <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
                Background Tasks
              </h1>
              <div className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {lastChecked ? `Last refreshed ${formatClock(lastChecked)}` : 'Loading agent activity...'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <HeaderButton icon={Bot} label="Agents" onClick={() => navigate('/agents')} />
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

        {snapshot.errors.length > 0 && (
          <section
            className="rounded-lg px-4 py-3"
            style={{
              background: 'color-mix(in srgb, var(--color-warning) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-warning) 22%, transparent)',
            }}
          >
            <div className="mb-1 flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              <AlertTriangle size={14} style={{ color: 'var(--color-warning)' }} />
              Some activity could not be loaded
            </div>
            <div className="grid grid-cols-1 gap-1 text-xs md:grid-cols-2" style={{ color: 'var(--color-text-secondary)' }}>
              {snapshot.errors.map((error) => (
                <div key={error} className="truncate" title={error}>
                  {error}
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Activity} label="Running" value={metrics.running} detail={`${snapshot.agents.length} total agents`} />
          <MetricCard icon={Clock3} label="Scheduled" value={metrics.scheduled} detail="Non-manual schedules" />
          <MetricCard icon={Timer} label="Open Tasks" value={metrics.activeTasks} detail="Pending or active" />
          <MetricCard icon={AlertTriangle} label="Failed Runs" value={metrics.failedRuns} detail="Recent trace failures" tone={metrics.failedRuns ? 'warning' : 'default'} />
        </div>

        {loading && snapshot.agents.length === 0 ? (
          <LoadingState />
        ) : snapshot.agents.length === 0 ? (
          <EmptyAgents onCreate={() => navigate('/agents')} />
        ) : (
          <>
            <Panel title="Agent Control Center" icon={Bot}>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {snapshot.agents.map((agent) => (
                  <AgentControlCard
                    key={agent.id}
                    agent={agent}
                    busyAction={busyAction}
                    onOpen={() => openAgent(agent.id)}
                    onRun={() => runAction(agent, 'run')}
                    onPause={() => runAction(agent, 'pause')}
                    onResume={() => runAction(agent, 'resume')}
                    onRecover={() => runAction(agent, 'recover')}
                  />
                ))}
              </div>
            </Panel>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <Panel title="Task Queue" icon={Clock3}>
                {recentTasks.length === 0 ? (
                  <EmptyText>No queued tasks yet.</EmptyText>
                ) : (
                  <div className="flex flex-col gap-2">
                    {recentTasks.map((task) => (
                      <TaskRow key={task.id} task={task} onOpenAgent={() => openAgent(task.agent_id)} />
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="Run History" icon={History}>
                {recentTraces.length === 0 ? (
                  <EmptyText>No agent runs recorded yet.</EmptyText>
                ) : (
                  <div className="flex flex-col gap-2">
                    {recentTraces.map((trace) => (
                      <TraceRow key={`${trace.agent_id}-${trace.id}`} trace={trace} onOpenAgent={() => openAgent(trace.agent_id)} />
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            {snapshot.errorAgents.length > 0 && (
              <Panel title="Needs Attention" icon={AlertTriangle}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {snapshot.errorAgents.map((agent) => (
                    <div
                      key={agent.id}
                      className="rounded-lg px-3 py-3"
                      style={{
                        background: 'color-mix(in srgb, var(--color-error) 7%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--color-error) 20%, transparent)',
                      }}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <div className="min-w-0 truncate text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                          {agent.name}
                        </div>
                        <StatusPill status={agent.status} color={agentStatusColor(agent.status)} />
                      </div>
                      <div className="line-clamp-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                        {cleanError(agent.summary_memory) || 'Agent reported an error.'}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <MiniButton icon={RotateCcw} label="Recover" busy={busyAction === `recover:${agent.id}`} onClick={() => runAction(agent, 'recover')} />
                        <MiniButton icon={Bot} label="Open" onClick={() => openAgent(agent.id)} />
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </>
        )}
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
  tone = 'default',
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  detail: string;
  tone?: 'default' | 'warning';
}) {
  const color = tone === 'warning' ? 'var(--color-warning)' : 'var(--color-accent)';
  return (
    <section
      className="rounded-lg px-4 py-3"
      style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
    >
      <div className="mb-2 flex items-center gap-2">
        <Icon size={15} style={{ color }} />
        <span className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
          {label}
        </span>
      </div>
      <div className="text-2xl font-semibold leading-none" style={{ color: 'var(--color-text)' }}>
        {value}
      </div>
      <div className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
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

function AgentControlCard({
  agent,
  busyAction,
  onOpen,
  onRun,
  onPause,
  onResume,
  onRecover,
}: {
  agent: ManagedAgent;
  busyAction: string | null;
  onOpen: () => void;
  onRun: () => void;
  onPause: () => void;
  onResume: () => void;
  onRecover: () => void;
}) {
  const schedule = formatSchedule(agent);
  const isRunning = agent.status === 'running';
  const isPaused = agent.status === 'paused';
  const canPause = agent.status === 'running' || agent.status === 'idle';
  const canRecover = ['error', 'needs_attention', 'stalled', 'budget_exceeded'].includes(agent.status);

  return (
    <article
      className="rounded-lg px-4 py-3"
      style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 text-left cursor-pointer">
          <div className="truncate text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            {agent.name}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            <span>{agent.agent_type}</span>
            <span>{schedule}</span>
            <span>Last run {formatRelativeTime(agent.last_run_at)}</span>
          </div>
        </button>
        <StatusPill status={agent.status} color={agentStatusColor(agent.status)} />
      </div>

      <div className="mb-3 line-clamp-2 min-h-[32px] text-xs" style={{ color: 'var(--color-text-secondary)' }}>
        {agent.current_activity || cleanError(agent.summary_memory) || 'No current background activity.'}
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <MiniStat label="Runs" value={String(agent.total_runs ?? 0)} />
        <MiniStat label="Tokens" value={formatNumber(agent.total_tokens ?? 0)} />
        <MiniStat label="Cost" value={formatCost(agent.total_cost)} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <MiniButton icon={Play} label="Run" busy={busyAction === `run:${agent.id}`} disabled={isRunning} onClick={onRun} />
        {isPaused ? (
          <MiniButton icon={Play} label="Resume" busy={busyAction === `resume:${agent.id}`} onClick={onResume} />
        ) : canPause ? (
          <MiniButton icon={Pause} label="Pause" busy={busyAction === `pause:${agent.id}`} onClick={onPause} />
        ) : null}
        {canRecover && (
          <MiniButton icon={RotateCcw} label="Recover" busy={busyAction === `recover:${agent.id}`} onClick={onRecover} />
        )}
        <MiniButton icon={Bot} label="Open" onClick={onOpen} />
      </div>
    </article>
  );
}

function TaskRow({ task, onOpenAgent }: { task: AgentTaskRow; onOpenAgent: () => void }) {
  const color = TASK_STATUS_COLORS[task.status] || 'var(--color-text-tertiary)';
  return (
    <article
      className="rounded-lg px-3 py-3"
      style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <button type="button" onClick={onOpenAgent} className="min-w-0 text-left cursor-pointer">
          <div className="truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            {task.description || 'Untitled task'}
          </div>
          <div className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            {task.agent_name} - created {formatRelativeTime(task.created_at)}
          </div>
        </button>
        <StatusPill status={task.status} color={color} />
      </div>
      {Object.keys(task.progress || {}).length > 0 && (
        <div className="truncate text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {compactJson(task.progress)}
        </div>
      )}
    </article>
  );
}

function TraceRow({ trace, onOpenAgent }: { trace: AgentTraceRow; onOpenAgent: () => void }) {
  const isSuccess = trace.outcome === 'success';
  const color = isSuccess ? 'var(--color-success)' : 'var(--color-error)';
  const errorDetail = trace.metadata?.error_detail as
    | { error_type?: string; error_message?: string; suggested_action?: string }
    | undefined;

  return (
    <article
      className="rounded-lg px-3 py-3"
      style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <button type="button" onClick={onOpenAgent} className="min-w-0 text-left cursor-pointer">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: color }} />
            <span className="truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {trace.agent_name}
            </span>
          </div>
          <div className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            {formatRelativeTime(trace.started_at)} - {formatDuration(trace.duration)} - {trace.steps} step{trace.steps === 1 ? '' : 's'}
          </div>
        </button>
        <StatusPill status={trace.outcome} color={color} />
      </div>

      {!isSuccess && (
        <div className="line-clamp-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {errorDetail?.error_message || trace.error_message || 'Run failed without a detailed error.'}
        </div>
      )}
    </article>
  );
}

function StatusPill({ status, color }: { status: string; color: string }) {
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
    >
      {status.replace(/_/g, ' ')}
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
  busy = false,
  disabled = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors cursor-pointer"
      style={{
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-text-secondary)',
        opacity: disabled ? 0.45 : 1,
      }}
      title={label}
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
      {label}
    </button>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center rounded-lg py-16" style={{ color: 'var(--color-text-tertiary)' }}>
      <Loader2 size={16} className="mr-2 animate-spin" />
      Loading background task history...
    </div>
  );
}

function EmptyAgents({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      className="rounded-lg px-4 py-12 text-center"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <Bot size={28} className="mx-auto mb-3" style={{ color: 'var(--color-accent)' }} />
      <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
        No background agents yet
      </div>
      <div className="mx-auto mt-2 max-w-md text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        Create an agent first, then this page will show its schedule, queue, run history, and recovery controls.
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium cursor-pointer"
        style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
      >
        <Bot size={13} />
        Open Agents
      </button>
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

function agentStatusColor(status: string): string {
  return AGENT_STATUS_COLORS[status] || 'var(--color-text-tertiary)';
}

function formatRelativeTime(ts?: number | null): string {
  if (!ts) return 'Never';
  const diff = Date.now() - ts * 1000;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(seconds?: number): string {
  if (!seconds && seconds !== 0) return '0s';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  return `${mins}m ${rem}s`;
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function formatCost(value?: number): string {
  if (value === undefined || value === null) return '$0.0000';
  return `$${value.toFixed(4)}`;
}

function formatSchedule(agent: ManagedAgent): string {
  const type = agent.schedule_type || String(agent.config?.schedule_type || 'manual');
  const value = agent.schedule_value || String(agent.config?.schedule_value || '');
  if (!type || type === 'manual') return 'Manual';
  if (type === 'daily') return value ? `Daily ${value}` : 'Daily';
  if (type === 'weekly') return value ? `Weekly ${value}` : 'Weekly';
  if (type === 'interval') return value ? `Every ${value}` : 'Interval';
  if (type === 'cron') return value ? `Cron ${value}` : 'Cron';
  return type.replace(/_/g, ' ');
}

function cleanError(value?: string): string {
  return (value || '').replace(/^ERROR:\s*/i, '').trim();
}

function compactJson(value: Record<string, unknown>): string {
  try {
    return JSON.stringify(value);
  } catch {
    return 'Progress available';
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
