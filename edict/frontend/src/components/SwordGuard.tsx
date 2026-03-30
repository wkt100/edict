/**
 * 刀侍卫 — 浮动对话助手
 *
 * 通过 Edict Dashboard HTTP API 发送消息到 OpenClaw 主会话。
 * 响应会在 OpenClaw 主界面（openclaw-tui/webchat）中显示。
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store';

interface GuardMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  status: 'sent' | 'error';
}

export default function SwordGuard({ className }: { className?: string }) {
  const toast = useStore((s) => s.toast);

  // ── 位置 & 隐藏状态 ──
  const [pos, setPos] = useState(() => {
    const s = localStorage.getItem('swordGuardPos');
    return s ? JSON.parse(s) : { x: window.innerWidth - 80, y: Math.round(window.innerHeight * 0.4) };
  });
  const dragging = useRef(false);
  const dragOff = useRef({ x: 0, y: 0 });

  // ── 面板 & 消息状态 ──
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<GuardMessage[]>([]);
  const [hovered, setHovered] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── 贴边隐藏 ──
  const applyHide = useCallback((x: number, y: number) => {
    const THRESH = 60;
    const newX = x < THRESH ? -45 : x > window.innerWidth - THRESH ? window.innerWidth - 45 : x;
    const final = { x: newX, y: Math.max(60, Math.min(y, window.innerHeight - 120)) };
    setPos(final);
    localStorage.setItem('swordGuardPos', JSON.stringify(final));
  }, []);

  // ── 拖动 ──
  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    dragOff.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  };
  const onTouchStart = (e: React.TouchEvent) => {
    dragging.current = true;
    dragOff.current = { x: e.touches[0].clientX - pos.x, y: e.touches[0].clientY - pos.y };
  };
  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging.current) return;
      const cx = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const cy = 'touches' in e ? e.touches[0].clientY : e.clientY;
      setPos({ x: cx - dragOff.current.x, y: cy - dragOff.current.y });
    };
    const onUp = () => { if (dragging.current) { dragging.current = false; applyHide(pos.x, pos.y); } };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [pos, applyHide]);

  // ── 发送消息 ──
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);

    const msgId = `user-${Date.now()}`;
    setMessages(prev => [
      ...prev,
      { id: msgId, role: 'user', content: text, timestamp: Date.now(), status: 'sent' },
    ]);

    try {
      const res = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionKey: 'agent:main:main' }),
      });
      const data = await res.json() as { ok: boolean; error?: string; runId?: string };
      if (!data.ok) {
        toast('发送失败: ' + (data.error || '未知错误'), 'err');
        setMessages(prev => prev.filter(m => m.id !== msgId));
      } else {
        toast('消息已发送，请在主界面查看回复', 'ok');
      }
    } catch (e) {
      toast('网络错误: ' + String(e), 'err');
      setMessages(prev => prev.filter(m => m.id !== msgId));
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [input, sending, toast]);

  // ── 自动滚动 ──
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── 贴边逻辑 ──
  const isLeft = pos.x < window.innerWidth / 2;
  const handleMouseEnter = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setHovered(true);
    if (pos.x < 0 || pos.x > window.innerWidth - 60) {
      setPos((p: {x:number,y:number}) => ({ ...p, x: p.x < 0 ? 0 : window.innerWidth - 80 }));
    }
  };
  const handleMouseLeave = () => {
    setHovered(false);
    hideTimer.current = setTimeout(() => applyHide(pos.x, pos.y), 800);
  };

  // ── 头像 ──
  const avatar = (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'fixed', left: pos.x, top: pos.y, zIndex: 9999,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        cursor: dragging.current ? 'grabbing' : 'grab', userSelect: 'none',
        transition: dragging.current ? 'none' : 'left 0.3s ease, top 0.3s ease',
      }}
    >
      <div
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onClick={() => { setOpen(o => !o); if (!open) applyHide(pos.x, pos.y); }}
        style={{
          width: 52, height: 52, borderRadius: '50%',
          background: 'linear-gradient(135deg, #6a9eff, #a07aff)',
          boxShadow: '0 4px 20px rgba(106,158,255,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, border: '2px solid rgba(255,255,255,.15)', flexShrink: 0,
        }}
        title="🗡️ 刀侍卫"
      >
        🗡️
      </div>

      {/* 贴边指示条 */}
      {(pos.x < 0 || pos.x > window.innerWidth - 60) && !hovered && (
        <div style={{
          position: 'absolute', top: '50%', transform: 'translateY(-50%)',
          [isLeft ? 'right' : 'left']: -4,
          width: 8, height: 32,
          background: 'linear-gradient(135deg, #6a9eff, #a07aff)', borderRadius: 4,
        }} />
      )}
    </div>
  );

  if (!open) return avatar;

  return (
    <>
      {avatar}
      <div style={{
        position: 'fixed',
        [isLeft ? 'left' : 'right']: pos.x < window.innerWidth / 2 ? 70 : undefined,
        [isLeft ? 'right' : 'left']: pos.x >= window.innerWidth / 2 ? 70 : undefined,
        bottom: 20, width: 360, height: 520,
        background: 'var(--panel)', border: '1px solid var(--line)',
        borderRadius: 'var(--modal-radius, 16px)',
        boxShadow: '0 8px 40px rgba(0,0,0,.5)',
        display: 'flex', flexDirection: 'column', zIndex: 9998, overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 14px', borderBottom: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--panel2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>🗡️</span>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>刀侍卫</span>
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 999,
              background: 'rgba(46,204,138,.15)',
              color: 'var(--ok)',
            }}>
              就绪
            </span>
          </div>
          <button onClick={() => { setOpen(false); applyHide(pos.x, pos.y); }} style={{
            fontSize: 16, padding: '2px 8px', borderRadius: 6,
            background: 'transparent', color: 'var(--muted)',
            border: '1px solid var(--line)', cursor: 'pointer', lineHeight: 1,
          }}>×</button>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '12px 14px',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, marginTop: 40 }}>
              发送指令至 OpenClaw 主会话
              <br /><br />
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                回复将在 openclaw-tui / 飞书 / webchat 中显示
              </span>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} style={{
              display: 'flex', flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              <div style={{
                maxWidth: '80%',
                padding: '8px 12px',
                borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                background: msg.role === 'user' ? 'var(--acc)' : 'var(--panel2)',
                color: msg.role === 'user' ? '#fff' : 'var(--text)',
                fontSize: 13, lineHeight: 1.5,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                border: msg.role === 'assistant' ? '1px solid var(--line)' : 'none',
              }}>
                {msg.content}
                {msg.role === 'user' && msg.status === 'sent' && (
                  <span style={{ marginLeft: 6, opacity: 0.6, fontSize: 11 }}>✓</span>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: '10px 14px', borderTop: '1px solid var(--line)', display: 'flex', gap: 8,
        }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="输入指令，回车发送…"
            disabled={sending}
            autoFocus
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 10,
              background: 'var(--input-bg)', border: '1px solid var(--input-border)',
              color: 'var(--text)', fontSize: 13, outline: 'none',
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            style={{
              padding: '8px 14px', borderRadius: 10,
              background: input.trim() && !sending ? 'var(--acc)' : 'var(--muted)',
              color: '#fff', border: 'none',
              cursor: input.trim() && !sending ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 600,
            }}
          >
            {sending ? '…' : '发送'}
          </button>
        </div>
      </div>
    </>
  );
}
