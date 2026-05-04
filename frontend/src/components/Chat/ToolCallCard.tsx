import { useEffect, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type { ToolCallInfo } from '../../types';
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
  const config = statusConfig[toolCall.status];
  const StatusIcon = config.icon;
  const preview = previewArgs(toolCall.arguments);
  const toolName =
    typeof toolCall.tool === 'string' ? toolCall.tool : toArgString(toolCall.tool);
  const argsText = formatJson(toolCall.arguments);
  const resultText = formatJson(toolCall.result);
  const imageArtifact = getGeneratedImageArtifact(toolCall);
  const showImagePreview = !!imageArtifact?.src && !imageErrored;

  useEffect(() => {
    setImageErrored(false);
  }, [imageArtifact?.src]);

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
          {toolName || 'tool'}
        </span>
        {preview && !expanded && (
          <span
            className="truncate"
            style={{ color: 'var(--color-text-tertiary)', fontSize: 10.5 }}
          >
            {preview}
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
                src={imageArtifact.src}
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
        </div>
      )}
    </div>
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

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function toDisplayText(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return typeof raw === 'string' ? raw : JSON.stringify(raw) ?? String(raw);
}

function extractImageReference(raw: unknown): { path?: string; url?: string } {
  const text = toDisplayText(raw);
  const url = text.match(/https?:\/\/[^\s"')]+/i)?.[0];
  const path = text.match(/((?:\/|[A-Za-z]:\\)[^\n"]+?\.(?:png|jpe?g|webp|gif|bmp|tiff?))/i)?.[0];
  return { path, url };
}

function getGeneratedImageArtifact(
  toolCall: ToolCallInfo,
): { src: string; label: string } | null {
  if (toolCall.status !== 'success') return null;
  if (String(toolCall.tool) !== 'image_generate') return null;

  const metadata = asRecord(toolCall.metadata);
  const result = asRecord(toolCall.result);
  const extracted = extractImageReference(toolCall.result);
  const path = firstString(metadata?.path, result?.path, extracted.path);
  const url = firstString(metadata?.url, result?.url, extracted.url);

  if (url) return { src: url, label: url };
  if (path) {
    return {
      src: isTauri() ? convertFileSrc(path) : '',
      label: path,
    };
  }
  return null;
}
