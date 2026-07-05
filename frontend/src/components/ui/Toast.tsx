import { useState, useEffect, createContext, useContext, useCallback, type ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  toast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-full max-w-[calc(100vw-2rem)] sm:max-w-sm">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

/* ── Toast Item ─────────────────────────────── */
const typeConfig: Record<ToastType, { bg: string; icon: string }> = {
  success: { bg: 'bg-success-50 border-success-500 text-success-700', icon: '✓' },
  error: { bg: 'bg-danger-50 border-danger-500 text-danger-600', icon: '✕' },
  warning: { bg: 'bg-warning-50 border-warning-500 text-warning-600', icon: '⚠' },
  info: { bg: 'bg-primary-50 border-primary-500 text-primary-700', icon: 'ℹ' },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const config = typeConfig[toast.type];

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border-l-4 shadow-lg animate-slide-in-right ${config.bg}`}
    >
      <span className="font-bold text-base flex-shrink-0">{config.icon}</span>
      <p className="text-sm flex-1">{toast.message}</p>
      <button onClick={onDismiss} className="text-current opacity-50 hover:opacity-100 cursor-pointer">
        ✕
      </button>
    </div>
  );
}
