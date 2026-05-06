import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import {
  Archive,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileAudio,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  MessageSquare,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  basename,
  collectChatArtifacts,
  type ArtifactKind,
  type ChatArtifact,
} from '../lib/artifacts';
import { isTauri } from '../lib/api';
import { useAppStore } from '../lib/store';

type FilterKind = 'all' | ArtifactKind;

const FILTERS: Array<{ id: FilterKind; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'image', label: 'Images' },
  { id: 'audio', label: 'Audio' },
  { id: 'transcript', label: 'Transcripts' },
];

export function ArtifactsPage() {
  const conversations = useAppStore((s) => s.conversations);
  const selectConversation = useAppStore((s) => s.selectConversation);
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterKind>('all');
  const [query, setQuery] = useState('');
  const artifacts = useMemo(
    () => collectChatArtifacts(conversations),
    [conversations],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return artifacts.filter((artifact) => {
      if (filter !== 'all' && artifact.kind !== filter) return false;
      if (!normalized) return true;
      return [
        artifact.title,
        artifact.conversationTitle,
        artifact.path,
        artifact.url,
        artifact.prompt,
        artifact.provider,
        artifact.transcript,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
    });
  }, [artifacts, filter, query]);

  const counts = useMemo(() => ({
    all: artifacts.length,
    image: artifacts.filter((artifact) => artifact.kind === 'image').length,
    audio: artifacts.filter((artifact) => artifact.kind === 'audio').length,
    transcript: artifacts.filter((artifact) => artifact.kind === 'transcript').length,
  }), [artifacts]);

  const openChat = (artifact: ChatArtifact) => {
    selectConversation(artifact.conversationId);
    navigate('/');
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-6">
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{
              background: 'var(--color-accent-subtle)',
              color: 'var(--color-accent)',
            }}
          >
            <Archive size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
              Artifacts
            </h1>
            <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {artifacts.length} saved from local conversations
            </div>
          </div>
          <div className="flex-1" />
          <div
            className="flex min-w-[240px] items-center gap-2 rounded-lg px-3 py-2"
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
            }}
          >
            <Search size={14} style={{ color: 'var(--color-text-tertiary)' }} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search artifacts..."
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'var(--color-text)' }}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className="rounded-lg px-3 py-1.5 text-sm transition-colors cursor-pointer"
                style={{
                  background: active ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                  border: active ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                  color: active ? 'var(--color-on-accent)' : 'var(--color-text-secondary)',
                }}
              >
                {item.label} <span className="opacity-70">{counts[item.id]}</span>
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <div
            className="rounded-lg px-4 py-8 text-center text-sm"
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-tertiary)',
            }}
          >
            No artifacts found.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {filtered.map((artifact) => (
              <ArtifactCard
                key={artifact.id}
                artifact={artifact}
                onOpenChat={() => openChat(artifact)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ArtifactCard({
  artifact,
  onOpenChat,
}: {
  artifact: ChatArtifact;
  onOpenChat: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const previewUrl = useArtifactPreview(artifact);
  const Icon = artifact.kind === 'image'
    ? ImageIcon
    : artifact.kind === 'audio'
      ? FileAudio
      : FileText;

  const copyPrimary = async () => {
    const value = artifact.transcript || artifact.path || artifact.url || artifact.prompt || artifact.title;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success('Copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  const openArtifact = async () => {
    try {
      if (artifact.path && isTauri()) {
        await invoke('open_attachment', { path: artifact.path });
      } else if (artifact.url) {
        window.open(artifact.url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const revealArtifact = async () => {
    if (!artifact.path || !isTauri()) return;
    try {
      await invoke('reveal_attachment', { path: artifact.path });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const downloadTranscript = () => {
    if (!artifact.transcript) return;
    downloadTextFile(
      `${safeFileName(artifact.title || 'transcript')}.md`,
      `# Transcript for ${artifact.title}\n\n${artifact.transcript}\n`,
    );
  };

  return (
    <article
      className="flex min-h-[220px] flex-col overflow-hidden rounded-lg"
      style={{
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div
        className="flex min-h-[120px] items-center justify-center"
        style={{ background: 'var(--color-bg-tertiary, var(--color-bg-secondary))' }}
      >
        {artifact.kind === 'image' && previewUrl ? (
          <img
            src={previewUrl}
            alt={artifact.title}
            className="block max-h-[220px] w-full object-contain"
          />
        ) : artifact.kind === 'audio' && previewUrl ? (
          <div className="w-full px-3">
            <audio controls src={previewUrl} preload="metadata" className="w-full" />
          </div>
        ) : artifact.kind === 'transcript' ? (
          <div className="max-h-[150px] overflow-hidden px-4 py-3 text-sm leading-relaxed">
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {artifact.transcript?.slice(0, 360)}
              {(artifact.transcript?.length ?? 0) > 360 ? '...' : ''}
            </p>
          </div>
        ) : (
          <Icon size={28} style={{ color: 'var(--color-text-tertiary)' }} />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="flex items-start gap-2 min-w-0">
          <Icon size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
          <div className="min-w-0 flex-1">
            <div
              className="truncate text-sm font-medium"
              style={{ color: 'var(--color-text)' }}
              title={artifact.title}
            >
              {artifact.title}
            </div>
            <div className="mt-0.5 truncate text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {artifact.source} · {artifact.conversationTitle}
            </div>
          </div>
        </div>

        <div className="space-y-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          {artifact.path && <ArtifactMeta label="Path" value={artifact.path} />}
          {artifact.url && <ArtifactMeta label="URL" value={artifact.url} />}
          {artifact.provider && <ArtifactMeta label="Provider" value={artifact.provider} />}
          {artifact.size && <ArtifactMeta label="Size" value={artifact.size} />}
          {artifact.prompt && <ArtifactMeta label="Prompt" value={artifact.prompt} />}
        </div>

        <div className="mt-auto flex flex-wrap gap-1.5">
          {(artifact.path || artifact.url) && (
            <ArtifactButton icon={<ExternalLink size={12} />} label="Open" onClick={openArtifact} />
          )}
          {artifact.path && isTauri() && (
            <ArtifactButton icon={<FolderOpen size={12} />} label="Reveal" onClick={revealArtifact} />
          )}
          <ArtifactButton
            icon={copied ? <Check size={12} /> : <Copy size={12} />}
            label={copied ? 'Copied' : 'Copy'}
            onClick={copyPrimary}
          />
          {artifact.transcript && (
            <ArtifactButton icon={<Download size={12} />} label="Markdown" onClick={downloadTranscript} />
          )}
          <ArtifactButton icon={<MessageSquare size={12} />} label="Chat" onClick={onOpenChat} />
        </div>
      </div>
    </article>
  );
}

function ArtifactMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 min-w-0">
      <span className="shrink-0">{label}</span>
      <span className="truncate" title={value}>{label === 'Path' ? basename(value) : value}</span>
    </div>
  );
}

function ArtifactButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors cursor-pointer"
      style={{
        background: 'var(--color-bg-tertiary, var(--color-bg-secondary))',
        border: '1px solid var(--color-border-subtle, var(--color-border))',
        color: 'var(--color-text-secondary)',
      }}
      title={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function useArtifactPreview(artifact: ChatArtifact): string {
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    setPreviewUrl('');
    if (artifact.url) {
      setPreviewUrl(artifact.url);
      return;
    }
    if (!artifact.path || !isTauri()) return;
    if (artifact.kind === 'image') {
      setPreviewUrl(convertFileSrc(artifact.path));
      return;
    }
    if (artifact.kind === 'audio') {
      invoke<string>('read_attachment_data_url', { path: artifact.path })
        .then((url) => {
          if (!cancelled) setPreviewUrl(url);
        })
        .catch(() => {
          if (!cancelled) setPreviewUrl('');
        });
    }
    return () => {
      cancelled = true;
    };
  }, [artifact.kind, artifact.path, artifact.url]);

  return previewUrl;
}

function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function safeFileName(value: string): string {
  return value
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'transcript';
}
