import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { chatApi, extractErrorMessage } from '../../services/api';
import type { ChatMessage as ChatMessageType } from '../../types';
import { RefreshIcon, SendIcon, XIcon } from '../ui/Icons';
import ChatMessage from './ChatMessage';

interface ChatPanelProps {
  onClose: () => void;
}

interface StoredChatHistory {
  messages: ChatMessageType[];
  updated_at: string;
}

const CHAT_HISTORY_KEY = 'lumin_chat_history';
const MAX_MESSAGES = 50;

function trimMessages(messages: ChatMessageType[]) {
  return messages.slice(-MAX_MESSAGES);
}

function isChatMessage(value: unknown): value is ChatMessageType {
  const item = value as ChatMessageType;
  return (
    item &&
    (item.role === 'user' || item.role === 'assistant') &&
    typeof item.content === 'string' &&
    typeof item.created_at === 'string'
  );
}

function loadHistory(): ChatMessageType[] {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredChatHistory;
    if (!Array.isArray(parsed.messages)) return [];
    return trimMessages(parsed.messages.filter(isChatMessage));
  } catch {
    return [];
  }
}

function saveHistory(messages: ChatMessageType[]) {
  if (messages.length === 0) {
    localStorage.removeItem(CHAT_HISTORY_KEY);
    return;
  }

  const payload: StoredChatHistory = {
    messages: trimMessages(messages),
    updated_at: new Date().toISOString(),
  };
  localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(payload));
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-lg border border-border-light bg-white px-3.5 py-3 shadow-sm">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-tertiary" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-tertiary [animation-delay:120ms]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-tertiary [animation-delay:240ms]" />
      </div>
    </div>
  );
}

export default function ChatPanel({ onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessageType[]>(loadHistory);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveHistory(messages);
  }, [messages]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleNewConversation = () => {
    setMessages([]);
    setInput('');
    setError('');
    localStorage.removeItem(CHAT_HISTORY_KEY);
  };

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const history = trimMessages(messages);
    const userMessage: ChatMessageType = {
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString(),
    };

    setMessages(trimMessages([...history, userMessage]));
    setInput('');
    setError('');
    setIsLoading(true);

    try {
      const response = await chatApi.send(history, trimmed);
      const assistantMessage: ChatMessageType = {
        role: 'assistant',
        content: response.reply,
        created_at: response.created_at,
      };
      setMessages((current) => trimMessages([...current, assistantMessage]));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <section
      className="fixed bottom-[10.25rem] right-3 z-[55] flex h-[min(500px,calc(100dvh-12rem))] w-[calc(100vw-24px)] max-w-[400px] animate-slide-up flex-col overflow-hidden rounded-lg border border-border bg-[#fbfaf6] shadow-xl md:bottom-[92px] md:right-6 md:h-[min(550px,calc(100vh-116px))] md:w-[calc(100vw-32px)]"
      aria-label="Lumin AI chat"
    >
      <header className="flex items-center justify-between border-b border-border-light bg-white px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Lumin AI</h2>
          <p className="text-xs text-text-tertiary">Hỗ trợ nhanh cho học viên</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleNewConversation}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary"
            aria-label="Bắt đầu cuộc trò chuyện mới"
            title="Cuộc trò chuyện mới"
          >
            <RefreshIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary"
            aria-label="Đóng chat"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-white/70 px-4 py-5 text-sm text-text-secondary">
            Mình có thể giúp bạn tra cứu yêu cầu 1-1, lớp nhóm, thanh toán, lịch học hoặc tư vấn nhu cầu học.
          </div>
        ) : (
          messages.map((message, index) => (
            <ChatMessage key={`${message.created_at}-${index}`} message={message} />
          ))
        )}
        {isLoading && <TypingIndicator />}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-border-light bg-white p-3">
        {error && (
          <div className="mb-2 rounded-md border border-danger-100 bg-danger-50 px-3 py-2 text-xs text-danger-600">
            {error}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={1}
            maxLength={4000}
            placeholder="Nhập tin nhắn..."
            className="max-h-28 min-h-11 flex-1 resize-none rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 disabled:bg-surface-secondary"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-text-primary text-white shadow-sm transition-colors hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Gửi tin nhắn"
          >
            <SendIcon className="h-4 w-4" />
          </button>
        </div>
      </form>
    </section>
  );
}
