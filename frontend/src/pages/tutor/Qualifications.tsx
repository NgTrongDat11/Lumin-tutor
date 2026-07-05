import { useEffect, useState, type FormEvent } from 'react';
import { tutorApi } from '../../services/api';
import type { QualificationResponse, QualificationCreate } from '../../types';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import { useConfirmDialog } from '../../components/ui/ConfirmDialog';
import DocumentLink from '../../components/ui/DocumentLink';
import EmptyState from '../../components/ui/EmptyState';
import { FormSkeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';

export default function TutorQualifications() {
  const [quals, setQuals] = useState<QualificationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const { toast } = useToast();
  const { confirm: confirmAction, ConfirmDialogElement } = useConfirmDialog();

  const load = () => {
    tutorApi.getQualifications().then(setQuals).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleDelete = async (id: number) => {
    const shouldDelete = await confirmAction({
      title: 'Xoá chứng chỉ này?',
      description: 'Chứng chỉ đã xoá sẽ không còn hiển thị trong hồ sơ xác minh của bạn.',
      confirmLabel: 'Xoá',
      variant: 'danger',
    });
    if (!shouldDelete) return;
    try {
      await tutorApi.deleteQualification(id);
      toast('success', 'Đã xoá chứng chỉ');
      load();
    } catch { toast('error', 'Xoá thất bại'); }
  };

  if (loading) return <FormSkeleton />;

  return (
    <div className="animate-slide-up">
      <PageHeader
        title="Chứng chỉ"
        description="Quản lý chứng chỉ, bằng cấp để xác minh năng lực."
        action={<Button onClick={() => setShowAdd(true)}>+ Thêm chứng chỉ</Button>}
      />

      {quals.length === 0 ? (
        <EmptyState title="Chưa có chứng chỉ" description="Thêm chứng chỉ để tăng uy tín hồ sơ." action={<Button onClick={() => setShowAdd(true)}>+ Thêm</Button>} />
      ) : (
        <div className="space-y-3">
          {quals.map((q) => (
            <Card key={q.id}>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-lg text-text-primary">{q.title}</h3>
                  </div>
                  <p className="text-sm text-text-secondary mb-4">{q.type}{q.issuer && ` — ${q.issuer}`}</p>
                  
                  {/* Status Bar */}
                  <div className="mt-6 mb-8 relative max-w-sm w-full">
                    {/* Background Line */}
                    <div className="absolute top-3 left-3 right-3 h-0.5 bg-border-light -z-10"></div>
                    
                    <div className="flex justify-between items-center relative z-10">
                      {/* Step 1 */}
                      <div className="flex flex-col items-center relative">
                        <div className="w-6 h-6 rounded-full bg-success-500 text-white flex items-center justify-center text-xs font-bold shadow-sm">✓</div>
                        <span className="text-[10px] font-medium text-success-700 absolute top-8 w-max">Đã tải lên</span>
                      </div>
                      
                      {/* Active Line 1-2 */}
                      <div className={`absolute top-3 left-3 h-0.5 -z-10 transition-all duration-500
                        ${q.status === 'PENDING' ? 'w-1/2 bg-gradient-to-r from-success-500 to-warning-500' : 'w-full bg-success-500'}`}></div>

                      {/* Step 2 */}
                      <div className="flex flex-col items-center relative">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-sm
                          ${q.status === 'PENDING' ? 'bg-warning-500 text-white' : 'bg-success-500 text-white'}`}>
                          {q.status === 'PENDING' ? (
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : '✓'}
                        </div>
                        <span className={`text-[10px] font-medium absolute top-8 w-max ${q.status === 'PENDING' ? 'text-warning-600' : 'text-success-700'}`}>Đang duyệt</span>
                      </div>

                      {/* Step 3 */}
                      <div className="flex flex-col items-center relative">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-sm
                          ${q.status === 'APPROVED' ? 'bg-success-500 text-white' : 
                            q.status === 'REJECTED' ? 'bg-danger-500 text-white' : 'bg-surface-tertiary text-text-tertiary border border-border'}`}>
                          {q.status === 'APPROVED' ? '✓' : q.status === 'REJECTED' ? '✕' : '3'}
                        </div>
                        <span className={`text-[10px] font-medium absolute top-8 w-max
                          ${q.status === 'APPROVED' ? 'text-success-700' : 
                            q.status === 'REJECTED' ? 'text-danger-600' : 'text-text-tertiary'}`}>
                          {q.status === 'REJECTED' ? 'Từ chối' : q.status === 'APPROVED' ? 'Đã duyệt' : 'Kết quả'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {q.review_note && <p className="text-xs bg-warning-50 p-2 rounded text-warning-700 mt-4 border border-warning-100">📝 Lời nhắn từ hệ thống: {q.review_note}</p>}
                  <DocumentLink
                    fileUrl={q.file_url}
                    className="text-xs text-primary-600 bg-primary-50 px-3 py-1.5 rounded-full hover:bg-primary-100 transition-colors mt-4 inline-block"
                    unavailableClassName="text-xs text-warning-600 bg-warning-50 px-3 py-1.5 rounded-full mt-4 inline-block"
                  >
                    Xem tài liệu đính kèm
                  </DocumentLink>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(q.id)} className="text-danger-600 hover:bg-danger-50 self-start">Xoá</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AddQualModal open={showAdd} onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); load(); }} toast={toast} />
      {ConfirmDialogElement}
    </div>
  );
}

function AddQualModal({ open, onClose, onAdded, toast }: { open: boolean; onClose: () => void; onAdded: () => void; toast: (t: 'success' | 'error', m: string) => void }) {
  const [form, setForm] = useState<QualificationCreate>({ type: 'DEGREE', title: '', file_url: '' });
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.file_url) {
      toast('error', 'Vui lòng tải lên tài liệu đính kèm trước khi thêm!');
      return;
    }
    setLoading(true);
    try {
      await tutorApi.addQualification(form);
      toast('success', 'Thêm chứng chỉ thành công!');
      onAdded();
    } catch { toast('error', 'Thêm thất bại'); }
    finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Thêm chứng chỉ" footer={<><Button variant="outline" onClick={onClose}>Huỷ</Button><Button loading={loading || isUploading} onClick={(e) => handleSubmit(e as unknown as FormEvent)}>Thêm chứng chỉ</Button></>}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select label="Loại" options={[{ value: 'DEGREE', label: 'Bằng cấp' }, { value: 'CERTIFICATE', label: 'Chứng chỉ' }, { value: 'OTHER', label: 'Khác' }]} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} />
        <Input label="Tên chứng chỉ" placeholder="VD: Bằng Cử nhân Toán" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
        <Input label="Nơi cấp" placeholder="VD: Đại học Sư phạm TP.HCM" value={form.issuer || ''} onChange={(e) => setForm((f) => ({ ...f, issuer: e.target.value }))} />
        <div>
           <label className="mb-2 block text-sm font-medium text-text-secondary">Tài liệu đính kèm (PDF/Ảnh) *</label>
           {form.file_url ? (
             <div className="flex items-center gap-2 p-2 bg-success-50 rounded border border-success-200">
               <span className="text-sm text-success-700 truncate max-w-[200px] flex-1">{form.file_url.split('/').pop()}</span>
               <button type="button" onClick={() => setForm(f => ({ ...f, file_url: '' }))} className="text-xs text-danger-600 hover:underline">Xóa</button>
             </div>
           ) : (
             <input type="file" className="block w-full text-sm text-text-secondary file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 disabled:opacity-50" 
                disabled={isUploading}
                onChange={async (e) => {
                  if (e.target.files && e.target.files[0]) {
                    setIsUploading(true);
                    try {
                       toast('success', 'Đang tải lên tài liệu...');
                       const res = await import('../../services/api').then(m => m.storageApi.upload(e.target.files![0], 'certificates'));
                       setForm(f => ({ ...f, file_url: res.file_url }));
                    } catch { toast('error', 'Lỗi tải file'); }
                    finally { setIsUploading(false); }
                  }
                }} 
             />
           )}
           {isUploading && <p className="text-xs text-primary-600 mt-2 flex items-center gap-2">
             <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
             Đang xử lý tải lên...
           </p>}
        </div>
      </form>
    </Modal>
  );
}
