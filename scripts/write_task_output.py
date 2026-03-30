#!/usr/bin/env python3
"""
统一写入任务输出到 data/outputs/{任务组}/{部门}/ 结构。

用法:
  python3 write_task_output.py <task_id> <dept> <content>
  python3 write_task_output.py <task_id> <dept> --file /path/to/content.txt
  python3 write_task_output.py <task_id> <dept> --title "标题" --content "内容"

所有官员的输出文档都走这里，保证输出结构统一。
"""
import pathlib
import sys
import re
import hashlib

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from file_lock import atomic_json_read

_BASE = pathlib.Path(__file__).resolve().parent.parent
OUTDIR = _BASE / 'data' / 'outputs'
TASKS_FILE = _BASE / 'data' / 'tasks_source.json'


def write_task_output(task_id: str, dept: str, title: str = '', content: str = ''):
    """写入任务输出到统一结构。返回输出文件路径，失败返回 None。"""
    if not task_id:
        print('[write_task_output] task_id 为空，跳过', file=sys.stderr)
        return None

    if not content and not title:
        print('[write_task_output] 内容和标题都为空，跳过', file=sys.stderr)
        return None

    if not TASKS_FILE.exists():
        print(f'[write_task_output] tasks_source.json 不存在: {TASKS_FILE}', file=sys.stderr)
        return None

    tasks = atomic_json_read(TASKS_FILE)
    task = next((t for t in tasks if str(t.get('id', '')) == str(task_id)), None)
    if not task:
        print(f'[write_task_output] 未找到任务 {task_id}', file=sys.stderr)
        return None

    plan_sid = task.get("planSessionId") or task.get("courtSessionId")
    plan_goal = task.get("planGoal") or task.get("courtSessionTopic", "") or task.get("title", "")

    # 合成文件内容
    if title:
        file_content = f"# {title}\n\n{content}" if content else f"# {title}\n"
    else:
        file_content = content

    # 生成 safe 文件夹名
    def make_safe_folder(name_str: str, sid: str) -> str:
        clean = re.sub(r"^step-\d+:\s*", "", name_str)
        safe = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fff]", "_", clean)[:50].strip("_")
        if not safe:
            safe = hashlib.md5(sid.encode()).hexdigest()[:12] if sid else hashlib.md5(task_id.encode()).hexdigest()[:12]
        return safe

    # 两种输出结构：
    # 1. 规划组任务：有 planSessionId → data/outputs/{任务组名}/
    # 2. 普通任务：无 planSessionId → data/outputs/{JJC-ID}/
    if plan_sid and plan_goal:
        safe = make_safe_folder(plan_goal, plan_sid)
        dept_dir = OUTDIR / safe / dept
        readme_path = OUTDIR / safe / "README.md"
        _write_readme(readme_path, tasks, plan_sid, plan_goal, safe)
    else:
        # 普通旨意：按任务ID建立独立文件夹
        safe = make_safe_folder(task.get("title", ""), task_id)
        dept_dir = OUTDIR / safe / dept
        # 普通任务不生成 README（只有一个任务）

    dept_dir.mkdir(parents=True, exist_ok=True)
    out_path = dept_dir / (task_id + "_" + dept + ".md")
    out_path.write_text(file_content, encoding="utf-8")
    print(f'[write_task_output] ✅ 已写入: {out_path}')
    return out_path


def _write_readme(readme_path: pathlib.Path, tasks, plan_sid: str, plan_goal: str, safe: str):
    """生成/更新规划组 README。"""
    all_plan_tasks = [
        t for t in tasks
        if (t.get("planSessionId") or t.get("courtSessionId")) == plan_sid
    ]
    depts_in_plan = sorted(set(t.get("targetDept", "?") for t in all_plan_tasks))

    task_lines_list = []
    for d in depts_in_plan:
        t = next((x for x in all_plan_tasks if x.get("targetDept") == d), {"id": "?", "title": ""})
        task_lines_list.append(f"- **{d}** ({t.get('id','?')}): {t.get('title','')}")
    task_lines = "\n".join(task_lines_list)

    tree_parts = []
    for d in depts_in_plan:
        tree_parts.append(f"    ├── {d}/")
        tree_parts.append(f"    │   └── <output files>")
    tree_parts.append(f"    └── README.md")
    tree = "\n".join(tree_parts)

    readme = (
        f"# {plan_goal}\n\n"
        f"**任务组ID**: `{plan_sid}`\n\n"
        f"## 任务列表\n\n"
        f"{task_lines}\n\n"
        f"## 文件夹结构\n\n"
        f"```\n{safe}/\n{tree}\n```\n"
    )
    readme_path.write_text(readme, encoding="utf-8")
    print(f'[write_task_output] ✅ README 已更新: {readme_path}')


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='写入任务输出到统一结构')
    parser.add_argument('task_id', help='任务 ID')
    parser.add_argument('dept', help='部门名称（如 中书省、兵部）')
    parser.add_argument('--title', '-t', default='', help='文档标题')
    parser.add_argument('--content', '-c', default='', help='文档内容')
    parser.add_argument('--file', '-f', type=pathlib.Path, default=None, help='从文件读取内容')
    args = parser.parse_args()

    content = args.content
    if args.file:
        if args.file.exists():
            content = args.file.read_text(encoding='utf-8')
        else:
            print(f'[write_task_output] 文件不存在: {args.file}', file=sys.stderr)
            sys.exit(1)

    result = write_task_output(args.task_id, args.dept, title=args.title, content=content)
    sys.exit(0 if result else 1)
