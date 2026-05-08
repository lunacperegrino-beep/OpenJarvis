import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Copy,
  FileCode2,
  Layers3,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Workflow,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import {
  fetchSkills,
  fetchWorkflows,
  runSkill,
  type SkillCatalog,
  type SkillInfo,
  type SkillRunResult,
  type WorkflowCatalog,
  type WorkflowInfo,
} from '../lib/api';

type TabKey = 'skills' | 'workflows';

interface Snapshot {
  skills: SkillCatalog | null;
  workflows: WorkflowCatalog | null;
  errors: {
    skills?: string;
    workflows?: string;
  };
}

const EMPTY_SNAPSHOT: Snapshot = {
  skills: null,
  workflows: null,
  errors: {},
};

export function SkillsWorkflowsPage() {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('skills');
  const [query, setQuery] = useState('');
  const [selectedSkillName, setSelectedSkillName] = useState('');
  const [selectedWorkflowName, setSelectedWorkflowName] = useState('');
  const [contextText, setContextText] = useState('{}');
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<SkillRunResult | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [skills, workflows] = await Promise.allSettled([fetchSkills(), fetchWorkflows()]);
    setSnapshot({
      skills: settledValue(skills) ?? null,
      workflows: settledValue(workflows) ?? null,
      errors: {
        skills: settledError(skills),
        workflows: settledError(workflows),
      },
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const skills = snapshot.skills?.skills ?? [];
  const workflows = snapshot.workflows?.workflows ?? [];
  const hasErrors = Object.values(snapshot.errors).some(Boolean);

  const filteredSkills = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return skills;
    return skills.filter((skill) =>
      [skill.name, skill.description, skill.source, ...skill.tool_names, ...skill.tags]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [skills, query]);

  const filteredWorkflows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return workflows;
    return workflows.filter((workflow) =>
      [workflow.name, workflow.source, ...workflow.nodes.map((node) => node.id), ...workflow.nodes.map((node) => node.type)]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [workflows, query]);

  const selectedSkill = useMemo(() => {
    if (!filteredSkills.length) return null;
    return (
      filteredSkills.find((skill) => skill.name === selectedSkillName) ??
      filteredSkills[0]
    );
  }, [filteredSkills, selectedSkillName]);

  const selectedWorkflow = useMemo(() => {
    if (!filteredWorkflows.length) return null;
    return (
      filteredWorkflows.find((workflow) => workflow.name === selectedWorkflowName) ??
      filteredWorkflows[0]
    );
  }, [filteredWorkflows, selectedWorkflowName]);

  useEffect(() => {
    if (!selectedSkill) return;
    setSelectedSkillName(selectedSkill.name);
    setContextText(JSON.stringify(defaultContext(selectedSkill), null, 2));
    setRunResult(null);
  }, [selectedSkill?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedWorkflow) setSelectedWorkflowName(selectedWorkflow.name);
  }, [selectedWorkflow?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const runSelectedSkill = async () => {
    if (!selectedSkill) return;
    let context: Record<string, unknown>;
    try {
      context = JSON.parse(contextText || '{}');
    } catch {
      toast.error('Context must be valid JSON');
      return;
    }
    setRunning(true);
    try {
      const result = await runSkill(selectedSkill.name, context);
      setRunResult(result);
      toast.success(result.success ? 'Skill completed' : 'Skill stopped with errors');
    } catch (err) {
      toast.error('Could not run skill', { description: errorMessage(err) });
    } finally {
      setRunning(false);
    }
  };

  const copySkillPrompt = async () => {
    if (!selectedSkill) return;
    const prompt = [
      `Use the OpenJarvis skill "${selectedSkill.name}".`,
      selectedSkill.description,
      '',
      'Context:',
      contextText || '{}',
    ].join('\n');
    await navigator.clipboard.writeText(prompt);
    toast.success('Skill prompt copied');
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
              <Wrench size={20} />
            </div>
            <div>
              <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
                Skills & Workflows
              </h1>
              <div className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                Curated reusable actions from the CLI, backend, user folder, and workspace.
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <HeaderButton icon={Bot} label="Agents" onClick={() => navigate('/agents')} />
            <HeaderButton icon={Settings2} label="Settings" onClick={() => navigate('/settings')} />
            <button
              type="button"
              onClick={refresh}
              disabled={loading || running}
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
          </div>
        </header>

        {hasErrors && (
          <Notice icon={AlertTriangle} title="Some catalog checks could not run">
            {Object.entries(snapshot.errors)
              .filter(([, value]) => Boolean(value))
              .map(([key, value]) => `${key}: ${value}`)
              .join('  ')}
          </Notice>
        )}

        <div className="grid gap-3 md:grid-cols-4">
          <MetricCard icon={Sparkles} label="Skills" value={skills.length} detail={`${readyCount(skills)} ready to run`} />
          <MetricCard icon={Workflow} label="Workflows" value={workflows.length} detail={snapshot.workflows?.execution.detail || 'Catalog definitions'} />
          <MetricCard icon={CheckCircle2} label="Executable Tools" value={snapshot.skills?.execution.available_tools.length ?? 0} detail="Safe desktop runtime tools" />
          <MetricCard icon={Layers3} label="Sources" value={snapshot.skills?.roots.filter((root) => root.exists).length ?? 0} detail="Existing skill roots" />
        </div>

        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-3"
          style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)' }}
        >
          <div className="inline-flex rounded-lg p-1" style={{ background: 'var(--color-bg-secondary)' }}>
            <TabButton active={tab === 'skills'} icon={Wrench} label="Skills" onClick={() => setTab('skills')} />
            <TabButton active={tab === 'workflows'} icon={Workflow} label="Workflows" onClick={() => setTab('workflows')} />
          </div>
          <div
            className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg px-3 py-2 md:max-w-sm"
            style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
          >
            <Search size={14} style={{ color: 'var(--color-text-tertiary)' }} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${tab}...`}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'var(--color-text)' }}
            />
          </div>
        </div>

        {tab === 'skills' ? (
          <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
            <Section title="Available Skills" icon={Wrench}>
              {loading ? (
                <LoadingRow label="Loading skills..." />
              ) : filteredSkills.length ? (
                <div className="flex max-h-[640px] flex-col gap-2 overflow-y-auto pr-1">
                  {filteredSkills.map((skill) => (
                    <SkillListItem
                      key={skill.name}
                      skill={skill}
                      active={selectedSkill?.name === skill.name}
                      onClick={() => setSelectedSkillName(skill.name)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState icon={Wrench} title="No skills found" detail="Add TOML skills under ./skills or ~/.openjarvis/skills." />
              )}
            </Section>

            <SkillDetail
              skill={selectedSkill}
              contextText={contextText}
              setContextText={setContextText}
              running={running}
              runResult={runResult}
              onRun={runSelectedSkill}
              onCopyPrompt={copySkillPrompt}
            />
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
            <Section title="Workflow Templates" icon={Workflow}>
              {loading ? (
                <LoadingRow label="Loading workflows..." />
              ) : filteredWorkflows.length ? (
                <div className="flex max-h-[640px] flex-col gap-2 overflow-y-auto pr-1">
                  {filteredWorkflows.map((workflow) => (
                    <WorkflowListItem
                      key={workflow.name}
                      workflow={workflow}
                      active={selectedWorkflow?.name === workflow.name}
                      onClick={() => setSelectedWorkflowName(workflow.name)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState icon={Workflow} title="No workflows found" detail="Add workflow TOML files under ./workflows or ~/.openjarvis/workflows." />
              )}
            </Section>

            <WorkflowDetail workflow={selectedWorkflow} executionDetail={snapshot.workflows?.execution.detail} />
          </div>
        )}
      </div>
    </div>
  );
}

function SkillDetail({
  skill,
  contextText,
  setContextText,
  running,
  runResult,
  onRun,
  onCopyPrompt,
}: {
  skill: SkillInfo | null;
  contextText: string;
  setContextText: (value: string) => void;
  running: boolean;
  runResult: SkillRunResult | null;
  onRun: () => void;
  onCopyPrompt: () => void;
}) {
  if (!skill) {
    return (
      <Section title="Skill Detail" icon={FileCode2}>
        <EmptyState icon={FileCode2} title="Select a skill" detail="Skill inputs, tools, and run status will appear here." />
      </Section>
    );
  }

  const disabledReason = skill.missing_dependencies.length
    ? `Missing dependencies: ${skill.missing_dependencies.join(', ')}`
    : skill.missing_runtime_tools.length
      ? `Needs blocked tools: ${skill.missing_runtime_tools.join(', ')}`
      : !skill.user_invocable
        ? 'Skill is not user-invocable'
        : '';

  return (
    <Section
      title={skill.name}
      icon={FileCode2}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onCopyPrompt}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium"
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <Copy size={13} />
            Copy Prompt
          </button>
          <button
            type="button"
            onClick={onRun}
            disabled={running || !skill.run_ready || !skill.user_invocable}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium"
            style={{
              background: 'var(--color-accent)',
              border: '1px solid var(--color-accent)',
              color: 'var(--color-on-accent)',
              opacity: running || !skill.run_ready || !skill.user_invocable ? 0.5 : 1,
            }}
          >
            {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            Run
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-2 text-sm" style={{ color: 'var(--color-text)' }}>
            {skill.description || 'No description provided.'}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge label={skill.source} tone="accent" />
            <Badge label={`v${skill.version || '0.1.0'}`} />
            <Badge label={`${skill.steps.length} steps`} />
            {skill.disable_model_invocation && <Badge label="hidden from model" tone="warning" />}
            {skill.run_ready && skill.user_invocable ? (
              <Badge label="ready" tone="success" />
            ) : (
              <Badge label="needs setup" tone="warning" />
            )}
          </div>
        </div>

        {disabledReason && (
          <Notice icon={AlertTriangle} title="Run is disabled">
            {disabledReason}
          </Notice>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <InfoPanel title="Inputs" values={skill.input_keys.length ? skill.input_keys : ['No explicit inputs']} />
          <InfoPanel title="Tools" values={skill.tool_names.length ? skill.tool_names : ['No tool steps']} />
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
            Context JSON
          </div>
          <textarea
            value={contextText}
            onChange={(event) => setContextText(event.target.value)}
            spellCheck={false}
            className="min-h-[130px] w-full resize-y rounded-lg px-3 py-2 font-mono text-xs outline-none"
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
          />
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
            Steps
          </div>
          <div className="flex flex-col gap-2">
            {skill.steps.map((step, index) => (
              <div
                key={`${step.tool_name || step.skill_name}-${index}`}
                className="rounded-lg px-3 py-2"
                style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
                    {index + 1}. {step.tool_name || step.skill_name || 'step'}
                  </div>
                  {step.output_key && <Badge label={step.output_key} />}
                </div>
                <code className="block whitespace-pre-wrap break-words text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                  {step.arguments_template}
                </code>
              </div>
            ))}
          </div>
        </div>

        {runResult && (
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
              Last Run
            </div>
            <div
              className="rounded-lg px-3 py-3"
              style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
            >
              <div className="mb-2 flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                {runResult.success ? <CheckCircle2 size={15} style={{ color: 'var(--color-success)' }} /> : <AlertTriangle size={15} style={{ color: 'var(--color-warning)' }} />}
                {runResult.success ? 'Completed' : 'Stopped with errors'}
              </div>
              <pre className="max-h-[240px] overflow-auto whitespace-pre-wrap text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {JSON.stringify(runResult.step_results, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

function WorkflowDetail({ workflow, executionDetail }: { workflow: WorkflowInfo | null; executionDetail?: string }) {
  if (!workflow) {
    return (
      <Section title="Workflow Detail" icon={Workflow}>
        <EmptyState icon={Workflow} title="Select a workflow" detail="Workflow graph nodes and edges will appear here." />
      </Section>
    );
  }

  return (
    <Section title={workflow.name} icon={Workflow}>
      <div className="flex flex-col gap-4">
        {executionDetail && (
          <Notice icon={AlertTriangle} title="Execution status">
            {executionDetail}
          </Notice>
        )}
        <div className="flex flex-wrap gap-1.5">
          <Badge label={workflow.source} tone="accent" />
          <Badge label={`${workflow.nodes.length} nodes`} />
          <Badge label={`${workflow.edges.length} edges`} />
          <Badge label={`${workflow.execution_stages.length} stages`} />
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
            Nodes
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {workflow.nodes.map((node) => (
              <div
                key={node.id}
                className="rounded-lg px-3 py-2"
                style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
              >
                <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                  {node.id}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge label={node.type} />
                  {node.agent && <Badge label={node.agent} tone="accent" />}
                  {node.tools.map((tool) => <Badge key={tool} label={tool} />)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
            Edges
          </div>
          {workflow.edges.length ? (
            <div className="flex flex-col gap-2">
              {workflow.edges.map((edge, index) => (
                <div
                  key={`${edge.source}-${edge.target}-${index}`}
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                >
                  {edge.source} {'->'} {edge.target}
                  {edge.condition && <span style={{ color: 'var(--color-text-tertiary)' }}> when {edge.condition}</span>}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Workflow} title="No edges" detail="This workflow has one standalone node or is still being drafted." />
          )}
        </div>
      </div>
    </Section>
  );
}

function SkillListItem({ skill, active, onClick }: { skill: SkillInfo; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg px-3 py-3 text-left transition-colors"
      style={{
        background: active ? 'var(--color-accent-subtle)' : 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            {skill.name}
          </div>
          <div className="mt-1 line-clamp-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {skill.description || 'No description'}
          </div>
        </div>
        {skill.run_ready ? (
          <CheckCircle2 size={15} style={{ color: 'var(--color-success)' }} />
        ) : (
          <AlertTriangle size={15} style={{ color: 'var(--color-warning)' }} />
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge label={skill.source} />
        <Badge label={`${skill.steps.length} steps`} />
      </div>
    </button>
  );
}

function WorkflowListItem({ workflow, active, onClick }: { workflow: WorkflowInfo; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg px-3 py-3 text-left transition-colors"
      style={{
        background: active ? 'var(--color-accent-subtle)' : 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div className="truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>
        {workflow.name}
      </div>
      <div className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
        {workflow.nodes.length} nodes, {workflow.edges.length} edges
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge label={workflow.source} />
        <Badge label={`${workflow.execution_stages.length} stages`} />
      </div>
    </button>
  );
}

function Section({
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
        className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
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

function TabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium"
      style={{
        background: active ? 'var(--color-bg-primary)' : 'transparent',
        border: active ? '1px solid var(--color-border)' : '1px solid transparent',
        color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
      }}
    >
      <Icon size={13} />
      {label}
    </button>
  );
}

function InfoPanel({ title, values }: { title: string; values: string[] }) {
  return (
    <div
      className="rounded-lg px-3 py-3"
      style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
    >
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
        {title}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => <Badge key={value} label={value} />)}
      </div>
    </div>
  );
}

function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'accent' | 'success' | 'warning' }) {
  const styles =
    tone === 'accent'
      ? { color: 'var(--color-accent)', border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)' }
      : tone === 'success'
        ? { color: 'var(--color-success)', border: '1px solid color-mix(in srgb, var(--color-success) 30%, transparent)' }
        : tone === 'warning'
          ? { color: 'var(--color-warning)', border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)' }
          : { color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)' };
  return (
    <span
      className="inline-flex max-w-full items-center rounded-md px-2 py-0.5 text-[11px]"
      style={{ background: 'var(--color-bg-primary)', ...styles }}
    >
      <span className="truncate">{label}</span>
    </span>
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

function defaultContext(skill: SkillInfo): Record<string, string> {
  return Object.fromEntries(skill.input_keys.map((key) => [key, '']));
}

function readyCount(skills: SkillInfo[]): number {
  return skills.filter((skill) => skill.run_ready && skill.user_invocable).length;
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
