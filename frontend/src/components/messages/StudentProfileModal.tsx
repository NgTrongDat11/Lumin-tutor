import { useEffect, useState } from 'react';
import { extractErrorMessage, privateRequestApi } from '../../services/api';
import Avatar from '../ui/Avatar';
import { getStatusBadge } from '../ui/Badge';
import Modal from '../ui/Modal';
import ContactDetails from '../shared/ContactDetails';

interface StudentProfile {
  student_id: number;
  full_name: string;
  avatar_url: string | null;
  email: string | null;
  phone: string | null;
  birth_year: number | null;
  address: string | null;
  school: string | null;
  academic_level: string | null;
  learning_style: string | null;
  parent_notes: string | null;
  contact_visible: boolean;
  created_at: string | null;
  total_contracts: number;
  request_history: {
    id: number;
    subject_name: string;
    grade_level: string;
    goal: string | null;
    requested_sessions: number;
    status: string;
    mode: string;
    created_at: string | null;
  }[];
}

interface StudentProfileModalProps {
  requestId: number | null;
  onClose: () => void;
}

export default function StudentProfileModal({ requestId, onClose }: StudentProfileModalProps) {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!requestId) {
      setProfile(null);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    privateRequestApi.studentProfile(requestId)
      .then((data) => {
        if (!cancelled) setProfile(data as StudentProfile);
      })
      .catch((err) => {
        if (!cancelled) setError(extractErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  return (
    <Modal
      open={!!requestId}
      onClose={onClose}
      title="Hồ sơ học viên"
      size="lg"
    >
      {loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-surface-secondary" />
            <div className="space-y-2 flex-1">
              <div className="h-5 w-40 rounded bg-surface-secondary" />
              <div className="h-3 w-60 rounded bg-surface-secondary" />
            </div>
          </div>
          <div className="h-20 rounded-lg bg-surface-secondary" />
          <div className="h-32 rounded-lg bg-surface-secondary" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-danger-100 bg-danger-50 p-4 text-sm text-danger-600">{error}</div>
      ) : profile ? (
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <Avatar name={profile.full_name} src={profile.avatar_url || undefined} size="lg" shape="circle" />
            <div>
              <h3 className="text-lg font-bold text-text-primary">{profile.full_name}</h3>
              <p className="text-sm text-text-secondary">Thông tin học viên và lịch sử học tập</p>
            </div>
          </div>

          <ContactDetails
            title="Liên hệ học viên"
            phone={profile.phone}
            email={profile.email}
            address={profile.address}
            emptyMessage={profile.contact_visible
              ? 'Học viên chưa cập nhật thông tin liên hệ.'
              : 'Số điện thoại và thông tin liên hệ sẽ hiển thị sau khi bạn xác nhận yêu cầu.'}
          />

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border-light bg-surface-secondary p-3 text-center">
              <p className="text-2xl font-bold text-primary-700">{profile.total_contracts}</p>
              <p className="text-xs font-medium text-text-tertiary">Hợp đồng</p>
            </div>
            <div className="rounded-lg border border-border-light bg-surface-secondary p-3 text-center">
              <p className="text-2xl font-bold text-primary-700">{profile.request_history.length}</p>
              <p className="text-xs font-medium text-text-tertiary">Yêu cầu</p>
            </div>
            <div className="rounded-lg border border-border-light bg-surface-secondary p-3 text-center">
              <p className="text-2xl font-bold text-primary-700">{profile.birth_year || '-'}</p>
              <p className="text-xs font-medium text-text-tertiary">Năm sinh</p>
            </div>
          </div>


          {(profile.school || profile.academic_level || profile.learning_style || profile.parent_notes) && (
            <div className="border-t border-border-light pt-4 space-y-3">
              <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider">Thông tin học vấn & Nhu cầu</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {profile.school && (
                  <div className="rounded-lg border border-border-light bg-surface-secondary p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-text-tertiary mb-1">Trường / Lớp</p>
                    <p className="text-sm font-semibold text-text-primary">{profile.school}</p>
                  </div>
                )}
                {profile.academic_level && (
                  <div className="rounded-lg border border-border-light bg-surface-secondary p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-text-tertiary mb-1">Học lực tự đánh giá</p>
                    <span className="inline-flex items-center rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-bold text-primary-700 border border-primary-100">
                      {profile.academic_level}
                    </span>
                  </div>
                )}
              </div>

              {profile.learning_style && (
                <div className="rounded-lg border border-border-light bg-surface-secondary p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-text-tertiary mb-1">Phong cách học tập</p>
                  <p className="text-sm text-text-secondary whitespace-pre-line leading-relaxed">{profile.learning_style}</p>
                </div>
              )}

              {profile.parent_notes && (
                <div className="rounded-lg border border-border-light bg-surface-secondary p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-text-tertiary mb-1">Ghi chú phụ huynh / học viên</p>
                  <p className="text-sm text-text-secondary whitespace-pre-line leading-relaxed">{profile.parent_notes}</p>
                </div>
              )}
            </div>
          )}

          {profile.created_at && (
            <p className="text-xs text-text-tertiary">
              Tham gia từ {new Date(profile.created_at).toLocaleDateString('vi-VN', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          )}

          <div>
            <h4 className="text-sm font-bold text-text-primary mb-3">Lịch sử yêu cầu học</h4>
            {profile.request_history.length === 0 ? (
              <p className="text-sm text-text-tertiary">Chưa có lịch sử.</p>
            ) : (
              <div className="space-y-2 max-h-[240px] overflow-y-auto">
                {profile.request_history.map((item) => (
                  <div key={item.id} className="rounded-lg border border-border-light bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-xs font-bold text-primary-700">
                          {item.subject_name}
                        </span>
                        <span className="text-xs text-text-secondary">{item.grade_level}</span>
                        <span className="text-xs text-text-secondary">· {item.requested_sessions} buổi</span>
                      </div>
                      {getStatusBadge(item.status)}
                    </div>
                    {item.goal && (
                      <p className="mt-1.5 text-xs leading-5 text-text-tertiary line-clamp-2">{item.goal}</p>
                    )}
                    {item.created_at && (
                      <p className="mt-1 text-[10px] text-text-tertiary">
                        {new Date(item.created_at).toLocaleDateString('vi-VN')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
