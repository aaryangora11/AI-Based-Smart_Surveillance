import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { getErrorMessage, login } from '../api';

type LoginPageProps = {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
};

export default function LoginPage({ theme, onToggleTheme }: LoginPageProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@smartsurveillance.local');
  const [password, setPassword] = useState('password');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const data = await login(email, password);
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('user_full_name', data.user?.full_name || data.user?.username || 'Operator');
      localStorage.setItem('user_email', data.user?.email || email);
      navigate('/dashboard');
    } catch (error) {
      setError(getErrorMessage(error, 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <label className="theme-switch auth-theme-toggle">
        <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
        <input
          type="checkbox"
          checked={theme === 'dark'}
          onChange={onToggleTheme}
          aria-label="Toggle dark mode"
        />
        <span className="theme-slider" aria-hidden="true" />
      </label>

      <section className="auth-hero">
        <div className="auth-hero-copy">
          <span className="eyebrow">Surveillance workspace</span>
          <h1>Operate sites, alerts, and live AI review from one workspace.</h1>
          <p>Built for monitoring teams that need a clear view, not a noisy screen.</p>
        </div>

        <div className="auth-preview-panel">
          <div className="auth-preview-strip" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="auth-preview-card auth-preview-card-primary">
            <span>Live watch</span>
            <strong>Camera health, alerts, and vision runs in one flow</strong>
          </div>
          <div className="auth-preview-grid">
            <div className="auth-preview-card">
              <span>Response</span>
              <strong>Instant alert review</strong>
            </div>
            <div className="auth-preview-card">
              <span>Evidence</span>
              <strong>Snapshots and processed output</strong>
            </div>
          </div>
        </div>

        <div className="auth-metrics">
          <div>
            <strong>Live</strong>
            <span>Vision processing</span>
          </div>
          <div>
            <strong>Instant</strong>
            <span>Alert response</span>
          </div>
          <div>
            <strong>Unified</strong>
            <span>Sites, cameras, analytics</span>
          </div>
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-card-header">
          <div>
            <span className="eyebrow">Secure sign in</span>
            <h2>Welcome back</h2>
            <p>Use your operator credentials to enter the console.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="stack-form">
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>

          <label>
            Password
            <div className="password-field">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? 'text' : 'password'}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                <span className={`eye-icon${showPassword ? ' eye-icon-off' : ''}`} aria-hidden="true" />
                <span className="sr-only">{showPassword ? 'Hide password' : 'Show password'}</span>
              </button>
            </div>
          </label>

          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>

          {error && <div className="error">{error}</div>}
        </form>

        <div className="auth-footer">
          <span>New here?</span>
          <Link to="/register" className="text-link">
            Create an account
          </Link>
        </div>
      </section>
    </div>
  );
}
