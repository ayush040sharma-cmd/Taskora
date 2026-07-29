import { useState, useEffect } from "react";
import { Layout, Trash2, Eye, CheckSquare, Users, Calendar } from "lucide-react";
import Modal from "../components/ui/Modal";
import Badge from "../components/ui/Badge";
import api from "../services/api";

const STATUS_COLORS = { todo: "default", inprogress: "info", in_progress: "info", done: "success", review: "warning" };
const PRIORITY_COLORS = { high: "error", medium: "warning", low: "success" };

export default function Boards() {
  const [boards, setBoards]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [tasks, setTasks]     = useState([]);
  const [taskLoading, setTaskLoading] = useState(false);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    api.get("/admin/boards")
      .then(r => setBoards(r.data || []))
      .catch(() => setBoards([]))
      .finally(() => setLoading(false));
  }, []);

  const openBoard = async (board) => {
    setSelected(board);
    setTaskLoading(true);
    try {
      const { data } = await api.get(`/admin/boards/${board.id}/tasks`);
      setTasks(data || []);
    } catch { setTasks([]); }
    finally { setTaskLoading(false); }
  };

  const deleteBoard = async () => {
    try {
      await api.delete(`/admin/boards/${confirm.id}`);
      setBoards(prev => prev.filter(b => b.id !== confirm.id));
    } finally { setConfirm(null); }
  };

  if (loading) return (
    <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
      {[...Array(6)].map((_, i) => <div key={i} className="h-36 bg-slate-900 border border-slate-800 rounded-xl" />)}
    </div>
  );

  return (
    <div className="p-6 animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-400">{boards.length} workspace{boards.length !== 1 ? "s" : ""} found</p>
      </div>

      {boards.length === 0 ? (
        <div className="text-center py-20 text-slate-500"><Layout size={40} className="mx-auto mb-3 opacity-40" /><p>No boards found</p></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {boards.map(b => (
            <div key={b.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-600/20 flex items-center justify-center">
                  <Layout size={16} className="text-indigo-400" />
                </div>
                <button onClick={() => setConfirm(b)} className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
              <h3 className="font-semibold text-slate-100 mb-1 truncate">{b.name}</h3>
              <p className="text-xs text-slate-500 mb-4">by {b.owner_name}</p>
              <div className="flex items-center gap-4 text-xs text-slate-400 mb-4">
                <span className="flex items-center gap-1"><CheckSquare size={12} />{b.task_count ?? 0} tasks</span>
                <span className="flex items-center gap-1"><Calendar size={12} />{new Date(b.created_at).toLocaleDateString()}</span>
              </div>
              <button onClick={() => openBoard(b)}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-slate-700 text-sm text-slate-300 hover:bg-slate-800 transition-colors">
                <Eye size={14} />View Tasks
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tasks modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `${selected.name} — Tasks` : ""} size="xl">
        {taskLoading ? (
          <div className="space-y-2 animate-pulse">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-slate-800 rounded-lg" />)}</div>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No tasks in this board</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  {["Title", "Status", "Priority", "Assignee", "Created"].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {tasks.map(t => (
                  <tr key={t.id} className="hover:bg-slate-800/30">
                    <td className="px-3 py-2.5 text-slate-200 font-medium max-w-[240px] truncate">{t.title}</td>
                    <td className="px-3 py-2.5"><Badge variant={STATUS_COLORS[t.status] || "default"}>{t.status}</Badge></td>
                    <td className="px-3 py-2.5"><Badge variant={PRIORITY_COLORS[t.priority] || "default"}>{t.priority || "—"}</Badge></td>
                    <td className="px-3 py-2.5 text-slate-400 text-xs">{t.assignee_name || "Unassigned"}</td>
                    <td className="px-3 py-2.5 text-slate-500 text-xs">{new Date(t.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Delete Board" size="sm"
        footer={<><button onClick={() => setConfirm(null)} className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-300 hover:bg-slate-800">Cancel</button><button onClick={deleteBoard} className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-semibold text-white">Delete</button></>}>
        <p className="text-sm text-slate-400">Permanently delete <strong className="text-slate-200">{confirm?.name}</strong> and all its tasks? This cannot be undone.</p>
      </Modal>
    </div>
  );
}
