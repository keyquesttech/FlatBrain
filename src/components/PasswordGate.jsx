import React, { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { login } from '../api';
import { AUTH_SESSION_KEY, AUTH_LOCAL_KEY, PASSWORD_LOCAL_KEY } from '../utils/authStorage';
import { isAppLocked } from '../utils/panelSettings';

// One-time carry-over from the pre-FlatBrain key names, so the rename
// doesn't log anyone out or forget a remembered password.
try {
  [
    [sessionStorage, 'bill-splitter-authed', AUTH_SESSION_KEY],
    [localStorage, 'bill-splitter-authed-remember', AUTH_LOCAL_KEY],
    [localStorage, 'bill-splitter-password', PASSWORD_LOCAL_KEY]
  ].forEach(([store, legacyKey, key]) => {
    const value = store.getItem(legacyKey);
    if (value != null && store.getItem(key) == null) store.setItem(key, value);
    store.removeItem(legacyKey);
  });
} catch { /* private mode — nothing to migrate */ }

function isAuthed() {
  return (
    sessionStorage.getItem(AUTH_SESSION_KEY) === 'true' ||
    localStorage.getItem(AUTH_LOCAL_KEY) === 'true'
  );
}

function persistAuth(remember) {
  if (remember) {
    localStorage.setItem(AUTH_LOCAL_KEY, 'true');
    sessionStorage.removeItem(AUTH_SESSION_KEY);
  } else {
    sessionStorage.setItem(AUTH_SESSION_KEY, 'true');
    localStorage.removeItem(AUTH_LOCAL_KEY);
    localStorage.removeItem(PASSWORD_LOCAL_KEY);
  }
}

// appKey names the app for the per-app locks in Settings; an app whose
// lock is off renders straight through. Being unlocked once still unlocks
// every app, like it always has — the locks only pick who asks.
export default function PasswordGate({ appKey, children }) {
  const [authed, setAuthed] = useState(isAuthed);
  const [password, setPassword] = useState(() => localStorage.getItem(PASSWORD_LOCAL_KEY) || '');
  const [remember, setRemember] = useState(() => localStorage.getItem(AUTH_LOCAL_KEY) === 'true');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await login(password);
      if (res.success) {
        persistAuth(remember);
        if (remember) {
          localStorage.setItem(PASSWORD_LOCAL_KEY, password);
        }
        setAuthed(true);
      } else {
        setError('Incorrect password. Please try again.');
        setPassword('');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isAppLocked(appKey) || authed) return children;

  return (
    <div className="auth-wrap animate-fade-in">
      <form className="glass-panel auth-card" onSubmit={handleSubmit}>
        <div className="auth-icon">
          <Lock size={28} />
        </div>
        <h2>FlatBrain</h2>
        <p className="text-muted auth-subtitle">
          Enter the password to access your flat's apps.
        </p>
        <div className="form-group auth-field">
          <label htmlFor="password-field">Password</label>
          <div className="password-input">
            <input
              id="password-field"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
            />
            <button
              type="button"
              className="password-toggle-btn"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <label className="remember-checkbox">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span>Remember password</span>
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={loading}
        >
          {loading ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}
