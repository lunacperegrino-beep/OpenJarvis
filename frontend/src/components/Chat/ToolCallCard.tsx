import { useEffect, useState, type ReactNode } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ToolCallInfo } from '../../types';
import {
  getGeneratedImageArtifact,
  type GeneratedImageArtifact,
} from '../../lib/artifacts';
import { isTauri } from '../../lib/api';

interface Props {
  toolCall: ToolCallInfo;
}

const statusConfig = {
  running: { icon: Loader2, color: 'var(--color-accent)' },
  success: { icon: CheckCircle2, color: 'var(--color-success)' },
  error: { icon: XCircle, color: 'var(--color-error)' },
};

function toArgString(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string') return raw;
  return JSON.stringify(raw);
}

function previewArgs(raw: unknown): string {
  const str = toArgString(raw);
  if (!str) return '';
  try {
    const parsed = JSON.parse(str);
    if (parsed && typeof parsed === 'object') {
      const entries = Object.entries(parsed);
      if (entries.length === 0) return '';
      const [k, v] = entries[0];
      const valStr = typeof v === 'string' ? v : JSON.stringify(v);
      const trimmed = valStr.length > 40 ? `${valStr.slice(0, 40)}…` : valStr;
      return entries.length === 1 ? `${k}: ${trimmed}` : `${k}: ${trimmed}, …`;
    }
  } catch {
    /* fall through */
  }
  return str.length > 60 ? `${str.slice(0, 60)}…` : str;
}

export function ToolCallCard({ toolCall }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [imageErrored, setImageErrored] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const config = statusConfig[toolCall.status];
  const StatusIcon = config.icon;
  const preview = previewArgs(toolCall.arguments);
  const argsText = formatJson(toolCall.arguments);
  const resultText = formatJson(toolCall.result);
  const imageArtifact = getGeneratedImageArtifact(toolCall);
  const imageSrc =
    imageArtifact?.url ||
    (imageArtifact?.path && isTauri() ? convertFileSrc(imageArtifact.path) : '');
  const showImagePreview = !!imageSrc && !imageErrored;
  const toolDisplay = getToolDisplay(toolCall, imageArtifact, preview);

  useEffect(() => {
    setImageErrored(false);
  }, [imageSrc]);

  const openArtifact = async () => {
    if (!imageArtifact) return;
    try {
      if (imageArtifact.path && isTauri()) {
        await invoke('open_artifact', { path: imageArtifact.path });
      } else if (imageArtifact.url) {
        window.open(imageArtifact.url, '_blank', 'noopener,noreferrer');
      } else if (imageSrc) {
        window.open(imageSrc, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const revealArtifact = async () => {
    if (!imageArtifact?.path) return;
    try {
      await invoke('reveal_artifact', { path: imageArtifact.path });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const copyPrompt = async () => {
    if (!imageArtifact?.prompt) return;
    try {
      await navigator.clipboard.writeText(imageArtifact.prompt);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 1600);
      toast.success('Prompt copied');
    } catch {
      toast.error('Could not copy prompt');
    }
  };

  const regenerateImage = () => {
    if (!imageArtifact?.prompt) return;
    window.dispatchEvent(
      new CustomEvent('openjarvis:regenerate-image', {
        detail: { prompt: imageArtifact.prompt },
      }),
    );
    toast.success('Regenerating image');
  };

  return (
    <div
      className="rounded-md text-xs overflow-hidden"
      style={{
        border: '1px solid var(--color-border-subtle, var(--color-border))',
        background: 'var(--color-bg-tertiary, var(--color-bg-secondary))',
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-2.5 py-1.5 cursor-pointer text-left"
        style={{ background: 'transparent' }}
      >
        {expanded ? (
          <ChevronDown size={11} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
        ) : (
          <ChevronRight size={11} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
        )}
        <StatusIcon
          size={11}
          style={{ color: config.color, flexShrink: 0 }}
          className={toolCall.status === 'running' ? 'animate-spin' : ''}
        />
        <span
          style={{ color: 'var(--color-text)', fontWeight: 500, flexShrink: 0 }}
        >
          {toolDisplay.title}
        </span>
        {toolDisplay.subtitle && !expanded && (
          <span
            className="truncate"
            style={{ color: 'var(--color-text-tertiary)', fontSize: 10.5 }}
          >
            {toolDisplay.subtitle}
          </span>
        )}
        <div className="flex-1" />
        {toolCall.latency != null && (
          <span
            style={{
              color: 'var(--color-text-tertiary)',
              fontSize: 10,
              flexShrink: 0,
            }}
          >
            {toolCall.latency < 1000
              ? `${Math.round(toolCall.latency)}ms`
              : `${(toolCall.latency / 1000).toFixed(1)}s`}
          </span>
        )}
      </button>
      {expanded && (
        <div
          className="px-2.5 pb-2 pt-0.5"
          style={{ borderTop: '1px solid var(--color-border-subtle, var(--color-border))' }}
        >
          {argsText && (
            <div className="mt-1.5">
              <div
                style={{
                  color: 'var(--color-text-tertiary)',
                  fontSize: 9.5,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: 3,
                }}
              >
                args
              </div>
              <pre
                className="p-1.5 rounded overflow-auto"
                style={{
                  background: 'var(--color-code-bg, rgba(0,0,0,0.2))',
                  color: 'var(--color-text-secondary)',
                  fontSize: 11,
                  lineHeight: 1.4,
                  maxHeight: 120,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {argsText}
              </pre>
            </div>
          )}
          {resultText && (
            <div className="mt-1.5">
              <div
                style={{
                  color: 'var(--color-text-tertiary)',
                  fontSize: 9.5,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: 3,
                }}
              >
                result
              </div>
              <pre
                className="p-1.5 rounded overflow-auto"
                style={{
                  background: 'var(--color-code-bg, rgba(0,0,0,0.2))',
                  color: 'var(--color-text-secondary)',
                  fontSize: 11,
                  lineHeight: 1.4,
                  maxHeight: 180,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {resultText}
              </pre>
            </div>
          )}
        </div>
      )}
      {imageArtifact && (
        <div
          className="px-2.5 pb-2"
          style={{
            borderTop: expanded
              ? undefined
              : '1px solid var(--color-border-subtle, var(--color-border))',
          }}
        >
          {showImagePreview && (
            <div
              className="mt-2 overflow-hidden rounded-md"
              style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border-subtle, var(--color-border))',
                width: 'min(320px, 100%)',
              }}
            >
              <img
                src={imageSrc}
                alt="Generated image preview"
                className="block max-w-full"
                style={{ maxHeight: 320, objectFit: 'contain' }}
                onError={() => setImageErrored(true)}
              />
            </div>
          )}
          <div
            className="mt-1.5 flex items-center gap-1.5 min-w-0"
            style={{ color: 'var(--color-text-tertiary)', fontSize: 10.5 }}
            title={imageArtifact.label}
          >
            <ImageIcon size={12} style={{ flexShrink: 0 }} />
            <span className="truncate">
              {showImagePreview ? imageArtifact.label : `Generated image: ${imageArtifact.label}`}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <ArtifactActionButton
              icon={<ExternalLink size={12} />}
              label="Open"
              onClick={openArtifact}
            />
            {imageArtifact.path && isTauri() && (
              <ArtifactActionButton
                icon={<FolderOpen size={12} />}
                label="Reveal"
                onClick={revealArtifact}
              />
            )}
            {imageArtifact.prompt && (
              <>
                <ArtifactActionButton
                  icon={promptCopied ? <Check size={12} /> : <Copy size={12} />}
                  label={promptCopied ? 'Copied' : 'Copy prompt'}
                  onClick={copyPrompt}
                />
                <ArtifactActionButton
                  icon={<RefreshCw size={12} />}
                  label="Regenerate"
                  onClick={regenerateImage}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ArtifactActionButton({
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
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="inline-flex items-center gap-1 rounded px-2 py-1 transition-colors cursor-pointer"
      style={{
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border-subtle, var(--color-border))',
        color: 'var(--color-text-secondary)',
        fontFamily: 'inherit',
        fontSize: 10.5,
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function formatJson(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw !== 'string') return JSON.stringify(raw, null, 2) ?? String(raw);
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function getToolDisplay(
  toolCall: ToolCallInfo,
  imageArtifact: GeneratedImageArtifact | null,
  fallbackPreview: string,
): { title: string; subtitle: string } {
  if (String(toolCall.tool) === 'image_generate') {
    if (toolCall.status === 'running') {
      return { title: 'Generating image', subtitle: fallbackPreview };
    }
    if (toolCall.status === 'error') {
      return { title: 'Image generation failed', subtitle: fallbackPreview };
    }
    const details = [imageArtifact?.provider, imageArtifact?.size]
      .filter(Boolean)
      .join(' · ');
    return {
      title: 'Generated image',
      subtitle: details || imageArtifact?.prompt || fallbackPreview,
    };
  }

  const toolName =
    typeof toolCall.tool === 'string' ? toolCall.tool : toArgString(toolCall.tool);
  return { title: toolName || 'tool', subtitle: fallbackPreview };
}
