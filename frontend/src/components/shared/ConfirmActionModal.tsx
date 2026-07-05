import Modal from '../ui/Modal';
import Button from '../ui/Button';

interface ConfirmActionModalProps {
  open: boolean;
  title: string;
  description: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmActionModal({
  open,
  title,
  description,
  variant = 'primary',
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmActionModalProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-sm leading-6 text-text-secondary">{description}</p>
    </Modal>
  );
}

export default ConfirmActionModal;
