// The storage keys PasswordGate unlocks the panel with. They live in a
// plain util so non-gate code (Settings' password change) can reach them
// without importing a component module.
export const AUTH_SESSION_KEY = 'flatbrain-authed';
export const AUTH_LOCAL_KEY = 'flatbrain-authed-remember';
export const PASSWORD_LOCAL_KEY = 'flatbrain-password';

// After a password change: a device that ticked "Remember password" still
// holds the old one — swap it so the next login pre-fills correctly.
export function syncRememberedPassword(password) {
  try {
    if (localStorage.getItem(PASSWORD_LOCAL_KEY) != null) {
      localStorage.setItem(PASSWORD_LOCAL_KEY, password);
    }
  } catch { /* private mode — nothing remembered to update */ }
}
