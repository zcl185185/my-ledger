import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BedDouble,
  Briefcase,
  Car,
  ChevronRight,
  MapPin,
  Pencil,
  Plus,
  ReceiptText,
  Train,
  Trash2,
  Utensils,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageCloseCapsule } from '../components/PageCloseCapsule';
import { Sheet } from '../components/Sheet';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import type {
  BusinessTrip,
  TripClaimStatus as ClaimStatus,
  TripExpense,
  TripExpenseCategory as ExpenseCategory,
  TripInvoiceStatus as InvoiceStatus,
  TripPaymentSource as PaymentSource,
  TripStatus,
} from '../types';
import { uuid } from '../utils/compat';
import { parseYuanToCents, toYuan, toYuanTrim } from '../utils/money';

const CATEGORY_OPTIONS: Array<{ value: ExpenseCategory; label: string; icon: ReactNode }> = [
  { value: 'taxi', label: '打车', icon: <Car size={18} /> },
  { value: 'lodging', label: '住宿', icon: <BedDouble size={18} /> },
  { value: 'meal', label: '餐饮', icon: <Utensils size={18} /> },
  { value: 'transport', label: '交通', icon: <Train size={18} /> },
  { value: 'other', label: '其他', icon: <ReceiptText size={18} /> },
];

const SOURCE_LABELS: Record<PaymentSource, string> = {
  company: '公司报销',
  allowance: '补贴内消费',
  self: '自费',
};

const CLAIM_LABELS: Record<ClaimStatus, string> = {
  unsubmitted: '未提交',
  submitted: '已提交',
  paid: '已到账',
};

const INVOICE_LABELS: Record<InvoiceStatus, string> = {
  not_required: '无需发票',
  pending: '待开票',
  ready: '已有发票',
};

function todayText() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function dateNumber(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return Number.NaN;
  return Date.UTC(year, month - 1, day);
}

function dateSpan(startDate: string, endDate: string) {
  const start = dateNumber(startDate);
  const end = dateNumber(endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const nights = Math.round((end - start) / 86_400_000);
  return { days: nights + 1, nights };
}

function categoryInfo(category: ExpenseCategory) {
  return CATEGORY_OPTIONS.find((option) => option.value === category) ?? CATEGORY_OPTIONS[4]!;
}

function reimbursableCents(expense: TripExpense, trip: BusinessTrip) {
  if (expense.paymentSource !== 'company') return 0;
  if (expense.category !== 'lodging') return expense.amountCents;
  return Math.min(expense.amountCents, trip.lodgingLimitCents * expense.units);
}

function personalCents(expense: TripExpense, trip: BusinessTrip) {
  if (expense.paymentSource === 'self') return expense.amountCents;
  if (expense.paymentSource === 'company' && expense.category === 'lodging') {
    return Math.max(0, expense.amountCents - trip.lodgingLimitCents * expense.units);
  }
  return 0;
}

function dateLabel(value: string) {
  return `${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日`;
}

export function BusinessTripPage() {
  const navigate = useNavigate();
  const storedTrips = useData((state) => state.businessTrips);
  const upsertBusinessTrip = useData((state) => state.upsertBusinessTrip);
  const deleteBusinessTrip = useData((state) => state.deleteBusinessTrip);
  const toast = useUI((state) => state.toast);
  const confirm = useUI((state) => state.confirm);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tripListOpen, setTripListOpen] = useState(false);
  const [tripEditorOpen, setTripEditorOpen] = useState(false);
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [expenseEditorOpen, setExpenseEditorOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  const [tripTitle, setTripTitle] = useState('');
  const [tripLocation, setTripLocation] = useState('');
  const [tripStart, setTripStart] = useState(todayText());
  const [tripEnd, setTripEnd] = useState(todayText());
  const [travelDays, setTravelDays] = useState('1');
  const [salaryDays, setSalaryDays] = useState('1');
  const [lodgingNights, setLodgingNights] = useState('0');
  const [dailySalary, setDailySalary] = useState('200');
  const [dailyAllowance, setDailyAllowance] = useState('50');
  const [lodgingLimit, setLodgingLimit] = useState('250');

  const [expenseDate, setExpenseDate] = useState(todayText());
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>('taxi');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseUnits, setExpenseUnits] = useState('1');
  const [paymentSource, setPaymentSource] = useState<PaymentSource>('company');
  const [claimStatus, setClaimStatus] = useState<ClaimStatus>('unsubmitted');
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus>('pending');
  const [expenseNote, setExpenseNote] = useState('');

  const trips = useMemo(() => storedTrips.filter((trip) => !trip.deletedAt), [storedTrips]);

  useEffect(() => {
    if (selectedId && trips.some((trip) => trip.id === selectedId)) return;
    setSelectedId(trips.find((trip) => trip.status === 'active')?.id ?? trips[0]?.id ?? null);
  }, [selectedId, trips]);

  const selectedTrip = trips.find((trip) => trip.id === selectedId) ?? trips[0] ?? null;
  const sortedTrips = useMemo(() => [...trips].sort((a, b) => b.startDate.localeCompare(a.startDate) || b.updatedAt - a.updatedAt), [trips]);
  const sortedExpenses = useMemo(() => selectedTrip
    ? selectedTrip.expenses.filter((expense) => !expense.deletedAt).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt)
    : [], [selectedTrip]);

  const totals = useMemo(() => {
    if (!selectedTrip) return { salary: 0, allowance: 0, reimbursement: 0, pending: 0, paid: 0, personal: 0, allowanceSpent: 0 };
    return selectedTrip.expenses.filter((expense) => !expense.deletedAt).reduce((result, expense) => {
      const reimbursable = reimbursableCents(expense, selectedTrip);
      result.reimbursement += reimbursable;
      result.pending += expense.claimStatus === 'paid' ? 0 : reimbursable;
      result.paid += expense.claimStatus === 'paid' ? reimbursable : 0;
      result.personal += personalCents(expense, selectedTrip);
      result.allowanceSpent += expense.paymentSource === 'allowance' ? expense.amountCents : 0;
      return result;
    }, {
      salary: selectedTrip.salaryDays * selectedTrip.dailySalaryCents,
      allowance: selectedTrip.travelDays * selectedTrip.dailyAllowanceCents,
      reimbursement: 0,
      pending: 0,
      paid: 0,
      personal: 0,
      allowanceSpent: 0,
    });
  }, [selectedTrip]);

  const recalculateDates = (startDate: string, endDate: string) => {
    const span = dateSpan(startDate, endDate);
    if (!span) return;
    setTravelDays(String(span.days));
    setSalaryDays(String(span.days));
    setLodgingNights(String(span.nights));
  };

  const openAddTrip = () => {
    const today = todayText();
    setEditingTripId(null);
    setTripTitle('');
    setTripLocation('');
    setTripStart(today);
    setTripEnd(today);
    setTravelDays('1');
    setSalaryDays('1');
    setLodgingNights('0');
    setDailySalary('200');
    setDailyAllowance('50');
    setLodgingLimit('250');
    setTripListOpen(false);
    setTripEditorOpen(true);
  };

  const openEditTrip = (trip: BusinessTrip) => {
    setEditingTripId(trip.id);
    setTripTitle(trip.title);
    setTripLocation(trip.location);
    setTripStart(trip.startDate);
    setTripEnd(trip.endDate);
    setTravelDays(String(trip.travelDays));
    setSalaryDays(String(trip.salaryDays));
    setLodgingNights(String(trip.lodgingNights));
    setDailySalary(toYuanTrim(trip.dailySalaryCents));
    setDailyAllowance(toYuanTrim(trip.dailyAllowanceCents));
    setLodgingLimit(toYuanTrim(trip.lodgingLimitCents));
    setTripEditorOpen(true);
  };

  const saveTrip = async () => {
    const title = tripTitle.trim();
    const location = tripLocation.trim();
    const span = dateSpan(tripStart, tripEnd);
    const parsedTravelDays = Number(travelDays);
    const parsedSalaryDays = Number(salaryDays);
    const parsedLodgingNights = Number(lodgingNights);
    const dailySalaryCents = parseYuanToCents(dailySalary);
    const dailyAllowanceCents = parseYuanToCents(dailyAllowance);
    const lodgingLimitCents = parseYuanToCents(lodgingLimit);

    if (!title) return toast('请输入出差名称', 'err');
    if (!location) return toast('请输入出差地点', 'err');
    if (!span) return toast('结束日期不能早于开始日期', 'err');
    if (!Number.isInteger(parsedTravelDays) || parsedTravelDays <= 0) return toast('请输入正确的出差天数', 'err');
    if (!Number.isInteger(parsedSalaryDays) || parsedSalaryDays < 0) return toast('请输入正确的计薪天数', 'err');
    if (!Number.isInteger(parsedLodgingNights) || parsedLodgingNights < 0) return toast('请输入正确的住宿晚数', 'err');
    if (!dailySalaryCents || !dailyAllowanceCents || !lodgingLimitCents) return toast('请输入正确的工资、补贴和住宿标准', 'err');

    const now = Date.now();
    if (editingTripId) {
      const current = trips.find((trip) => trip.id === editingTripId);
      if (!current) return;
      await upsertBusinessTrip({
        ...current,
        title,
        location,
        startDate: tripStart,
        endDate: tripEnd,
        travelDays: parsedTravelDays,
        salaryDays: parsedSalaryDays,
        lodgingNights: parsedLodgingNights,
        dailySalaryCents,
        dailyAllowanceCents,
        lodgingLimitCents,
        updatedAt: now,
      });
      toast('出差信息已更新');
    } else {
      const id = uuid();
      await upsertBusinessTrip({
        id,
        title,
        location,
        startDate: tripStart,
        endDate: tripEnd,
        travelDays: parsedTravelDays,
        salaryDays: parsedSalaryDays,
        lodgingNights: parsedLodgingNights,
        dailySalaryCents,
        dailyAllowanceCents,
        lodgingLimitCents,
        status: 'active',
        expenses: [],
        updatedAt: now,
      });
      setSelectedId(id);
      toast('出差已创建');
    }
    setTripEditorOpen(false);
  };

  const deleteTrip = async () => {
    if (!editingTripId) return;
    const trip = trips.find((item) => item.id === editingTripId);
    if (!trip) return;
    const ok = await confirm({
      title: `删除「${trip.title}」？`,
      message: `会同时删除本次出差的 ${trip.expenses.filter((expense) => !expense.deletedAt).length} 条消费记录，不影响主账本和账户余额。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    const remaining = trips.filter((item) => item.id !== trip.id);
    await deleteBusinessTrip(trip.id);
    setSelectedId(remaining[0]?.id ?? null);
    setTripEditorOpen(false);
    toast('出差记录已删除', 'info');
  };

  const toggleTripStatus = async () => {
    if (!selectedTrip) return;
    const nextStatus: TripStatus = selectedTrip.status === 'active' ? 'completed' : 'active';
    await upsertBusinessTrip({ ...selectedTrip, status: nextStatus, updatedAt: Date.now() });
    toast(nextStatus === 'completed' ? '本次出差已结束' : '已恢复为进行中', 'info');
  };

  const openAddExpense = () => {
    if (!selectedTrip) return;
    const today = todayText();
    const defaultDate = today < selectedTrip.startDate || today > selectedTrip.endDate ? selectedTrip.startDate : today;
    setEditingExpenseId(null);
    setExpenseDate(defaultDate);
    setExpenseCategory('taxi');
    setExpenseAmount('');
    setExpenseUnits('1');
    setPaymentSource('company');
    setClaimStatus('unsubmitted');
    setInvoiceStatus('pending');
    setExpenseNote('');
    setExpenseEditorOpen(true);
  };

  const openEditExpense = (expense: TripExpense) => {
    setEditingExpenseId(expense.id);
    setExpenseDate(expense.date);
    setExpenseCategory(expense.category);
    setExpenseAmount(toYuanTrim(expense.amountCents));
    setExpenseUnits(String(expense.units));
    setPaymentSource(expense.paymentSource);
    setClaimStatus(expense.claimStatus);
    setInvoiceStatus(expense.invoiceStatus);
    setExpenseNote(expense.note);
    setExpenseEditorOpen(true);
  };

  const saveExpense = async () => {
    if (!selectedTrip) return;
    const amountCents = parseYuanToCents(expenseAmount);
    const units = expenseCategory === 'lodging' ? Number(expenseUnits) : 1;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate) || !Number.isFinite(dateNumber(expenseDate))) return toast('请选择正确的消费日期', 'err');
    if (!amountCents) return toast('请输入正确的消费金额', 'err');
    if (!Number.isInteger(units) || units <= 0) return toast('请输入正确的住宿晚数', 'err');

    const item: TripExpense = {
      id: editingExpenseId ?? uuid(),
      date: expenseDate,
      category: expenseCategory,
      amountCents,
      units,
      paymentSource,
      claimStatus: paymentSource === 'company' ? claimStatus : 'unsubmitted',
      invoiceStatus,
      note: expenseNote.trim(),
      updatedAt: Date.now(),
    };
    await upsertBusinessTrip({
      ...selectedTrip,
      expenses: editingExpenseId
        ? selectedTrip.expenses.map((expense) => expense.id === editingExpenseId ? item : expense)
        : [...selectedTrip.expenses, item],
      updatedAt: Date.now(),
    });
    setExpenseEditorOpen(false);
    toast(editingExpenseId ? '消费记录已更新' : '消费记录已添加');
  };

  const deleteExpense = async () => {
    if (!selectedTrip || !editingExpenseId) return;
    const ok = await confirm({ title: '删除这条消费记录？', message: '只删除出差记录，不影响主账本。', confirmText: '删除', danger: true });
    if (!ok) return;
    const deletedAt = Date.now();
    await upsertBusinessTrip({
      ...selectedTrip,
      expenses: selectedTrip.expenses.map((expense) => expense.id === editingExpenseId ? { ...expense, deletedAt, updatedAt: deletedAt } : expense),
      updatedAt: Date.now(),
    });
    setExpenseEditorOpen(false);
    toast('消费记录已删除', 'info');
  };

  const advanceClaim = async (expense: TripExpense) => {
    if (!selectedTrip || expense.paymentSource !== 'company') return;
    const nextStatus: ClaimStatus = expense.claimStatus === 'unsubmitted' ? 'submitted' : expense.claimStatus === 'submitted' ? 'paid' : 'unsubmitted';
    await upsertBusinessTrip({
      ...selectedTrip,
      expenses: selectedTrip.expenses.map((item) => item.id === expense.id ? { ...item, claimStatus: nextStatus, updatedAt: Date.now() } : item),
      updatedAt: Date.now(),
    });
    toast(nextStatus === 'submitted' ? '已标记为已提交' : nextStatus === 'paid' ? '已确认报销到账' : '已撤销报销状态', 'info');
  };

  return (
    <div className="min-h-full bg-surface pb-8">
      <header className="pt-safe px-3 py-3 bg-card border-b border-line">
        <div className="relative h-12 flex items-center justify-center">
          <button className="absolute left-0 w-11 h-11 grid place-items-center" aria-label="新建出差" onClick={openAddTrip}><Plus size={22} /></button>
          <h1 className="text-center text-lg font-bold">出差记录</h1>
          <div className="absolute right-0">
            <PageCloseCapsule onClose={() => navigate('/assets')} onMore={() => setTripListOpen(true)} />
          </div>
        </div>
      </header>

      <main className="px-3 pt-3">
        {!selectedTrip ? (
          <section className="rounded-2xl bg-card py-14 px-5 text-center">
            <span className="mx-auto w-14 h-14 rounded-2xl bg-fill text-primary grid place-items-center"><Briefcase size={25} /></span>
            <h2 className="font-semibold mt-4">还没有出差记录</h2>
            <p className="text-xs leading-relaxed text-ink-3 mt-2">新建一次出差，自由填写地点、工资、补贴和住宿额度。</p>
            <button className="h-11 px-5 mt-4 rounded-xl bg-primary text-on-primary text-sm font-medium" onClick={openAddTrip}>新建出差</button>
          </section>
        ) : (
          <>
            <section className="rounded-2xl bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] ${selectedTrip.status === 'active' ? 'bg-primary text-on-primary' : 'bg-fill text-ink-3'}`}>{selectedTrip.status === 'active' ? '进行中' : '已结束'}</span>
                    <span className="text-xs text-ink-3">{selectedTrip.travelDays} 天 · {selectedTrip.lodgingNights} 晚</span>
                  </div>
                  <h2 className="text-xl font-bold mt-2 truncate">{selectedTrip.title}</h2>
                  <p className="text-xs text-ink-3 mt-1 flex items-center gap-1"><MapPin size={13} />{selectedTrip.location} · {selectedTrip.startDate} 至 {selectedTrip.endDate}</p>
                </div>
                <button className="w-10 h-10 shrink-0 rounded-xl bg-fill grid place-items-center" aria-label="编辑出差信息" onClick={() => openEditTrip(selectedTrip)}><Pencil size={17} /></button>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-line text-center">
                <div><span className="block text-[10px] text-ink-3">工资/天</span><strong className="block text-sm mt-1">¥ {toYuan(selectedTrip.dailySalaryCents)}</strong></div>
                <div><span className="block text-[10px] text-ink-3">补贴/天</span><strong className="block text-sm mt-1">¥ {toYuan(selectedTrip.dailyAllowanceCents)}</strong></div>
                <div><span className="block text-[10px] text-ink-3">住宿/晚</span><strong className="block text-sm mt-1">¥ {toYuan(selectedTrip.lodgingLimitCents)}</strong></div>
              </div>
            </section>

            <section className="rounded-2xl bg-card p-4 mt-3">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">本次汇总</h2>
                <span className="text-[11px] text-ink-3">工资、补贴与报销分开计算</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <SummaryCell label={`固定工资 · ${selectedTrip.salaryDays} 天`} value={totals.salary} />
                <SummaryCell label={`出差补贴 · ${selectedTrip.travelDays} 天`} value={totals.allowance} />
                <SummaryCell label="公司待报销" value={totals.pending} tone="primary" />
                <SummaryCell label="自费 / 超额" value={totals.personal} tone={totals.personal > 0 ? 'danger' : 'normal'} />
              </div>
              <div className="mt-3 pt-3 border-t border-line flex justify-between text-xs">
                <span className="text-ink-3">补贴已消费 ¥ {toYuan(totals.allowanceSpent)}</span>
                <span className="text-ink-3">报销已到账 ¥ {toYuan(totals.paid)}</span>
              </div>
            </section>

            <section className="rounded-2xl bg-card p-4 mt-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">消费记录</h2>
                  <p className="text-[11px] text-ink-3 mt-0.5">{sortedExpenses.length} 笔 · 可报销共 ¥ {toYuan(totals.reimbursement)}</p>
                </div>
                <button className="h-10 px-3 rounded-xl bg-primary text-on-primary text-sm font-medium flex items-center gap-1" onClick={openAddExpense}><Plus size={16} />记消费</button>
              </div>

              {sortedExpenses.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm text-ink-3">还没有消费记录</p>
                  <p className="text-[11px] text-ink-3 mt-1">打车、住宿、餐饮等都可以单独记录</p>
                </div>
              ) : (
                <div className="divide-y divide-line mt-3">
                  {sortedExpenses.map((expense) => {
                    const category = categoryInfo(expense.category);
                    const reimbursable = reimbursableCents(expense, selectedTrip);
                    const overLimit = personalCents(expense, selectedTrip);
                    return (
                      <article key={expense.id} className="py-3">
                        <button className="w-full flex items-center gap-3 text-left" onClick={() => openEditExpense(expense)}>
                          <span className="w-10 h-10 rounded-xl bg-fill text-ink-2 grid place-items-center shrink-0">{category.icon}</span>
                          <span className="flex-1 min-w-0">
                            <span className="flex items-center gap-2"><strong className="text-sm font-medium">{category.label}</strong><small className="text-[10px] text-ink-3">{dateLabel(expense.date)}</small></span>
                            <small className="block text-[11px] text-ink-3 mt-1 truncate">{SOURCE_LABELS[expense.paymentSource]} · {INVOICE_LABELS[expense.invoiceStatus]}{expense.note ? ` · ${expense.note}` : ''}</small>
                          </span>
                          <span className="shrink-0 text-right">
                            <strong className="block text-sm">¥ {toYuan(expense.amountCents)}</strong>
                            <small className={`block text-[10px] mt-1 ${expense.paymentSource === 'company' ? expense.claimStatus === 'paid' ? 'text-success' : 'text-primary' : 'text-ink-3'}`}>{expense.paymentSource === 'company' ? CLAIM_LABELS[expense.claimStatus] : SOURCE_LABELS[expense.paymentSource]}</small>
                          </span>
                        </button>
                        {(reimbursable > 0 || overLimit > 0) && (
                          <div className="ml-[52px] mt-2 flex items-center justify-between gap-2">
                            <span className="text-[10px] text-ink-3">可报 ¥ {toYuan(reimbursable)}{overLimit > 0 ? ` · 超额 ¥ ${toYuan(overLimit)}` : ''}</span>
                            {expense.paymentSource === 'company' && (
                              <button className={`min-h-9 px-3 rounded-lg text-xs ${expense.claimStatus === 'paid' ? 'bg-fill text-ink-3' : 'border border-primary text-primary'}`} onClick={() => void advanceClaim(expense)}>
                                {expense.claimStatus === 'unsubmitted' ? '标记已提交' : expense.claimStatus === 'submitted' ? '确认已到账' : '撤销到账'}
                              </button>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <div className="grid grid-cols-2 gap-2 mt-3">
              <button className="h-11 rounded-xl bg-card text-sm font-medium" onClick={() => setTripListOpen(true)}>全部出差（{trips.length}）</button>
              <button className="h-11 rounded-xl bg-card text-sm font-medium" onClick={() => void toggleTripStatus()}>{selectedTrip.status === 'active' ? '结束本次出差' : '恢复进行中'}</button>
            </div>
            <p className="text-[11px] text-ink-3 text-center mt-3">本页面独立记录，不生成主账本账单，也不修改账户余额</p>
          </>
        )}
      </main>

      <Sheet open={tripListOpen} onClose={() => setTripListOpen(false)} title="全部出差">
        <div className="px-4 pb-6">
          <button className="w-full h-11 mb-3 rounded-xl bg-primary text-on-primary font-medium flex items-center justify-center gap-1" onClick={openAddTrip}><Plus size={17} />新建出差</button>
          <div className="divide-y divide-line">
            {sortedTrips.map((trip) => (
              <button key={trip.id} className="w-full py-3 flex items-center gap-3 text-left" onClick={() => { setSelectedId(trip.id); setTripListOpen(false); }}>
                <span className="w-10 h-10 rounded-xl bg-fill text-primary grid place-items-center"><Briefcase size={18} /></span>
                <span className="flex-1 min-w-0"><strong className="block text-sm truncate">{trip.title}</strong><small className="block text-xs text-ink-3 mt-0.5 truncate">{trip.location} · {trip.startDate}</small></span>
                <span className={`text-[10px] ${trip.status === 'active' ? 'text-primary' : 'text-ink-3'}`}>{trip.status === 'active' ? '进行中' : '已结束'}</span>
                <ChevronRight size={15} className="text-ink-3" />
              </button>
            ))}
          </div>
        </div>
      </Sheet>

      <Sheet open={tripEditorOpen} onClose={() => setTripEditorOpen(false)} title={editingTripId ? '编辑出差信息' : '新建出差'}>
        <div className="px-4 pb-6 space-y-3">
          <FormField label="出差名称"><input value={tripTitle} onChange={(event) => setTripTitle(event.target.value)} maxLength={30} placeholder="例如：上海项目支持" className="field-input" /></FormField>
          <FormField label="出差地点（自由填写）"><div className="flex items-center gap-2 w-full"><MapPin size={16} className="text-ink-3 shrink-0" /><input value={tripLocation} onChange={(event) => setTripLocation(event.target.value)} maxLength={30} placeholder="例如：上海" className="field-input" /></div></FormField>
          <div className="grid grid-cols-2 gap-2">
            <FormField label="开始日期"><input type="date" value={tripStart} onChange={(event) => { const value = event.target.value; setTripStart(value); recalculateDates(value, tripEnd); }} className="field-input" /></FormField>
            <FormField label="结束日期"><input type="date" value={tripEnd} onChange={(event) => { const value = event.target.value; setTripEnd(value); recalculateDates(tripStart, value); }} className="field-input" /></FormField>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <FormField label="出差天数"><input type="number" min="1" step="1" inputMode="numeric" value={travelDays} onChange={(event) => setTravelDays(event.target.value)} className="field-input text-center" /></FormField>
            <FormField label="计薪天数"><input type="number" min="0" step="1" inputMode="numeric" value={salaryDays} onChange={(event) => setSalaryDays(event.target.value)} className="field-input text-center" /></FormField>
            <FormField label="住宿晚数"><input type="number" min="0" step="1" inputMode="numeric" value={lodgingNights} onChange={(event) => setLodgingNights(event.target.value)} className="field-input text-center" /></FormField>
          </div>
          <p className="text-[11px] text-ink-3">修改日期会自动重算天数，之后仍可手动调整。</p>
          <div className="pt-2 border-t border-line">
            <p className="text-sm font-semibold mb-3">本次资金标准</p>
            <div className="grid grid-cols-3 gap-2">
              <MoneyField label="工资/天" value={dailySalary} onChange={setDailySalary} />
              <MoneyField label="补贴/天" value={dailyAllowance} onChange={setDailyAllowance} />
              <MoneyField label="住宿/晚" value={lodgingLimit} onChange={setLodgingLimit} />
            </div>
            <p className="text-[11px] text-ink-3 mt-2">打车默认按实际金额报销；每笔消费仍可改为补贴内消费或自费。</p>
          </div>
          <button className="w-full h-11 rounded-xl bg-primary text-on-primary font-medium" onClick={() => void saveTrip()}>保存</button>
          {editingTripId && <button className="w-full h-11 text-danger flex items-center justify-center gap-1" onClick={() => void deleteTrip()}><Trash2 size={17} />删除本次出差</button>}
        </div>
      </Sheet>

      <Sheet open={expenseEditorOpen} onClose={() => setExpenseEditorOpen(false)} title={editingExpenseId ? '编辑消费记录' : '记录出差消费'}>
        <div className="px-4 pb-6 space-y-3">
          <div>
            <span className="block text-xs text-ink-3 mb-1.5">消费类型</span>
            <div className="grid grid-cols-5 gap-1.5">
              {CATEGORY_OPTIONS.map((option) => (
                <button key={option.value} className={`min-h-[62px] rounded-xl flex flex-col items-center justify-center gap-1 text-[11px] ${expenseCategory === option.value ? 'bg-primary text-on-primary' : 'bg-fill text-ink-2'}`} onClick={() => setExpenseCategory(option.value)}>
                  {option.icon}<span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <FormField label="消费日期"><input type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} className="field-input" /></FormField>
            <MoneyField label="消费金额" value={expenseAmount} onChange={setExpenseAmount} placeholder="0.00" />
          </div>
          {expenseCategory === 'lodging' && (
            <FormField label="这笔住宿包含晚数"><input type="number" min="1" step="1" inputMode="numeric" value={expenseUnits} onChange={(event) => setExpenseUnits(event.target.value)} className="field-input" /></FormField>
          )}
          <div>
            <span className="block text-xs text-ink-3 mb-1.5">费用归属</span>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(SOURCE_LABELS) as PaymentSource[]).map((source) => (
                <button key={source} className={`h-11 rounded-xl text-xs ${paymentSource === source ? 'bg-primary text-on-primary' : 'bg-fill text-ink-2'}`} onClick={() => setPaymentSource(source)}>{SOURCE_LABELS[source]}</button>
              ))}
            </div>
          </div>
          {paymentSource === 'company' && (
            <div className="grid grid-cols-2 gap-2">
              <SelectField label="报销状态" value={claimStatus} onChange={(value) => setClaimStatus(value as ClaimStatus)}>
                {(Object.keys(CLAIM_LABELS) as ClaimStatus[]).map((status) => <option key={status} value={status}>{CLAIM_LABELS[status]}</option>)}
              </SelectField>
              <SelectField label="发票状态" value={invoiceStatus} onChange={(value) => setInvoiceStatus(value as InvoiceStatus)}>
                {(Object.keys(INVOICE_LABELS) as InvoiceStatus[]).map((status) => <option key={status} value={status}>{INVOICE_LABELS[status]}</option>)}
              </SelectField>
            </div>
          )}
          {paymentSource !== 'company' && (
            <SelectField label="凭证状态" value={invoiceStatus} onChange={(value) => setInvoiceStatus(value as InvoiceStatus)}>
              {(Object.keys(INVOICE_LABELS) as InvoiceStatus[]).map((status) => <option key={status} value={status}>{INVOICE_LABELS[status]}</option>)}
            </SelectField>
          )}
          {selectedTrip && expenseCategory === 'lodging' && paymentSource === 'company' && parseYuanToCents(expenseAmount) && (
            <div className="rounded-xl bg-fill px-3 py-2 text-xs flex items-center justify-between">
              <span className="text-ink-3">按 {expenseUnits || 1} 晚计算</span>
              <span>可报 ¥ {toYuan(Math.min(parseYuanToCents(expenseAmount)!, selectedTrip.lodgingLimitCents * Math.max(1, Number(expenseUnits) || 1)))}</span>
            </div>
          )}
          <FormField label="备注（可选）"><input value={expenseNote} onChange={(event) => setExpenseNote(event.target.value)} maxLength={50} placeholder="例如：机场到酒店" className="field-input" /></FormField>
          <button className="w-full h-11 rounded-xl bg-primary text-on-primary font-medium" onClick={() => void saveExpense()}>保存</button>
          {editingExpenseId && <button className="w-full h-11 text-danger flex items-center justify-center gap-1" onClick={() => void deleteExpense()}><Trash2 size={17} />删除这条消费</button>}
        </div>
      </Sheet>
    </div>
  );
}

function SummaryCell({ label, value, tone = 'normal' }: { label: string; value: number; tone?: 'normal' | 'primary' | 'danger' }) {
  return (
    <div className="rounded-xl bg-fill p-3">
      <span className="block text-[10px] text-ink-3 truncate">{label}</span>
      <strong className={`block text-base mt-1 ${tone === 'primary' ? 'text-primary' : tone === 'danger' ? 'text-danger' : ''}`}>¥ {toYuan(value)}</strong>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="block text-xs text-ink-3 mb-1.5">{label}</span><div className="h-12 rounded-xl bg-fill px-3 flex items-center">{children}</div></label>;
}

function MoneyField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="block text-xs text-ink-3 mb-1.5">{label}</span>
      <div className="h-12 rounded-xl bg-fill px-2 flex items-center gap-1"><span className="text-xs text-ink-3">¥</span><input value={value} onChange={(event) => onChange(event.target.value)} inputMode="decimal" placeholder={placeholder} className="field-input" /></div>
    </label>
  );
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-ink-3 mb-1.5">{label}</span>
      <div className="h-12 rounded-xl bg-fill px-3 flex items-center"><select value={value} onChange={(event) => onChange(event.target.value)} className="field-input">{children}</select></div>
    </label>
  );
}
