import { useState, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { authApi, storageApi } from '../../services/api';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Avatar from '../ui/Avatar';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import { useToast } from '../ui/Toast';
import VietnamAddressFields from './VietnamAddressFields';
import { EDUCATION_STAGES, inferStageAndGrade } from '../../constants/gradeLevels';



export default function AccountSettingsModal({ onClose }: { onClose: () => void }) {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  
  const [tab, setTab] = useState<'profile' | 'password'>('profile');
  
  // Profile state
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState(user?.address || '');
  const [birthYear, setBirthYear] = useState(user?.birth_year ? String(user.birth_year) : '');
  const [school, setSchool] = useState(user?.school || '');

  // Grade stage/grade/custom level
  const [stage, setStage] = useState(() => {
    const { stage: initialStage } = inferStageAndGrade(user?.academic_level);
    return initialStage;
  });
  const [grade, setGrade] = useState(() => {
    const { grade: initialGrade } = inferStageAndGrade(user?.academic_level);
    return initialGrade;
  });
  const [customGrade, setCustomGrade] = useState(() => {
    const { custom: initialCustom } = inferStageAndGrade(user?.academic_level);
    return initialCustom;
  });

  const [learningStyle, setLearningStyle] = useState(user?.learning_style || '');
  const [parentNotes, setParentNotes] = useState(user?.parent_notes || '');
  const [profileLoading, setProfileLoading] = useState(false);

  // Password state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passLoading, setPassLoading] = useState(false);
  
  // Avatar state
  const [avatarLoading, setAvatarLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast('error', 'Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    setPassLoading(true);
    try {
      await authApi.updatePassword({ old_password: oldPassword, new_password: newPassword });
      toast('success', 'Đổi mật khẩu thành công.');
      setOldPassword('');
      setNewPassword('');
    } catch (err: unknown) {
      let msg = 'Đổi mật khẩu thất bại.';
      if (err && typeof err === 'object' && 'response' in err) {
        const errorData = (err as { response?: { data?: { detail?: string } } }).response?.data;
        if (errorData?.detail) msg = errorData.detail;
      }
      toast('error', msg);
    } finally {
      setPassLoading(false);
    }
  };

  const handleProfileChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast('error', 'Họ và tên không được để trống.');
      return;
    }

    let finalAcademicLevel = '';
    if (user?.role === 'STUDENT') {
      if (!address || !address.trim()) {
        toast('error', 'Địa chỉ không được để trống.');
        return;
      }
      if (!stage) {
        toast('error', 'Cấp học không được để trống.');
        return;
      }
      if (stage === 'OTHER') {
        finalAcademicLevel = customGrade.trim();
        if (!finalAcademicLevel) {
          toast('error', 'Trình độ/Lớp khác không được để trống.');
          return;
        }
      } else {
        finalAcademicLevel = grade;
        if (!finalAcademicLevel) {
          toast('error', 'Lớp không được để trống.');
          return;
        }
      }
    }

    setProfileLoading(true);
    try {
      await authApi.updateProfile({
        full_name: fullName,
        phone: phone || undefined,
        address: address || undefined,
        birth_year: birthYear ? parseInt(birthYear) : undefined,
        school: school || undefined,
        academic_level: user?.role === 'STUDENT' ? finalAcademicLevel : undefined,
        learning_style: learningStyle || undefined,
        parent_notes: parentNotes || undefined,
      });
      toast('success', 'Cập nhật hồ sơ thành công.');
      await refresh();
    } catch (err: unknown) {
      let msg = 'Cập nhật hồ sơ thất bại.';
      if (err && typeof err === 'object' && 'response' in err) {
        const errorData = (err as { response?: { data?: { detail?: string } } }).response?.data;
        if (errorData?.detail) msg = errorData.detail;
      }
      toast('error', msg);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast('error', 'Chỉ chấp nhận file hình ảnh.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast('error', 'Kích thước file không được vượt quá 2MB.');
      return;
    }

    setAvatarLoading(true);
    try {
      const res = await storageApi.upload(file, 'avatars');
      if (res.file_url) {
        toast('success', 'Cập nhật ảnh đại diện thành công.');
        await refresh();
      }
    } catch {
      toast('error', 'Lỗi tải ảnh lên.');
    } finally {
      setAvatarLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Modal open={true} onClose={onClose} title="Thông tin tài khoản" size="md">
      <div className="flex border-b border-border-light mb-4">
        <button
          className={`flex-1 py-2 text-sm font-semibold transition-colors border-b-2 ${tab === 'profile' ? 'border-primary-600 text-primary-700' : 'border-transparent text-text-tertiary hover:text-text-secondary'}`}
          onClick={() => setTab('profile')}
        >
          Hồ sơ
        </button>
        <button
          className={`flex-1 py-2 text-sm font-semibold transition-colors border-b-2 ${tab === 'password' ? 'border-primary-600 text-primary-700' : 'border-transparent text-text-tertiary hover:text-text-secondary'}`}
          onClick={() => setTab('password')}
        >
          Mật khẩu
        </button>
      </div>

      {tab === 'profile' && (
        <div className="space-y-6 py-2">
          <div className="flex flex-col items-center justify-center gap-4">
            <Avatar name={user.full_name} src={user.avatar_url || undefined} size="xl" />
            <div className="flex flex-col items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                loading={avatarLoading}
                onClick={() => fileInputRef.current?.click()}
              >
                Đổi ảnh đại diện
              </Button>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleAvatarChange} 
              />
              <p className="text-[10px] text-text-tertiary text-center">
                JPG, PNG. Tối đa 2MB.
              </p>
            </div>
          </div>

          <form onSubmit={handleProfileChange} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input 
                label="Họ và tên" 
                required 
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
              <Input 
                label="Số điện thoại" 
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <Input 
                label="Năm sinh" 
                type="number" 
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
              />
              <div className="md:col-span-2">
                <VietnamAddressFields
                  value={address}
                  onChange={setAddress}
                  required={user.role === 'STUDENT'}
                />
              </div>
            </div>

            {user.role === 'STUDENT' && (
              <div className="border-t border-border-light pt-4 space-y-4">
                <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider">Thông tin học vấn & Nhu cầu</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input 
                    label="Trường đang theo học"
                    placeholder="VD: THPT Chuyên Lê Hồng Phong"
                    value={school}
                    onChange={(e) => setSchool(e.target.value)}
                  />
                  <Select
                    label="Cấp học *"
                    placeholder="Chọn cấp học..."
                    options={EDUCATION_STAGES.map((s) => ({ value: s.value, label: s.label }))}
                    value={stage}
                    onChange={(e) => {
                      const nextStage = e.target.value;
                      setStage(nextStage);
                      setGrade('');
                      setCustomGrade('');
                    }}
                    required
                  />
                  {stage && stage !== 'OTHER' && (
                    <Select
                      label="Lớp *"
                      placeholder="Chọn lớp..."
                      options={EDUCATION_STAGES.find((s) => s.value === stage)?.grades || []}
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                      required
                    />
                  )}
                  {stage === 'OTHER' && (
                    <Input
                      label="Trình độ/Lớp khác *"
                      placeholder="VD: IELTS 6.5, Đại học,..."
                      value={customGrade}
                      onChange={(e) => setCustomGrade(e.target.value)}
                      required
                    />
                  )}
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <Textarea 
                    label="Phong cách học tập ưa thích" 
                    placeholder="VD: Thích học qua thực hành, Cần gia sư đốc thúc sát sao, Giải nhiều bài tập vận dụng..." 
                    value={learningStyle}
                    onChange={(e) => setLearningStyle(e.target.value)}
                    rows={2}
                  />
                  <Textarea 
                    label="Ghi chú thêm (từ phụ huynh/học viên)" 
                    placeholder="VD: Học sinh rụt rè cần gia sư kiên nhẫn; muốn tập trung cải thiện kỹ năng Viết..." 
                    value={parentNotes}
                    onChange={(e) => setParentNotes(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
            )}

            <div className="pt-2">
              <Button type="submit" className="w-full" loading={profileLoading}>
                Lưu thay đổi hồ sơ
              </Button>
            </div>
          </form>
        </div>
      )}

      {tab === 'password' && (
        <form onSubmit={handlePasswordChange} className="space-y-4 py-2">
          <Input 
            label="Mật khẩu hiện tại" 
            type="password" 
            required 
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
          />
          <Input 
            label="Mật khẩu mới" 
            type="password" 
            required 
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <p className="text-xs text-text-tertiary">Mật khẩu phải có ít nhất 6 ký tự.</p>
          <div className="pt-2">
            <Button type="submit" className="w-full" loading={passLoading}>
              Cập nhật mật khẩu
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
