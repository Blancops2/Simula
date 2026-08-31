import { AuthProvider } from './auth/AuthContext';
import { AppRouter } from './routing/AppRouter';

export function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
