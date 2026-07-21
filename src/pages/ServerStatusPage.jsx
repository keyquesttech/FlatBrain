import React, { useEffect, useState } from 'react';
import { Activity, Cpu, HardDrive, MemoryStick, Thermometer } from 'lucide-react';
import BackupCard from '../components/BackupCard';
import CollapsibleCard from '../components/CollapsibleCard';
import RebootCard from '../components/RebootCard';
import Navigation from '../components/Navigation';

const POLL_MS = 3000;
// The graph only gains a point a minute, so its data refreshes on its own
// slower cadence instead of riding along with every fast stats poll.
const HISTORY_POLL_MS = 60 * 1000;
const CHART_WINDOW_MS = 4 * 60 * 60 * 1000;
// A gap in the samples longer than this (service down, Pi off) breaks the
// temperature line instead of drawing a misleading bridge across it.
const CHART_GAP_MS = 5 * 60 * 1000;

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

// Icon + text for a collapsible card's title row
const cardTitle = (Icon, text) => (
  <span className="stat-title"><Icon size={15} /> {text}</span>
);

function StatBody({ value, hot, percent, detail, detailWarn }) {
  return (
    <>
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
    </>
  );
}

// Temperature over the past four hours, from the server's once-a-minute
// samples. Hand-rolled SVG like the app's other charts: only geometry lives
// in the (stretched) viewBox, labels are HTML so nothing distorts.
function TempChart({ history }) {
  const now = Date.now();
  const t0 = now - CHART_WINDOW_MS;
  const pts = (history || []).filter((p) => p.t >= t0);
  if (pts.length < 2) {
    return (
      <p className="stat-detail temp-chart-empty">
        Collecting readings — the graph fills in as the server samples once a minute.
      </p>
    );
  }

  const temps = pts.map((p) => p.c);
  const yMin = Math.floor(Math.min(...temps)) - 1;
  const yMax = Math.ceil(Math.max(...temps)) + 1;
  const x = (t) => ((t - t0) / CHART_WINDOW_MS) * 100;
  const y = (c) => 100 - ((c - yMin) / (yMax - yMin)) * 100;

  const segments = [];
  let current = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].t - pts[i - 1].t > CHART_GAP_MS) {
      segments.push(current);
      current = [];
    }
    current.push(pts[i]);
  }
  segments.push(current);

  const last = pts[pts.length - 1];

  return (
    <div className="temp-chart">
      <div className="temp-chart-y" aria-hidden="true">
        <span>{yMax}°</span>
        <span>{Math.round((yMin + yMax) / 2)}°</span>
        <span>{yMin}°</span>
      </div>
      <div className="temp-chart-plot">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Temperature over the past 4 hours, between ${yMin} and ${yMax} degrees Celsius`}
        >
          <defs>
            <linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--blue)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--blue)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[25, 50, 75].map((gy) => (
            <line key={gy} x1="0" y1={gy} x2="100" y2={gy} className="temp-chart-grid" vectorEffect="non-scaling-stroke" />
          ))}
          {segments.map((seg, i) => {
            // A lone sample between gaps still shows up, as a dot
            if (seg.length === 1) {
              const [p] = seg;
              return (
                <line
                  key={i}
                  x1={x(p.t)} y1={y(p.c)} x2={x(p.t)} y2={y(p.c)}
                  className="temp-chart-line" strokeLinecap="round" strokeWidth="4"
                  vectorEffect="non-scaling-stroke"
                />
              );
            }
            const line = seg.map((p) => `${x(p.t)},${y(p.c)}`).join(' ');
            return (
              <g key={i}>
                <polygon
                  points={`${x(seg[0].t)},100 ${line} ${x(seg[seg.length - 1].t)},100`}
                  fill="url(#tempFill)"
                />
                <polyline points={line} className="temp-chart-line" vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
          <line
            x1={x(last.t)} y1={y(last.c)} x2={x(last.t)} y2={y(last.c)}
            className="temp-chart-dot" strokeLinecap="round" vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="temp-chart-x" aria-hidden="true">
          <span>4h ago</span><span>3h</span><span>2h</span><span>1h</span><span>now</span>
        </div>
      </div>
    </div>
  );
}

// Live host stats for the Pi FlatBrain runs on, polled every few seconds.
// CPU usage is measured by the server between polls, so the first reading
// can be null for an instant and the meters settle after one interval.
export default function ServerStatusPage() {
  const [stats, setStats] = useState(null);
  const [tempHistory, setTempHistory] = useState([]);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const getJSON = (url) => fetch(url).then((res) => {
      if (!res.ok) throw new Error(`API ${url} failed with status ${res.status}`);
      return res.json();
    });
    const load = () => {
      getJSON('/api/system/stats')
        .then((s) => { if (!cancelled) { setStats(s); setOffline(false); } })
        .catch(() => { if (!cancelled) setOffline(true); });
    };
    const loadHistory = () => {
      getJSON('/api/system/temp-history')
        .then((r) => { if (!cancelled) setTempHistory(r.history); })
        .catch(() => {});
    };
    load();
    loadHistory();
    const statsId = setInterval(load, POLL_MS);
    const historyId = setInterval(loadHistory, HISTORY_POLL_MS);
    return () => { cancelled = true; clearInterval(statsId); clearInterval(historyId); };
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
            {/* Temperature owns the full top row: current reading + 4h graph */}
            <div className="stat-span-all">
              <CollapsibleCard title={cardTitle(Thermometer, 'Temperature')} storageKey="status-temp">
                <div className="temp-card-body">
                  <div className="temp-card-now">
                    <StatBody
                      value={stats.tempC != null ? `${stats.tempC.toFixed(1)}°C` : '—'}
                      percent={stats.tempC != null ? (stats.tempC / 85) * 100 : null}
                      hot={stats.tempC >= 70}
                      detail={throttle.text}
                      detailWarn={throttle.warn}
                    />
                  </div>
                  <div className="temp-card-chart">
                    <TempChart history={tempHistory} />
                  </div>
                </div>
              </CollapsibleCard>
            </div>

            <CollapsibleCard title={cardTitle(Cpu, 'CPU')} storageKey="status-cpu">
              <StatBody
                value={cpu.percent != null ? `${cpu.percent}%` : '—'}
                percent={cpu.percent}
                hot={cpu.percent >= 90}
                detail={`load ${cpu.load[0]} · ${cpu.cores} cores${cpu.mhz ? ` · ${cpu.mhz} MHz` : ''}`}
              />
            </CollapsibleCard>
            <CollapsibleCard title={cardTitle(MemoryStick, 'Memory')} storageKey="status-memory">
              <StatBody
                value={memPercent != null ? `${memPercent}%` : '—'}
                percent={memPercent}
                hot={memPercent >= 90}
                detail={mem
                  ? `${formatSize(mem.used)} of ${formatSize(mem.total)}${mem.swapTotal ? ` · swap ${formatSize(mem.swapUsed)}` : ''}`
                  : '—'}
              />
            </CollapsibleCard>
            <CollapsibleCard title={cardTitle(HardDrive, 'Storage')} storageKey="status-storage">
              <StatBody
                value={disk?.percent != null ? `${disk.percent}%` : '—'}
                percent={disk?.percent}
                hot={disk?.percent >= 90}
                detail={disk ? `${formatSize(disk.used)} used · ${formatSize(disk.avail)} free of ${formatSize(disk.total)}` : '—'}
              />
            </CollapsibleCard>
          </div>

          <div className="form-card-stack">
            <CollapsibleCard title={cardTitle(Activity, 'System')} storageKey="status-system">
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
            </CollapsibleCard>

            {/* Whole-panel USB backups live here — server care, not any one app's */}
            <BackupCard />

            {/* Scheduled reboots — 06:30 default, after the backup slot */}
            <RebootCard />
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
