import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/ui/Toast';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import type { UserRole } from '../../types';
import { extractErrorMessage } from '../../services/api';

const roleDashboard: Record<UserRole, string> = {
  STUDENT: '/student',
  TUTOR: '/tutor',
  STAFF: '/staff',
  SUPER_ADMIN: '/admin',
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const me = await login(email, password);
      toast('success', 'Đăng nhập thành công!');
      navigate(roleDashboard[me.user.role], { replace: true });
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/80 bg-white p-6 shadow-xl">
      <h2 className="text-3xl font-semibold tracking-tight text-text-primary">Đăng nhập</h2>
      <p className="text-sm text-text-secondary mt-2 mb-8 leading-6">
        Tiếp tục với không gian học tập, gia sư hoặc vận hành của bạn.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          label="Mật khẩu"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && (
          <div className="px-4 py-3 rounded-lg bg-danger-50 border border-danger-100 text-sm text-danger-600">
            {error}
          </div>
        )}

        <Button type="submit" loading={loading} className="w-full h-11">
          Đăng nhập
        </Button>
      </form>

      <p className="text-sm text-text-secondary text-center mt-6">
        Chưa có tài khoản?{' '}
        <Link to="/register" className="text-primary-600 font-medium hover:text-primary-700">
          Đăng ký ngay
        </Link>
      </p>
    </div>
  );
}
