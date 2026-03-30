import { useEffect, useState } from 'react';
import { useStore, TAB_DEFS, startPolling, stopPolling, isEdict, isArchived } from './store';
import SwordGuard from './components/SwordGuard';
import EdictBoard from './components/EdictBoard';
import MonitorPanel from './components/MonitorPanel';
import OfficialPanel from './components/OfficialPanel';
import ModelConfig from './components/ModelConfig';
import SkillsConfig from './components/SkillsConfig';
import SessionsPanel from './components/SessionsPanel';
import MemorialPanel from './components/MemorialPanel';
import TemplatePanel from './components/TemplatePanel';
import MorningPanel from './components/MorningPanel';
import TaskModal from './components/TaskModal';
// ConfirmDialog is used inside TaskModal as needed
import Toaster from './components/Toaster';
import CourtCeremony from './components/CourtCeremony';
import CourtDiscussion from './components/CourtDiscussion';
import TaskPlanner from './components/TaskPlanner';

export default function App() {
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const liveStatus = useStore((s) => s.liveStatus);
  const countdown = useStore((s) => s.countdown);
  const loadAll = useStore((s) => s.loadAll);
  const courtSession = useStore((s) => s.courtSession);
  const courtRestoreSession = useStore((s) => s.courtRestoreSession);
  const [theme, setTheme] = useState<'dark' | 'light' | 'cyber' | 'brutal' | 'forest' | 'amoled'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light' | 'cyber' | 'brutal' | 'forest' | 'amoled') || 'dark';
  });

  const THEMES: Array<{ id: 'dark' | 'light' | 'cyber' | 'brutal' | 'forest' | 'amoled'; label: string; emoji: string }> = [
    { id: 'dark',  label: '暗夜',   emoji: '🌙' },
    { id: 'light', label: '黎明',   emoji: '☀️' },
    { id: 'cyber', label: '霓虹',   emoji: '🖥️' },
    { id: 'brutal',label: '毛坯',   emoji: '🧱' },
    { id: 'forest',label: '森林',   emoji: '🌲' },
    { id: 'amoled',label: '纯黑',   emoji: '⚫' },
  ];

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    startPolling();
    courtRestoreSession();
    return () => stopPolling();
  }, []);

  // Compute header chips
  const tasks = liveStatus?.tasks || [];
  const edicts = tasks.filter(isEdict);
  const activeEdicts = edicts.filter((t) => !isArchived(t));
  const sync = liveStatus?.syncStatus;
  const syncOk = sync?.ok;

  // Tab badge counts
  const tabBadge = (key: string): string => {
    if (key === 'edicts') return String(activeEdicts.length);
    if (key === 'sessions') return String(tasks.filter((t) => !isEdict(t)).length);
    if (key === 'memorials') return String(edicts.filter((t) => ['Done', 'Cancelled'].includes(t.state)).length);
    if (key === 'court' && courtSession) return `🏛${courtSession.round}`;
    if (key === 'monitor') {
      const activeDepts = tasks.filter((t) => t.org && t.state === 'Doing').length;
      return activeDepts + '活跃';
    }
    return '';
  };

  return (
    <div className="wrap">
      {/* ── Header ── */}
      <div className="hdr">
        <div>
          <div className="logo">三省六部 · 总控台</div>
          <div className="sub-text">OpenClaw Sansheng-Liubu Dashboard</div>
        </div>
        <div className="hdr-r">
          {courtSession && activeTab !== 'court' && (
            <button
              className="chip"
              style={{ background: 'linear-gradient(135deg, #6a9eff22, #a07aff22)', border: '1px solid #6a9eff44', cursor: 'pointer' }}
              onClick={() => setActiveTab('court')}
              title="返回朝堂议政"
            >
              🏛 第{courtSession.round}轮 {courtSession.phase === 'concluded' ? '（已散朝）' : '进行中'}
            </button>
          )}
          <span className={`chip ${syncOk ? 'ok' : syncOk === false ? 'err' : ''}`}>
            {syncOk ? '✅ 同步正常' : syncOk === false ? '❌ 服务器未启动' : '⏳ 连接中…'}
          </span>
          <span className="chip">{activeEdicts.length} 道旨意</span>
          <button
            className="chip"
            onClick={() => {
              const idx = THEMES.findIndex((t) => t.id === theme);
              setTheme(THEMES[(idx + 1) % THEMES.length].id);
            }}
            title="切换主题"
            style={{ cursor: 'pointer', userSelect: 'none', minWidth: 64 }}
          >
            {THEMES.find((t) => t.id === theme)?.emoji} {THEMES.find((t) => t.id === theme)?.label}
          </button>
          <button className="btn-refresh" onClick={() => loadAll()}>
            ⟳ 刷新
          </button>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>⟳ {countdown}s</span>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="tabs">
        {TAB_DEFS.map((t) => (
          <div
            key={t.key}
            className={`tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.icon} {t.label}
            {tabBadge(t.key) && <span className="tbadge">{tabBadge(t.key)}</span>}
          </div>
        ))}
      </div>

      {/* ── Panels ── */}
      {activeTab === 'edicts' && <EdictBoard />}
      {activeTab === 'court' && <CourtDiscussion />}
      {activeTab === 'plan' && <TaskPlanner />}
      {activeTab === 'monitor' && <MonitorPanel />}
      {activeTab === 'officials' && <OfficialPanel />}
      {activeTab === 'models' && <ModelConfig />}
      {activeTab === 'skills' && <SkillsConfig />}
      {activeTab === 'sessions' && <SessionsPanel />}
      {activeTab === 'memorials' && <MemorialPanel />}
      {activeTab === 'templates' && <TemplatePanel />}
      {activeTab === 'morning' && <MorningPanel />}

      {/* ── Overlays ── */}
      <TaskModal />
      <Toaster />
      <CourtCeremony />

      {/* ── 刀侍卫 ── */}
      <SwordGuard />
    </div>
  );
}
