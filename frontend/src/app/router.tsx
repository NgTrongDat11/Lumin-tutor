import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { UserRole } from '../types';
import { PageLoading } from '../components/ui/Spinner';

// Layouts
import PublicLayout from '../components/layout/PublicLayout';
import DashboardLayout from '../components/layout/DashboardLayout';

// Auth pages
import LandingPage from '../pages/marketing/LandingPage';
import LoginPage from '../pages/auth/LoginPage';
import RegisterPage from '../pages/auth/RegisterPage';

// Student pages
import StudentDashboard from '../pages/student/Dashboard';
import StudentMyLearning from '../pages/student/MyLearning';
import StudentSchedule from '../pages/student/Schedule';
import StudentPayments from '../pages/student/Payments';
import StudentReviews from '../pages/student/Reviews';
import MessagesPage from '../pages/messages/MessagesPage';

// Tutor pages
import TutorDashboard from '../pages/tutor/Dashboard';
import TutorProfile from '../pages/tutor/Profile';
import TutorSchedule from '../pages/tutor/Schedule';
import TutorTeaching from '../pages/tutor/Teaching';
import TutorOpportunities from '../pages/tutor/Opportunities';
import TutorIncome from '../pages/tutor/Income';

// Staff pages
import StaffDashboard from '../pages/staff/Dashboard';
import StaffTutorVerification from '../pages/staff/TutorVerification';
import StaffStudentManagement from '../pages/staff/StudentManagement';
import StaffAcademic from '../pages/staff/Academic';
import StaffPayments from '../pages/staff/PaymentManagement';
import StaffOperations from '../pages/staff/Operations';

// Admin pages
import AdminSystem from '../pages/admin/System';
import AdminStaffManagement from '../pages/admin/StaffManagement';
import AdminAuditLog from '../pages/admin/AuditLog';

/* ── Route Guard ─────────────────────────────────── */
const roleDashboard: Record<UserRole, string> = {
  STUDENT: '/student',
  TUTOR: '/tutor',
  STAFF: '/staff',
  SUPER_ADMIN: '/admin',
};

function ProtectedRoute({ allowedRoles, children }: { allowedRoles: UserRole[]; children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <PageLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={roleDashboard[user.role]} replace />;
  }
  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <PageLoading />;
  if (user) return <Navigate to={roleDashboard[user.role]} replace />;
  return <>{children}</>;
}

/* ── Router ──────────────────────────────────────── */
export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route element={<PublicOnlyRoute><PublicLayout /></PublicOnlyRoute>}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        {/* Student routes */}
        <Route element={<ProtectedRoute allowedRoles={['STUDENT']}><DashboardLayout /></ProtectedRoute>}>
          <Route path="/student" element={<StudentDashboard />} />
          <Route path="/student/schedule" element={<StudentSchedule />} />
          <Route path="/student/my-learning" element={<StudentMyLearning />} />
          <Route path="/student/payments" element={<StudentPayments />} />
          <Route path="/student/reviews" element={<StudentReviews />} />
          <Route path="/student/messages" element={<MessagesPage />} />
        </Route>

        {/* Tutor routes */}
        <Route element={<ProtectedRoute allowedRoles={['TUTOR']}><DashboardLayout /></ProtectedRoute>}>
          <Route path="/tutor" element={<TutorDashboard />} />
          <Route path="/tutor/profile" element={<TutorProfile />} />
          <Route path="/tutor/qualifications" element={<TutorProfile initialTab="certificates" />} />
          <Route path="/tutor/schedule" element={<TutorSchedule />} />
          <Route path="/tutor/sessions" element={<TutorSchedule initialTab="teaching" />} />
          <Route path="/tutor/availability" element={<TutorProfile initialTab="availability" />} />
          <Route path="/tutor/teaching" element={<TutorTeaching />} />
          <Route path="/tutor/subjects" element={<TutorTeaching />} />
          <Route path="/tutor/opportunities" element={<TutorOpportunities />} />
          <Route path="/tutor/private-requests" element={<Navigate to="/tutor/opportunities" replace />} />
          <Route path="/tutor/applications" element={<Navigate to="/tutor/opportunities" replace />} />
          <Route path="/tutor/messages" element={<MessagesPage />} />
          <Route path="/tutor/income" element={<TutorIncome />} />
        </Route>

        {/* Staff routes */}
        <Route element={<ProtectedRoute allowedRoles={['STAFF', 'SUPER_ADMIN']}><DashboardLayout /></ProtectedRoute>}>
          <Route path="/staff" element={<StaffDashboard />} />
          <Route path="/staff/tutors" element={<StaffTutorVerification mode="list" />} />
          <Route path="/staff/tutors/verify" element={<StaffTutorVerification mode="verify" />} />
          <Route path="/staff/students" element={<StaffStudentManagement />} />
          <Route path="/staff/classes" element={<StaffAcademic mode="classes" />} />
          <Route path="/staff/requests" element={<StaffAcademic mode="requests" />} />
          <Route path="/staff/subjects" element={<StaffAcademic mode="subjects" />} />
          <Route path="/staff/schedules" element={<StaffOperations initialTab="schedules" />} />
          <Route path="/staff/contracts" element={<StaffOperations initialTab="contracts" />} />
          <Route path="/staff/operations" element={<Navigate to="/staff/schedules" replace />} />
          <Route path="/staff/payments" element={<StaffPayments />} />
          <Route path="/staff/messages" element={<MessagesPage />} />
        </Route>

        {/* Admin routes */}
        <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN']}><DashboardLayout /></ProtectedRoute>}>
          <Route path="/admin" element={<Navigate to="/staff" replace />} />
          <Route path="/admin/staff" element={<AdminStaffManagement />} />
          <Route path="/admin/audit" element={<AdminAuditLog />} />
          <Route path="/admin/system" element={<AdminSystem />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
