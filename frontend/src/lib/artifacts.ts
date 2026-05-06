import type { ChatAttachment, ChatMessage, Conversation, ToolCallInfo } from '../types';

export type ArtifactKind = 'image' | 'audio' | 'transcript';
export type ArtifactSource = 'generated' | 'upload' | 'transcript';

export interface GeneratedImageArtifact {
  label: string;
  path?: string;
  url?: string;
  prompt?: string;
  provider?: string;
  size?: string;
}

export interface TranscriptArtifact {
  title: string;
  body: string;
  content: string;
}

export interface ChatArtifact {
  id: string;
  kind: ArtifactKind;
  source: ArtifactSource;
  title: string;
  conversationId: string;
  conversationTitle: string;
  messageId: string;
  timestamp: number;
  path?: string;
  url?: string;
  prompt?: string;
  provider?: string;
  size?: string;
  transcript?: string;
}

export function collectChatArtifacts(conversations: Conversation[]): ChatArtifact[] {
  const artifacts: ChatArtifact[] = [];

  for (const conversation of conversations) {
    for (const message of conversation.messages) {
      const transcript = parseTranscriptArtifact(message.content);
      if (message.role === 'assistant' && transcript) {
        artifacts.push({
          id: `${conversation.id}:${message.id}:transcript`,
          kind: 'transcript',
          source: 'transcript',
          title: transcript.title,
          conversationId: conversation.id,
          conversationTitle: conversation.title,
          messageId: message.id,
          timestamp: message.timestamp,
          transcript: transcript.body,
        });
      }

      for (const attachment of message.attachments ?? []) {
        artifacts.push(attachmentToArtifact(conversation, message, attachment));
      }

      for (const toolCall of message.toolCalls ?? []) {
        const image = getGeneratedImageArtifact(toolCall);
        if (!image) continue;
        artifacts.push({
          id: `${conversation.id}:${message.id}:tool:${toolCall.id}`,
          kind: 'image',
          source: 'generated',
          title: image.prompt || basename(image.path || image.url || image.label),
          conversationId: conversation.id,
          conversationTitle: conversation.title,
          messageId: message.id,
          timestamp: message.timestamp,
          path: image.path,
          url: image.url,
          prompt: image.prompt,
          provider: image.provider,
          size: image.size,
        });
      }
    }
  }

  return artifacts.sort((a, b) => b.timestamp - a.timestamp);
}

export function parseTranscriptArtifact(content: string): TranscriptArtifact | null {
  const trimmed = content.trim();
  const match = /^Transcript for \*\*(.+?)\*\*/m.exec(trimmed);
  if (!match) return null;
  const body = trimmed.slice(match.index + match[0].length).trim();
  return {
    title: match[1].trim(),
    body,
    content: trimmed,
  };
}

export function isTranscriptArtifact(content: string): boolean {
  return parseTranscriptArtifact(content) !== null;
}

export function getGeneratedImageArtifact(
  toolCall: ToolCallInfo,
): GeneratedImageArtifact | null {
  if (toolCall.status !== 'success') return null;
  if (String(toolCall.tool) !== 'image_generate') return null;

  const metadata = asRecord(toolCall.metadata);
  const result = asRecord(toolCall.result);
  const args = asRecord(toolCall.arguments);
  const extracted = extractImageReference(toolCall.result);
  const path = firstString(metadata?.path, result?.path, extracted.path);
  const url = firstString(metadata?.url, result?.url, extracted.url);
  const prompt = firstString(args?.prompt, metadata?.prompt, result?.prompt);
  const provider = firstString(metadata?.provider, result?.provider);
  const size = firstString(metadata?.size, args?.size, result?.size);

  if (url) return { label: url, url, prompt, provider, size };
  if (path) return { label: path, path, prompt, provider, size };
  return null;
}

export function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function attachmentToArtifact(
  conversation: Conversation,
  message: ChatMessage,
  attachment: ChatAttachment,
): ChatArtifact {
  return {
    id: `${conversation.id}:${message.id}:attachment:${attachment.id}`,
    kind: attachment.kind,
    source: 'upload',
    title: attachment.name,
    conversationId: conversation.id,
    conversationTitle: conversation.title,
    messageId: message.id,
    timestamp: message.timestamp,
    path: attachment.path,
    url: attachment.url,
  };
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
