import { useEffect, useState } from 'react';
import { extractErrorMessage, privateRequestApi } from '../../services/api';
import type { PrivateRequestResponse } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import { useToast } from '../ui/Toast';

interface UpdateLocationModalProps {
  requestId: number | null;
  currentLocation?: string | null;
  onClose: () => void;
  onUpdated: (request: PrivateRequestResponse) => void | Promise<void>;
}

export default function UpdateLocationModal({
  requestId,
  currentLocation,
  onClose,
  onUpdated,
}: UpdateLocationModalProps) {
  const { toast } = useToast();
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (requestId === null) return;
    setLocation(currentLocation || '');
  }, [currentLocation, requestId]);

  const handleSave = async () => {
    if (requestId === null || saving) return;
    const trimmed = location.trim();
    if (!trimmed) {
      toast('error', 'Vui lòng nhập phòng/link học');
      return;
    }
    if (trimmed.length > 500) {
      toast('error', 'Phòng/link học tối đa 500 ký tự');
      return;
    }

    setSaving(true);
    try {
      const updatedRequest = await privateRequestApi.updateLocation(requestId, trimmed);
      toast('success', 'Đã cập nhật phòng/link học');
      await onUpdated(updatedRequest);
      onClose();
    } catch (err) {
      toast('error', 'Cập nhật thất bại: ' + extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={requestId !== null}
      onClose={onClose}
      title="Đổi phòng/link học"
      size="sm"
      footer={(
        <>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button loading={saving} onClick={handleSave}>Lưu</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <Input
          label="Phòng/link học"
          placeholder="VD: Google Meet, Zoom, phòng A203 hoặc địa chỉ học"
          value={location}
          maxLength={500}
          onChange={(event) => setLocation(event.target.value)}
          autoFocus
        />
      </div>
    </Modal>
  );
}