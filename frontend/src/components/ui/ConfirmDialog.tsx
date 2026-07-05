import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Modal from './Modal';
import Button from './Button';
import { InfoIcon } from './Icons';

export type ConfirmDialogVariant = 'default' | 'danger' | 'warning';

export interface ConfirmDialogOptions {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
}

interface ConfirmDialogProps extends ConfirmDialogOptions {
  open: boolean;
  onClose: () => void;
  onConfirm: () => unknown;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  loading?: boolean;
}

const variantStyles: Record<ConfirmDialogVariant, { icon: string; title: string; confirmVariant: 'primary' | 'danger' }> = {
  default: {
    icon: 'bg-primary-50 text-primary-700',
    title: 'text-text-primary',
    confirmVariant: 'primary',
  },
  danger: {
    icon: 'bg-danger-50 text-danger-600',
    title: 'text-danger-700',
    confirmVariant: 'danger',
  },
  warning: {
    icon: 'bg-warning-50 text-warning-700',
    title: 'text-warning-700',
    confirmVariant: 'primary',
  },
};

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  confirmText,
  cancelText,
  danger = false,
  variant,
  loading,
}: ConfirmDialogProps) {
  const [internalLoading, setInternalLoading] = useState(false);
  const resolvedVariant = variant || (danger ? 'danger' : 'default');
  const styles = variantStyles[resolvedVariant];
  const isLoading = loading ?? internalLoading;
  const resolvedConfirmLabel = confirmLabel || confirmText || 'Xác nhận';
  const resolvedCancelLabel = cancelLabel || cancelText || 'Hủy';

  const handleClose = () => {
    if (!isLoading) onClose();
  };

  const handleConfirm = async () => {
    if (isLoading) return;
    setInternalLoading(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      // Keep the dialog open if the caller rejects; callers should surface the failure.
    } finally {
      setInternalLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="sm"
      footer={(
        <>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            {resolvedCancelLabel}
          </Button>
          <Button variant={styles.confirmVariant} onClick={handleConfirm} loading={isLoading}>
            {resolvedConfirmLabel}
          </Button>
        </>
      )}
    >
      <div className="flex gap-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${styles.icon}`}>
          <InfoIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className={`text-base font-semibold leading-6 ${styles.title}`}>{title}</h2>
          {description && <p className="mt-2 text-sm leading-6 text-text-secondary">{description}</p>}
        </div>
      </div>
    </Modal>
  );
}

export function useConfirmDialog() {
  const [options, setOptions] = useState<ConfirmDialogOptions | null>(null);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const close = useCallback(() => {
    resolverRef.current?.(false);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const confirm = useCallback((nextOptions: ConfirmDialogOptions) => {
    resolverRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOptions(nextOptions);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    resolverRef.current?.(true);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  useEffect(() => {
    return () => {
      resolverRef.current?.(false);
      resolverRef.current = null;
    };
  }, []);

  const ConfirmDialogElement = useMemo(() => (
    <ConfirmDialog
      open={Boolean(options)}
      title={options?.title || ''}
      description={options?.description}
      confirmLabel={options?.confirmLabel}
      cancelLabel={options?.cancelLabel}
      variant={options?.variant}
      onClose={close}
      onConfirm={handleConfirm}
    />
  ), [close, handleConfirm, options]);

  return { confirm, ConfirmDialogElement };
}
