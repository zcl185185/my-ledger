import { useMemo, useState } from 'react';
import { CalendarClock, Check, ChevronRight, Plus, SkipForward, Trash2 } from 'lucide-react';
import { SettingsShell, Toggle } from './SettingsShell';
import { Sheet } from '../../components/Sheet';
import { useData } from '../../store/data';
import { useUI } from '../../store/ui';
import type { BillType, RecurringBill } from '../../types';
import { uuid } from '../../utils/compat';
import { parseYuanToCents, toYuan, toYuanTrim } from '../../utils/money';
import { isRecurringDue, recurringDueAt, recurringPeriodKey, recurringScheduleLabel } from '../../utils/recurring';

export function RecurringPage() {
  const recurringBills = useData((s) => s.recurringBills);
  const categories = useData((s) => s.categories);
  const accounts = useData((s) => s.accounts);
  const currentLedgerId = useData((s) => s.currentLedgerId);
  const addBill = useData((s) => s.addBill);
  const upsert = useData((s) => s.upsertRecurringBill);
  const remove = useData((s) => s.deleteRecurringBill);
  const toast = useUI((s) => s.toast);
  const confirm = useUI((s) => s.confirm);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringBill | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<BillType>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [frequency, setFrequency] = useState<'monthly' | 'yearly'>('monthly');
  const [day, setDay] = useState('1');
  const [month, setMonth] = useState('1');
  const [note, setNote] = useState('');
  const [enabled, setEnabled] = useState(true);

  const now = new Date();
  const sorted = useMemo(() => [...recurringBills].sort((a, b) => Number(isRecurringDue(b, now)) - Number(isRecurringDue(a, now)) || a.dayOfMonth - b.dayOfMonth), [recurringBills]);
  const due = sorted.filter((x) => isRecurringDue(x, now));
  const cats = categories.filter((c) => c.type === type && !c.hidden).sort((a, b) => a.sort - b.sort);

  const openAdd = () => {
    setEditing(null);
    setName(''); setType('expense'); setAmount('');
    const expenseCats = categories.filter((c) => c.type === 'expense' && !c.hidden).sort((a, b) => a.sort - b.sort);
    setCategoryId(expenseCats[0]?.id ?? '');
    setAccountId(accounts[0]?.id ?? '');
    setFrequency('monthly'); setDay('1'); setMonth('1'); setNote(''); setEnabled(true); setOpen(true);
  };

  const openEdit = (item: RecurringBill) => {
    setEditing(item); setName(item.name); setType(item.type); setAmount(toYuanTrim(item.amountCents));
    setCategoryId(item.categoryId); setAccountId(item.accountId); setFrequency(item.frequency);
    setDay(String(item.dayOfMonth)); setMonth(String(item.monthOfYear ?? 1)); setNote(item.note); setEnabled(item.enabled); setOpen(true);
  };

  const changeType = (next: BillType) => {
    setType(next);
    setCategoryId(categories.filter((c) => c.type === next && !c.hidden).sort((a, b) => a.sort - b.sort)[0]?.id ?? '');
  };

  const save = async () => {
    const cents = parseYuanToCents(amount);
    const dayNum = Number(day);
    const monthNum = Number(month);
    if (!name.trim()) return toast('请输入名称', 'err');
    if (cents === null) return toast('请输入正确金额', 'err');
    if (!categoryId || !accountId) return toast('请选择分类和账户', 'err');
    if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31) return toast('日期请输入 1 到 31', 'err');
    if (frequency === 'yearly' && (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12)) return toast('月份请输入 1 到 12', 'err');
    const time = Date.now();
    const item: RecurringBill = {
      id: editing?.id ?? uuid(), name: name.trim(), type, amountCents: cents, categoryId, accountId,
      note: note.trim(), frequency, dayOfMonth: dayNum, monthOfYear: frequency === 'yearly' ? monthNum : undefined,
      enabled, lastHandledKey: editing?.lastHandledKey, createdAt: editing?.createdAt ?? time, updatedAt: time,
    };
    await upsert(item);
    setOpen(false);
    toast(editing ? '周期账单已更新' : '周期账单已添加');
  };

  const handlePeriod = async (item: RecurringBill, skip: boolean) => {
    if (!skip) {
      await addBill({
        type: item.type, amountCents: item.amountCents, categoryId: item.categoryId, note: item.note || item.name,
        accountId: item.accountId, occurredAt: recurringDueAt(item, now), ledgerId: currentLedgerId, kind: 'standard',
      });
    }
    await upsert({ ...item, lastHandledKey: recurringPeriodKey(item, now), updatedAt: Date.now() });
    toast(skip ? '本期已跳过' : '已记入账单');
  };

  const deleteItem = async () => {
    if (!editing) return;
    const ok = await confirm({ title: `删除「${editing.name}」？`, confirmText: '删除', danger: true });
    if (!ok) return;
    await remove(editing.id); setOpen(false); toast('已删除');
  };

  return (
    <SettingsShell title="周期账单">
      <div className="px-3 pt-3 pb-8 space-y-3">
        {due.length > 0 && (
          <div className="rounded-2xl bg-card p-4">
            <div className="flex items-center gap-2 mb-3"><CalendarClock size={19} className="text-primary" /><h2 className="font-semibold">待确认（{due.length}）</h2></div>
            <div className="divide-y divide-line">
              {due.map((item) => <DueRow key={item.id} item={item} accountName={accounts.find((a) => a.id === item.accountId)?.name} onPost={() => void handlePeriod(item, false)} onSkip={() => void handlePeriod(item, true)} />)}
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-line flex justify-between"><h2 className="font-semibold">全部周期账单</h2><span className="text-xs text-ink-3">{recurringBills.length} 项</span></div>
          {sorted.length === 0 ? <p className="px-4 py-8 text-center text-sm text-ink-3">还没有周期账单</p> : sorted.map((item) => (
            <button key={item.id} className="w-full px-4 py-3 flex items-center gap-3 border-b border-line last:border-0 text-left" onClick={() => openEdit(item)}>
              <span className={`w-9 h-9 rounded-full bg-fill flex items-center justify-center ${item.type === 'income' ? 'text-success' : 'text-danger'}`}><CalendarClock size={18} /></span>
              <span className="flex-1 min-w-0"><span className="block text-sm font-medium truncate">{item.name}</span><span className="block text-xs text-ink-3">{recurringScheduleLabel(item)} · {accounts.find((a) => a.id === item.accountId)?.name ?? '账户已删除'}</span></span>
              <span className="text-right"><span className="block text-sm font-semibold">¥ {toYuan(item.amountCents)}</span><span className="block text-[10px] text-ink-3">{item.enabled ? '已启用' : '已暂停'}</span></span>
              <ChevronRight size={15} className="text-ink-3" />
            </button>
          ))}
        </div>

        <button className="w-full h-12 rounded-2xl bg-primary text-on-primary font-semibold flex items-center justify-center gap-1" onClick={openAdd}><Plus size={18} /> 添加周期账单</button>
        <p className="text-xs text-ink-3 px-1">到期后只会提醒；点击“记入”才生成正式账单，不会自动扣款。</p>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title={editing ? '编辑周期账单' : '添加周期账单'}>
        <div className="px-4 pb-6 space-y-3">
          <div className="grid grid-cols-2 rounded-xl bg-fill p-1">
            {(['expense', 'income'] as BillType[]).map((v) => <button key={v} className={`h-9 rounded-lg text-sm ${type === v ? 'bg-card shadow font-medium' : 'text-ink-3'}`} onClick={() => changeType(v)}>{v === 'expense' ? '支出' : '收入'}</button>)}
          </div>
          <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} placeholder="名称，例如：房租" className="w-full h-11 px-3 rounded-xl bg-fill outline-none" />
          <div className="flex items-center h-11 px-3 rounded-xl bg-fill"><span className="text-ink-3 mr-2">¥</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="金额" className="flex-1 min-w-0 bg-transparent outline-none" /></div>
          <div className="grid grid-cols-2 gap-2">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="h-11 px-3 rounded-xl bg-fill outline-none"><option value="">选择分类</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-11 px-3 rounded-xl bg-fill outline-none"><option value="">选择账户</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as 'monthly' | 'yearly')} className="h-11 px-3 rounded-xl bg-fill outline-none"><option value="monthly">每月</option><option value="yearly">每年</option></select>
            <div className="h-11 px-3 rounded-xl bg-fill flex items-center gap-1">{frequency === 'yearly' && <><input inputMode="numeric" value={month} onChange={(e) => setMonth(e.target.value)} className="w-8 bg-transparent outline-none text-center" /><span className="text-xs text-ink-3">月</span></>}<input inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} className="w-8 bg-transparent outline-none text-center" /><span className="text-xs text-ink-3">日</span></div>
          </div>
          <input value={note} maxLength={30} onChange={(e) => setNote(e.target.value)} placeholder="账单备注（可选）" className="w-full h-11 px-3 rounded-xl bg-fill outline-none" />
          <div className="h-11 flex items-center justify-between"><span className="text-sm">启用提醒</span><Toggle on={enabled} onChange={setEnabled} /></div>
          <button className="w-full h-11 rounded-xl bg-primary text-on-primary font-medium" onClick={() => void save()}>保存</button>
          {editing && <button className="w-full h-10 text-danger flex items-center justify-center gap-1" onClick={() => void deleteItem()}><Trash2 size={16} /> 删除</button>}
        </div>
      </Sheet>
    </SettingsShell>
  );
}

function DueRow({ item, accountName, onPost, onSkip }: { item: RecurringBill; accountName?: string; onPost: () => void; onSkip: () => void }) {
  return <div className="py-3"><div className="flex justify-between"><div><p className="text-sm font-medium">{item.name}</p><p className="text-xs text-ink-3">{accountName} · ¥{toYuan(item.amountCents)}</p></div><span className="text-xs text-danger">已到期</span></div><div className="flex justify-end gap-2 mt-2"><button className="h-8 px-3 rounded-full bg-fill text-xs flex items-center gap-1" onClick={onSkip}><SkipForward size={13} />跳过</button><button className="h-8 px-3 rounded-full bg-primary text-on-primary text-xs font-medium flex items-center gap-1" onClick={onPost}><Check size={13} />记入账单</button></div></div>;
}
