import { Outlet, Link, useNavigate } from 'react-router-dom';
import authHero from '../../assets/auth-hero.png';

export default function PublicLayout() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-white">
      {/* Left — hero image, clean overlay */}
      <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden">
        <img
          src={authHero}
          alt="Học viên đang học tập"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-primary-950/50" />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div className="w-9 h-9 bg-white/15 rounded-lg flex items-center justify-center border border-white/10">
              <span className="text-sm font-bold">L</span>
            </div>
            <span className="text-xl font-bold tracking-tight">Lumin</span>
          </Link>

          <div>
            <h1 className="text-4xl font-bold leading-[1.15] tracking-tight max-w-lg">
              Nền tảng kết nối
              <br />
              học viên — gia sư.
            </h1>
            <p className="mt-4 text-sm text-white/60 max-w-sm leading-6">
              Gợi ý gia sư và lớp học phù hợp dựa trên mục tiêu, lịch rảnh và khu vực của từng học viên.
            </p>
          </div>

          <div className="flex gap-10 border-t border-white/12 pt-6">
            <div>
              <p className="text-2xl font-bold">500+</p>
              <p className="text-white/50 text-xs mt-0.5">Gia sư xác minh</p>
            </div>
            <div>
              <p className="text-2xl font-bold">2K+</p>
              <p className="text-white/50 text-xs mt-0.5">Học viên</p>
            </div>
            <div>
              <p className="text-2xl font-bold">98%</p>
              <p className="text-white/50 text-xs mt-0.5">Hài lòng</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right — form */}
      <div className="flex min-h-screen flex-1 flex-col bg-surface-secondary">
        <header className="sticky top-0 z-20 border-b border-border-light bg-surface-secondary/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-md items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => (window.history.state && window.history.state.idx > 0 ? navigate(-1) : navigate('/'))}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-light bg-white px-3 text-sm font-semibold text-text-secondary shadow-xs transition-colors hover:text-text-primary"
              aria-label="Quay lại trang trước"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5" />
                <path d="m11 6-6 6 6 6" />
              </svg>
              Quay lại
            </button>
            <Link to="/" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-light bg-white px-3 text-sm font-semibold text-text-primary shadow-xs">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-950 text-xs font-bold text-white">L</span>
              Trang chủ
            </Link>
          </div>
        </header>

        <div className="flex flex-1 items-start justify-center px-4 pb-8 pt-5 sm:px-6 sm:pt-8 lg:items-center lg:p-12">
          <div className="w-full max-w-md animate-fade-in">
            <div className="mb-5 hidden items-center justify-between lg:flex">
              <button
                type="button"
                onClick={() => (window.history.state && window.history.state.idx > 0 ? navigate(-1) : navigate('/'))}
                className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-white hover:text-text-primary"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 12H5" />
                  <path d="m11 6-6 6 6 6" />
                </svg>
                Quay lại
              </button>
              <Link to="/" className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-text-primary transition-colors hover:bg-white">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-950 text-xs font-bold text-white">L</span>
                Trang chủ
              </Link>
            </div>
            <Outlet />

            <footer className="mt-8 border-t border-border-light pt-6 text-center">
              <div className="mb-2 flex items-center justify-center gap-1.5 text-sm font-medium text-text-secondary">
                <span className="font-bold text-primary-700">Lumin</span>
                <span className="text-text-tertiary">·</span>
                <span>Hệ thống Đề xuất Gia sư</span>
              </div>
              <p className="text-xs text-text-tertiary">
                &copy; {new Date().getFullYear()} Lumin Education. Đã đăng ký bản quyền.
              </p>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
