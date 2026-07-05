import { useEffect, useState } from 'react';
import { classApi, privateRequestApi, tutorApi } from '../../services/api';
import type { CourseClassResponse, PrivateRequestResponse, TutorPublicResponse } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Avatar from '../ui/Avatar';
import { PageLoading } from '../ui/Spinner';
import { BookOpenIcon, UsersIcon, SearchIcon } from '../ui/Icons';

export function LearningDetailModal({ target, onClose }: { target: { type: 'CLASS' | 'PRIVATE', id: number } | null, onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ course?: CourseClassResponse, request?: PrivateRequestResponse, tutor?: TutorPublicResponse } | null>(null);

  useEffect(() => {
    if (!target) return;
    let isMounted = true;
    setLoading(true);

    const load = async () => {
      try {
        let course, req, tutorId;
        if (target.type === 'CLASS') {
          course = await classApi.get(target.id);
          tutorId = course.primary_tutor_id;
        } else {
          req = await privateRequestApi.get(target.id);
          tutorId = req.tutor_id;
        }

        let tutor;
        if (tutorId) {
          const tutors = await tutorApi.browse();
          tutor = tutors.find((t) => t.id === tutorId);
        }

        if (isMounted) setData({ course, request: req, tutor });
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => { isMounted = false; };
  }, [target]);

  if (!target) return null;

  return (
    <Modal open onClose={onClose} title="Chi tiết Lớp học & Gia sư" size="lg" footer={<Button onClick={onClose}>Đóng</Button>}>
      {loading ? (
        <div className="py-10"><PageLoading /></div>
      ) : data ? (
        <div className="space-y-6">
          {data.tutor && (
            <div className="flex items-center gap-4 border-b border-border-light pb-6">
              <Avatar id={data.tutor.id} name={data.tutor.full_name} src={data.tutor.avatar_url || undefined} size="xl" shape="square" className="rounded-2xl" />
              <div>
                <h2 className="text-2xl font-bold text-text-primary">{data.tutor.full_name}</h2>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-bold text-amber-700">
                    {Number(data.tutor.average_rating || 0).toFixed(1)} ⭐
                  </span>
                  <span className="rounded-full bg-surface-secondary px-3 py-1 text-xs font-bold text-text-secondary">
                    {data.tutor.years_experience} năm kinh nghiệm
                  </span>
                </div>
              </div>
            </div>
          )}

          {data.tutor && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border-light bg-surface-secondary p-4 flex flex-col items-center text-center">
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm mb-2"><BookOpenIcon className="h-4 w-4 text-primary-600" /></div>
                <p className="text-xs font-bold text-text-tertiary uppercase mb-1">Hình thức</p>
                <p className="font-bold text-text-primary">{data.tutor.teaching_mode === 'ONLINE' ? 'Trực tuyến' : data.tutor.teaching_mode === 'OFFLINE' ? 'Trực tiếp' : 'Linh hoạt'}</p>
              </div>
              <div className="rounded-xl border border-border-light bg-surface-secondary p-4 flex flex-col items-center text-center">
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm mb-2"><UsersIcon className="h-4 w-4 text-primary-600" /></div>
                <p className="text-xs font-bold text-text-tertiary uppercase mb-1">Trình độ</p>
                <p className="font-bold text-text-primary line-clamp-1">{data.tutor.qualification_level || 'Chưa cập nhật'}</p>
              </div>
              <div className="rounded-xl border border-border-light bg-surface-secondary p-4 flex flex-col items-center text-center">
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm mb-2"><SearchIcon className="h-4 w-4 text-primary-600" /></div>
                <p className="text-xs font-bold text-text-tertiary uppercase mb-1">Khu vực</p>
                <p className="font-bold text-text-primary line-clamp-1">{data.tutor.teaching_area || 'Chưa rõ'}</p>
              </div>
            </div>
          )}

          {data.tutor?.bio && (
            <div>
              <h4 className="text-sm font-bold text-text-primary mb-2">Giới thiệu gia sư</h4>
              <p className="text-sm leading-relaxed text-text-secondary bg-surface-secondary p-4 rounded-xl">
                {data.tutor.bio}
              </p>
            </div>
          )}

          <div>
            <h4 className="text-sm font-bold text-text-primary mb-2">Thông tin khóa học</h4>
            <div className="bg-primary-50 border border-primary-100 p-4 rounded-xl">
              {data.course ? (
                <>
                  <p className="font-bold text-primary-900 text-lg mb-2">{data.course.title}</p>
                  <p className="text-sm text-primary-800 mb-1"><strong>Mục tiêu:</strong> {data.course.goal || 'Đang cập nhật'}</p>
                  <p className="text-sm text-primary-800 mb-1"><strong>Thời lượng:</strong> {data.course.total_sessions} buổi</p>
                  <p className="text-sm text-primary-800"><strong>Sĩ số:</strong> {data.course.min_students}-{data.course.max_students} học viên</p>
                </>
              ) : data.request ? (
                <>
                  <p className="font-bold text-primary-900 text-lg mb-2">{data.request.subject_name} - {data.request.grade_level}</p>
                  <p className="text-sm text-primary-800 mb-1"><strong>Mục tiêu:</strong> {data.request.goal || 'Đang cập nhật'}</p>
                  <p className="text-sm text-primary-800 mb-1"><strong>Thời lượng yêu cầu:</strong> {data.request.requested_sessions} buổi</p>
                  <p className="text-sm text-primary-800 mb-1"><strong>Hình thức:</strong> {data.request.mode === 'ONLINE' ? 'Trực tuyến' : data.request.mode === 'OFFLINE' ? 'Trực tiếp' : 'Cả hai'}</p>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="py-10 text-center text-text-tertiary">Không tải được dữ liệu.</div>
      )}
    </Modal>
  );
}
