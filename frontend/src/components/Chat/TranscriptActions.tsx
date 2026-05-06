import { useMemo, useState, type ReactNode } from 'react';
import {
  Check,
  Copy,
  Download,
  FileText,
  Languages,
  ListChecks,
  Users,
  WandSparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { parseTranscriptArtifact } from '../../lib/artifacts';

interface Props {
  content: string;
  transcriptSource?: string;
}

export function TranscriptActions({ content, transcriptSource }: Props) {
  const [copied, setCopied] = useState(false);
  const transcript = useMemo(
    () => parseTranscriptArtifact(transcriptSource || content),
    [content, transcriptSource],
  );
  if (!transcript) return null;

  const runAction = (prompt: string) => {
    window.dispatchEvent(
      new CustomEvent('openjarvis:transcript-action', {
        detail: {
          prompt,
          transcript: transcript.content,
        },
      }),
    );
  };

  const copyTranscript = async () => {
    try {
      await navigator.clipboard.writeText(transcript.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success('Transcript copied');
    } catch {
      toast.error('Could not copy transcript');
    }
  };

  const downloadTranscript = () => {
    downloadTextFile(
      `${safeFileName(transcript.title || 'transcript')}.md`,
      `# Transcript for ${transcript.title}\n\n${transcript.body}\n`,
    );
  };

  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-1.5"
      style={{ color: 'var(--color-text-secondary)' }}
    >
      <TranscriptButton
        icon={<Users size={13} />}
        label="Speakers"
        onClick={() => runAction(
          'Format the transcript into a readable conversation with separated speakers. Preserve the original language.',
        )}
      />
      <TranscriptButton
        icon={<FileText size={13} />}
        label="Summary"
        onClick={() => runAction('Summarize the transcript into concise notes.')}
      />
      <TranscriptButton
        icon={<ListChecks size={13} />}
        label="Actions"
        onClick={() => runAction(
          'Extract action items, decisions, dates, and follow-ups from the transcript.',
        )}
      />
      <TranscriptButton
        icon={<Languages size={13} />}
        label="Translate"
        onClick={() => runAction('Translate the transcript to English.')}
      />
      <TranscriptButton
        icon={<WandSparkles size={13} />}
        label="Clean up"
        onClick={() => runAction(
          'Clean up the transcript for readability while preserving meaning and speaker intent.',
        )}
      />
      <TranscriptButton
        icon={copied ? <Check size={13} /> : <Copy size={13} />}
        label={copied ? 'Copied' : 'Copy'}
        onClick={copyTranscript}
      />
      <TranscriptButton
        icon={<Download size={13} />}
        label="Markdown"
        onClick={downloadTranscript}
      />
    </div>
  );
}

function TranscriptButton({
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
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors cursor-pointer"
      style={{
        background: 'var(--color-bg-secondary)',
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
