import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { extractErrorMessage, messageApi } from '../../services/api';
import type { MessageResponse, MessageThreadResponse, UserRole } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { EmptyPanel, PortalPage } from '../../components/portal/PortalPage';
import Button from '../../components/ui/Button';
import Textarea from '../../components/ui/Textarea';
import { MessagesSkeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { MessageCircleIcon, PinIcon, SendIcon, SearchIcon } from '../../components/ui/Icons';
import RequestActionBar from '../../components/messages/RequestActionBar';

const roleLabels: Record<UserRole, string> = {
  STUDENT: 'Học viên',
  TUTOR: 'Gia sư',
  STAFF: 'Nhân viên',
  SUPER_ADMIN: 'Quản trị viên',
};

function parseApiTime(value: string) {
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  return new Date(hasTimezone ? value : `${value}Z`);
}

function formatTime(value: string | null | undefined) {
  if (!value) return '';
  return parseApiTime(value).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

function isSupportThread(thread: MessageThreadResponse) {
  return !thread.private_request_id && !thread.class_registration_id && !thread.class_id;
}

function getThreadTitle(thread: MessageThreadResponse, currentUserId: number | undefined) {
  if (thread.private_request_id || thread.class_registration_id || thread.class_id) {
    return thread.title || threadSubtitle(thread, currentUserId);
  }
  if (thread.participants.length === 2 && currentUserId) {
    const other = thread.participants.find((p) => p.account_id !== currentUserId);
    if (other) {
      return `${other.full_name} (${roleLabels[other.role as UserRole] || other.role})`;
    }
  }
  return thread.title || 'Hỗ trợ trung tâm';
}

function threadSubtitle(thread: MessageThreadResponse, currentUserId?: number) {
  if (thread.private_request_id) return `Yêu cầu 1-1 #${thread.private_request_id}`;
  if (thread.class_registration_id) return `Đăng ký lớp #${thread.class_registration_id}`;
  if (thread.class_id) return `Lớp nhóm #${thread.class_id}`;
  if (thread.participants.length === 2 && currentUserId) {
    return 'Trò chuyện trực tiếp';
  }
  return 'Hỗ trợ trung tâm';
}

/* ── Pin helpers (localStorage per user) ─────── */
function getPinnedKey(userId: number | undefined) {
  return `lumin_pinned_threads_${userId || 0}`;
}
function loadPinnedIds(userId: number | undefined): Set<number> {
  try {
    const raw = localStorage.getItem(getPinnedKey(userId));
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}
function savePinnedIds(userId: number | undefined, ids: Set<number>) {
  localStorage.setItem(getPinnedKey(userId), JSON.stringify([...ids]));
}

export default function MessagesPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [threads, setThreads] = useState<MessageThreadResponse[]>([]);
  const [activeThread, setActiveThread] = useState<MessageThreadResponse | null>(null);
  const [messages, setMessages] = useState<MessageResponse[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pinnedIds, setPinnedIds] = useState<Set<number>>(() => loadPinnedIds(user?.id));
  const { toast } = useToast();
  
  const [hasMoreThreads, setHasMoreThreads] = useState(true);
  const [loadingMoreThreads, setLoadingMoreThreads] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageIdRef = useRef<number | null>(null);

  const activeThreadId = searchParams.get('threadId');

  const loadThreads = useCallback(async () => {
    const list = await messageApi.listThreads(20, 0);
    setThreads(list);
    setHasMoreThreads(list.length === 20);
    if (!activeThreadId && !activeThread && list[0]) {
      setSearchParams({ threadId: String(list[0].id) }, { replace: true });
    }
    return list;
  }, [activeThreadId, activeThread, setSearchParams]);

  const handleLoadMoreThreads = async () => {
    if (loadingMoreThreads) return;
    setLoadingMoreThreads(true);
    try {
      const list = await messageApi.listThreads(20, threads.length);
      setThreads((prev) => [...prev, ...list]);
      setHasMoreThreads(list.length === 20);
    } catch (err) {
      toast('error', extractErrorMessage(err));
    } finally {
      setLoadingMoreThreads(false);
    }
  };

  const handleLoadMoreMessages = async () => {
    if (loadingMoreMessages || messages.length === 0 || !activeThread) return;
    setLoadingMoreMessages(true);
    const oldestId = messages[0].id;
    try {
      const older = await messageApi.listMessages(activeThread.id, 30, oldestId);
      setMessages((current) => [...older, ...current]);
      setHasMoreMessages(older.length === 30);
    } catch (err) {
      toast('error', extractErrorMessage(err));
    } finally {
      setLoadingMoreMessages(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadThreads()
      .catch((err) => toast('error', extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = Number(activeThreadId || 0);
    lastMessageIdRef.current = null;
    if (!id) {
      setActiveThread(null);
      setMessages([]);
      setHasMoreMessages(false);
      return;
    }
    setThreadLoading(true);
    Promise.all([messageApi.getThread(id), messageApi.listMessages(id, 30)])
      .then(([thread, messageList]) => {
        setActiveThread(thread);
        setMessages(messageList);
        setHasMoreMessages(messageList.length === 30);
        setThreads((current) => current.map((item) => item.id === thread.id ? { ...thread, unread_count: 0 } : item));
      })
      .catch((err) => toast('error', extractErrorMessage(err)))
      .finally(() => setThreadLoading(false));
  }, [activeThreadId, toast]);

  // Auto-scroll logic: only scroll down if last message ID changes (e.g. sent/received new message, or loaded new thread)
  useEffect(() => {
    if (messages.length === 0) return;
    const latestMessage = messages[messages.length - 1];
    const lastId = lastMessageIdRef.current;
    if (lastId === null || latestMessage.id !== lastId) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    lastMessageIdRef.current = latestMessage.id;
  }, [messages]);

  const participants = useMemo(() => {
    return activeThread?.participants.filter((participant) => participant.account_id !== user?.id) ?? [];
  }, [activeThread, user?.id]);

  /* ── Filter & sort threads ────────────────────── */
  const visibleThreads = useMemo(() => {
    let result = threads
      .filter((t) => {
        if (t.id === Number(activeThreadId)) return true;
        if (isSupportThread(t)) {
          if (t.participants.length === 2) return true;
          return !!t.last_message;
        }
        return true;
      });

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((t) =>
        getThreadTitle(t, user?.id).toLowerCase().includes(q) ||
        threadSubtitle(t, user?.id).toLowerCase().includes(q) ||
        (t.last_message?.content || '').toLowerCase().includes(q) ||
        t.participants.some((p) => p.full_name.toLowerCase().includes(q)),
      );
    }

    // Sort: pinned first → unread → newest
    result.sort((a, b) => {
      const aPinned = pinnedIds.has(a.id) ? 1 : 0;
      const bPinned = pinnedIds.has(b.id) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;

      const aUnread = (a.unread_count || 0) > 0 ? 1 : 0;
      const bUnread = (b.unread_count || 0) > 0 ? 1 : 0;
      if (aUnread !== bUnread) return bUnread - aUnread;

      const aTime = new Date(a.updated_at || 0).getTime();
      const bTime = new Date(b.updated_at || 0).getTime();
      return bTime - aTime;
    });

    return result;
  }, [threads, searchQuery, pinnedIds, activeThreadId, user?.id]);

  /* ── Handlers ─────────────────────────────────── */
  const handleStartSupport = async () => {
    try {
      const thread = await messageApi.ensureThread({ support: true, title: 'Hỗ trợ trung tâm' });
      await loadThreads();
      setSearchParams({ threadId: String(thread.id) });
    } catch (err) {
      toast('error', extractErrorMessage(err));
    }
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!activeThread || !content) return;
    setSending(true);
    try {
      const message = await messageApi.sendMessage(activeThread.id, content);
      setMessages((current) => [...current, message]);
      setDraft('');
      void loadThreads();
    } catch (err) {
      toast('error', extractErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const refreshActiveConversation = async () => {
    if (!activeThread) return;
    try {
      const [thread, messageList] = await Promise.all([
        messageApi.getThread(activeThread.id),
        messageApi.listMessages(activeThread.id, 30),
      ]);
      setActiveThread(thread);
      setMessages(messageList);
      setHasMoreMessages(messageList.length === 30);
      setThreads((current) => {
        const next = current.map((item) => item.id === thread.id ? { ...thread, unread_count: 0 } : item);
        return next.some((item) => item.id === thread.id) ? next : [thread, ...current];
      });
      void loadThreads();
    } catch (err) {
      toast('error', extractErrorMessage(err));
    }
  };

  const togglePin = (threadId: number) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) {
        next.delete(threadId);
      } else {
        next.add(threadId);
      }
      savePinnedIds(user?.id, next);
      return next;
    });
  };

  if (loading) return <MessagesSkeleton />;

  return (
    <PortalPage
      title="Tin nhắn"
      description="Trao đổi theo đúng ngữ cảnh yêu cầu 1-1, đăng ký lớp hoặc hỗ trợ trung tâm."
      actions={<Button variant="outline" onClick={handleStartSupport}>Liên hệ hỗ trợ</Button>}
      className="h-full flex flex-col min-h-0 !space-y-3 flex-1 max-w-none w-full"
    >
      <div className="grid flex-1 min-h-0 gap-4 lg:h-full lg:min-h-0 lg:grid-cols-[320px_1fr] h-full">
        {/* ── Thread List Panel ─────────────────────── */}
        <div className="flex min-h-0 flex-col rounded-lg border border-border-light bg-white shadow-xs h-full">
          <div className="border-b border-border-light px-4 pt-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-text-primary">
                Hội thoại
                <span className="ml-2 text-xs font-medium text-text-tertiary">{visibleThreads.length}</span>
              </h2>
            </div>
            {/* Search bar */}
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm hội thoại..."
                className="w-full rounded-lg border border-border-light bg-surface-secondary py-2 pl-9 pr-3 text-sm text-text-primary outline-none transition-all placeholder:text-text-tertiary focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-500/20"
              />
            </div>
          </div>

          {/* Scrollable thread list */}
          <div className="flex-1 overflow-y-auto px-3 py-3">
            {visibleThreads.length === 0 ? (
              <EmptyPanel
                title={searchQuery ? 'Không tìm thấy hội thoại' : 'Chưa có hội thoại'}
                description={searchQuery ? 'Thử từ khóa khác hoặc xóa bộ lọc.' : 'Khi gửi yêu cầu, đăng ký lớp hoặc liên hệ hỗ trợ, hội thoại sẽ xuất hiện tại đây.'}
                action={!searchQuery ? <Button size="sm" onClick={handleStartSupport}>Tạo hội thoại hỗ trợ</Button> : undefined}
              />
            ) : (
              <div className="space-y-2">
                {visibleThreads.map((thread) => {
                  const active = activeThread?.id === thread.id;
                  const pinned = pinnedIds.has(thread.id);
                  const threadTitle = getThreadTitle(thread, user?.id);
                  return (
                    <div
                      key={thread.id}
                      className={`group relative w-full rounded-lg border px-3 py-3 text-left transition-all ${
                        active
                          ? 'border-primary-200 bg-primary-50 shadow-sm'
                          : 'border-border-light bg-white hover:bg-surface-secondary hover:border-primary-100'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSearchParams({ threadId: String(thread.id) })}
                        className="absolute inset-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        aria-label={`Mở hội thoại ${threadTitle}`}
                        aria-pressed={active}
                      />
                      {/* Pin indicator */}
                      {pinned && (
                        <span className="absolute -left-1 top-3 h-5 w-1 rounded-r-full bg-primary-500" />
                      )}
                      <div className="pointer-events-none relative flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {pinned && <PinIcon className="h-3.5 w-3.5 shrink-0 text-primary-600" />}
                            <p className={`truncate text-sm font-semibold ${active ? 'text-primary-800' : 'text-text-primary'}`}>
                              {threadTitle}
                            </p>
                          </div>
                          <p className="mt-0.5 text-xs text-text-tertiary">{threadSubtitle(thread, user?.id)}</p>
                        </div>
                        <div className="pointer-events-auto relative z-10 flex shrink-0 items-center gap-1.5">
                          {/* Pin/unpin button */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); togglePin(thread.id); }}
                            className={`rounded p-1 text-xs transition-colors ${
                              pinned
                                ? 'text-primary-600 hover:bg-primary-100'
                                : 'text-text-tertiary opacity-0 group-hover:opacity-100 hover:bg-surface-tertiary'
                            }`}
                            title={pinned ? 'Bỏ ghim' : 'Ghim hội thoại'}
                            aria-label={pinned ? 'Bỏ ghim hội thoại' : 'Ghim hội thoại'}
                          >
                            <PinIcon className={`h-4 w-4 ${pinned ? 'rotate-45' : ''}`} />
                          </button>
                          {thread.unread_count > 0 && (
                            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary-600 px-1.5 text-[10px] font-bold text-white">
                              {thread.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="pointer-events-none relative mt-2 line-clamp-2 text-xs leading-5 text-text-secondary">
                        {thread.last_message?.content || 'Chưa có tin nhắn.'}
                      </p>
                      <p className="pointer-events-none relative mt-1 text-[11px] text-text-tertiary">{formatTime(thread.last_message?.created_at || thread.updated_at)}</p>
                    </div>
                  );
                })}
                {hasMoreThreads && (
                  <div className="mt-3 pb-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={handleLoadMoreThreads}
                      loading={loadingMoreThreads}
                    >
                      Tải thêm hội thoại
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Chat Panel ────────────────────────────── */}
        <section className="flex min-h-0 h-full flex-col rounded-lg border border-border-light bg-white shadow-xs">
          {!activeThread ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <div className="max-w-sm text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                  <MessageCircleIcon className="h-6 w-6" />
                </div>
                <h2 className="mt-4 font-semibold text-text-primary">Chọn một hội thoại</h2>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  Tin nhắn giữa học viên, gia sư và trung tâm sẽ được lưu theo từng ngữ cảnh xử lý.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="border-b border-border-light px-4 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">{getThreadTitle(activeThread, user?.id)}</h2>
                    <p className="mt-1 text-sm text-text-secondary">{threadSubtitle(activeThread, user?.id)}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {participants.map((participant) => (
                      <span key={participant.account_id} className="rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-semibold text-text-secondary">
                        {participant.full_name} · {roleLabels[participant.role]}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {activeThread.private_request_id && user && (
                <RequestActionBar
                  privateRequestId={activeThread.private_request_id}
                  userRole={user.role}
                  onStatusChange={refreshActiveConversation}
                />
              )}

              <div className="min-h-0 flex-1 overflow-y-auto bg-surface-secondary/60 p-4">
                {threadLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                        <div className={`h-14 w-52 animate-pulse rounded-lg ${i % 2 === 0 ? 'bg-white border border-border-light' : 'bg-primary-200'}`} />
                      </div>
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-white p-6 text-center">
                    <p className="font-semibold text-text-primary">Chưa có trao đổi</p>
                    <p className="mt-1 text-sm text-text-secondary">Gửi tin nhắn đầu tiên để thống nhất thông tin với bên còn lại.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {hasMoreMessages && (
                      <div className="flex justify-center pb-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleLoadMoreMessages}
                          loading={loadingMoreMessages}
                          className="bg-white border-primary-200 text-primary-700 hover:bg-primary-50"
                        >
                          Tải tin nhắn cũ hơn
                        </Button>
                      </div>
                    )}
                    {messages.map((message) => (
                      <div key={message.id} className={`flex ${message.is_mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[78%] rounded-lg px-3.5 py-2.5 shadow-xs ${
                          message.is_mine
                            ? 'bg-primary-700 text-white'
                            : 'border border-border-light bg-white text-text-primary'
                        }`}>
                          {!message.is_mine && (
                            <p className="mb-1 text-xs font-semibold text-primary-700">{message.sender_name || 'Người gửi'}</p>
                          )}
                          <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                          <p className={`mt-1 text-[11px] ${message.is_mine ? 'text-white/70' : 'text-text-tertiary'}`}>
                            {formatTime(message.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              <form onSubmit={handleSend} className="border-t border-border-light bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end w-full">
                  <div className="flex-1">
                    <Textarea
                      className="min-h-[48px] resize-none"
                      placeholder="Nhập tin nhắn..."
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      rows={2}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend(e);
                        }
                      }}
                    />
                  </div>
                  <Button type="submit" loading={sending} disabled={!draft.trim()} className="gap-2 shrink-0">
                    <SendIcon className="h-4 w-4" />
                    Gửi
                  </Button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </PortalPage>
  );
}
