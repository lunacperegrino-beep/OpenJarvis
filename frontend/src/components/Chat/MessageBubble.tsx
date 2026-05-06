import { Component, useState, useMemo, type ErrorInfo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';
import { Copy, Check } from 'lucide-react';
import { AttachmentCard } from './AttachmentCard';
import { AudioPlayer } from './AudioPlayer';
import { TranscriptActions } from './TranscriptActions';
import { ToolCallCard } from './ToolCallCard';
import { XRayFooter } from './XRayFooter';
import type { ChatMessage } from '../../types';

function stripThinkTags(text: string): string {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>\s*/gi, '');
  cleaned = cleaned.replace(/^[\s\S]*?<\/think>\s*/i, '');
  return cleaned.trim();
}

interface Props {
  message: ChatMessage;
}

class ToolCallErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Tool call render failed', error, info);
  }

  render() {
    if (this.state.failed) {
      return (
        <div
          className="rounded-md px-3 py-2 text-xs"
          style={{
            background: 'var(--color-bg-tertiary, var(--color-bg-secondary))',
            border: '1px solid var(--color-border-subtle, var(--color-border))',
            color: 'var(--color-text-tertiary)',
          }}
        >
          Tool output could not be displayed.
        </div>
      );
    }
    return this.props.children;
  }
}

function getTextContent(node: any): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(getTextContent).join('');
  }
  if (node?.props?.children) {
    return getTextContent(node.props.children);
  }
  return '';
}

function CodeBlockPre({ children, ...props }: any) {
  const [copied, setCopied] = useState(false);
  const codeElement = Array.isArray(children) ? children[0] : children;
  const className = codeElement?.props?.className || '';
  const match = /language-([\w-]+)/.exec(className);
  const lang = match ? match[1] : '';
  const code = getTextContent(codeElement?.props?.children).replace(/\n$/, '');

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="code-block-wrapper relative my-3"
      style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden' }}
    >
      <div
        className="flex items-center justify-between px-4 py-1.5 text-xs"
        style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}
      >
        <span className="font-mono">{lang || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded transition-colors cursor-pointer"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre {...props} style={{ margin: 0, borderRadius: 0 }}>
        {children}
      </pre>
    </div>
  );
}

function CopyMessageButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
      style={{ color: 'var(--color-text-tertiary)' }}
      title="Copy message"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[85%] flex flex-col items-end gap-2">
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-col gap-2 w-full items-end">
              {message.attachments.map((attachment) => (
                <AttachmentCard key={attachment.id} attachment={attachment} compact />
              ))}
            </div>
          )}
          {message.content && (
            <div
              className="px-4 py-2.5 text-sm leading-relaxed"
              style={{
                background: 'var(--color-user-bubble)',
                color: 'var(--color-user-bubble-text)',
                borderRadius: 'var(--radius-xl) var(--radius-xl) var(--radius-sm) var(--radius-xl)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {message.content}
            </div>
          )}
        </div>
      </div>
    );
  }

  const cleanContent = useMemo(() => stripThinkTags(message.content), [message.content]);

  return (
    <div className="group mb-6">
      {/* Tool calls */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          {message.toolCalls.map((tc) => (
            <ToolCallErrorBoundary key={tc.id}>
              <ToolCallCard toolCall={tc} />
            </ToolCallErrorBoundary>
          ))}
        </div>
      )}

      {/* Audio player (e.g. morning digest) */}
      {message.audio?.url && <AudioPlayer src={message.audio.url} />}

      {/* Assistant message */}
      {cleanContent && (
        <>
          <div className="prose max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[[rehypeHighlight, { detect: true }], rehypeKatex]}
              components={{
                pre: CodeBlockPre,
              }}
            >
              {cleanContent}
            </ReactMarkdown>
          </div>
          <TranscriptActions content={cleanContent} />
        </>
      )}

      {/* Footer: copy + x-ray */}
      <div className="flex items-center gap-2 mt-1.5">
        <CopyMessageButton content={cleanContent} />
      </div>
      <XRayFooter usage={message.usage} telemetry={message.telemetry} />
    </div>
  );
}
