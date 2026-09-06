import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, PiggyBank, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageCloseCapsule } from '../components/PageCloseCapsule';
import { Sheet } from '../components/Sheet';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import type {
  AllocationBucketDetail as BucketDetail,
  AllocationBucketDetails as BucketDetails,
  AllocationBucketKey as BucketKey,
  AllocationExpense as PlannedExpense,
  AllocationExpenseType as ExpenseType,
  MonthlyAllocationPlan,
} from '../types';
import { uuid } from '../utils/compat';
import { parseYuanToCents, toYuan, toYuanTrim } from '../utils/money';

type BucketDefinition = {
  key: BucketKey;
  name: string;
  ratio: number;
  description: string;
};

const BUCKETS: BucketDefinition[] = [
  { key: 'needs', name: '生活必需账户', ratio: 60, description: '房租、水电、吃饭、交通和日常开销' },
  { key: 'security', name: '本金保障账户', ratio: 20, description: '生活保障、应急资金和盈余储蓄' },
  { key: 'growth', name: '成长投资账户', ratio: 10, description: '技能学习、试错资金和长期投资' },
  { key: 'flexible', name: '灵活消费账户', ratio: 10, description: '娱乐、自由消费和突发消费' },
];

const EMPTY_SWEPT = { needs: 0, growth: 0, flexible: 0 };

function defaultBucketDetails(): BucketDetails {
  return {
    needs: { location: '微信', description: '房租、水电、吃饭、交通和日常开销' },
    security: { location: '中国银行 9207', description: '生活保障、应急资金和盈余储蓄' },
    growth: { location: '', description: '技能学习、试错资金和长期投资' },
    flexible: { location: '', description: '娱乐、自由消费和突发消费' },
  };
}

function bucketDetail(plan: MonthlyAllocationPlan, key: BucketKey): BucketDetail {
  return plan.bucketDetails?.[key] ?? defaultBucketDetails()[key];
}

function monthOffset(yearMonth: string, delta: number) {
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));
  const next = new Date(year, month - 1 + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
}

function allocateCents(totalCents: number): Record<BucketKey, number> {
  const needs = Math.round(totalCents * 0.6);
  const security = Math.round(totalCents * 0.2);
  const growth = Math.round(totalCents * 0.1);
  return { needs, security, growth, flexible: totalCents - needs - security - growth };
}

function createDraft(yearMonth: string, plans: MonthlyAllocationPlan[]): MonthlyAllocationPlan {
  const previous = [...plans]
    .filter((plan) => plan.yearMonth < yearMonth)
    .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth))[0];
  const fixedItems = (previous?.items ?? [])
    .filter((item) => item.type === 'fixed')
    .map((item) => ({ ...item, id: uuid(), updatedAt: Date.now() }));
  const previousDetails = previous
    ? BUCKETS.reduce<BucketDetails>((result, bucket) => {
      result[bucket.key] = { ...bucketDetail(previous, bucket.key) };
      return result;
    }, defaultBucketDetails())
    : defaultBucketDetails();
  return {
    yearMonth,
    amountCents: 0,
    incomeType: previous?.incomeType ?? '工资收入',
    items: fixedItems,
    swept: { ...EMPTY_SWEPT },
    bucketDetails: previousDetails,
    savedAt: 0,
  };
}

export function Allocation6211Page() {
  const navigate = useNavigate();
  const storedPlans = useData((s) => s.allocationPlans);
  const upsertAllocationPlan = useData((s) => s.upsertAllocationPlan);
  const toast = useUI((s) => s.toast);
  const confirm = useUI((s) => s.confirm);
  const currentYearMonth = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const [yearMonth, setYearMonth] = useState(currentYearMonth);
  const plans = useMemo(() => storedPlans.filter((plan) => !plan.deletedAt), [storedPlans]);
  const [draft, setDraft] = useState<MonthlyAllocationPlan>(() => createDraft(currentYearMonth, []));
  const [amount, setAmount] = useState('');
  const [incomeType, setIncomeType] = useState('工资收入');
  const [error, setError] = useState('');
  const [activeBucket, setActiveBucket] = useState<BucketKey | null>(null);
  const [itemEditorOpen, setItemEditorOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemAmount, setItemAmount] = useState('');
  const [itemType, setItemType] = useState<ExpenseType>('fixed');
  const [locationInput, setLocationInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');

  useEffect(() => {
    const saved = plans.find((plan) => plan.yearMonth === yearMonth);
    const next = saved ?? createDraft(yearMonth, plans);
    setDraft(next);
    setAmount(next.amountCents > 0 ? toYuanTrim(next.amountCents) : '');
    setIncomeType(next.incomeType);
    setError('');
    setActiveBucket(null);
    setItemEditorOpen(false);
  }, [plans, yearMonth]);

  const baseAllocations = useMemo(() => allocateCents(draft.amountCents), [draft.amountCents]);
  const sweptTotal = draft.swept.needs + draft.swept.growth + draft.swept.flexible;
  const budgets: Record<BucketKey, number> = {
    needs: baseAllocations.needs - draft.swept.needs,
    security: baseAllocations.security + sweptTotal,
    growth: baseAllocations.growth - draft.swept.growth,
    flexible: baseAllocations.flexible - draft.swept.flexible,
  };
  const plannedByBucket = BUCKETS.reduce<Record<BucketKey, number>>((result, bucket) => {
    result[bucket.key] = draft.items.filter((item) => item.bucket === bucket.key).reduce((sum, item) => sum + item.amountCents, 0);
    return result;
  }, { needs: 0, security: 0, growth: 0, flexible: 0 });
  const remainingByBucket = BUCKETS.reduce<Record<BucketKey, number>>((result, bucket) => {
    result[bucket.key] = budgets[bucket.key] - plannedByBucket[bucket.key];
    return result;
  }, { needs: 0, security: 0, growth: 0, flexible: 0 });
  const availableSurplus = Math.max(0, baseAllocations.needs - plannedByBucket.needs - draft.swept.needs)
    + Math.max(0, baseAllocations.growth - plannedByBucket.growth - draft.swept.growth)
    + Math.max(0, baseAllocations.flexible - plannedByBucket.flexible - draft.swept.flexible);

  const commit = (next: MonthlyAllocationPlan) => {
    setDraft(next);
    void upsertAllocationPlan(next);
  };

  const inputCents = () => {
    const cents = parseYuanToCents(amount);
    if (cents === null || cents <= 0) {
      setError('请输入大于 0 的金额');
      return null;
    }
    setError('');
    return cents;
  };

  const recalculate = () => {
    const cents = inputCents();
    if (cents === null) return;
    setDraft((current) => ({ ...current, amountCents: cents, incomeType, swept: cents === current.amountCents ? current.swept : { ...EMPTY_SWEPT } }));
    toast('分配金额已重新计算', 'info');
  };

  const savePlan = () => {
    const cents = inputCents();
    if (cents === null) return;
    const next = {
      ...draft,
      amountCents: cents,
      incomeType,
      swept: cents === draft.amountCents ? draft.swept : { ...EMPTY_SWEPT },
      savedAt: Date.now(),
    };
    commit(next);
    toast(`${Number(yearMonth.slice(5, 7))} 月规划已保存`);
  };

  const openBucket = (key: BucketKey) => {
    const detail = bucketDetail(draft, key);
    setActiveBucket(key);
    setLocationInput(detail.location);
    setDescriptionInput(detail.description);
    setItemEditorOpen(false);
  };

  const saveBucketDetail = () => {
    if (!activeBucket) return;
    const details = BUCKETS.reduce<BucketDetails>((result, bucket) => {
      result[bucket.key] = { ...bucketDetail(draft, bucket.key) };
      return result;
    }, defaultBucketDetails());
    details[activeBucket] = { location: locationInput.trim(), description: descriptionInput.trim() };
    commit({ ...draft, bucketDetails: details, savedAt: Date.now() });
    toast('分区信息已保存');
  };

  const openAddItem = () => {
    setEditingItemId(null);
    setItemName('');
    setItemAmount('');
    setItemType('fixed');
    setItemEditorOpen(true);
  };

  const openEditItem = (item: PlannedExpense) => {
    setEditingItemId(item.id);
    setItemName(item.name);
    setItemAmount(toYuanTrim(item.amountCents));
    setItemType(item.type);
    setItemEditorOpen(true);
  };

  const saveItem = () => {
    if (!activeBucket) return;
    const normalizedName = itemName.trim();
    const amountCents = parseYuanToCents(itemAmount);
    if (!normalizedName) return toast('请输入开销名称', 'err');
    if (amountCents === null || amountCents <= 0) return toast('请输入正确的开销金额', 'err');
    const updatedAt = Date.now();
    const items = editingItemId
      ? draft.items.map((item) => item.id === editingItemId ? { ...item, name: normalizedName, amountCents, type: itemType, updatedAt } : item)
      : [...draft.items, { id: uuid(), bucket: activeBucket, name: normalizedName, amountCents, type: itemType, updatedAt }];
    commit({ ...draft, items, savedAt: Date.now() });
    setItemEditorOpen(false);
    toast(editingItemId ? '开销规划已更新' : '开销规划已添加');
  };

  const deleteItem = async () => {
    if (!editingItemId) return;
    const item = draft.items.find((entry) => entry.id === editingItemId);
    if (!item) return;
    const ok = await confirm({ title: `删除「${item.name}」？`, message: '只会删除这项规划，不影响任何账单或账户。', confirmText: '删除', danger: true });
    if (!ok) return;
    commit({ ...draft, items: draft.items.filter((entry) => entry.id !== editingItemId), savedAt: Date.now() });
    setItemEditorOpen(false);
    toast('开销规划已删除', 'info');
  };

  const sweepSurplus = () => {
    const nextSwept = {
      needs: draft.swept.needs + Math.max(0, baseAllocations.needs - plannedByBucket.needs - draft.swept.needs),
      growth: draft.swept.growth + Math.max(0, baseAllocations.growth - plannedByBucket.growth - draft.swept.growth),
      flexible: draft.swept.flexible + Math.max(0, baseAllocations.flexible - plannedByBucket.flexible - draft.swept.flexible),
    };
    commit({ ...draft, swept: nextSwept, savedAt: Date.now() });
    toast('盈余已归入本金保障');
  };

  const resetSweep = () => {
    commit({ ...draft, swept: { ...EMPTY_SWEPT }, savedAt: Date.now() });
    toast('已撤回盈余归集', 'info');
  };

  const activeDefinition = BUCKETS.find((bucket) => bucket.key === activeBucket);
  const activeItems = draft.items.filter((item) => item.bucket === activeBucket);

  return (
    <div className="min-h-full bg-surface pb-8">
      <header className="pt-safe px-3 py-3 bg-header">
        <div className="relative h-12 flex items-center justify-center">
          <h1 className="text-center text-lg font-bold">6211 财务管理</h1>
          <div className="absolute right-0">
            <PageCloseCapsule onClose={() => navigate('/assets')} onMore={() => toast('暂无更多设置', 'info')} />
          </div>
        </div>
        <div className="flex items-center justify-between mt-1">
          <button className="w-11 h-11 rounded-xl bg-header-fill text-header-fill-ink grid place-items-center" aria-label="上个月" onClick={() => setYearMonth((value) => monthOffset(value, -1))}><ChevronLeft size={19} /></button>
          <strong className="text-sm text-header-ink">{yearMonth.slice(0, 4)} 年 {yearMonth.slice(5, 7)} 月</strong>
          <button className="w-11 h-11 rounded-xl bg-header-fill text-header-fill-ink grid place-items-center" aria-label="下个月" onClick={() => setYearMonth((value) => monthOffset(value, 1))}><ChevronRight size={19} /></button>
        </div>
      </header>

      <main className="px-3 pt-3 space-y-3">
        <section className="rounded-2xl bg-card p-4">
          <label className="block">
            <span className="block text-xs text-ink-3 mb-1.5">本月收入金额</span>
            <div className="h-14 rounded-xl bg-fill px-4 flex items-center gap-2">
              <span className="text-lg text-ink-3">¥</span>
              <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="输入工资或任意金额" className="field-input flex-1 text-xl font-semibold" />
            </div>
          </label>
          <label className="block mt-3">
            <span className="block text-xs text-ink-3 mb-1.5">收入类型</span>
            <select value={incomeType} onChange={(event) => setIncomeType(event.target.value)} className="w-full h-12 rounded-xl bg-fill px-3 text-sm outline-none">
              <option>工资收入</option><option>奖金</option><option>兼职收入</option><option>其他收入</option>
            </select>
          </label>
          {error && <p className="text-xs text-danger mt-2" role="alert">{error}</p>}
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button className="h-11 rounded-xl bg-fill text-sm font-medium" onClick={recalculate}>重新计算</button>
            <button className="h-11 rounded-xl bg-primary text-on-primary text-sm font-medium" onClick={savePlan}>保存本月规划</button>
          </div>
        </section>

        <section className="rounded-2xl bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">分配结果</h2>
            <span className="text-xs text-ink-3">点击查看开销</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden flex bg-fill" role="img" aria-label="生活必需百分之六十，本金保障百分之二十，成长投资百分之十，灵活消费百分之十">
            <span className="w-[60%] bg-primary" />
            <span className="w-[20%]" style={{ background: 'color-mix(in srgb, var(--success) 75%, var(--primary))' }} />
            <span className="w-[10%] bg-success" />
            <span className="w-[10%] bg-ink-3" />
          </div>

          <div className="mt-3 divide-y divide-line">
            {BUCKETS.map((bucket) => {
              const remaining = remainingByBucket[bucket.key];
              const fixedCount = draft.items.filter((item) => item.bucket === bucket.key && item.type === 'fixed').length;
              const detail = bucketDetail(draft, bucket.key);
              return (
                <button key={bucket.key} className="w-full min-h-[78px] py-3 flex items-center gap-3 text-left" onClick={() => openBucket(bucket.key)}>
                  <span className="w-10 h-10 shrink-0 rounded-xl bg-fill text-primary flex items-center justify-center text-xs font-semibold">{bucket.ratio}%</span>
                  <span className="flex-1 min-w-0">
                    <strong className="block text-sm font-medium">{bucket.name}</strong>
                    <small className="block text-xs text-ink-3 mt-0.5 truncate">存放：{detail.location || '未设置'}</small>
                    <small className="block text-[10px] text-ink-3 mt-0.5 truncate">已规划 ¥ {toYuan(plannedByBucket[bucket.key])}{fixedCount ? ` · 固定 ${fixedCount} 项` : ''}</small>
                  </span>
                  <span className="shrink-0 text-right">
                    <strong className={`block text-sm ${remaining < 0 ? 'text-danger' : ''}`}>¥ {toYuan(remaining)}</strong>
                    <small className="block text-[10px] text-ink-3 mt-0.5">剩余</small>
                  </span>
                  <ChevronRight size={15} className="shrink-0 text-ink-3" />
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl bg-card p-4">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-xl bg-fill text-primary grid place-items-center"><PiggyBank size={21} /></span>
            <div className="flex-1">
              <h2 className="text-sm font-semibold">盈余储蓄</h2>
              <p className="text-xs text-ink-3 mt-0.5">已归入本金保障 ¥ {toYuan(sweptTotal)}</p>
            </div>
          </div>
          {sweptTotal > 0 ? (
            <button className="w-full h-11 mt-3 rounded-xl bg-fill text-sm flex items-center justify-center gap-1" onClick={resetSweep}><RotateCcw size={15} />撤回盈余归集</button>
          ) : (
            <button className="w-full h-11 mt-3 rounded-xl bg-primary text-on-primary text-sm font-medium disabled:opacity-50" disabled={availableSurplus <= 0} onClick={sweepSurplus}>一键存入本金保障 · ¥ {toYuan(availableSurplus)}</button>
          )}
          <p className="text-[11px] text-ink-3 text-center mt-2">只是规划额度转移，不会操作银行卡或账户余额</p>
        </section>
      </main>

      <Sheet open={!!activeBucket} onClose={() => setActiveBucket(null)} title={itemEditorOpen ? (editingItemId ? '编辑开销' : '添加开销') : activeDefinition?.name ?? '分区详情'}>
        {activeDefinition && activeBucket && (
          itemEditorOpen ? (
            <div className="px-4 pb-6 space-y-3">
              <label className="block"><span className="block text-xs text-ink-3 mb-1.5">开销名称</span><div className="h-12 rounded-xl bg-fill px-3 flex items-center"><input value={itemName} onChange={(event) => setItemName(event.target.value)} maxLength={24} placeholder="例如：房租" className="field-input" /></div></label>
              <label className="block"><span className="block text-xs text-ink-3 mb-1.5">金额</span><div className="h-12 rounded-xl bg-fill px-3 flex items-center gap-2"><span className="text-ink-3">¥</span><input value={itemAmount} onChange={(event) => setItemAmount(event.target.value)} inputMode="decimal" placeholder="0.00" className="field-input flex-1" /></div></label>
              <label className="block"><span className="block text-xs text-ink-3 mb-1.5">规划类型</span><select value={itemType} onChange={(event) => setItemType(event.target.value as ExpenseType)} className="w-full h-12 rounded-xl bg-fill px-3 text-sm outline-none"><option value="fixed">固定开销（下月自动带入）</option><option value="monthly">本月计划（仅当前月份）</option></select></label>
              <button className="w-full h-11 rounded-xl bg-primary text-on-primary font-medium" onClick={saveItem}>保存</button>
              <button className="w-full h-11 rounded-xl bg-fill text-sm" onClick={() => setItemEditorOpen(false)}>返回分区详情</button>
              {editingItemId && <button className="w-full h-11 text-danger flex items-center justify-center gap-1" onClick={() => void deleteItem()}><Trash2 size={17} />删除这项规划</button>}
            </div>
          ) : (
            <div className="px-4 pb-6">
              <div className="grid grid-cols-3 gap-2 rounded-2xl bg-fill p-3 mb-4 text-center">
                <div><span className="block text-[10px] text-ink-3">可用额度</span><strong className="block text-sm mt-1">¥ {toYuan(budgets[activeBucket])}</strong></div>
                <div><span className="block text-[10px] text-ink-3">已规划</span><strong className="block text-sm mt-1">¥ {toYuan(plannedByBucket[activeBucket])}</strong></div>
                <div><span className="block text-[10px] text-ink-3">剩余</span><strong className={`block text-sm mt-1 ${remainingByBucket[activeBucket] < 0 ? 'text-danger' : ''}`}>¥ {toYuan(remainingByBucket[activeBucket])}</strong></div>
              </div>
              <section className="rounded-2xl bg-fill p-3 mb-4">
                <label className="block"><span className="block text-[11px] text-ink-3 mb-1">资金存放位置</span><input value={locationInput} onChange={(event) => setLocationInput(event.target.value)} maxLength={30} placeholder="例如：微信、中国银行 9207" className="field-input" /></label>
                <label className="block mt-3"><span className="block text-[11px] text-ink-3 mb-1">用途说明</span><input value={descriptionInput} onChange={(event) => setDescriptionInput(event.target.value)} maxLength={60} placeholder={activeDefinition.description} className="field-input" /></label>
                <button className="w-full h-10 mt-3 rounded-xl bg-card text-sm font-medium" onClick={saveBucketDetail}>保存分区信息</button>
              </section>
              <div className="divide-y divide-line">
                {activeItems.length === 0 ? <p className="py-7 text-center text-sm text-ink-3">还没有规划开销</p> : activeItems.map((item) => (
                  <button key={item.id} className="w-full min-h-[62px] py-3 flex items-center gap-3 text-left" onClick={() => openEditItem(item)}>
                    <span className="flex-1 min-w-0"><strong className="block text-sm font-medium truncate">{item.name}</strong><small className="block text-xs text-ink-3 mt-0.5">{item.type === 'fixed' ? '固定开销 · 下月自动带入' : '本月计划'}</small></span>
                    <strong className="text-sm">¥ {toYuan(item.amountCents)}</strong><Pencil size={14} className="text-ink-3" />
                  </button>
                ))}
              </div>
              <button className="w-full h-11 mt-3 rounded-xl bg-primary text-on-primary font-medium flex items-center justify-center gap-1" onClick={openAddItem}><Plus size={17} />添加开销规划</button>
            </div>
          )
        )}
      </Sheet>
    </div>
  );
}
