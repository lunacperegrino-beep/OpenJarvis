import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Check,
  Copy,
  ExternalLink,
  FileAudio,
  FolderOpen,
  Image as ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { isTauri } from '../../lib/api';
import type { ChatAttachment } from '../../types';

interface Props {
  attachment: ChatAttachment;
  compact?: boolean;
}

export function AttachmentCard({ attachment, compact = false }: Props) {
  const [copied, setCopied] = useState(false);
  const [desktopPreviewUrl, setDesktopPreviewUrl] = useState('');
  const src = useMemo(() => {
    if (attachment.url) return attachment.url;
    return desktopPreviewUrl;
  }, [attachment.url, desktopPreviewUrl]);

  useEffect(() => {
    let cancelled = false;
    setDesktopPreviewUrl('');
    if (!attachment.path || !isTauri()) return;

    invoke<string>('read_attachment_data_url', { path: attachment.path })
      .then((url) => {
        if (!cancelled) setDesktopPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDesktopPreviewUrl('');
      });

    return () => {
      cancelled = true;
    };
  }, [attachment.path]);

  const openAttachment = async () => {
    try {
      if (attachment.path && isTauri()) {
        await invoke('open_attachment', { path: attachment.path });
      } else if (attachment.url) {
        window.open(attachment.url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const revealAttachment = async () => {
    if (!attachment.path || !isTauri()) return;
    try {
      await invoke('reveal_attachment', { path: attachment.path });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const copyPath = async () => {
    const value = attachment.path || attachment.url || attachment.name;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success(attachment.path ? 'Path copied' : 'Attachment copied');
    } catch {
      toast.error('Could not copy attachment path');
    }
  };

  const Icon = attachment.kind === 'audio' ? FileAudio : ImageIcon;

  return (
    <div
      className="rounded-md overflow-hidden"
      style={{
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border-subtle, var(--color-border))',
      }}
    >
      {attachment.kind === 'image' && src && (
        <div
          className="overflow-hidden"
          style={{
            background: 'var(--color-bg-tertiary, var(--color-bg-secondary))',
            maxWidth: compact ? 220 : 360,
          }}
        >
          <img
            src={src}
            alt={attachment.name}
            className="block max-w-full"
            style={{ maxHeight: compact ? 160 : 320, objectFit: 'contain' }}
          />
        </div>
      )}

      {attachment.kind === 'audio' && src && (
        <div className="px-2.5 pt-2.5">
          <audio controls src={src} preload="metadata" className="w-full" />
        </div>
      )}

      <div className="flex items-center gap-2 px-2.5 py-2 min-w-0">
        <Icon size={14} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <div className="truncate text-xs font-medium" style={{ color: 'var(--color-text)' }}>
            {attachment.name}
          </div>
          {attachment.path && (
            <div className="truncate text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {attachment.path}
            </div>
          )}
        </div>
        <AttachmentButton icon={<ExternalLink size={12} />} label="Open" onClick={openAttachment} />
        {attachment.path && isTauri() && (
          <AttachmentButton icon={<FolderOpen size={12} />} label="Reveal" onClick={revealAttachment} />
        )}
        <AttachmentButton
          icon={copied ? <Check size={12} /> : <Copy size={12} />}
          label={copied ? 'Copied' : 'Copy'}
          onClick={copyPath}
        />
      </div>
    </div>
  );
}

function AttachmentButton({
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
      className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] transition-colors cursor-pointer"
      style={{
        color: 'var(--color-text-secondary)',
        background: 'var(--color-bg-tertiary, var(--color-bg-secondary))',
        border: '1px solid var(--color-border-subtle, var(--color-border))',
      }}
      title={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
