import Modal from '../ui/Modal';
import Button from '../ui/Button';

interface PasswordResultModalProps {
  open: boolean;
  onClose: () => void;
  name: string;
  password: string;
  roleLabel?: string;
}

export function PasswordResultModal({
  open,
  onClose,
  name,
  password,
  roleLabel = 'Người dùng',
}: PasswordResultModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mật khẩu tạm"
      size="sm"
      footer={<Button onClick={onClose}>Đã ghi nhận</Button>}
    >
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          Mật khẩu tạm cho {roleLabel.toLowerCase()} <strong>{name}</strong>:
        </p>
        <div className="rounded-lg border border-border-light bg-surface-tertiary p-4 text-center">
          <code className="select-all text-2xl font-bold tracking-widest text-primary-700">{password}</code>
        </div>
        <p className="rounded-lg border border-warning-200 bg-warning-50 p-3 text-xs leading-5 text-warning-800">
          Mật khẩu này chỉ hiển thị một lần. {roleLabel} nên đổi mật khẩu sau khi đăng nhập.
        </p>
      </div>
    </Modal>
  );
}
export default PasswordResultModal;
