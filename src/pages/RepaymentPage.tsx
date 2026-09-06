import { useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageCloseCapsule } from '../components/PageCloseCapsule';
import { Sheet } from '../components/Sheet';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import type { RepaymentPlan } from '../types';
import { uuid } from '../utils/compat';
import { parseYuanToCents, toYuan, toYuanTrim } from '../utils/money';

function offsetMonth(year: number, month: number, delta: number) {
  const next = new Date(year, month - 1 + delta, 1);
  return { year: next.getFullYear(), month: next.getMonth() + 1 };
}

export function RepaymentPage() {
  const navigate = useNavigate();
  const storedPlans = useData((s) => s.repaymentPlans);
  const upsertRepaymentPlan = useData((s) => s.upsertRepaymentPlan);
  const deleteRepaymentPlan = useData((s) => s.deleteRepaymentPlan);
  const toast = useUI((s) => s.toast);
  const confirm = useUI((s) => s.confirm);
  const now = useMemo(() => new Date(), []);
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const yearMonth = `${period.year}-${String(period.month).padStart(2, '0')}`;
  const plans = useMemo(() => storedPlans.filter((plan) => !plan.deletedAt), [storedPlans]);

  const events = useMemo(() => plans
    .filter((plan) => plan.dueDate.startsWith(`${yearMonth}-`))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name, 'zh-CN')), [plans, yearMonth]);
  const totalCents = events.reduce((sum, event) => sum + event.amountCents, 0);
  const pendingEvents = events.filter((event) => !event.paidAt);
  const paidCount = events.length - pendingEvents.length;
  const pendingCents = pendingEvents.reduce((sum, event) => sum + event.amountCents, 0);
  const firstPendingEvent = pendingEvents[0];

  const openAdd = () => {
    setEditingId(null);
    setName('');
    setDueDate(`${yearMonth}-01`);
    setAmount('');
    setNote('');
    setEditorOpen(true);
  };

  const openEdit = (plan: RepaymentPlan) => {
    setEditingId(plan.id);
    setName(plan.name);
    setDueDate(plan.dueDate);
    setAmount(toYuanTrim(plan.amountCents));
    setNote(plan.note);
    setEditorOpen(true);
  };

  const savePlan = async () => {
    const normalizedName = name.trim();
    const amountCents = parseYuanToCents(amount);
    if (!normalizedName) return toast('请输入还款名称', 'err');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(new Date(`${dueDate}T00:00:00`).getTime())) return toast('请选择正确的还款日期', 'err');
    if (amountCents === null || amountCents <= 0) return toast('请输入正确的还款金额', 'err');

    const updatedAt = Date.now();
    if (editingId) {
      const current = plans.find((plan) => plan.id === editingId);
      if (!current) return;
      await upsertRepaymentPlan({ ...current, name: normalizedName, dueDate, amountCents, note: note.trim(), updatedAt });
      toast('还款计划已更新');
    } else {
      await upsertRepaymentPlan({ id: uuid(), name: normalizedName, dueDate, amountCents, note: note.trim(), updatedAt });
      toast('还款计划已添加');
    }
    const savedDate = new Date(`${dueDate}T00:00:00`);
    setPeriod({ year: savedDate.getFullYear(), month: savedDate.getMonth() + 1 });
    setEditorOpen(false);
  };

  const deletePlan = async () => {
    if (!editingId) return;
    const plan = plans.find((item) => item.id === editingId);
    if (!plan) return;
    const ok = await confirm({ title: `删除「${plan.name}」？`, message: '只会删除这个月份的这条还款计划，不影响账单和账户余额。', confirmText: '删除', danger: true });
    if (!ok) return;
    await deleteRepaymentPlan(editingId);
    setEditorOpen(false);
    toast('还款计划已删除', 'info');
  };

  const setPaid = async (id: string, paid: boolean) => {
    const plan = plans.find((item) => item.id === id);
    if (!plan) return;
    await upsertRepaymentPlan({ ...plan, paidAt: paid ? Date.now() : undefined, updatedAt: Date.now() });
    toast(paid ? '已确认还款' : '已撤销还款确认', 'info');
  };

  return (
    <div className="min-h-full bg-surface pb-8">
      <header className="pt-safe px-3 py-3 bg-card border-b border-line">
        <div className="relative h-12 flex items-center justify-center">
          <button className="absolute left-0 w-11 h-11 grid place-items-center" aria-label="添加还款提醒" onClick={openAdd}>
            <Plus size={22} />
          </button>
          <h1 className="text-center text-lg font-bold">还款时间轴</h1>
          <div className="absolute right-0">
            <PageCloseCapsule onClose={() => navigate('/assets')} onMore={() => toast('暂无更多设置', 'info')} />
          </div>
        </div>
        <div className="flex items-center justify-between mt-1">
          <button className="w-11 h-11 rounded-xl bg-fill grid place-items-center" aria-label="上个月" onClick={() => setPeriod((current) => offsetMonth(current.year, current.month, -1))}><ChevronLeft size={19} /></button>
          <strong className="text-sm">{period.year} 年 {String(period.month).padStart(2, '0')} 月</strong>
          <button className="w-11 h-11 rounded-xl bg-fill grid place-items-center" aria-label="下个月" onClick={() => setPeriod((current) => offsetMonth(current.year, current.month, 1))}><ChevronRight size={19} /></button>
        </div>
      </header>

      <main className="px-3 pt-3">
        <section className="rounded-2xl bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-ink-3">本月待还</span>
            <span className="text-xs text-ink-3">待还 {pendingEvents.length} 笔 · 已还 {paidCount} 笔</span>
          </div>
          <p className="text-3xl font-bold mt-1">¥ {toYuan(pendingCents)}</p>
          <p className="text-xs text-ink-3 mt-2">
            {firstPendingEvent
              ? `下一笔：${firstPendingEvent.dueDate.slice(5, 7)}月${firstPendingEvent.dueDate.slice(8, 10)}日 · ${firstPendingEvent.name}`
              : events.length ? `本月 ${events.length} 笔计划已全部确认` : '点击左上角 ＋ 添加本月还款计划'}
          </p>
          {events.length > 0 && <p className="text-[11px] text-ink-3 mt-1">本月计划总额 ¥ {toYuan(totalCents)}</p>}
        </section>

        <div className="flex items-end justify-between mt-5 mb-2 px-0.5">
          <div><span className="text-xs text-ink-3">{period.month} 月</span><h2 className="font-semibold">还款计划</h2></div>
          <span className="text-xs text-ink-3">确认后会标记已还</span>
        </div>

        {events.length === 0 ? (
          <section className="rounded-2xl bg-card py-12 px-4 text-center">
            <p className="text-sm text-ink-3">还没有还款提醒</p>
            <button className="h-11 px-5 mt-3 rounded-xl bg-primary text-on-primary text-sm font-medium" onClick={openAdd}>添加第一条</button>
          </section>
        ) : (
          <div className="relative pl-6 before:absolute before:left-[7px] before:top-4 before:bottom-4 before:w-px before:bg-line">
            {events.map((event) => (
              <article key={event.id} className={`relative w-full rounded-2xl bg-card p-4 mb-2 ${event.paidAt ? 'opacity-70' : ''}`}>
                <span className={`absolute -left-[22px] top-5 w-3.5 h-3.5 rounded-full border-[3px] bg-surface ${event.paidAt ? 'border-success' : 'border-primary'}`} />
                <span className="flex items-center justify-between gap-3">
                  <time className="text-xs text-ink-3">{event.dueDate.slice(5, 7)}月{event.dueDate.slice(8, 10)}日</time>
                  <span className={`text-xs ${event.paidAt ? 'text-success' : 'text-primary'}`}>{event.paidAt ? '已还' : '待还'}</span>
                </span>
                <span className="flex items-end justify-between gap-3 mt-2">
                  <span className="min-w-0">
                    <strong className="block text-sm font-medium truncate">{event.name}</strong>
                    <small className="block text-xs text-ink-3 mt-1 truncate">{event.note || '本月还款计划'}</small>
                  </span>
                  <strong className="shrink-0 text-primary">¥ {toYuan(event.amountCents)}</strong>
                </span>
                <span className="flex items-center justify-end gap-2 mt-3">
                  <button className="min-h-11 px-3 flex items-center gap-1 text-xs text-ink-3" onClick={() => openEdit(event)}><Pencil size={14} />编辑</button>
                  {event.paidAt ? (
                    <button className="min-h-11 px-3 flex items-center gap-1 text-xs text-ink-3" onClick={() => setPaid(event.id, false)}><RotateCcw size={14} />撤销确认</button>
                  ) : (
                    <button className="min-h-11 px-4 rounded-xl border border-primary text-primary flex items-center gap-1 text-sm" onClick={() => setPaid(event.id, true)}><Check size={15} />确认已还</button>
                  )}
                </span>
              </article>
            ))}
          </div>
        )}

        <p className="text-[11px] text-ink-3 text-center mt-3">确认只更新本月提醒状态，不生成账单，也不影响账户余额或报表</p>
      </main>

      <Sheet open={editorOpen} onClose={() => setEditorOpen(false)} title={editingId ? '编辑还款提醒' : '添加还款提醒'}>
        <div className="px-4 pb-6 space-y-3">
          <label className="block">
            <span className="block text-xs text-ink-3 mb-1.5">还款名称</span>
            <div className="h-12 rounded-xl bg-fill px-3 flex items-center"><input value={name} onChange={(event) => setName(event.target.value)} maxLength={24} placeholder="例如：京东白条" className="field-input" /></div>
          </label>
          <div className="grid grid-cols-[1.1fr_0.9fr] gap-2">
            <label className="block">
              <span className="block text-xs text-ink-3 mb-1.5">还款日期</span>
              <div className="h-12 rounded-xl bg-fill px-3 flex items-center"><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="field-input" /></div>
            </label>
            <label className="block">
              <span className="block text-xs text-ink-3 mb-1.5">金额</span>
              <div className="h-12 rounded-xl bg-fill px-3 flex items-center gap-2"><span className="text-ink-3">¥</span><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" className="field-input flex-1" /></div>
            </label>
          </div>
          <label className="block">
            <span className="block text-xs text-ink-3 mb-1.5">备注（可选）</span>
            <div className="h-12 rounded-xl bg-fill px-3 flex items-center"><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={40} placeholder="例如：自动扣款银行卡" className="field-input" /></div>
          </label>
          <button className="w-full h-11 rounded-xl bg-primary text-on-primary font-medium" onClick={() => void savePlan()}>保存</button>
          {editingId && (
            <button className="w-full h-11 text-danger flex items-center justify-center gap-1" onClick={() => void deletePlan()}><Trash2 size={17} />删除这条计划</button>
          )}
        </div>
      </Sheet>
    </div>
  );
}
