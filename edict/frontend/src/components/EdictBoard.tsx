import { useState } from 'react';
import { useStore, isEdict, isArchived, getPipeStatus, stateLabel, deptColor, PIPE } from '../store';
import { api, type Task } from '../api';

// 排序权重
const STATE_ORDER: Record<string, number> = {
  Doing: 0, Review: 1, Assigned: 2, Menxia: 3, Zhongshu: 4,
  Taizi: 5, Inbox: 6, Blocked: 7, Next: 8, Done: 9, Cancelled: 10,
};

function MiniPipe({ task }: { task: Task }) {
  const stages = getPipeStatus(task);
  return (
    <div className="ec-pipe">
      {stages.map((s, i) => (
        <span key={s.key} style={{ display: 'contents' }}>
          <div className={`ep-node ${s.status}`}>
            <div className="ep-icon">{s.icon}</div>
            <div className="ep-name">{s.dept}</div>
          </div>
          {i < stages.length - 1 && <div className="ep-arrow">›</div>}
        </span>
      ))}
    </div>
  );
}

function EdictCard({ task }: { task: Task }) {
  const setModalTaskId = useStore((s) => s.setModalTaskId);
  const toast = useStore((s) => s.toast);
  const loadAll = useStore((s) => s.loadAll);
  const [showPath, setShowPath] = useState(false);

  const hb = task.heartbeat || { status: 'unknown', label: '⚪' };
  const stCls = 'st-' + (task.state || '');
  const deptCls = 'dt-' + (task.org || '').replace(/\s/g, '');
  const curStage = PIPE.find((_, i) => getPipeStatus(task)[i].status === 'active');
  const todos = task.todos || [];
  const todoDone = todos.filter((x) => x.status === 'completed').length;
  const todoTotal = todos.length;
  const canStop = !['Done', 'Blocked', 'Cancelled'].includes(task.state);
  const canResume = ['Blocked', 'Cancelled'].includes(task.state);
  const archived = isArchived(task);
  const isBlocked = task.block && task.block !== '无' && task.block !== '-';

  // 计算输出文件路径
  const outputPath = (() => {
    const repoBase = '/Users/pro/projects/edict';
    const raw = task as unknown as Record<string, unknown>;
    const planSid = raw.planSessionId as string | undefined;
    const planGoal = raw.planGoal as string | undefined;
    const dept = task.org || '执行部门';
    if (task.output && task.output !== '-' && !task.output.startsWith('--')) {
      const p = task.output;
      if (p.startsWith('/') && !p.startsWith('/Users')) {
        return p; // 系统路径
      }
      if (p.startsWith('/Users')) {
        return p; // 用户 workspace 路径
      }
    }
    if (planSid && planGoal) {
      const safe = (planGoal.replace(/^step-\d+:\s*/, '').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_').slice(0, 50).replace(/^_+|_+$/g, '') || planSid.slice(0, 12));
      return `${repoBase}/data/outputs/${safe}/${dept}/${task.id}_${dept}.md`;
    }
    return null;
  })();

  const handleAction = async (action: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (action === 'stop' || action === 'cancel') {
      // Use confirm dialog via store (will implement with ConfirmDialog)
      const reason = prompt(action === 'stop' ? '请输入叫停原因：' : '请输入取消原因：');
      if (reason === null) return;
      try {
        const r = await api.taskAction(task.id, action, reason);
        if (r.ok) { toast(r.message || '操作成功'); loadAll(); }
        else { toast(r.error || '操作失败', 'err'); }
      } catch { toast('服务器连接失败', 'err'); }
    } else if (action === 'resume') {
      try {
        const r = await api.taskAction(task.id, 'resume', '恢复执行');
        if (r.ok) { toast(r.message || '已恢复'); loadAll(); }
        else { toast(r.error || '操作失败', 'err'); }
      } catch { toast('服务器连接失败', 'err'); }
    }
  };

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const r = await api.archiveTask(task.id, !task.archived);
      if (r.ok) { toast(r.message || '操作成功'); loadAll(); }
      else toast(r.error || '操作失败', 'err');
    } catch { toast('服务器连接失败', 'err'); }
  };

  return (
    <div
      className={`edict-card${archived ? ' archived' : ''}`}
      onClick={() => setModalTaskId(task.id)}
    >
      <MiniPipe task={task} />
      <div className="ec-id">{task.id}</div>
      <div className="ec-title">{task.title || '(无标题)'}</div>
      <div className="ec-meta">
        <span className={`tag ${stCls}`}>{stateLabel(task)}</span>
        {task.org && <span className={`tag ${deptCls}`}>{task.org}</span>}
        {curStage && (
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            当前: <b style={{ color: deptColor(curStage.dept) }}>{curStage.dept} · {curStage.action}</b>
          </span>
        )}
      </div>
      {task.now && task.now !== '-' && (
        <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 6 }}>
          {task.now.substring(0, 80)}
        </div>
      )}
      {(task.review_round || 0) > 0 && (
        <div style={{ fontSize: 11, marginBottom: 6 }}>
          {Array.from({ length: task.review_round || 0 }, (_, i) => (
            <span
              key={i}
              style={{
                display: 'inline-block', width: 14, height: 14, borderRadius: '50%',
                background: i < (task.review_round || 0) - 1 ? '#1a3a6a22' : 'var(--acc)22',
                border: `1px solid ${i < (task.review_round || 0) - 1 ? '#2a4a8a' : 'var(--acc)'}`,
                fontSize: 9, textAlign: 'center', lineHeight: '13px', marginRight: 2,
                color: i < (task.review_round || 0) - 1 ? '#4a6aaa' : 'var(--acc)',
              }}
            >
              {i + 1}
            </span>
          ))}
          <span style={{ color: 'var(--muted)', fontSize: 10 }}>第 {task.review_round} 轮磋商</span>
        </div>
      )}
      {todoTotal > 0 && !['Done', 'Cancelled'].includes(task.state) && (
        <div className="ec-todo-bar">
          <span>📋 {todoDone}/{todoTotal}</span>
          <div className="ec-todo-track">
            <div className="ec-todo-fill" style={{ width: `${Math.round((todoDone / todoTotal) * 100)}%` }} />
          </div>
          <span>{todoDone === todoTotal ? '✅ 全部完成' : '🔄 进行中'}</span>
        </div>
      )}
      <div className="ec-footer">
        <span className={`hb ${hb.status}`}>{hb.label}</span>
        {isBlocked && (
          <span className="tag" style={{ borderColor: '#ff527044', color: 'var(--danger)', background: '#200a10' }}>
            🚫 {task.block}
          </span>
        )}
        {task.eta && task.eta !== '-' && (
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>📅 {task.eta}</span>
        )}
      </div>
      {task.state === 'Done' && outputPath && (
        <div style={{ fontSize: 10, padding: '2px 8px 4px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
          {showPath ? (
            <>
              <span style={{ color: 'var(--muted)', wordBreak: 'break-all', flex: 1, fontFamily: 'monospace' }}>{outputPath}</span>
              <button
                className="mini-act"
                style={{ fontSize: 10, padding: '1px 6px' }}
                onClick={(e) => { e.stopPropagation(); setShowPath(false); }}
              >收起</button>
            </>
          ) : (
            <button
              className="mini-act"
              style={{ fontSize: 10, padding: '1px 6px' }}
              onClick={(e) => { e.stopPropagation(); setShowPath(true); }}
              title={outputPath}
            >📁 查看输出</button>
          )}
        </div>
      )}
      <div className="ec-actions" onClick={(e) => e.stopPropagation()}>
        {canStop && (
          <>
            <button className="mini-act" onClick={(e) => handleAction('stop', e)}>⏸ 叫停</button>
            <button className="mini-act danger" onClick={(e) => handleAction('cancel', e)}>🚫 取消</button>
          </>
        )}
        {canResume && (
          <button className="mini-act" onClick={(e) => handleAction('resume', e)}>▶ 恢复</button>
        )}
        {archived && !task.archived && (
          <button className="mini-act" onClick={handleArchive}>📦 归档</button>
        )}
        {task.archived && (
          <button className="mini-act" onClick={handleArchive}>📤 取消归档</button>
        )}
      </div>
    </div>
  );
}

export default function EdictBoard() {
  const liveStatus = useStore((s) => s.liveStatus);
  const edictFilter = useStore((s) => s.edictFilter);
  const setEdictFilter = useStore((s) => s.setEdictFilter);
  const toast = useStore((s) => s.toast);
  const loadAll = useStore((s) => s.loadAll);

  const tasks = liveStatus?.tasks || [];
  const allEdicts = tasks.filter(isEdict);
  const activeEdicts = allEdicts.filter((t) => !isArchived(t));
  const archivedEdicts = allEdicts.filter((t) => isArchived(t));

  let edicts: Task[];
  if (edictFilter === 'active') edicts = activeEdicts;
  else if (edictFilter === 'archived') edicts = archivedEdicts;
  else edicts = allEdicts;

  edicts.sort((a, b) => (STATE_ORDER[a.state] ?? 9) - (STATE_ORDER[b.state] ?? 9));

  const unArchivedDone = allEdicts.filter((t) => !t.archived && ['Done', 'Cancelled'].includes(t.state));

  const handleArchiveAll = async () => {
    if (!confirm('将所有已完成/已取消的旨意移入归档？')) return;
    try {
      const r = await api.archiveAllDone();
      if (r.ok) { toast(`📦 ${r.count || 0} 道旨意已归档`); loadAll(); }
      else toast(r.error || '批量归档失败', 'err');
    } catch { toast('服务器连接失败', 'err'); }
  };

  const handleScan = async () => {
    try {
      const r = await api.schedulerScan();
      if (r.ok) toast(`🧭 太子巡检完成：${r.count || 0} 个动作`);
      else toast(r.error || '巡检失败', 'err');
      loadAll();
    } catch { toast('服务器连接失败', 'err'); }
  };

  const handleBatchResume = async () => {
    try {
      const r = await api.batchResumeBlocked();
      if (r.ok && r.count > 0) { toast(`⏭️ 已解除 ${r.count} 项阻塞`); loadAll(); }
      else if (!r.ok) toast('操作失败', 'err');
      else if (r.count === 0) toast('没有需要解除的阻塞项');
    } catch (e: unknown) { toast(`服务器错误: ${e instanceof Error ? e.message : String(e)}`, 'err'); }
  };

  const handleBatchHealthCheck = async () => {
    try {
      const r = await api.batchHealthCheck();
      if (!r.ok) { toast(r.error || '状态更新失败', 'err'); return; }
      const agents = r.activeAgents.join('、') || '无';
      if (r.fixedCount > 0) {
        toast(`🔄 已修复 ${r.fixedCount} 项异常，活跃Agent：${agents}`);
      } else {
        toast(`✅ 检查完成，活跃Agent：${agents}，无异常`);
      }
      loadAll();
    } catch (e: unknown) { toast(`服务器错误: ${e instanceof Error ? e.message : String(e)}`, 'err'); }
  };

  const handleCancelGroup = async (sid: string, groupTasks: Task[]) => {
    const cancellable = groupTasks.filter((t) => !['Done', 'Cancelled'].includes(t.state));
    if (cancellable.length === 0) { toast('无可取消的任务', 'err'); return; }
    const reason = prompt(`取消协作任务组 "${sid}" 的 ${cancellable.length} 项任务\n请输入取消原因：`);
    if (reason === null) return;
    let ok = 0, fail = 0;
    for (const t of cancellable) {
      try {
        const r = await api.taskAction(t.id, 'cancel', reason);
        if (r.ok) ok++; else fail++;
      } catch { fail++; }
    }
    if (fail === 0) toast(`🚫 已取消 ${ok} 项任务`);
    else toast(`✅ 取消成功 ${ok} 项，失败 ${fail} 项`, 'err');
    loadAll();
  };

  return (
    <div>
      {/* Archive Bar */}
      <div className="archive-bar">
        <span className="ab-label">筛选:</span>
        {(['active', 'archived', 'all'] as const).map((f) => (
          <button
            key={f}
            className={`ab-btn ${edictFilter === f ? 'active' : ''}`}
            onClick={() => setEdictFilter(f)}
          >
            {f === 'active' ? '活跃' : f === 'archived' ? '归档' : '全部'}
          </button>
        ))}
        {unArchivedDone.length > 0 && (
          <button className="ab-btn" onClick={handleArchiveAll}>📦 一键归档</button>
        )}
        <button className="ab-btn" onClick={handleBatchHealthCheck}>🔄 一键更新状态</button>
        <button className="ab-btn" onClick={handleBatchResume}>⏭️ 解除阻塞</button>
        <span className="ab-count">
          活跃 {activeEdicts.length} · 归档 {archivedEdicts.length} · 共 {allEdicts.length}
        </span>
        <button className="ab-scan" onClick={handleScan}>🧭 太子巡检</button>
      </div>

      {/* Grid — 按 planSessionId / courtSessionId 分组 */}
      <div className="edict-grid">
        {edicts.length === 0 ? (
          <div className="empty" style={{ gridColumn: '1/-1' }}>
            暂无旨意<br />
            <small style={{ fontSize: 11, marginTop: 6, display: 'block', color: 'var(--muted)' }}>
              通过飞书向太子发送任务，太子分拣后转中书省处理
            </small>
          </div>
        ) : (
          <>
            {(() => {
              const planGrouped = new Map<string, typeof edicts>();
              const courtGrouped = new Map<string, typeof edicts>();
              const standalone: typeof edicts = [];
              for (const t of edicts) {
                const raw = t as unknown as Record<string, unknown>;
                const planSid = raw.planSessionId as string | undefined;
                const courtSid = raw.courtSessionId as string | undefined;
                if (planSid) {
                  if (!planGrouped.has(planSid)) planGrouped.set(planSid, []);
                  planGrouped.get(planSid)!.push(t);
                } else if (courtSid) {
                  if (!courtGrouped.has(courtSid)) courtGrouped.set(courtSid, []);
                  courtGrouped.get(courtSid)!.push(t);
                } else {
                  standalone.push(t);
                }
              }
              const rows: React.ReactNode[] = [];

              // 任务规划组
              for (const [sid, groupTasks] of planGrouped) {
                const raw0 = groupTasks[0] as unknown as Record<string, unknown>;
                const goal = raw0.title as string | undefined;
                const done = groupTasks.filter((t) => t.state === 'Done').length;
                rows.push(
                  <div key={`plan-${sid}`} style={{ gridColumn: '1/-1' }}>
                    <div className="flex items-center gap-2 mb-1 px-1">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#2ecc8a22] text-[#2ecc8a] border border-[#2ecc8a44] font-semibold">
                        📋 任务规划组（{done}/{groupTasks.length}完成）
                      </span>
                      {goal && (
                        <span className="text-[10px] text-[#2ecc8a66] truncate max-w-[300px]">
                          {goal.slice(0, 60)}
                        </span>
                      )}
                      <button
                        className="text-[10px] px-2 py-0.5 rounded bg-red-900/40 text-red-300 border border-red-700/40 ml-auto cursor-pointer"
                        onClick={() => handleCancelGroup(sid, groupTasks)}
                      >
                        🚫 取消全组
                      </button>
                    </div>
                    <div className="edict-grid" style={{ gap: '10px' }}>
                      {groupTasks.map((t) => (
                        <EdictCard key={t.id} task={t} />
                      ))}
                    </div>
                  </div>
                );
              }

              // 协作任务组（来自朝堂议政）
              for (const [sid, groupTasks] of courtGrouped) {
                const topic = (groupTasks[0] as unknown as Record<string, unknown>).courtSessionTopic as string | undefined;
                rows.push(
                  <div key={`court-${sid}`} style={{ gridColumn: '1/-1' }}>
                    <div className="flex items-center gap-2 mb-1 px-1">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-900/50 text-purple-300 border border-purple-700/40 font-semibold">
                        🔗 协作任务组（{groupTasks.length}项）
                      </span>
                      {topic && (
                        <span className="text-[10px] text-purple-400/70 truncate max-w-[300px]">
                          📜 {topic}
                        </span>
                      )}
                      <button
                        className="text-[10px] px-2 py-0.5 rounded bg-red-900/40 text-red-300 border border-red-700/40 ml-auto cursor-pointer"
                        onClick={() => handleCancelGroup(sid, groupTasks)}
                      >
                        🚫 取消全组
                      </button>
                    </div>
                    <div className="edict-grid" style={{ gap: '10px' }}>
                      {groupTasks.map((t) => (
                        <EdictCard key={t.id} task={t} />
                      ))}
                    </div>
                  </div>
                );
              }

              // 独立任务
              for (const t of standalone) {
                rows.push(<EdictCard key={t.id} task={t} />);
              }
              return rows;
            })()}
          </>
        )}
      </div>
    </div>
  );
}
