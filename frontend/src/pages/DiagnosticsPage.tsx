import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Cpu,
  Database,
  FileText,
  Loader2,
  MessageCircle,
  RefreshCw,
  Settings,
  ShieldCheck,
  Stethoscope,
  Wrench,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  fetchAvailableTools,
  fetchChannelDiagnostics,
  fetchDoctorReport,
  fetchRuntimeReadiness,
  fetchSecurityScan,
  fetchServerInfo,
  getMemoryStats,
  type ChannelDiagnostics,
  type DoctorCheck,
  type DoctorReport,
  type MemoryStats,
  type RuntimeReadiness,
  type RuntimeReadinessItem,
  type SecurityFinding,
  type SecurityScanReport,
  type ToolInfo,
} from '../lib/api';
import { useAppStore } from '../lib/store';
import type { ServerInfo } from '../types';

type DiagnosticStatus = 'ok' | 'warn' | 'fail' | 'unknown';
type SectionKey = 'readiness' | 'doctor' | 'security' | 'tools' | 'channels' | 'memory' | 'server';

interface DiagnosticsSnapshot {
  readiness?: RuntimeReadiness;
  doctor?: DoctorReport;
  security?: SecurityScanReport;
  tools?: ToolInfo[];
  channels?: ChannelDiagnostics;
  memory?: MemoryStats;
  server?: ServerInfo & { active_tools?: Array<{ name: string; category?: string }> };
  errors: Partial<Record<SectionKey, string>>;
}

const EMPTY_SNAPSHOT: DiagnosticsSnapshot = { errors: {} };

const STATUS_META: Record<DiagnosticStatus, { label: string; icon: LucideIcon; color: string; soft: string }> = {
  ok: {
    label: 'Ready',
    icon: CheckCircle2,
    color: 'var(--color-success)',
    soft: 'color-mix(in srgb, var(--color-success) 10%, transparent)',
  },
  warn: {
    label: 'Needs attention',
    icon: AlertTriangle,
    color: 'var(--color-warning)',
    soft: 'color-mix(in srgb, var(--color-warning) 10%, transparent)',
  },
  fail: {
    label: 'Blocked',
    icon: XCircle,
    color: 'var(--color-error)',
    soft: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
  },
  unknown: {
    label: 'Unknown',
    icon: Activity,
    color: 'var(--color-text-tertiary)',
    soft: 'var(--color-bg-secondary)',
  },
};

export function DiagnosticsPage() {
  const navigate = useNavigate();
  const selectedModel = useAppStore((s) => s.selectedModel);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [
      readiness,
      doctor,
      security,
      tools,
      channels,
      memory,
      server,
    ] = await Promise.allSettled([
      fetchRuntimeReadiness(selectedModel),
      fetchDoctorReport(),
      fetchSecurityScan(),
      fetchAvailableTools(),
      fetchChannelDiagnostics(),
      getMemoryStats(),
      fetchServerInfo(),
    ]);

    setSnapshot({
      readiness: settledValue(readiness),
      doctor: settledValue(doctor),
      security: settledValue(security),
      tools: settledValue(tools),
      channels: settledValue(channels),
      memory: settledValue(memory),
      server: settledValue(server) as DiagnosticsSnapshot['server'],
      errors: {
        readiness: settledError(readiness),
        doctor: settledError(doctor),
        security: settledError(security),
        tools: settledError(tools),
        channels: settledError(channels),
        memory: settledError(memory),
        server: settledError(server),
      },
    });
    setLoading(false);
  }, [selectedModel]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const statuses = useMemo(() => ({
    runtime: readinessStatus(snapshot.readiness?.items, snapshot.errors.readiness),
    doctor: doctorStatus(snapshot.doctor, snapshot.errors.doctor),
    security: securityStatus(snapshot.security, snapshot.errors.security),
    capabilities: capabilityStatus(snapshot, snapshot.errors),
  }), [snapshot]);

  const overall = useMemo(
    () => combineStatus(Object.values(statuses)),
    [statuses],
  );

  const recommendations = useMemo(
    () => buildRecommendations(snapshot),
    [snapshot],
  );

  const checkedAt = latestCheckedAt(snapshot);
  const errors = Object.entries(snapshot.errors).filter(([, value]) => Boolean(value));
  const activeToolCount = snapshot.server?.active_tools?.length ?? 0;
  const configuredTools = snapshot.tools?.filter((tool) => tool.configured).length ?? 0;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ background: STATUS_META[overall].soft, color: STATUS_META[overall].color }}
            >
              <Stethoscope size={20} />
            </div>
            <div>
              <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
                Diagnostics
              </h1>
              <div className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                {checkedAt ? `Last checked ${checkedAt}` : 'Checking local runtime...'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <HeaderButton icon={Bot} label="Models" onClick={() => setCommandPaletteOpen(true)} />
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

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatusCard icon={Cpu} label="Runtime" status={statuses.runtime} detail={runtimeDetail(snapshot)} />
          <StatusCard icon={FileText} label="Doctor" status={statuses.doctor} detail={doctorDetail(snapshot.doctor)} />
          <StatusCard icon={ShieldCheck} label="Security" status={statuses.security} detail={securityDetail(snapshot.security)} />
          <StatusCard icon={Wrench} label="Capabilities" status={statuses.capabilities} detail={`${activeToolCount} active, ${configuredTools} configured`} />
        </div>

        {errors.length > 0 && (
          <section
            className="rounded-lg px-4 py-3"
            style={{
              background: 'color-mix(in srgb, var(--color-warning) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-warning) 22%, transparent)',
            }}
          >
            <div className="mb-2 flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              <AlertTriangle size={14} style={{ color: 'var(--color-warning)' }} />
              Some checks could not run
            </div>
            <div className="grid grid-cols-1 gap-1 text-xs md:grid-cols-2" style={{ color: 'var(--color-text-secondary)' }}>
              {errors.map(([key, value]) => (
                <div key={key} className="min-w-0 truncate">
                  <span className="font-medium">{labelForKey(key)}</span>: {value}
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <Panel title="Runtime Readiness" icon={Activity}>
            <div className="flex flex-col gap-2">
              {(snapshot.readiness?.items ?? []).map((item) => (
                <ReadinessRow key={item.id} item={item} />
              ))}
              {loading && !snapshot.readiness && <LoadingRow label="Checking services..." />}
            </div>
          </Panel>

          <Panel title="Next Fixes" icon={Wrench}>
            {recommendations.length === 0 ? (
              <EmptyText>Nothing urgent found.</EmptyText>
            ) : (
              <div className="flex flex-col gap-2">
                {recommendations.map((item) => (
                  <div
                    key={item}
                    className="rounded-lg px-3 py-2 text-sm"
                    style={{
                      background: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {item}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Panel title="Doctor Checks" icon={FileText}>
            <CheckList checks={snapshot.doctor?.checks ?? []} loading={loading && !snapshot.doctor} />
          </Panel>

          <Panel title="Security Scan" icon={ShieldCheck}>
            <FindingList findings={snapshot.security?.findings ?? []} loading={loading && !snapshot.security} />
          </Panel>
        </div>

        <Panel title="Capabilities" icon={Wrench}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <CapabilityBlock
              icon={Bot}
              title="Active Model"
              value={snapshot.server?.model || selectedModel || 'Not selected'}
              detail={snapshot.server?.engine ? `Engine: ${snapshot.server.engine}` : 'Engine unknown'}
            />
            <CapabilityBlock
              icon={Wrench}
              title="Tools"
              value={`${activeToolCount} active`}
              detail={`${snapshot.tools?.length ?? 0} available, ${configuredTools} configured`}
            />
            <CapabilityBlock
              icon={MessageCircle}
              title="Channels"
              value={formatChannelStatus(snapshot.channels)}
              detail={snapshot.channels?.message || `${snapshot.channels?.channels.length ?? 0} channel bindings`}
            />
            <CapabilityBlock
              icon={Database}
              title="Memory"
              value={`${snapshot.memory?.entries ?? 0} entries`}
              detail={snapshot.memory?.backend ? `Backend: ${snapshot.memory.backend}` : 'Memory status unavailable'}
            />
            <CapabilityBlock
              icon={Activity}
              title="Agent"
              value={snapshot.server?.agent || 'Default chat'}
              detail={activeToolCount > 0 ? 'Agent tool bridge active' : 'No active agent tools reported'}
            />
            <CapabilityBlock
              icon={ShieldCheck}
              title="Security"
              value={securityDetail(snapshot.security)}
              detail={snapshot.security?.has_failures ? 'Review failed findings below' : 'Read-only scan completed'}
            />
          </div>
        </Panel>
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

function StatusCard({
  icon: Icon,
  label,
  status,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  status: DiagnosticStatus;
  detail: string;
}) {
  const meta = STATUS_META[status];
  const StateIcon = meta.icon;
  return (
    <section
      className="rounded-lg px-4 py-3"
      style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <Icon size={16} style={{ color: 'var(--color-accent)' }} />
        <span
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium"
          style={{ background: meta.soft, color: meta.color }}
        >
          <StateIcon size={11} />
          {meta.label}
        </span>
      </div>
      <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
        {label}
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

function ReadinessRow({ item }: { item: RuntimeReadinessItem }) {
  const status = readinessItemStatus(item.state);
  const meta = STATUS_META[status];
  const StateIcon = meta.icon;
  return (
    <div
      className="grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-lg px-3 py-2"
      style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
    >
      <StateIcon size={15} style={{ color: meta.color, marginTop: 2 }} />
      <div className="min-w-0">
        <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
          {item.label}
        </div>
        <div className="mt-0.5 break-words text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          {item.detail}
        </div>
      </div>
      <span className="rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: meta.soft, color: meta.color }}>
        {item.state}
      </span>
    </div>
  );
}

function CheckList({ checks, loading }: { checks: DoctorCheck[]; loading: boolean }) {
  if (loading) return <LoadingRow label="Running doctor checks..." />;
  if (checks.length === 0) return <EmptyText>No doctor checks returned.</EmptyText>;

  return (
    <div className="max-h-[420px] overflow-y-auto pr-1">
      <div className="flex flex-col gap-2">
        {checks.map((check) => (
          <DiagnosticRow
            key={`${check.name}-${check.message}`}
            name={check.name}
            status={check.status}
            message={check.message}
            details={check.details}
          />
        ))}
      </div>
    </div>
  );
}

function FindingList({ findings, loading }: { findings: SecurityFinding[]; loading: boolean }) {
  if (loading) return <LoadingRow label="Running security scan..." />;
  if (findings.length === 0) return <EmptyText>No security findings returned.</EmptyText>;

  return (
    <div className="max-h-[420px] overflow-y-auto pr-1">
      <div className="flex flex-col gap-2">
        {findings.map((finding) => (
          <DiagnosticRow
            key={`${finding.name}-${finding.message}`}
            name={finding.name}
            status={finding.status}
            message={finding.message}
            details={finding.platform}
          />
        ))}
      </div>
    </div>
  );
}

function DiagnosticRow({
  name,
  status,
  message,
  details,
}: {
  name: string;
  status: DiagnosticStatus;
  message: string;
  details?: string | null;
}) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <div
      className="grid grid-cols-[auto_1fr] gap-3 rounded-lg px-3 py-2"
      style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
    >
      <Icon size={15} style={{ color: meta.color, marginTop: 2 }} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            {name}
          </span>
          <span className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase" style={{ background: meta.soft, color: meta.color }}>
            {status}
          </span>
        </div>
        <div className="mt-1 break-words text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {message}
        </div>
        {details && (
          <div className="mt-1 break-words text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
            {details}
          </div>
        )}
      </div>
    </div>
  );
}

function CapabilityBlock({
  icon: Icon,
  title,
  value,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div
      className="rounded-lg px-3 py-3"
      style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
    >
      <div className="mb-2 flex items-center gap-2">
        <Icon size={14} style={{ color: 'var(--color-accent)' }} />
        <span className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
          {title}
        </span>
      </div>
      <div className="truncate text-sm font-semibold" title={value} style={{ color: 'var(--color-text)' }}>
        {value}
      </div>
      <div className="mt-1 truncate text-xs" title={detail} style={{ color: 'var(--color-text-tertiary)' }}>
        {detail}
      </div>
    </div>
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
    <div className="rounded-lg px-3 py-6 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
      {children}
    </div>
  );
}

function settledValue<T>(result: PromiseSettledResult<T>): T | undefined {
  return result.status === 'fulfilled' ? result.value : undefined;
}

function settledError<T>(result: PromiseSettledResult<T>): string | undefined {
  if (result.status === 'fulfilled') return undefined;
  return result.reason instanceof Error ? result.reason.message : String(result.reason);
}

function readinessItemStatus(state: RuntimeReadinessItem['state']): DiagnosticStatus {
  if (state === 'ready') return 'ok';
  if (state === 'warning') return 'warn';
  if (state === 'error') return 'fail';
  return 'unknown';
}

function readinessStatus(items?: RuntimeReadinessItem[], error?: string): DiagnosticStatus {
  if (error) return 'fail';
  if (!items || items.length === 0) return 'unknown';
  const states = items.map((item) => readinessItemStatus(item.state));
  return combineStatus(states);
}

function doctorStatus(report?: DoctorReport, error?: string): DiagnosticStatus {
  if (error) return 'fail';
  return report?.status ?? 'unknown';
}

function securityStatus(report?: SecurityScanReport, error?: string): DiagnosticStatus {
  if (error) return 'fail';
  if (!report) return 'unknown';
  if (report.has_failures) return 'fail';
  if (report.has_warnings) return 'warn';
  return 'ok';
}

function capabilityStatus(snapshot: DiagnosticsSnapshot, errors: DiagnosticsSnapshot['errors']): DiagnosticStatus {
  if (errors.tools || errors.channels || errors.memory || errors.server) return 'warn';
  const hasTools = (snapshot.tools?.length ?? 0) > 0;
  const memoryReady = Boolean(snapshot.memory?.backend);
  if (hasTools && memoryReady) return 'ok';
  return 'unknown';
}

function combineStatus(statuses: DiagnosticStatus[]): DiagnosticStatus {
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('warn')) return 'warn';
  if (statuses.every((status) => status === 'ok')) return 'ok';
  return 'unknown';
}

function runtimeDetail(snapshot: DiagnosticsSnapshot): string {
  const items = snapshot.readiness?.items ?? [];
  if (items.length === 0) return snapshot.errors.readiness || 'No readiness data yet';
  const ready = items.filter((item) => item.state === 'ready').length;
  return `${ready}/${items.length} checks ready`;
}

function doctorDetail(report?: DoctorReport): string {
  if (!report) return 'No doctor report yet';
  return `${report.summary.ok} ok, ${report.summary.warn} warnings, ${report.summary.fail} failures`;
}

function securityDetail(report?: SecurityScanReport): string {
  if (!report) return 'No scan yet';
  const warn = report.findings.filter((finding) => finding.status === 'warn').length;
  const fail = report.findings.filter((finding) => finding.status === 'fail').length;
  if (fail || warn) return `${warn} warnings, ${fail} failures`;
  return 'No issues found';
}

function formatChannelStatus(report?: ChannelDiagnostics): string {
  if (!report) return 'Unknown';
  if (report.status === 'not_configured') return 'Not configured';
  return report.status.replace(/_/g, ' ');
}

function latestCheckedAt(snapshot: DiagnosticsSnapshot): string {
  const timestamps = [
    snapshot.readiness?.checked_at,
    snapshot.doctor?.checked_at,
  ].filter((value): value is number => typeof value === 'number' && value > 0);
  if (timestamps.length === 0) return '';
  return new Date(Math.max(...timestamps)).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function labelForKey(key: string): string {
  const labels: Record<string, string> = {
    readiness: 'Runtime',
    doctor: 'Doctor',
    security: 'Security',
    tools: 'Tools',
    channels: 'Channels',
    memory: 'Memory',
    server: 'Server info',
  };
  return labels[key] || key;
}

function buildRecommendations(snapshot: DiagnosticsSnapshot): string[] {
  const items: string[] = [];
  const readiness = snapshot.readiness?.items ?? [];
  const backend = readiness.find((item) => item.id === 'backend');
  const ollama = readiness.find((item) => item.id === 'ollama');
  const model = readiness.find((item) => item.id === 'model');
  const speech = readiness.find((item) => item.id === 'speech');
  const drawThings = readiness.find((item) => item.id === 'drawthings');

  if (backend && backend.state === 'error') {
    items.push('Backend is not reachable. Check Settings > API URL, then restart OpenJarvis if the app server is stopped.');
  }
  if (ollama && ollama.state === 'error') {
    items.push('Ollama is not responding. Start Ollama or reinstall it if the app cannot launch the local engine.');
  }
  if (model && model.state !== 'ready') {
    items.push('Selected model is not ready. Open the model picker and select or download an installed local model.');
  }
  if (speech && speech.state !== 'ready') {
    items.push('Speech is degraded. Check the speech backend and confirm Whisper MLX is available for audio transcription.');
  }
  if (drawThings && drawThings.state !== 'ready') {
    items.push('Draw Things is not ready. Enable its API server on port 7860 before image generation.');
  }

  snapshot.doctor?.checks
    .filter((check) => check.status === 'fail')
    .slice(0, 2)
    .forEach((check) => items.push(`${check.name}: ${check.message}`));

  snapshot.security?.findings
    .filter((finding) => finding.status === 'fail')
    .slice(0, 2)
    .forEach((finding) => items.push(`${finding.name}: ${finding.message}`));

  return Array.from(new Set(items)).slice(0, 6);
}
