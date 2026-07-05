import { useEffect, useState, type FormEvent } from 'react';
import { tutorApi } from '../../services/api';
import type { QualificationCreate, QualificationResponse, TutorAvailabilityResponse, TutorProfileResponse, TutorProfileUpdate } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import { useConfirmDialog } from '../../components/ui/ConfirmDialog';
import { getStatusBadge } from '../../components/ui/Badge';
import DocumentLink from '../../components/ui/DocumentLink';
import { FormSkeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { ClockIcon, ShieldCheckIcon, UserCheckIcon, WalletIcon } from '../../components/ui/Icons';
import { EmptyPanel, MetricTile, PortalPage, SectionPanel, SegmentedTabs } from '../../components/portal/PortalPage';
import AreaSuggestionChips from '../../components/shared/AreaSuggestionChips';
import AvailabilityManager from '../../components/tutor/AvailabilityManager';

type ProfileTab = 'profile' | 'certificates' | 'availability';

function completionScore(profile: TutorProfileResponse | null, qualifications: QualificationResponse[], availabilities: TutorAvailabilityResponse[]) {
  const checks = [
    Boolean(profile?.bio),
    Boolean(profile?.qualification_level),
    Number(profile?.years_experience || 0) > 0,
    Boolean(profile?.teaching_mode),
    Boolean(profile?.teaching_area),
    qualifications.length > 0,
    availabilities.length > 0,
    profile?.verification_status === 'VERIFIED',
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function certificateLabel(type: string) {
  const labels: Record<string, string> = {
    DEGREE: 'Bằng cấp',
    CERTIFICATE: 'Chứng chỉ',
    OTHER: 'Khác',
  };
  return labels[type] || type;
}

function verificationStatusLabel(status: string) {
  const labels: Record<string, string> = {
    DRAFT: 'Bản nháp',
    PENDING_REVIEW: 'Chờ duyệt',
    VERIFIED: 'Đã xác minh',
    REJECTED: 'Từ chối',
  };
  return labels[status] || status;
}

function teachingModeLabel(mode: string | null | undefined) {
  if (mode === 'ONLINE') return 'Trực tuyến';
  if (mode === 'OFFLINE') return 'Trực tiếp';
  if (mode === 'BOTH') return 'Trực tuyến và trực tiếp';
  return 'Chưa rõ';
}

export default function TutorProfile({ initialTab = 'profile' }: { initialTab?: ProfileTab }) {
  const { refresh, user } = useAuth();
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab);
  const [profile, setProfile] = useState<TutorProfileResponse | null>(null);
  const [qualifications, setQualifications] = useState<QualificationResponse[]>([]);
  const [availabilities, setAvailabilities] = useState<TutorAvailabilityResponse[]>([]);
  const [form, setForm] = useState<TutorProfileUpdate>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showAddQual, setShowAddQual] = useState(false);
  const { toast } = useToast();
  const { confirm: confirmAction, ConfirmDialogElement } = useConfirmDialog();

  const load = () => {
    Promise.all([
      tutorApi.getProfile().catch(() => null),
      tutorApi.getQualifications().catch(() => []),
      tutorApi.getAvailabilities().catch(() => []),
    ]).then(([profileData, qualificationList, availabilityList]) => {
      setProfile(profileData);
      setQualifications(qualificationList);
      setAvailabilities(availabilityList);
      if (profileData) {
        setForm({
          bio: profileData.bio || '',
          qualification_level: profileData.qualification_level || '',
          years_experience: profileData.years_experience,
          teaching_mode: profileData.teaching_mode,
          teaching_area: profileData.teaching_area || '',
        });
      }
      setLoading(false);
    });
  };

  useEffect(load, []);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const updated = await tutorApi.updateProfile(form);
      setProfile(updated);
      toast('success', 'Đã cập nhật hồ sơ');
      refresh();
    } catch {
      toast('error', 'Cập nhật thất bại');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitReview = async () => {
    setSubmitting(true);
    try {
      const updated = await tutorApi.submitReview();
      if (updated) {
        setProfile(updated);
      } else {
        const freshProfile = await tutorApi.getProfile();
        setProfile(freshProfile);
      }
      toast('success', 'Đã gửi hồ sơ chờ duyệt');
      refresh();
    } catch {
      toast('error', 'Gửi duyệt thất bại. Cần có ít nhất 1 chứng chỉ.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteQualification = async (id: number) => {
    const shouldDelete = await confirmAction({
      title: 'Xóa chứng chỉ này?',
      description: 'Chứng chỉ đã xóa sẽ không còn hiển thị trong hồ sơ xác minh của bạn.',
      confirmLabel: 'Xóa',
      variant: 'danger',
    });
    if (!shouldDelete) return;
    try {
      await tutorApi.deleteQualification(id);
      toast('success', 'Đã xóa chứng chỉ');
      load();
    } catch {
      toast('error', 'Xóa thất bại');
    }
  };

  if (loading) return <FormSkeleton />;
  if (!profile) return <PortalPage title="Hồ sơ gia sư"><EmptyPanel title="Không tải được hồ sơ" /></PortalPage>;

  const score = completionScore(profile, qualifications, availabilities);
  const approvedQualifications = qualifications.filter((qualification) => qualification.status === 'APPROVED').length;
  const pendingQualifications = qualifications.filter((qualification) => qualification.status === 'PENDING').length;
  const canSubmit = profile.verification_status === 'DRAFT' || profile.verification_status === 'REJECTED';

  return (
    <PortalPage
      title="Hồ sơ gia sư"
      description="Gộp hồ sơ và chứng chỉ vào một trung tâm xác minh, đúng với cách gia sư hiểu về uy tín cá nhân."
      actions={(
        <>
          {activeTab === 'certificates' && <Button onClick={() => setShowAddQual(true)}>Thêm chứng chỉ</Button>}
          {canSubmit && <Button variant="secondary" loading={submitting} onClick={handleSubmitReview}>Gửi duyệt hồ sơ</Button>}
        </>
      )}
    >
      <div className="rounded-lg border border-border-light bg-white p-3 shadow-xs">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile compact icon={UserCheckIcon} label="Hoàn thiện hồ sơ" value={`${score}%`} tone={score >= 80 ? 'success' : 'warning'} />
          <MetricTile
            compact
            icon={ShieldCheckIcon}
            label="Trạng thái xác minh"
            value={verificationStatusLabel(profile.verification_status)}
            tone={profile.verification_status === 'VERIFIED' ? 'success' : 'warning'}
          />
          <MetricTile
            compact
            icon={WalletIcon}
            label="Chứng chỉ"
            value={`${qualifications.length} chứng chỉ`}
            hint={`${approvedQualifications} đã duyệt · ${pendingQualifications} chờ duyệt`}
            tone={pendingQualifications > 0 ? 'warning' : 'success'}
          />
          <MetricTile
            compact
            icon={ClockIcon}
            label="Lịch rảnh"
            value={`${availabilities.length} khung giờ`}
            hint="Dữ liệu ghép lịch và gợi ý học viên."
            tone={availabilities.length > 0 ? 'success' : 'warning'}
          />
        </div>
      </div>

      <SegmentedTabs
        value={activeTab}
        onChange={setActiveTab}
        tabs={[
          { value: 'profile', label: 'Thông tin hồ sơ' },
          { value: 'certificates', label: 'Chứng chỉ', count: qualifications.length },
          { value: 'availability', label: 'Lịch rảnh', count: availabilities.length },
        ]}
      />

      {activeTab === 'profile' ? (
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <SectionPanel title="Thông tin nghề nghiệp" description="Nội dung này là phần học viên và nhân viên dùng để đánh giá mức phù hợp.">
            <form onSubmit={handleSave} className="space-y-5">
              <Textarea
                label="Giới thiệu bản thân"
                placeholder="Mô tả kinh nghiệm, phong cách dạy và nhóm học viên phù hợp..."
                value={form.bio || ''}
                onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))}
                className="min-h-[150px]"
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Trình độ"
                  placeholder="VD: Cử nhân Sư phạm Toán"
                  value={form.qualification_level || ''}
                  onChange={(event) => setForm((current) => ({ ...current, qualification_level: event.target.value }))}
                />
                <Input
                  label="Số năm kinh nghiệm"
                  type="number"
                  min={0}
                  value={form.years_experience ?? 0}
                  onChange={(event) => setForm((current) => ({ ...current, years_experience: Number(event.target.value) }))}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Hình thức dạy"
                  options={[
                    { value: 'BOTH', label: 'Trực tuyến và trực tiếp' },
                    { value: 'ONLINE', label: 'Trực tuyến' },
                    { value: 'OFFLINE', label: 'Trực tiếp' },
                  ]}
                  value={form.teaching_mode || 'BOTH'}
                  onChange={(event) => setForm((current) => ({ ...current, teaching_mode: event.target.value as 'ONLINE' | 'OFFLINE' | 'BOTH' }))}
                />
                <Input
                  label="Khu vực dạy"
                  placeholder="VD: Phường Ninh Kiều, Thành phố Cần Thơ"
                  value={form.teaching_area || ''}
                  onChange={(event) => setForm((current) => ({ ...current, teaching_area: event.target.value }))}
                />
              </div>
              <AreaSuggestionChips
                value={form.teaching_area || ''}
                onChange={(value) => setForm((current) => ({ ...current, teaching_area: value }))}
                label="Khu vực thường nhận"
                disabled={form.teaching_mode === 'ONLINE'}
                referenceAddress={form.teaching_area || user?.address || ''}
              />

              <Button type="submit" loading={saving}>Lưu hồ sơ</Button>
            </form>
          </SectionPanel>

          <SectionPanel title="Xem trước hồ sơ" description="Card rút gọn giúp kiểm tra nhanh thông điệp hồ sơ." className="xl:sticky xl:top-6 xl:self-start">
            <div className="rounded-xl border-2 border-primary-200 bg-gradient-to-br from-white to-primary-50/30 p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg bg-primary-100 text-lg font-semibold text-primary-800 shadow-xs">
                  {user?.avatar_url ? <img src={user.avatar_url} alt="Avatar" className="h-full w-full object-cover" /> : user?.full_name.charAt(0) || 'L'}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-xl font-semibold text-text-primary">{form.qualification_level || 'Gia sư Lumin'}</h3>
                  <p className="text-sm text-text-secondary">{form.years_experience ?? 0} năm kinh nghiệm · {teachingModeLabel(form.teaching_mode)}</p>
                  <label className="mt-2 inline-block cursor-pointer text-xs font-semibold text-primary-600 hover:text-primary-800">
                    Đổi ảnh đại diện
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={async (event) => {
                        if (event.target.files?.[0]) {
                          try {
                            await import('../../services/api').then((module) => module.storageApi.upload(event.target.files![0], 'avatars'));
                            toast('success', 'Đã tải ảnh đại diện');
                            refresh();
                          } catch {
                            toast('error', 'Lỗi tải ảnh lên');
                          }
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
              <p className="mt-5 text-sm leading-7 text-text-secondary">
                {form.bio || 'Viết ngắn gọn về môn mạnh, nhóm học viên phù hợp, cách theo sát tiến độ và kết quả từng hỗ trợ.'}
              </p>
              <div className="mt-5">{getStatusBadge(profile.verification_status)}</div>
            </div>
          </SectionPanel>
        </div>
      ) : activeTab === 'certificates' ? (
        <SectionPanel title="Chứng chỉ và bằng cấp" description="Mỗi chứng chỉ là một bằng chứng xác minh, nên hiển thị gọn theo trạng thái xử lý.">
          {qualifications.length === 0 ? (
            <EmptyPanel title="Chưa có chứng chỉ" description="Thêm chứng chỉ hoặc bằng cấp để gửi hồ sơ chờ duyệt." action={<Button onClick={() => setShowAddQual(true)}>Thêm chứng chỉ</Button>} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {qualifications.map((qualification) => (
                <article key={qualification.id} className="rounded-lg border border-border-light bg-surface-secondary p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold text-text-primary">{qualification.title}</h3>
                        {getStatusBadge(qualification.status)}
                      </div>
                      <p className="mt-1 text-sm text-text-secondary">
                        {certificateLabel(qualification.type)}{qualification.issuer ? ` · ${qualification.issuer}` : ''}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" className="text-danger-600 hover:bg-danger-50" onClick={() => handleDeleteQualification(qualification.id)}>
                      Xóa
                    </Button>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-md bg-white px-2 py-2 font-semibold text-success-700">Đã tải lên</div>
                    <div className={`rounded-md px-2 py-2 font-semibold ${qualification.status === 'PENDING' ? 'bg-warning-50 text-warning-700' : 'bg-white text-success-700'}`}>
                      Đang duyệt
                    </div>
                    <div className={`rounded-md px-2 py-2 font-semibold ${
                      qualification.status === 'APPROVED'
                        ? 'bg-success-50 text-success-700'
                        : qualification.status === 'REJECTED'
                          ? 'bg-danger-50 text-danger-600'
                          : 'bg-white text-text-tertiary'
                    }`}>
                      {qualification.status === 'APPROVED' ? 'Đã duyệt' : qualification.status === 'REJECTED' ? 'Từ chối' : 'Kết quả'}
                    </div>
                  </div>

                  {qualification.review_note && <p className="mt-4 rounded-md border border-warning-100 bg-warning-50 p-3 text-sm text-warning-700">{qualification.review_note}</p>}
                  <DocumentLink
                    fileUrl={qualification.file_url}
                    className="mt-4 inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-primary-800 hover:bg-primary-50"
                    unavailableClassName="mt-4 inline-flex rounded-full bg-warning-50 px-3 py-1.5 text-xs font-semibold text-warning-700"
                  >
                    Xem tài liệu
                  </DocumentLink>
                </article>
              ))}
            </div>
          )}
        </SectionPanel>
      ) : (
        <AvailabilityManager availabilities={availabilities} onChanged={load} />
      )}

      <AddQualificationModal open={showAddQual} onClose={() => setShowAddQual(false)} onAdded={() => { setShowAddQual(false); load(); }} toast={toast} />
      {ConfirmDialogElement}
    </PortalPage>
  );
}

function AddQualificationModal({ open, onClose, onAdded, toast }: { open: boolean; onClose: () => void; onAdded: () => void; toast: (t: 'success' | 'error' | 'info', m: string) => void }) {
  const [form, setForm] = useState<QualificationCreate>({ type: 'DEGREE', title: '', file_url: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.file_url.trim()) {
      toast('error', 'Vui lòng tải minh chứng trước khi thêm chứng chỉ.');
      return;
    }
    setSaving(true);
    try {
      await tutorApi.addQualification(form);
      toast('success', 'Đã thêm chứng chỉ');
      onAdded();
    } catch {
      toast('error', 'Thêm chứng chỉ thất bại');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Thêm chứng chỉ"
      footer={(
        <>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button loading={saving} onClick={(event) => handleSubmit(event as unknown as FormEvent)}>Thêm chứng chỉ</Button>
        </>
      )}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select
          label="Loại"
          options={[
            { value: 'DEGREE', label: 'Bằng cấp' },
            { value: 'CERTIFICATE', label: 'Chứng chỉ' },
            { value: 'OTHER', label: 'Khác' },
          ]}
          value={form.type}
          onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
        />
        <Input label="Tên chứng chỉ" placeholder="VD: Bằng Cử nhân Toán" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required />
        <Input label="Nơi cấp" placeholder="VD: Đại học Sư phạm TP.HCM" value={form.issuer || ''} onChange={(event) => setForm((current) => ({ ...current, issuer: event.target.value }))} />
        <div>
          <label className="mb-2 block text-sm font-medium text-text-secondary">Tài liệu đính kèm</label>
          {form.file_url ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border-light bg-surface-secondary px-3 py-2">
              <span className="truncate text-sm text-primary-800">{form.file_url.split('/').pop()}</span>
              <button type="button" onClick={() => setForm((current) => ({ ...current, file_url: '' }))} className="text-xs font-semibold text-danger-600">Xóa</button>
            </div>
          ) : (
            <input
              type="file"
              className="block w-full text-sm text-text-secondary file:mr-4 file:rounded-full file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-700 hover:file:bg-primary-100"
              onChange={async (event) => {
                if (event.target.files?.[0]) {
                  try {
                    toast('info', 'Đang tải file lên...');
                    const res = await import('../../services/api').then((module) => module.storageApi.upload(event.target.files![0], 'certificates'));
                    setForm((current) => ({ ...current, file_url: res.file_url }));
                  } catch {
                    toast('error', 'Lỗi tải file');
                  }
                }
              }}
            />
          )}
        </div>
      </form>
    </Modal>
  );
}
