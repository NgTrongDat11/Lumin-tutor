import { useState, useRef, useEffect } from 'react';

interface ActionMenuProps {
  status: string;
  onToggle: () => void;
  onReset: () => void;
  onChat?: () => void;
  loading: boolean;
  roleLabel?: string;
}

export function ActionMenu({
  status,
  onToggle,
  onReset,
  onChat,
  loading,
  roleLabel = 'tài khoản',
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleLabel = status === 'ACTIVE' ? `Khóa ${roleLabel}` : `Mở khóa ${roleLabel}`;
  const toggleClass =
    status === 'ACTIVE'
      ? 'text-danger-600 hover:bg-danger-50'
      : 'text-success-700 hover:bg-success-50';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-tertiary hover:text-text-primary disabled:opacity-50"
      >
        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-border-light bg-white py-1 shadow-lg animate-fade-in">
          {onChat && (
            <>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onChat();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-secondary"
              >
                <svg
                  className="h-4 w-4 text-text-tertiary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                Nhắn tin
              </button>
              <div className="mx-2 border-t border-border-light" />
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onReset();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-secondary"
          >
            <svg
              className="h-4 w-4 text-text-tertiary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
            Cấp lại mật khẩu
          </button>
          <div className="mx-2 border-t border-border-light" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onToggle();
            }}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${toggleClass}`}
          >
            {status === 'ACTIVE' ? (
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                />
              </svg>
            ) : (
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {toggleLabel}
          </button>
        </div>
      )}
    </div>
  );
}

export default ActionMenu;
