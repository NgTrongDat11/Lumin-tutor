import { Component, type ErrorInfo, type ReactNode } from 'react';
import Button from '../ui/Button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in ErrorBoundary:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-[400px] w-full flex-col items-center justify-center rounded-2xl border border-danger-100 bg-danger-50/30 p-6 text-center shadow-xs md:p-10">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-danger-100 text-3xl text-danger-700 animate-bounce">
            ⚠️
          </div>
          <h2 className="mt-4 text-xl font-bold text-text-primary md:text-2xl">Đã xảy ra lỗi ngoài ý muốn</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-text-secondary">
            Giao diện phần này gặp sự cố khi xử lý dữ liệu. Vui lòng tải lại trang hoặc nhấn nút khôi phục bên dưới.
          </p>

          {this.state.error && (
            <div className="mt-4 max-w-lg overflow-x-auto rounded-lg bg-white border border-border-light p-3 text-left font-mono text-[11px] text-danger-600 shadow-inner">
              <p className="font-bold">{this.state.error.name}: {this.state.error.message}</p>
              {this.state.error.stack && (
                <pre className="mt-1 max-h-32 overflow-y-auto text-text-tertiary">
                  {this.state.error.stack}
                </pre>
              )}
            </div>
          )}

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button variant="outline" onClick={this.handleReset}>
              Thử khôi phục
            </Button>
            <Button onClick={this.handleReload}>
              Tải lại trang
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
