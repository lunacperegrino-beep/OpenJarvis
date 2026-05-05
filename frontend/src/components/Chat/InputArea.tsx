import { useState, useRef, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Send, Square, Paperclip, FileAudio, Image as ImageIcon, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore, generateId } from '../../lib/store';
import { streamChat } from '../../lib/sse';
import { fetchSavings, getBase, isTauri, transcribeAudio, transcribeAudioFile } from '../../lib/api';
import { MicButton } from './MicButton';
import { AttachmentCard } from './AttachmentCard';
import { useSpeech } from '../../hooks/useSpeech';
import type { ChatAttachment, ChatMessage, ToolCallInfo, TokenUsage, MessageTelemetry } from '../../types';

export function InputArea() {
  const [input, setInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragDepthRef = useRef(0);
  const suppressDropUntilRef = useRef(0);

  const activeId = useAppStore((s) => s.activeId);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const streamState = useAppStore((s) => s.streamState);
  const speechEnabled = useAppStore((s) => s.settings.speechEnabled);
  const maxTokens = useAppStore((s) => s.settings.maxTokens);
  const temperature = useAppStore((s) => s.settings.temperature);
  const createConversation = useAppStore((s) => s.createConversation);
  const addMessage = useAppStore((s) => s.addMessage);
  const updateLastAssistant = useAppStore((s) => s.updateLastAssistant);
  const setStreamState = useAppStore((s) => s.setStreamState);
  const resetStream = useAppStore((s) => s.resetStream);
  const modelLoading = useAppStore((s) => s.modelLoading);

  const { state: speechState, available: speechAvailable, startRecording, stopRecording } = useSpeech();

  // Abort in-flight stream when the user switches models mid-generation.
  // This prevents errors from trying to continue a stream with a stale model.
  const prevModelRef = useRef(selectedModel);
  useEffect(() => {
    if (prevModelRef.current !== selectedModel && streamState.isStreaming) {
      abortRef.current?.abort();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      resetStream();
      abortRef.current = null;
    }
    prevModelRef.current = selectedModel;
  }, [selectedModel, streamState.isStreaming, resetStream]);

  const micDisabled = !speechEnabled || !speechAvailable || streamState.isStreaming;
  const micReason: 'not-enabled' | 'no-backend' | 'streaming' | undefined =
    !speechEnabled ? 'not-enabled'
    : !speechAvailable ? 'no-backend'
    : streamState.isStreaming ? 'streaming'
    : undefined;

  const handleMicClick = useCallback(async () => {
    if (speechState === 'recording') {
      try {
        const text = await stopRecording();
        if (text) {
          setInput((prev) => (prev ? prev + ' ' + text : text));
        }
      } catch {
        // Error is captured in useSpeech
      }
    } else {
      await startRecording();
    }
  }, [speechState, startRecording, stopRecording]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [input]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    resetStream();
  }, [resetStream]);

  const addPendingImage = useCallback((attachment: ChatAttachment) => {
    setPendingAttachments((prev) => {
      if (prev.some((item) => item.path === attachment.path && item.url === attachment.url)) {
        return prev;
      }
      return [...prev, attachment].slice(-4);
    });
    setAttachmentMenuOpen(false);
    toast.success('Image attached');
  }, []);

  const transcribeSelectedAudio = useCallback(async (
    attachment: ChatAttachment,
    source: string | File,
  ) => {
    if (streamState.isStreaming || uploadingAudio) return;

    let convId = activeId;
    if (!convId) {
      convId = createConversation(selectedModel);
    }

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: `Transcribe audio: ${attachment.name}`,
      timestamp: Date.now(),
      attachments: [attachment],
    };
    addMessage(convId, userMsg);

    const assistantMsg: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: 'Transcribing audio...',
      timestamp: Date.now(),
    };
    addMessage(convId, assistantMsg);

    const startTime = Date.now();
    const timer = setInterval(() => {
      setStreamState({ elapsedMs: Date.now() - startTime });
    }, 100);
    timerRef.current = timer;
    setUploadingAudio(true);
    setStreamState({
      isStreaming: true,
      phase: 'Transcribing audio...',
      elapsedMs: 0,
      activeToolCalls: [],
      content: '',
    });

    try {
      const result =
        typeof source === 'string'
          ? await transcribeAudioFile(source)
          : await transcribeAudio(source, source.name);
      const transcript = result.text?.trim() || '(No speech detected.)';
      updateLastAssistant(
        convId,
        `Transcript for **${attachment.name}**\n\n${transcript}`,
      );
      useAppStore.getState().addLogEntry({
        timestamp: Date.now(),
        level: 'info',
        category: 'chat',
        message: `Transcribed audio: ${attachment.name}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updateLastAssistant(
        convId,
        `Audio transcription failed for **${attachment.name}**.\n\n${message}`,
      );
      toast.error('Audio transcription failed');
      useAppStore.getState().addLogEntry({
        timestamp: Date.now(),
        level: 'error',
        category: 'chat',
        message: `Audio transcription failed: ${message}`,
      });
    } finally {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setUploadingAudio(false);
      resetStream();
    }
  }, [
    activeId,
    selectedModel,
    streamState.isStreaming,
    uploadingAudio,
    createConversation,
    addMessage,
    updateLastAssistant,
    setStreamState,
    resetStream,
  ]);

  const handlePickImage = useCallback(async () => {
    if (streamState.isStreaming || modelLoading) return;
    if (isTauri()) {
      const path = await pickDesktopAttachment('image');
      if (!path) return;
      addPendingImage({
        id: generateId(),
        kind: 'image',
        name: basename(path),
        path,
      });
      return;
    }
    imageInputRef.current?.click();
  }, [addPendingImage, modelLoading, streamState.isStreaming]);

  const handlePickAudio = useCallback(async () => {
    if (streamState.isStreaming || modelLoading || uploadingAudio) return;
    setAttachmentMenuOpen(false);
    if (isTauri()) {
      const path = await pickDesktopAttachment('audio');
      if (!path) return;
      await transcribeSelectedAudio(
        {
          id: generateId(),
          kind: 'audio',
          name: basename(path),
          path,
        },
        path,
      );
      return;
    }
    audioInputRef.current?.click();
  }, [modelLoading, streamState.isStreaming, transcribeSelectedAudio, uploadingAudio]);

  const handleBrowserImage = useCallback(async (file: File | null) => {
    if (!file) return;
    try {
      addPendingImage({
        id: generateId(),
        kind: 'image',
        name: file.name,
        url: await readFileAsDataUrl(file),
        mimeType: file.type,
        size: file.size,
      });
    } catch {
      toast.error('Could not load image');
    }
  }, [addPendingImage]);

  const handleBrowserAudio = useCallback(async (file: File | null) => {
    if (!file) return;
    await transcribeSelectedAudio(
      {
        id: generateId(),
        kind: 'audio',
        name: file.name,
        url: URL.createObjectURL(file),
        mimeType: file.type,
        size: file.size,
      },
      file,
    );
  }, [transcribeSelectedAudio]);

  const handleDroppedFiles = useCallback(async (files: File[]) => {
    if (streamState.isStreaming || modelLoading || uploadingAudio) {
      toast.error('Wait for the current request to finish before dropping a file');
      return;
    }

    const images = files.filter(isImageFile);
    const audio = files.filter(isAudioFile);

    if (images.length === 0 && audio.length === 0) {
      toast.error('Drop an audio or image file');
      return;
    }

    for (const file of images.slice(0, 4)) {
      await handleBrowserImage(file);
    }

    if (audio.length > 0) {
      if (audio.length > 1) {
        toast.info('Transcribing the first audio file');
      }
      await handleBrowserAudio(audio[0]);
    }
  }, [
    handleBrowserAudio,
    handleBrowserImage,
    modelLoading,
    streamState.isStreaming,
    uploadingAudio,
  ]);

  const handleDroppedPaths = useCallback(async (paths: string[]) => {
    if (streamState.isStreaming || modelLoading || uploadingAudio) {
      toast.error('Wait for the current request to finish before dropping a file');
      return;
    }

    const images = paths.filter(isImagePath);
    const audio = paths.filter(isAudioPath);

    if (images.length === 0 && audio.length === 0) {
      toast.error('Drop an audio or image file');
      return;
    }

    for (const path of images.slice(0, 4)) {
      addPendingImage({
        id: generateId(),
        kind: 'image',
        name: basename(path),
        path,
      });
    }

    if (audio.length > 0) {
      if (audio.length > 1) {
        toast.info('Transcribing the first audio file');
      }
      const path = audio[0];
      await transcribeSelectedAudio(
        {
          id: generateId(),
          kind: 'audio',
          name: basename(path),
          path,
        },
        path,
      );
    }
  }, [
    addPendingImage,
    modelLoading,
    streamState.isStreaming,
    transcribeSelectedAudio,
    uploadingAudio,
  ]);

  const sendMessage = useCallback(async (
    overrideContent?: string,
    overrideAttachments?: ChatAttachment[],
  ) => {
    const attachments = overrideAttachments ?? pendingAttachments;
    const content = (overrideContent ?? input).trim();
    if ((!content && attachments.length === 0) || streamState.isStreaming) return;

    const isImageOnlyUpload =
      !content &&
      attachments.length > 0 &&
      attachments.every((attachment) => attachment.kind === 'image');
    const displayContent = content || formatAttachmentOnlyMessage(attachments);

    setInput('');
    if (!overrideAttachments) setPendingAttachments([]);
    setAttachmentMenuOpen(false);

    let convId = activeId;
    if (!convId) {
      convId = createConversation(selectedModel);
    }

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: displayContent,
      timestamp: Date.now(),
      attachments: attachments.length > 0 ? attachments : undefined,
    };
    addMessage(convId, userMsg);

    if (isImageOnlyUpload) {
      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: (
          'Image uploaded. I can show, open, and reveal the file now. ' +
          'Full visual analysis is not wired into this desktop build yet, so ask with text or use the file path for local file operations.'
        ),
        timestamp: Date.now(),
      };
      addMessage(convId, assistantMsg);
      return;
    }

    // Build API messages before adding assistant placeholder
    const currentMessages = useAppStore.getState().messages;
    const apiMessages = currentMessages.map((m) => ({
      role: m.role,
      content: buildApiMessageContent(m.content, m.attachments),
    }));

    const assistantMsg: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    addMessage(convId, assistantMsg);

    // Start streaming
    const startTime = Date.now();
    const timer = setInterval(() => {
      setStreamState({ elapsedMs: Date.now() - startTime });
    }, 100);
    timerRef.current = timer;

    const controller = new AbortController();
    abortRef.current = controller;

    let accumulatedContent = '';
    let usage: TokenUsage | undefined;
    let complexity: { score: number; tier: string; suggested_max_tokens: number } | undefined;
    const toolCalls: ToolCallInfo[] = [];
    let lastFlush = 0;
    let ttftMs: number | undefined;

    setStreamState({
      isStreaming: true,
      phase: 'Generating...',
      elapsedMs: 0,
      activeToolCalls: [],
      content: '',
    });
    useAppStore.getState().addLogEntry({
      timestamp: Date.now(),
      level: 'info',
      category: 'chat',
      message: `Request: "${displayContent.slice(0, 80)}${displayContent.length > 80 ? '...' : ''}" → ${selectedModel}`,
    });

    try {
      for await (const sseEvent of streamChat(
        { model: selectedModel, messages: apiMessages, stream: true, temperature, max_tokens: maxTokens },
        controller.signal,
      )) {
        const eventName = sseEvent.event;

        if (eventName === 'agent_turn_start') {
          setStreamState({ phase: 'Agent thinking...' });
        } else if (eventName === 'inference_start') {
          setStreamState({ phase: 'Generating...' });
          useAppStore.getState().addLogEntry({
            timestamp: Date.now(), level: 'info', category: 'chat',
            message: `Generating with ${selectedModel}...`,
          });
        } else if (eventName === 'tool_call_start') {
          try {
            const data = JSON.parse(sseEvent.data);
            const tc: ToolCallInfo = {
              id: generateId(),
              tool: data.tool,
              arguments: data.arguments || '',
              status: 'running',
            };
            toolCalls.push(tc);
            setStreamState({
              phase: `Calling ${data.tool}...`,
              activeToolCalls: [...toolCalls],
            });
            updateLastAssistant(convId, accumulatedContent, [...toolCalls]);
            useAppStore.getState().addLogEntry({
              timestamp: Date.now(), level: 'info', category: 'tool',
              message: `Calling ${data.tool}(${data.arguments || ''})`,
            });
          } catch {}
        } else if (eventName === 'tool_call_end') {
          try {
            const data = JSON.parse(sseEvent.data);
            const tc = toolCalls.find(
              (t) => t.tool === data.tool && t.status === 'running',
            );
            if (tc) {
              tc.status = data.success ? 'success' : 'error';
              tc.latency = data.latency;
              tc.result = data.result;
              tc.metadata = data.metadata;
            }
            setStreamState({
              phase: 'Generating...',
              activeToolCalls: [...toolCalls],
            });
            updateLastAssistant(convId, accumulatedContent, [...toolCalls]);
          } catch {}
        } else {
          try {
            const data = JSON.parse(sseEvent.data);
            const delta = data.choices?.[0]?.delta;
            if (data.usage) usage = data.usage;
            if (data.complexity) complexity = data.complexity;
            if (delta?.content) {
              if (!ttftMs) ttftMs = Date.now() - startTime;
              accumulatedContent += delta.content;
              setStreamState({ content: accumulatedContent, phase: '' });

              const now = Date.now();
              if (now - lastFlush >= 80) {
                updateLastAssistant(
                  convId,
                  accumulatedContent,
                  toolCalls.length > 0 ? [...toolCalls] : undefined,
                );
                lastFlush = now;
              }
            }
            if (data.choices?.[0]?.finish_reason === 'stop') break;
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User cancelled or model switch — keep whatever was accumulated
        if (!accumulatedContent) accumulatedContent = '(Generation stopped)';
      } else {
        const errMsg = err?.message || String(err);
        accumulatedContent =
          accumulatedContent || `Error: ${errMsg}`;
        useAppStore.getState().addLogEntry({
          timestamp: Date.now(), level: 'error', category: 'chat',
          message: `Stream error: ${errMsg}`,
        });
      }
    } finally {
      if (!accumulatedContent) {
        accumulatedContent = 'No response was generated. Please try again.';
      }
      const totalMs = Date.now() - startTime;
      const _CLOUD_PREFIXES = ['gpt-', 'o1-', 'o3-', 'o4-', 'claude-', 'gemini-', 'openrouter/', 'MiniMax-', 'chatgpt-'];
      const engineLabel = _CLOUD_PREFIXES.some(p => selectedModel.startsWith(p)) ? 'cloud' : 'ollama';
      const telemetry: MessageTelemetry = {
        engine: engineLabel,
        model_id: selectedModel,
        total_ms: totalMs,
        ttft_ms: ttftMs,
        tokens_per_sec: usage?.completion_tokens
          ? usage.completion_tokens / (totalMs / 1000)
          : undefined,
        complexity_score: complexity?.score,
        complexity_tier: complexity?.tier,
        suggested_max_tokens: complexity?.suggested_max_tokens,
      };
      // Check if the response has digest audio available
      let audioMeta: { url: string } | undefined;
      try {
        const digestRes = await fetch(`${getBase()}/api/digest`);
        if (digestRes.ok) {
          const digest = await digestRes.json();
          if (digest.audio_available) {
            audioMeta = { url: `${getBase()}/api/digest/audio` };
          }
        }
      } catch {
        // Not a digest response or server unavailable — skip
      }

      updateLastAssistant(
        convId,
        accumulatedContent,
        toolCalls.length > 0 ? toolCalls : undefined,
        usage,
        telemetry,
        audioMeta,
      );
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      resetStream();
      useAppStore.getState().addLogEntry({
        timestamp: Date.now(), level: 'info', category: 'chat',
        message: `Response: ${accumulatedContent.length} chars`,
      });
      abortRef.current = null;

      fetchSavings()
        .then((data) => useAppStore.getState().setSavings(data))
        .catch(() => {});
    }
  }, [
    input,
    pendingAttachments,
    activeId,
    selectedModel,
    streamState.isStreaming,
    createConversation,
    addMessage,
    updateLastAssistant,
    setStreamState,
    resetStream,
    temperature,
    maxTokens,
  ]);

  useEffect(() => {
    const regenerateImage = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string }>).detail;
      const prompt = detail?.prompt?.trim();
      if (!prompt) return;
      void sendMessage(`Generate an image: ${prompt}`);
    };

    window.addEventListener('openjarvis:regenerate-image', regenerateImage);
    return () => {
      window.removeEventListener('openjarvis:regenerate-image', regenerateImage);
    };
  }, [sendMessage]);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    import('@tauri-apps/api/webview')
      .then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === 'enter' || payload.type === 'over') {
          setDragActive(isPhysicalPointInsideElement(payload.position, dropZoneRef.current));
          return;
        }
        if (payload.type === 'leave') {
          setDragActive(false);
          return;
        }
        if (payload.type === 'drop') {
          setDragActive(false);
          if (!isPhysicalPointInsideElement(payload.position, dropZoneRef.current)) return;
          if (Date.now() < suppressDropUntilRef.current) return;
          suppressDropUntilRef.current = Date.now() + 700;
          void handleDroppedPaths(payload.paths);
        }
      }))
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [handleDroppedPaths]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasDroppableFiles(event.dataTransfer)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragActive(true);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasDroppableFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragActive(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasDroppableFiles(event.dataTransfer)) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setDragActive(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasDroppableFiles(event.dataTransfer)) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragActive(false);
    if (Date.now() < suppressDropUntilRef.current) return;
    const files = Array.from(event.dataTransfer.files || []);
    if (files.length === 0) return;
    suppressDropUntilRef.current = Date.now() + 700;
    void handleDroppedFiles(files);
  };

  return (
    <div
      ref={dropZoneRef}
      className="px-4 pb-4 pt-2"
      style={{ maxWidth: 'var(--chat-max-width)', margin: '0 auto', width: '100%' }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {pendingAttachments.length > 0 && (
        <div className="mb-2 flex flex-col gap-2">
          {pendingAttachments.map((attachment) => (
            <div key={attachment.id} className="relative">
              <AttachmentCard attachment={attachment} compact />
              <button
                type="button"
                onClick={() => setPendingAttachments((prev) => prev.filter((item) => item.id !== attachment.id))}
                className="absolute top-1 right-1 p-1 rounded-full cursor-pointer"
                style={{
                  background: 'var(--color-bg)',
                  color: 'var(--color-text-tertiary)',
                  border: '1px solid var(--color-border)',
                }}
                title="Remove attachment"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div
        className="relative flex items-center gap-2 rounded-2xl px-4 py-3 transition-shadow"
        style={{
          background: 'var(--color-input-bg)',
          border: dragActive ? '1px solid var(--color-accent)' : '1px solid var(--color-input-border)',
          boxShadow: dragActive ? '0 0 0 3px var(--color-accent-subtle)' : 'var(--shadow-sm)',
        }}
      >
        <div className="relative">
          <button
            type="button"
            onClick={() => setAttachmentMenuOpen((open) => !open)}
            disabled={streamState.isStreaming || modelLoading || uploadingAudio}
            className="p-2 rounded-xl transition-colors shrink-0 cursor-pointer disabled:opacity-30 disabled:cursor-default"
            style={{
              background: attachmentMenuOpen ? 'var(--color-bg-tertiary)' : 'transparent',
              color: 'var(--color-text-tertiary)',
            }}
            title="Attach file"
          >
            {uploadingAudio ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
          </button>
          {attachmentMenuOpen && (
            <div
              className="absolute bottom-full left-0 mb-2 w-44 rounded-lg overflow-hidden z-20"
              style={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              <AttachmentMenuButton
                icon={<FileAudio size={14} />}
                label="Upload audio"
                onClick={handlePickAudio}
              />
              <AttachmentMenuButton
                icon={<ImageIcon size={14} />}
                label="Upload image"
                onClick={handlePickImage}
              />
            </div>
          )}
        </div>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message OpenJarvis..."
          rows={1}
          className="flex-1 bg-transparent outline-none resize-none text-sm leading-relaxed"
          style={{ color: 'var(--color-text)', maxHeight: '200px' }}
          disabled={streamState.isStreaming || modelLoading}
        />
        {streamState.isStreaming ? (
          <button
            onClick={stopStreaming}
            className="p-2 rounded-xl transition-colors shrink-0 cursor-pointer"
            style={{ background: 'var(--color-error)', color: 'var(--color-on-accent)' }}
            title="Stop generating"
          >
            <Square size={16} />
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <MicButton
              state={speechState}
              onClick={handleMicClick}
              disabled={micDisabled}
              reason={micReason}
            />
            <button
              onClick={() => sendMessage()}
              disabled={(!input.trim() && pendingAttachments.length === 0) || modelLoading}
              className="p-2 rounded-xl transition-colors shrink-0 cursor-pointer disabled:opacity-30 disabled:cursor-default"
              style={{
                background: input.trim() || pendingAttachments.length > 0 ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                color: input.trim() || pendingAttachments.length > 0 ? 'white' : 'var(--color-text-tertiary)',
              }}
              title="Send message"
            >
              <Send size={16} />
            </button>
          </div>
        )}
      </div>
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*,.m4a,.mp3,.wav,.webm,.flac,.ogg,.aac"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0] ?? null;
          event.currentTarget.value = '';
          void handleBrowserAudio(file);
        }}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0] ?? null;
          event.currentTarget.value = '';
          void handleBrowserImage(file);
        }}
      />
      <div className="flex items-center justify-center mt-2 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
        <span>
          <kbd className="font-mono">Enter</kbd> to send &middot;{' '}
          <kbd className="font-mono">Shift+Enter</kbd> for new line
        </span>
      </div>
    </div>
  );
}

function AttachmentMenuButton({
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
      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left cursor-pointer transition-colors"
      style={{
        color: 'var(--color-text-secondary)',
        background: 'transparent',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = 'var(--color-bg-secondary)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = 'transparent';
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

async function pickDesktopAttachment(kind: 'audio' | 'image'): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    multiple: false,
    filters: [
      kind === 'audio'
        ? { name: 'Audio', extensions: ['m4a', 'mp3', 'wav', 'webm', 'flac', 'ogg', 'aac'] }
        : { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff'] },
    ],
  });
  if (Array.isArray(selected)) return selected[0] ?? null;
  return typeof selected === 'string' ? selected : null;
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

const AUDIO_EXTENSIONS = new Set(['m4a', 'mp3', 'wav', 'webm', 'flac', 'ogg', 'aac']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff']);

function extensionFromName(name: string): string {
  const match = /\.([^.\\/]+)$/.exec(name.toLowerCase());
  return match?.[1] || '';
}

function isAudioPath(path: string): boolean {
  return AUDIO_EXTENSIONS.has(extensionFromName(path));
}

function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.has(extensionFromName(path));
}

function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || isAudioPath(file.name);
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || isImagePath(file.name);
}

function hasDroppableFiles(dataTransfer: DataTransfer): boolean {
  if (Array.from(dataTransfer.types).includes('Files')) return true;
  return Array.from(dataTransfer.items || []).some((item) => item.kind === 'file');
}

function isPhysicalPointInsideElement(
  position: { x: number; y: number },
  element: HTMLElement | null,
): boolean {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  const x = position.x / scale;
  const y = position.y / scale;
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function formatAttachmentOnlyMessage(attachments: ChatAttachment[]): string {
  if (attachments.length === 1) return `Uploaded ${attachments[0].kind}: ${attachments[0].name}`;
  return `Uploaded ${attachments.length} attachments`;
}

function buildApiMessageContent(content: string, attachments?: ChatAttachment[]): string {
  if (!attachments?.length) return content;
  const attachmentNotes = attachments.map((attachment) => {
    const location = attachment.path || attachment.url || attachment.name;
    if (attachment.kind === 'image') {
      return `[Attached image: ${attachment.name}. Location: ${location}. Visual analysis is not supported in this desktop build yet.]`;
    }
    return `[Attached audio: ${attachment.name}. Location: ${location}.]`;
  });
  return [content, ...attachmentNotes].filter(Boolean).join('\n\n');
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
