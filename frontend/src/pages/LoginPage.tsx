import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ROLE_HOME } from '../auth/types';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: Location } };

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const user = await login(email, password);
      const redirectTo = location.state?.from?.pathname ?? ROLE_HOME[user.role];
      navigate(redirectTo, { replace: true });
    } catch (err: unknown) {
      const axiosError = err as { response?: { status?: number; data?: { message?: string } } };
      const status = axiosError.response?.status;
      const message = axiosError.response?.data?.message;

      if (status === 423) {
        setError(message ?? 'Cuenta bloqueada temporalmente. Intenta más tarde.');
      } else if (status === 403) {
        setError(message ?? 'Tu cuenta no tiene un rol asignado. Contacta al administrador.');
      } else {
        setError('Correo o contraseña incorrectos.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <form onSubmit={handleSubmit} className="login-form">
        <h1>Iniciar sesión — Σimula</h1>

        <label>
          Correo institucional
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </label>

        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>

        {error && (
          <p role="alert" className="login-error">
            {error}
          </p>
        )}

        <button type="submit" className={`btn btn-primary ${submitting ? 'btn-loading' : ''}`} disabled={submitting}>
          {submitting ? 'Ingresando…' : 'Iniciar sesión'}
        </button>
      </form>
    </div>
  );
}
