import React, { useEffect, useState } from 'react';
import { Activity, Cpu, HardDrive, MemoryStick, Thermometer } from 'lucide-react';
import Navigation from '../components/Navigation';

const POLL_MS = 3000;

function formatSize(bytes) {
  if (bytes == null) return '—';
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / (1024 * 1024))} MB`;
}

function formatUptime(sec) {
  if (sec == null) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// One throttle line for the temperature card: the "now" flags matter most,
// the "ever" flags still deserve a mention because they mean the Pi hit a
// limit at some point since boot.
function throttleSummary(t) {
  if (!t) return { text: 'SoC temperature', warn: false };
  if (t.throttledNow) return { text: 'Throttling right now', warn: true };
  if (t.undervoltageNow) return { text: 'Under-voltage right now', warn: true };
  if (t.throttledEver || t.undervoltageEver) return { text: 'Hit a limit earlier this boot', warn: true };
  return { text: 'No throttling since boot', warn: false };
}

function StatCard({ icon: Icon, label, value, percent, hot, detail, detailWarn }) {
  return (
    <div className="glass-panel stat-card">
      <div className="stat-head"><Icon size={15} /><span>{label}</span></div>
      <div className={`stat-value ${hot ? 'stat-value-hot' : ''}`}>{value}</div>
      {percent != null && (
        <div className="stat-meter-track">
          <div
            className={`stat-meter-fill ${hot ? 'stat-meter-hot' : ''}`}
            style={{ width: `${Math.min(100, Math.max(2, percent))}%` }}
          />
        </div>
      )}
      <div className={`stat-detail ${detailWarn ? 'stat-detail-warn' : ''}`}>{detail}</div>
    </div>
  );
}

// Live host stats for the Pi FlatBrain runs on, polled every few seconds.
// CPU usage is measured by the server between polls, so the first reading
// can be null for an instant and the meters settle after one interval.
export default function ServerStatusPage() {
  const [stats, setStats] = useState(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch('/api/system/stats')
        .then((res) => {
          if (!res.ok) throw new Error(`API /system/stats failed with status ${res.status}`);
          return res.json();
        })
        .then((s) => { if (!cancelled) { setStats(s); setOffline(false); } })
        .catch(() => { if (!cancelled) setOffline(true); });
    };
    load();
    const intervalId = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(intervalId); };
  }, []);

  const cpu = stats?.cpu;
  const mem = stats?.memory;
  const disk = stats?.disk;
  const memPercent = mem?.total ? Math.round((mem.used / mem.total) * 100) : null;
  const throttle = throttleSummary(stats?.throttled);

  return (
    <div className="container container-narrow animate-fade-in">
      <Navigation showTabs={false} appLabel="Server Status" />

      <div className="page-header">
        <h1>Server Status</h1>
        <p className="text-muted">
          {offline ? 'Can’t reach the server — showing the last reading.'
            : stats?.model || 'Reading host stats…'}
        </p>
      </div>

      {stats && (
        <>
          <div className="stat-grid">
            <StatCard
              icon={Cpu}
              label="CPU"
              value={cpu.percent != null ? `${cpu.percent}%` : '—'}
              percent={cpu.percent}
              hot={cpu.percent >= 90}
              detail={`load ${cpu.load[0]} · ${cpu.cores} cores${cpu.mhz ? ` · ${cpu.mhz} MHz` : ''}`}
            />
            <StatCard
              icon={Thermometer}
              label="Temperature"
              value={stats.tempC != null ? `${stats.tempC.toFixed(1)}°C` : '—'}
              percent={stats.tempC != null ? (stats.tempC / 85) * 100 : null}
              hot={stats.tempC >= 70}
              detail={throttle.text}
              detailWarn={throttle.warn}
            />
            <StatCard
              icon={MemoryStick}
              label="Memory"
              value={memPercent != null ? `${memPercent}%` : '—'}
              percent={memPercent}
              hot={memPercent >= 90}
              detail={mem
                ? `${formatSize(mem.used)} of ${formatSize(mem.total)}${mem.swapTotal ? ` · swap ${formatSize(mem.swapUsed)}` : ''}`
                : '—'}
            />
            <StatCard
              icon={HardDrive}
              label="Storage"
              value={disk?.percent != null ? `${disk.percent}%` : '—'}
              percent={disk?.percent}
              hot={disk?.percent >= 90}
              detail={disk ? `${formatSize(disk.used)} used · ${formatSize(disk.avail)} free of ${formatSize(disk.total)}` : '—'}
            />
          </div>

          <div className="glass-panel">
            <div className="stat-head"><Activity size={15} /><span>System</span></div>
            <div className="sys-rows">
              <div className="sys-row"><span className="sys-row-label">Hostname</span><span className="sys-row-value">{stats.hostname}</span></div>
              {stats.model && (
                <div className="sys-row"><span className="sys-row-label">Board</span><span className="sys-row-value">{stats.model}</span></div>
              )}
              <div className="sys-row"><span className="sys-row-label">Kernel</span><span className="sys-row-value">Linux {stats.kernel} · {stats.arch}</span></div>
              <div className="sys-row"><span className="sys-row-label">Uptime</span><span className="sys-row-value">{formatUptime(stats.uptimeSec)}</span></div>
              <div className="sys-row"><span className="sys-row-label">Load average</span><span className="sys-row-value">{cpu.load.join(' · ')}</span></div>
              <div className="sys-row"><span className="sys-row-label">Node</span><span className="sys-row-value">{stats.node}</span></div>
            </div>
          </div>
        </>
      )}

      {!stats && (
        <div className="glass-panel">
          <p className="text-muted" style={{ margin: 0 }}>
            {offline ? 'The stats API isn’t responding.' : 'Reading host stats…'}
          </p>
        </div>
      )}
    </div>
  );
}
