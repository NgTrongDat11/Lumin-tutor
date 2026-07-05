import Button from '../ui/Button';

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = 'Đã xảy ra lỗi',
  description = 'Không thể tải dữ liệu từ máy chủ. Vui lòng kiểm tra lại kết nối mạng hoặc thử lại.',
  onRetry,
  className = '',
}: ErrorStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-2xl border border-danger-100 bg-danger-50/50 p-8 text-center backdrop-blur-sm ${className}`}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-100 text-danger-600 mb-4 animate-bounce">
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h3 className="text-base font-bold text-danger-900">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-danger-700">{description}</p>
      {onRetry && (
        <div className="mt-6">
          <Button variant="danger" size="sm" onClick={onRetry}>
            Tải lại dữ liệu
          </Button>
        </div>
      )}
    </div>
  );
}

export default ErrorState;
