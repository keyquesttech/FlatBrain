import React, { useEffect, useState } from 'react';
import { playError } from '../utils/sound';

// In-app replacements for window.alert / window.confirm plus a toast, all
// styled like the rest of the app. One DialogHost mounts in App; these
// module-level functions talk to it, so callers just await them:
//   await appAlert('message', { title, tone: 'error' })
//   const ok = await appConfirm('message', { okLabel, danger: true })
//   appToast('message')            // non-blocking, auto-dismisses
// If the host isn't mounted (never happens in practice), they fall back to
// the native popups rather than silently swallowing the interaction.

let pushDialog = null;
let pushToast = null;
let nextId = 0;

export function appAlert(message, opts = {}) {
  return new Promise((resolve) => {
    if (!pushDialog) {
      window.alert(message);
      resolve();
      return;
    }
    pushDialog({ id: ++nextId, type: 'alert', message, resolve, ...opts });
  });
}

export function appConfirm(message, opts = {}) {
  return new Promise((resolve) => {
    if (!pushDialog) {
      resolve(window.confirm(message));
      return;
    }
    pushDialog({ id: ++nextId, type: 'confirm', message, resolve, ...opts });
  });
}

export function appToast(message, opts = {}) {
  if (pushToast) pushToast({ id: ++nextId, message, tone: opts.tone || 'success', duration: opts.duration || 4200 });
}

export default function DialogHost() {
  const [dialogs, setDialogs] = useState([]);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    pushDialog = (d) => setDialogs((ds) => [...ds, d]);
    pushToast = (t) => {
      setToasts((ts) => [...ts, t]);
      setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== t.id)), t.duration);
    };
    return () => {
      pushDialog = null;
      pushToast = null;
    };
  }, []);

  const current = dialogs[0];

  const close = (result) => {
    current?.resolve(result);
    setDialogs((ds) => ds.slice(1));
  };

  // Error dialogs announce themselves; Escape dismisses like the native ones.
  useEffect(() => {
    if (!current) return;
    if (current.tone === 'error') playError();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        current.resolve(current.type === 'confirm' ? false : undefined);
        setDialogs((ds) => ds.slice(1));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  return (
    <>
      {current && (
        <div className="dialog-overlay" onClick={() => close(current.type === 'confirm' ? false : undefined)}>
          <div
            className={`dialog-card dialog-${current.tone || 'info'}`}
            role="dialog"
            aria-modal="true"
            aria-label={current.title || (current.type === 'confirm' ? 'Confirm' : 'Notice')}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="dialog-title">{current.title || (current.type === 'confirm' ? 'Are you sure?' : 'Notice')}</h3>
            <p className="dialog-message">{current.message}</p>
            <div className="dialog-actions">
              {current.type === 'confirm' && (
                <button type="button" className="btn btn-secondary" onClick={() => close(false)}>
                  {current.cancelLabel || 'Cancel'}
                </button>
              )}
              <button
                type="button"
                autoFocus
                className={`btn ${current.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => close(current.type === 'confirm' ? true : undefined)}
              >
                {current.okLabel || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>{t.message}</div>
        ))}
      </div>
    </>
  );
}
