import { AuthProvider } from './hooks/useAuth';
import { ToastProvider } from './components/ui/Toast';
import AppRouter from './app/router';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppRouter />
      </ToastProvider>
    </AuthProvider>
  );
}
