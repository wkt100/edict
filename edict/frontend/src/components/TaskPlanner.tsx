/**
 * 任务规划器 — 输入目标，LLM 分解，确认后批量派发，支持历史跟踪
 */

import { useState, useEffect, useCallback } from 'react';
import { useStore, DEPTS } from '../store';
import { api } from '../api';

type PlanTask = {
  id: string;
  task: string;
  dept: string;
  priority: 'high' | 'normal' | 'low';
  dependencies: string[];
  taskId?: string;  // 创建后填充的任务ID
  state?: string;   // Done/Blocked/Taizi 等
};

type PlanRecord = {
  planSessionId: string;
  goal: string;
  summary: string;
  tasks: PlanTask[];
  dispatchedAt: string;
};

const PLAN_HISTORY_KEY = 'task_planner_history';

function genPlanSessionId() {
  return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function loadHistory(): PlanRecord[] {
  try {
    return JSON.parse(localStorage.getItem(PLAN_HISTORY_KEY) || '[]');
  } catch { return []; }
}

function saveHistory(records: PlanRecord[]) {
  try {
    localStorage.setItem(PLAN_HISTORY_KEY, JSON.stringify(records.slice(0, 20)));
  } catch {}
}

export default function TaskPlanner() {
  const toast = useStore((s) => s.toast);
  const liveStatus = useStore((s) => s.liveStatus);
  const tasks = liveStatus?.tasks ?? [];
  const loadAll = useStore((s) => s.loadAll);

  const [goal, setGoal] = useState('');
  const [granularity, setGranularity] = useState<'coarse' | 'fine'>('coarse');
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<{ summary: string; tasks: PlanTask[]; planSessionId: string } | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [history, setHistory] = useState<PlanRecord[]>(() => loadHistory());
  const [showHistory, setShowHistory] = useState(false);

  // 更新历史记录中各任务的状态
  const getHistoryWithStates = useCallback((records: PlanRecord[]) => {
    return records.map((rec) => ({
      ...rec,
      tasks: rec.tasks.map((t) => {
        if (!t.taskId) return t;
        const liveTask = tasks.find((lt: typeof tasks[number]) => lt.id === t.taskId);
        return { ...t, state: liveTask?.state || t.state };
      }),
    }));
  }, [tasks]);

  const handlePlan = async () => {
    if (!goal.trim()) { toast('请输入目标', 'err'); return; }
    setLoading(true);
    setPlan(null);
    try {
      const r = await api.planTask(goal.trim(), granularity);
      if (r.ok) {
        const planSessionId = genPlanSessionId();
        setPlan({ summary: r.summary, tasks: r.tasks as PlanTask[], planSessionId });
      } else {
        toast(r.error || '规划失败', 'err');
      }
    } catch (e: unknown) {
      toast(`服务器错误: ${e instanceof Error ? e.message : String(e)}`, 'err');
    } finally {
      setLoading(false);
    }
  };

  const updateTask = (idx: number, field: keyof PlanTask, value: string) => {
    if (!plan) return;
    const tasks = [...plan.tasks];
    tasks[idx] = { ...tasks[idx], [field]: value };
    setPlan({ ...plan, tasks });
  };

  const deleteTask = (idx: number) => {
    if (!plan) return;
    const tasks = plan.tasks.filter((_, i) => i !== idx);
    setPlan({ ...plan, tasks });
  };

  const handleDispatch = async () => {
    if (!plan || plan.tasks.length === 0) return;
    setDispatching(true);
    let ok = 0, fail = 0;
    const newTasks: PlanTask[] = [];
    for (const t of plan.tasks) {
      try {
        const r = await api.courtDiscussCreateTask(
          'planner',
          t.dept,
          t.task,
          t.priority,
          plan.planSessionId,
        );
        if (r.ok) {
          ok++;
          newTasks.push({ ...t, taskId: r.taskId as string });
        } else {
          fail++;
          newTasks.push({ ...t });
        }
      } catch { fail++; newTasks.push({ ...t }); }
    }
    setDispatching(false);

    if (ok > 0) {
      // 保存到历史
      const record: PlanRecord = {
        planSessionId: plan.planSessionId,
        goal: goal.trim(),
        summary: plan.summary,
        tasks: newTasks,
        dispatchedAt: new Date().toLocaleString('zh-CN'),
      };
      const updated = [record, ...history].slice(0, 20);
      setHistory(updated);
      saveHistory(updated);
      setPlan(null);
      setGoal('');
      toast(`✅ 已派发 ${ok} 项任务至六部`);
      loadAll();
    }
    if (fail > 0) {
      toast(`成功 ${ok} 项，失败 ${fail} 项`, 'err');
    }
  };

  const PRIORITY_OPTIONS = ['high', 'normal', 'low'];
  const DEPT_OPTIONS = DEPTS.map((d) => d.id);

  const historyWithStates = getHistoryWithStates(history);

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="text-lg font-bold">📋 任务规划</div>
        <button
          className="chip"
          onClick={() => { setShowHistory(!showHistory); loadAll(); }}
        >
          {showHistory ? '← 返回规划' : `📜 历史记录 (${history.length})`}
        </button>
      </div>

      {showHistory ? (
        /* 历史记录 */
        <div className="space-y-3">
          {historyWithStates.length === 0 && (
            <div className="text-sm text-[#6a9eff44] text-center py-8">暂无历史记录</div>
          )}
          {historyWithStates.map((rec) => {
            const done = rec.tasks.filter((t) => t.state === 'Done').length;
            const total = rec.tasks.length;
            const allDone = total > 0 && done === total;
            return (
              <div key={rec.planSessionId} className={`rounded border p-4 ${allDone ? 'border-[#2ecc8a33] bg-[#2ecc8a0a]' : 'border-[#6a9eff33] bg-[#6a9eff0a]'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-sm">{rec.goal}</div>
                  <div className="text-xs text-[#6a9eff88]">{rec.dispatchedAt}</div>
                </div>
                {rec.summary && (
                  <div className="text-xs text-[#6a9eff66] mb-2 italic">{rec.summary}</div>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <div className={`text-xs font-bold ${allDone ? 'text-[#2ecc8a]' : 'text-[#6a9eff]'}`}>
                    {done}/{total} 项完成
                  </div>
                  <div className="flex-1 h-1 bg-[#1a1a2e] rounded overflow-hidden">
                    <div
                      className="h-full bg-[#2ecc8a] transition-all"
                      style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  {rec.tasks.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className={`w-2 h-2 rounded-full ${t.state === 'Done' ? 'bg-[#2ecc8a]' : 'bg-[#6a9eff44]'}`} />
                      <span className={t.state === 'Done' ? 'text-[#2ecc8a88] line-through' : 'text-[#6a9eff88]'}>
                        {t.task.slice(0, 40)}{t.task.length > 40 ? '…' : ''}
                      </span>
                      <span className="text-[#6a9eff44] ml-auto">{t.dept}</span>
                      <span className={
                        t.state === 'Done' ? 'text-[#2ecc8a66]' :
                        t.state === 'Blocked' ? 'text-[#ff527066]' :
                        'text-[#f5c84266]'
                      }>
                        {t.state || '待派发'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          {/* 输入区 */}
          <div className="rounded border border-[#6a9eff44] bg-[#6a9eff11] p-4 mb-4">
            <div className="mb-3">
              <label className="block text-sm text-[#6a9eff88] mb-1">目标描述</label>
              <textarea
                className="w-full bg-[#0a0a1a] border border-[#6a9eff44] rounded p-2 text-sm resize-none focus:outline-none focus:border-[#6a9eff88]"
                rows={3}
                placeholder="例如：分析竞品A和竞品B"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handlePlan();
                }}
              />
            </div>
            <div className="flex items-center gap-3">
              <div>
                <span className="text-sm text-[#6a9eff88] mr-2">分解粒度：</span>
                <button
                  className={`chip mr-1 ${granularity === 'coarse' ? 'active' : ''}`}
                  onClick={() => setGranularity('coarse')}
                >
                  粗粒度（3-5步）
                </button>
                <button
                  className={`chip ${granularity === 'fine' ? 'active' : ''}`}
                  onClick={() => setGranularity('fine')}
                >
                  细粒度（6-10步）
                </button>
              </div>
              <button
                className="chip primary"
                onClick={handlePlan}
                disabled={loading}
              >
                {loading ? '🤔 规划中…' : '🚀 开始规划'}
              </button>
            </div>
            <div className="text-xs text-[#6a9eff44] mt-2">按 Ctrl/Cmd+Enter 快速规划</div>
          </div>

          {/* 规划结果 */}
          {plan && (
            <div className="rounded border border-[#2ecc8a44] bg-[#2ecc8a11] p-4">
              <div className="font-bold mb-3">📋 规划结果</div>
              {plan.summary && (
                <div className="text-sm text-[#2ecc8a88] mb-3 italic">方案：{plan.summary}</div>
              )}
              <div className="space-y-2 mb-4">
                {plan.tasks.map((t, idx) => (
                  <div key={t.id} className="flex items-start gap-2 bg-[#0a0a1a] rounded p-2 border border-[#2ecc8a22]">
                    <span className="text-xs text-[#2ecc8a66] mt-1 min-w-[24px]">{idx + 1}.</span>
                    <input
                      className="flex-1 bg-transparent border-b border-[#2ecc8a33] text-sm px-1 py-0.5 focus:outline-none focus:border-[#2ecc8a88]"
                      value={t.task}
                      onChange={(e) => updateTask(idx, 'task', e.target.value)}
                    />
                    <select
                      className="bg-[#0a0a1a] border border-[#2ecc8a44] rounded text-xs px-1 py-0.5 text-[#2ecc8a]"
                      value={t.dept}
                      onChange={(e) => updateTask(idx, 'dept', e.target.value)}
                    >
                      {DEPT_OPTIONS.map((d) => {
                        const dept = DEPTS.find((x) => x.id === d);
                        return (
                          <option key={d} value={d}>
                            {dept?.emoji} {dept?.label}
                          </option>
                        );
                      })}
                    </select>
                    <select
                      className={`bg-[#0a0a1a] border rounded text-xs px-1 py-0.5 ${
                        t.priority === 'high' ? 'border-[#ff527044] text-[#ff5270]' :
                        t.priority === 'low' ? 'border-[#f5c84244] text-[#f5c84288]' :
                        'border-[#2ecc8a44] text-[#2ecc8a]'
                      }`}
                      value={t.priority}
                      onChange={(e) => updateTask(idx, 'priority', e.target.value)}
                    >
                      {PRIORITY_OPTIONS.map((p) => (
                        <option key={p} value={p}>{p === 'high' ? '🔴 高' : p === 'low' ? '🟡 低' : '🟢 中'}</option>
                      ))}
                    </select>
                    <button
                      className="text-xs text-[#ff527066] hover:text-[#ff5270] ml-1"
                      onClick={() => deleteTask(idx)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <button
                className="text-xs text-[#6a9eff66] hover:text-[#6a9eff] mb-3"
                onClick={() => {
                  if (!plan) return;
                  const newTask: PlanTask = {
                    id: `step-${plan.tasks.length + 1}`,
                    task: '',
                    dept: '太子',
                    priority: 'normal',
                    dependencies: [],
                  };
                  setPlan({ ...plan, tasks: [...plan.tasks, newTask] });
                }}
              >
                + 添加子任务
              </button>

              <div className="flex gap-2 mt-2">
                <button
                  className="chip primary"
                  onClick={handleDispatch}
                  disabled={dispatching || plan.tasks.length === 0}
                >
                  {dispatching ? '📮 派发中…' : `📮 派发全部 ${plan.tasks.length} 项至六部`}
                </button>
                <button
                  className="chip"
                  onClick={() => { setPlan(null); setGoal(''); }}
                >
                  重置
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
