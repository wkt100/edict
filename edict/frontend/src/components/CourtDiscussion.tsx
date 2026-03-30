/**
 * 朝堂议政 — 多官员实时讨论可视化组件
 *
 * 灵感来自 nvwa 项目的故事剧场 + 协作工坊 + 虚拟生活
 * 功能：
 *   - 可视化朝堂布局，官员站位
 *   - 实时群聊讨论，官员各抒己见
 *   - 皇帝（用户）随时发言参与
 *   - 天命降临（上帝视角）改变讨论走向
 *   - 命运骰子：随机事件增加趣味性
 *   - 自动推进 / 手动推进
 *
 * 状态存储在全局 store，切换面板不丢失。
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore, DEPTS, type CourtSession, type CourtMessage, type CourtEdict } from '../store';
import { api } from '../api';

// ── 常量 ──

const OFFICIAL_COLORS: Record<string, string> = {
  taizi: '#e8a040', zhongshu: '#a07aff', menxia: '#6a9eff', shangshu: '#2ecc8a',
  libu: '#f5c842', hubu: '#ff9a6a', bingbu: '#ff5270', xingbu: '#cc4444',
  gongbu: '#44aaff', libu_hr: '#9b59b6',
};

const EMOTION_EMOJI: Record<string, string> = {
  neutral: '', confident: '😏', worried: '😟', angry: '😤',
  thinking: '🤔', amused: '😄', happy: '😊',
};

const COURT_POSITIONS: Record<string, { x: number; y: number }> = {
  // 左列
  zhongshu: { x: 15, y: 25 }, menxia: { x: 15, y: 45 }, shangshu: { x: 15, y: 65 },
  // 右列
  libu: { x: 85, y: 20 }, hubu: { x: 85, y: 35 }, bingbu: { x: 85, y: 50 },
  xingbu: { x: 85, y: 65 }, gongbu: { x: 85, y: 80 },
  // 中间
  taizi: { x: 50, y: 20 }, libu_hr: { x: 50, y: 80 },
};

export default function CourtDiscussion() {
  // ── 持久化状态（来自 store，切换面板不丢失）──
  const phase = useStore((s) => s.courtPhase);
  const session = useStore((s) => s.courtSession);
  const selectedIds = useStore((s) => s.courtSelectedIds);
  const topic = useStore((s) => s.courtTopic);
  const autoPlay = useStore((s) => s.courtAutoPlay);
  const setPhase = useStore((s) => s.setCourtPhase);
  const setSession = useStore((s) => s.setCourtSession);
  const setSelectedIds = useStore((s) => s.setCourtSelectedIds);
  const setTopic = useStore((s) => s.setCourtTopic);
  const setAutoPlay = useStore((s) => s.setCourtAutoPlay);
  const toggleOfficial = useStore((s) => s.courtToggleOfficial);
  const courtReset = useStore((s) => s.courtReset);

  // ── 本地 UI 状态（不需要持久化）──
  const [loading, setLoading] = useState(false);
  const autoPlayRef = useRef(false);
  // 皇帝发言
  const [userInput, setUserInput] = useState('');
  // 天命降临
  const [showDecree, setShowDecree] = useState(false);
  const [decreeInput, setDecreeInput] = useState('');
  const [decreeFlash, setDecreeFlash] = useState(false);
  // 命运骰子
  const [diceRolling, setDiceRolling] = useState(false);
  const [diceResult, setDiceResult] = useState<string | null>(null);
  // 活跃说话官员
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  // 官员情绪
  const [emotions, setEmotions] = useState<Record<string, string>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const toast = useStore((s) => s.toast);
  const liveStatus = useStore((s) => s.liveStatus);

  // 自动滚到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [(session as CourtSession | null)?.messages?.length]);

  // 自动推进
  useEffect(() => {
    autoPlayRef.current = autoPlay;
  }, [autoPlay]);

  useEffect(() => {
    if (!autoPlay || !session || loading) return;
    const timer = setInterval(() => {
      if (autoPlayRef.current && !loading) {
        handleAdvance();
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [autoPlay, session, loading]);

  // ── 开始议政 ──
  const handleStart = async () => {
    if (!topic.trim() || selectedIds.size < 2 || loading) return;
    setLoading(true);
    try {
      const res = await api.courtDiscussStart(topic, Array.from(selectedIds));
      if (!res.ok) throw new Error(res.error || '启动失败');
      const sess = res as unknown as CourtSession;
      setSession(sess);
      setPhase('session');
      sessionStorage.setItem('courtSessionId', sess.session_id);
    } catch (e: unknown) {
      toast((e as Error).message || '启动失败', 'err');
    } finally {
      setLoading(false);
    }
  };

  // ── 推进讨论 ──
  const handleAdvance = useCallback(async (userMsg?: string, decree?: string) => {
    if (!session || loading) return;
    setLoading(true);

    try {
      const res = await api.courtDiscussAdvance(session.session_id, userMsg, decree);
      if (!res.ok) throw new Error(res.error || '推进失败');

      // 更新 session messages（追加新消息）
      setSession((prev) => {
        if (!prev) return prev;
        const newMsgs: CourtMessage[] = [];

        if (userMsg) {
          newMsgs.push({ type: 'emperor', content: userMsg, timestamp: Date.now() / 1000 });
        }
        if (decree) {
          newMsgs.push({ type: 'decree', content: decree, timestamp: Date.now() / 1000 });
        }

        const aiMsgs = (res.new_messages || []).map((m: Record<string, string>) => ({
          type: 'official',
          official_id: m.official_id,
          official_name: m.name,
          content: m.content,
          emotion: m.emotion,
          action: m.action,
          timestamp: Date.now() / 1000,
        }));

        if (res.scene_note) {
          newMsgs.push({ type: 'scene_note', content: res.scene_note, timestamp: Date.now() / 1000 });
        }

        return {
          ...prev,
          round: res.round ?? prev.round + 1,
          messages: [...prev.messages, ...newMsgs, ...aiMsgs],
        };
      });

      // 动画：依次高亮说话的官员
      const aiMsgs = res.new_messages || [];
      if (aiMsgs.length > 0) {
        const emotionMap: Record<string, string> = {};
        let idx = 0;
        const cycle = () => {
          if (idx < aiMsgs.length) {
            setSpeakingId(aiMsgs[idx].official_id);
            emotionMap[aiMsgs[idx].official_id] = aiMsgs[idx].emotion || 'neutral';
            idx++;
            setTimeout(cycle, 1200);
          } else {
            setSpeakingId(null);
          }
        };
        cycle();
        setEmotions((prev) => ({ ...prev, ...emotionMap }));
      }
    } catch {
      // silently
    } finally {
      setLoading(false);
    }
  }, [session, loading]);

  // ── 皇帝发言 ──
  const handleEmperor = () => {
    const msg = userInput.trim();
    if (!msg) return;
    setUserInput('');
    handleAdvance(msg);
  };

  // ── 天命降临 ──
  const handleDecree = () => {
    const msg = decreeInput.trim();
    if (!msg) return;
    setDecreeInput('');
    setShowDecree(false);
    setDecreeFlash(true);
    setTimeout(() => setDecreeFlash(false), 800);
    handleAdvance(undefined, msg);
  };

  // ── 命运骰子 ──
  const handleDice = async () => {
    if (loading || diceRolling) return;
    setDiceRolling(true);
    setDiceResult(null);

    // 滚动动画
    let count = 0;
    const timer = setInterval(async () => {
      count++;
      setDiceResult('🎲 命运轮转中...');
      if (count >= 6) {
        clearInterval(timer);
        try {
          const res = await api.courtDiscussFate();
          const event = res.event || '边疆急报传来';
          setDiceResult(event);
          setDiceRolling(false);
          // 自动作为天命降临注入
          handleAdvance(undefined, `【命运骰子】${event}`);
        } catch {
          setDiceResult('命运之力暂时无法触及');
          setDiceRolling(false);
        }
      }
    }, 200);
  };

  // ── 结束议政 ──
  const handleConclude = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await api.courtDiscussConclude(session.session_id);
      if (res.summary) {
        const raw = res as unknown as Record<string, unknown>;
        const exportPath = raw.exportPath as string | undefined;
        if (exportPath) toast(`议政记录已导出至: ${exportPath.split('/').pop()}`, 'ok');
        setSession((prev) =>
          prev
            ? {
              ...prev,
              phase: 'concluded',
              messages: [
                ...prev.messages,
                { type: 'system', content: `📋 朝堂议政结束 — ${res.summary}`, timestamp: Date.now() / 1000 },
              ],
              edict: raw.edict as CourtEdict | undefined,
            }
            : prev,
        );
      }
      setAutoPlay(false);
    } catch {
      toast('结束失败', 'err');
    } finally {
      setLoading(false);
    }
  };

  // ── 重置 ──
  const handleReset = () => {
    if (session) {
      api.courtDiscussDestroy(session.session_id).catch(() => {});
    }
    courtReset(); // 重置 store 中的议政状态
    setEmotions({});
    setSpeakingId(null);
    setDiceResult(null);
  };

  // ── 预设议题（从当前旨意中提取）──
  const activeEdicts = (liveStatus?.tasks || []).filter(
    (t) => /^JJC-/i.test(t.id) && !['Done', 'Cancelled'].includes(t.state),
  );

  const presetTopics = [
    ...activeEdicts.slice(0, 3).map((t) => ({
      text: `讨论旨意 ${t.id}：${t.title}`,
      taskId: t.id,
      icon: '📜',
    })),
    { text: '讨论系统架构优化方案', taskId: '', icon: '🏗️' },
    { text: '评估当前项目进展和风险', taskId: '', icon: '📊' },
    { text: '制定下周工作计划', taskId: '', icon: '📋' },
    { text: '紧急问题：线上Bug排查方案', taskId: '', icon: '🚨' },
  ];

  // ═══════════════════
  //     渲染：设置页
  // ═══════════════════

  if (phase === 'setup') {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center py-4">
          <h2 className="text-xl font-bold bg-gradient-to-r from-amber-400 to-purple-400 bg-clip-text text-transparent">
            🏛 朝堂议政
          </h2>
          <p className="text-xs text-[var(--muted)] mt-1">
            择臣上殿，围绕议题展开讨论 · 陛下可随时发言或降下天意改变走向
          </p>
        </div>

        {/* 选择官员 */}
        <div className="bg-[var(--panel)] rounded-xl p-4 border border-[var(--line)]">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold">👔 选择参朝官员</span>
            <span className="text-xs text-[var(--muted)]">（{selectedIds.size}/8，至少2位）</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {DEPTS.map((d) => {
              const active = selectedIds.has(d.id);
              const color = OFFICIAL_COLORS[d.id] || '#6a9eff';
              return (
                <button
                  key={d.id}
                  onClick={() => toggleOfficial(d.id)}
                  className="p-2.5 rounded-lg border transition-all text-left"
                  style={{
                    borderColor: active ? color + '80' : 'var(--line)',
                    background: active ? color + '15' : 'var(--panel2)',
                    boxShadow: active ? `0 0 12px ${color}20` : 'none',
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg">{d.emoji}</span>
                    <div>
                      <div className="text-xs font-semibold" style={{ color: active ? color : 'var(--text)' }}>
                        {d.label}
                      </div>
                      <div className="text-[10px] text-[var(--muted)]">{d.role}</div>
                    </div>
                    {active && (
                      <span
                        className="ml-auto w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white"
                        style={{ background: color }}
                      >
                        ✓
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 议题 */}
        <div className="bg-[var(--panel)] rounded-xl p-4 border border-[var(--line)]">
          <div className="text-sm font-semibold mb-2">📜 设定议题</div>
          {presetTopics.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {presetTopics.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setTopic(p.text)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-[var(--line)] hover:border-[var(--acc)] hover:text-[var(--acc)] transition-colors"
                  style={{
                    background: topic === p.text ? 'var(--acc)' + '18' : 'transparent',
                    borderColor: topic === p.text ? 'var(--acc)' : undefined,
                    color: topic === p.text ? 'var(--acc)' : undefined,
                  }}
                >
                  {p.icon} {p.text}
                </button>
              ))}
            </div>
          )}
          <textarea
            className="w-full bg-[var(--panel2)] rounded-lg p-3 text-sm border border-[var(--line)] focus:border-[var(--acc)] outline-none resize-none"
            rows={2}
            placeholder="或自定义议题..."
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </div>

        {/* 功能特性标签 */}
        <div className="flex flex-wrap gap-1.5">
          {[
            '👑 皇帝发言', '⚡ 天命降临', '🎲 命运骰子',
            '🔄 自动推进', '📜 讨论记录',
          ].map((tag) => (
            <span key={tag} className="text-[10px] px-2 py-1 rounded-full border border-[var(--line)] text-[var(--muted)]">
              {tag}
            </span>
          ))}
        </div>

        {/* 开始按钮 */}
        <button
          onClick={handleStart}
          disabled={selectedIds.size < 2 || !topic.trim() || loading}
          className="w-full py-3 rounded-xl font-semibold text-sm transition-all border-0"
          style={{
            background:
              selectedIds.size >= 2 && topic.trim()
                ? 'linear-gradient(135deg, #6a9eff, #a07aff)'
                : 'var(--panel2)',
            color: selectedIds.size >= 2 && topic.trim() ? '#fff' : 'var(--muted)',
            opacity: loading ? 0.6 : 1,
            cursor: selectedIds.size >= 2 && topic.trim() && !loading ? 'pointer' : 'not-allowed',
          }}
        >
          {loading ? '召集中...' : `🏛 开始朝议（${selectedIds.size}位上殿）`}
        </button>
      </div>
    );
  }

  // ═══════════════════
  //   渲染：议政进行中
  // ═══════════════════

  const officials = session?.officials || [];
  const messages = session?.messages || [];

  return (
    <div className="space-y-3">
      {/* 顶部控制栏 */}
      <div className="flex items-center justify-between flex-wrap gap-2 bg-[var(--panel)] rounded-xl px-4 py-2 border border-[var(--line)]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">🏛 朝堂议政</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--acc)]20 text-[var(--acc)] border border-[var(--acc)]30">
            第{session?.round || 0}轮
          </span>
          {session?.phase === 'concluded' && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-800">
              已结束
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowDecree(!showDecree)}
            className="text-xs px-2.5 py-1 rounded-lg border border-amber-600/40 text-amber-400 hover:bg-amber-900/20 transition"
            title="天命降临 — 上帝视角干预"
          >
            ⚡ 天命
          </button>
          <button
            onClick={handleDice}
            disabled={diceRolling || loading}
            className="text-xs px-2.5 py-1 rounded-lg border border-purple-600/40 text-purple-400 hover:bg-purple-900/20 transition"
            title="命运骰子 — 随机事件"
          >
            🎲 {diceRolling ? '...' : '骰子'}
          </button>
          <button
            onClick={() => setAutoPlay(!autoPlay)}
            className={`text-xs px-2.5 py-1 rounded-lg border transition ${autoPlay
              ? 'border-green-600/40 text-green-400 bg-green-900/20'
              : 'border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]'
              }`}
          >
            {autoPlay ? '⏸ 暂停' : '▶ 自动'}
          </button>
          {session?.phase !== 'concluded' && (
            <button
              onClick={handleConclude}
              className="text-xs px-2.5 py-1 rounded-lg border border-[var(--line)] text-[var(--muted)] hover:text-[var(--warn)] hover:border-[var(--warn)]40 transition"
            >
              📋 散朝
            </button>
          )}
          <button
            onClick={handleReset}
            className="text-xs px-2 py-1 rounded-lg border border-red-900/40 text-red-400/70 hover:text-red-400 transition"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 天命降临面板 */}
      {showDecree && (
        <div
          className="bg-gradient-to-br from-amber-950/40 to-purple-950/30 rounded-xl p-4 border border-amber-700/30"
          style={{ animation: 'fadeIn .3s' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-amber-400">⚡ 天命降临 — 上帝视角</span>
            <button onClick={() => setShowDecree(false)} className="text-xs text-[var(--muted)]">
              ✕
            </button>
          </div>
          <p className="text-[10px] text-amber-300/60 mb-2">
            降下天意改变讨论走向，所有官员将对此做出反应
          </p>
          <div className="flex gap-2">
            <input
              value={decreeInput}
              onChange={(e) => setDecreeInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDecree()}
              placeholder="例如：突然发现预算多出一倍..."
              className="flex-1 bg-black/30 rounded-lg px-3 py-1.5 text-sm border border-amber-800/40 outline-none focus:border-amber-600"
            />
            <button
              onClick={handleDecree}
              disabled={!decreeInput.trim()}
              className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-amber-600 to-purple-600 text-white text-xs font-semibold disabled:opacity-40"
            >
              降旨
            </button>
          </div>
        </div>
      )}

      {/* 命运骰子结果 */}
      {diceResult && (
        <div
          className="bg-purple-950/40 rounded-lg px-3 py-2 border border-purple-700/30 text-xs text-purple-300 flex items-center gap-2"
          style={{ animation: 'fadeIn .3s' }}
        >
          <span className="text-lg">🎲</span>
          {diceResult}
        </div>
      )}

      {/* 天命降临闪光效果 */}
      {decreeFlash && (
        <div
          className="fixed inset-0 pointer-events-none z-50"
          style={{
            background: 'radial-gradient(circle, rgba(255,200,50,0.3), transparent 70%)',
            animation: 'fadeOut .8s forwards',
          }}
        />
      )}

      {/* 议题 */}
      <div className="text-xs text-center text-[var(--muted)] py-1">
        📜 {session?.topic || ''}
      </div>

      {/* 主内容：朝堂布局 + 聊天记录 */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-3">
        {/* 左侧：朝堂可视化 */}
        <div className="bg-[var(--panel)] rounded-xl p-3 border border-[var(--line)] relative overflow-hidden min-h-[320px]">
          {/* 龙椅 */}
          <div className="text-center mb-2">
            <div className="inline-block px-3 py-1 rounded-lg bg-gradient-to-b from-amber-800/40 to-amber-950/40 border border-amber-700/30">
              <span className="text-lg">👑</span>
              <div className="text-[10px] text-amber-400/80">龙 椅</div>
            </div>
          </div>

          {/* 官员站位 */}
          <div className="relative" style={{ minHeight: 250 }}>
            {/* 左列标签 */}
            <div className="absolute left-0 top-0 text-[9px] text-[var(--muted)] opacity-50">三省</div>
            <div className="absolute right-0 top-0 text-[9px] text-[var(--muted)] opacity-50">六部</div>

            {officials.map((o) => {
              const pos = COURT_POSITIONS[o.id] || { x: 50, y: 50 };
              const color = OFFICIAL_COLORS[o.id] || '#6a9eff';
              const isSpeaking = speakingId === o.id;
              const emotion = emotions[o.id] || 'neutral';

              return (
                <div
                  key={o.id}
                  className="absolute transition-all duration-500"
                  style={{
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  {/* 说话光圈 */}
                  {isSpeaking && (
                    <div
                      className="absolute -inset-2 rounded-full"
                      style={{
                        background: `radial-gradient(circle, ${color}40, transparent)`,
                        animation: 'pulse 1s infinite',
                      }}
                    />
                  )}
                  {/* 头像 */}
                  <div
                    className="relative w-10 h-10 rounded-full flex items-center justify-center text-lg border-2 transition-all"
                    style={{
                      borderColor: isSpeaking ? color : color + '40',
                      background: isSpeaking ? color + '30' : color + '10',
                      transform: isSpeaking ? 'scale(1.2)' : 'scale(1)',
                      boxShadow: isSpeaking ? `0 0 16px ${color}50` : 'none',
                    }}
                  >
                    {o.emoji}
                    {/* 情绪气泡 */}
                    {EMOTION_EMOJI[emotion] && (
                      <span
                        className="absolute -top-1 -right-1 text-xs"
                        style={{ animation: 'bounceIn .3s' }}
                      >
                        {EMOTION_EMOJI[emotion]}
                      </span>
                    )}
                  </div>
                  {/* 名字 */}
                  <div
                    className="text-[9px] text-center mt-0.5 whitespace-nowrap"
                    style={{ color: isSpeaking ? color : 'var(--muted)' }}
                  >
                    {o.name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 右侧：聊天记录 */}
        <div className="bg-[var(--panel)] rounded-xl border border-[var(--line)] flex flex-col" style={{ maxHeight: 500 }}>
          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ minHeight: 200 }}>
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} officials={officials} />
            ))}
            {loading && (
              <div className="text-xs text-[var(--muted)] text-center py-2" style={{ animation: 'pulse 1.5s infinite' }}>
                🏛 群臣正在思考...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 皇帝输入栏 */}
          {session?.phase !== 'concluded' && (
            <div className="border-t border-[var(--line)] p-2 flex gap-2">
              <input
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEmperor()}
                placeholder="朕有话说..."
                className="flex-1 bg-[var(--panel2)] rounded-lg px-3 py-1.5 text-sm border border-[var(--line)] outline-none focus:border-amber-600"
              />
              <button
                onClick={handleEmperor}
                disabled={!userInput.trim() || loading}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold border-0 disabled:opacity-40"
                style={{
                  background: userInput.trim() ? 'linear-gradient(135deg, #e8a040, #f5c842)' : 'var(--panel2)',
                  color: userInput.trim() ? '#000' : 'var(--muted)',
                }}
              >
                👑 发言
              </button>
              <button
                onClick={() => handleAdvance()}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg text-xs border border-[var(--acc)]40 text-[var(--acc)] hover:bg-[var(--acc)]10 disabled:opacity-40 transition"
              >
                ▶ 下一轮
              </button>
            </div>
          )}

          {/* 圣旨面板 — 议政结束后显示 */}
          {session?.phase === 'concluded' && session?.edict && (
            <EdictPanel session={session} toast={toast} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── 圣旨面板 ──
interface EdictPanelProps {
  session: CourtSession;
  toast: (msg: string, kind?: 'ok' | 'err') => void;
}

function EdictPanel({ session, toast }: EdictPanelProps) {
  const edict = session.edict!;
  const dispatching = useRef<Set<string>>(new Set());
  const [dispatched, setDispatched] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set(edict.todos.map((_, i) => i)));

  const allSelected = selected.size === edict.todos.length;
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(edict.todos.map((_, i) => i)));
  };
  const toggleOne = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const handleDispatchSelected = async () => {
    const toDispatch = edict.todos.filter((_, i) => selected.has(i) && !dispatched.has(`${edict.todos[i].dept}-${edict.todos[i].task}`));
    if (toDispatch.length === 0) return;
    let ok = 0;
    for (const todo of toDispatch) {
      const key = `${todo.dept}-${todo.task}`;
      dispatching.current.add(key);
      try {
        const res = await api.courtDiscussCreateTask(session.session_id, todo.dept, todo.task, todo.priority);
        if (res.ok) {
          setDispatched((prev) => new Set(prev).add(key));
          ok++;
        }
      } finally {
        dispatching.current.delete(key);
      }
    }
    if (ok > 0) toast(`圣旨已下发 ${ok} 项至六部执行`, 'ok');
  };

  const handleDispatchOne = async (todo: { dept: string; task: string; priority: string }, key: string, i: number) => {
    if (dispatching.current.has(key)) return;
    dispatching.current.add(key);
    try {
      const res = await api.courtDiscussCreateTask(session.session_id, todo.dept, todo.task, todo.priority);
      if (res.ok) {
        setDispatched((prev) => new Set(prev).add(key));
        toast(`圣旨已下发${todo.dept}执行`, 'ok');
      } else {
        toast(res.error || '下发失败', 'err');
      }
    } catch {
      toast('下发失败', 'err');
    } finally {
      dispatching.current.delete(key);
    }
  };

  const PRIORITY_COLOR: Record<string, string> = {
    high: '#ff5270',
    normal: '#f5c842',
    low: '#2ecc8a',
  };

  const pendingCount = edict.todos.filter((t, i) => !dispatched.has(`${t.dept}-${t.task}`)).length;

  return (
    <div className="bg-gradient-to-br from-amber-950/40 to-purple-950/30 rounded-xl p-5 border border-amber-700/30 space-y-4" style={{ animation: 'fadeIn .5s' }}>
      {/* 标题 */}
      <div className="flex items-center gap-3">
        <span className="text-2xl">📜</span>
        <div>
          <div className="text-sm font-bold text-amber-400">圣旨</div>
          <div className="text-xs text-amber-300/60">议政结论，可逐条或批量下发执行</div>
        </div>
      </div>

      {/* 核心结论 */}
      <div className="bg-black/20 rounded-lg p-3 border border-amber-800/30">
        <div className="text-[10px] text-amber-400/80 mb-1 font-semibold">📋 核心结论</div>
        <div className="text-sm leading-relaxed">{edict.summary}</div>
      </div>

      {/* 共识 */}
      {edict.consensus.length > 0 && (
        <div>
          <div className="text-[10px] text-green-400/80 mb-1.5 font-semibold uppercase tracking-wider">✓ 已达成共识</div>
          <div className="flex flex-col gap-1">
            {edict.consensus.map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-green-400 mt-0.5">✓</span>
                <span>{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 待决议题 */}
      {edict.pending.length > 0 && (
        <div>
          <div className="text-[10px] text-purple-400/80 mb-1.5 font-semibold uppercase tracking-wider">⏳ 待决议题</div>
          <div className="flex flex-col gap-1">
            {edict.pending.map((p, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-purple-400 mt-0.5">◆</span>
                <span className="text-purple-300/80">{p}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 待办事项 + 批量操作 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] text-[var(--acc)]/80 font-semibold uppercase tracking-wider">
            📌 待执行事项 ({pendingCount}/{edict.todos.length})
          </div>
          <div className="flex items-center gap-2">
            {/* 全选 */}
            <label className="flex items-center gap-1 text-[10px] text-[var(--muted)] cursor-pointer hover:text-[var(--text)]">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="accent-[var(--acc)]"
              />
              全选
            </label>
            {/* 批量下发 */}
            {pendingCount > 0 && (
              <button
                onClick={handleDispatchSelected}
                className="px-3 py-1 rounded-lg text-[10px] font-semibold border-0"
                style={{ background: 'linear-gradient(135deg, #6a9eff, #a07aff)', color: '#fff' }}
              >
                📮 批量下发（{selected.size}项）
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {edict.todos.map((todo, i) => {
            const key = `${todo.dept}-${todo.task}`;
            const isDone = dispatched.has(key);
            const isSelected = selected.has(i);
            const color = PRIORITY_COLOR[todo.priority] || '#6a9eff';
            return (
              <div
                key={i}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${isDone ? 'opacity-50' : ''}`}
                style={{
                  background: isDone ? 'rgba(46,204,138,0.1)' : isSelected ? 'rgba(106,158,255,0.08)' : 'rgba(0,0,0,0.15)',
                  borderColor: isDone ? '#2ecc8a44' : isSelected ? color + '55' : color + '22',
                }}
              >
                {/* 勾选 */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleOne(i)}
                  disabled={isDone}
                  className="accent-[var(--acc)] mt-1 flex-shrink-0"
                  style={{ width: 14, height: 14 }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                      style={{ background: color + '22', color, border: `1px solid ${color}44` }}
                    >
                      {todo.dept}
                    </span>
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded"
                      style={{ background: color + '15', color: color + 'bb' }}
                    >
                      {todo.priority === 'high' ? '高优' : todo.priority === 'normal' ? '中优' : '低优'}
                    </span>
                    {isDone && <span className="text-[10px] text-green-400">✓ 已下发</span>}
                  </div>
                  <div className="text-sm leading-relaxed">{todo.task}</div>
                </div>
                {!isDone && (
                  <button
                    onClick={() => handleDispatchOne(todo, key, i)}
                    className="px-3 py-1 rounded-lg text-xs font-semibold border-0 flex-shrink-0 transition-all"
                    style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)`, color: '#fff' }}
                  >
                    📮
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── 消息气泡 ──

function MessageBubble({
  msg,
  officials,
}: {
  msg: CourtMessage;
  officials: Array<{ id: string; name: string; emoji: string }>;
}) {
  const color = OFFICIAL_COLORS[msg.official_id || ''] || '#6a9eff';
  const official = officials.find((o) => o.id === msg.official_id);

  if (msg.type === 'system') {
    return (
      <div className="text-center text-[10px] text-[var(--muted)] py-1 border-b border-[var(--line)] border-dashed">
        {msg.content}
      </div>
    );
  }

  if (msg.type === 'scene_note') {
    return (
      <div className="text-center text-[10px] text-purple-400/80 py-1 italic">
        ✦ {msg.content} ✦
      </div>
    );
  }

  if (msg.type === 'emperor') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-gradient-to-br from-amber-900/40 to-amber-800/20 rounded-xl px-3 py-2 border border-amber-700/30">
          <div className="text-[10px] text-amber-400 mb-0.5">👑 皇帝</div>
          <div className="text-sm">{msg.content}</div>
        </div>
      </div>
    );
  }

  if (msg.type === 'decree') {
    return (
      <div className="text-center py-2">
        <div className="inline-block bg-gradient-to-r from-amber-900/30 via-purple-900/30 to-amber-900/30 rounded-lg px-4 py-2 border border-amber-600/30">
          <div className="text-xs text-amber-400 font-bold">⚡ 天命降临</div>
          <div className="text-sm mt-0.5">{msg.content}</div>
        </div>
      </div>
    );
  }

  // 官员消息
  return (
    <div className="flex gap-2 items-start" style={{ animation: 'fadeIn .4s' }}>
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 border"
        style={{ borderColor: color + '60', background: color + '15' }}
      >
        {official?.emoji || '💬'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[11px] font-semibold" style={{ color }}>
            {msg.official_name || '官员'}
          </span>
          {msg.emotion && EMOTION_EMOJI[msg.emotion] && (
            <span className="text-xs">{EMOTION_EMOJI[msg.emotion]}</span>
          )}
        </div>
        <div className="text-sm leading-relaxed">
          {msg.content?.split(/(\*[^*]+\*)/).map((part, i) => {
            if (part.startsWith('*') && part.endsWith('*')) {
              return (
                <span key={i} className="text-[var(--muted)] italic text-xs">
                  {part.slice(1, -1)}
                </span>
              );
            }
            return <span key={i}>{part}</span>;
          })}
        </div>
      </div>
    </div>
  );
}
