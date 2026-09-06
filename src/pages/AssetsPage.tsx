import { useMemo, useState, type ReactNode } from 'react';
import {
  BadgeDollarSign,
  CalendarClock,
  ChartPie,
  ChevronRight,
  CreditCard,
  DatabaseBackup,
  Eye,
  EyeOff,
  Gem,
  HandCoins,
  House,
  Landmark,
  Pencil,
  Plus,
  Repeat2,
  Smartphone,
  Tags,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Sheet } from '../components/Sheet';
import { useData } from '../store/data';
import { useSettings } from '../store/settings';
import { useUI } from '../store/ui';
import type { Account, AccountType } from '../types';
import { ACCOUNT_TYPES, accountBalanceAt, accountIcon, accountNature, accountTypeLabel, billEffectOnAccount, portfolioTotals } from '../utils/accounts';
import { uuid } from '../utils/compat';
import { toYuan, toYuanTrim } from '../utils/money';

const COLORS = ['#D3A52D', '#5B8DEF', '#45B987', '#D86A7A', '#826ED8', '#D58245', '#55AEB5', '#8995A8'];

function amountToCents(value: string): number | null {
  const s = value.trim();
  if (!/^-?\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  const negative = s.startsWith('-');
  const [whole = '0', decimals = ''] = (negative ? s.slice(1) : s).split('.');
  const cents = Number(whole) * 100 + Number((decimals + '00').slice(0, 2));
  return negative ? -cents : cents;
}

export function AssetsPage() {
  const navigate = useNavigate();
  const accounts = useData((s) => s.accounts);
  const bills = useData((s) => s.bills);
  const categories = useData((s) => s.categories);
  const upsertAccount = useData((s) => s.upsertAccount);
  const deleteAccount = useData((s) => s.deleteAccount);
  const hide = useSettings((s) => s.hideAmount);
  const setSettings = useSettings((s) => s.set);
  const toast = useUI((s) => s.toast);
  const confirm = useUI((s) => s.confirm);

  const [typeOpen, setTypeOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [detail, setDetail] = useState<Account | null>(null);
  const [editing, setEditing] = useState<Account | null>(null);
  const [editType, setEditType] = useState<AccountType>('cash');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [opening, setOpening] = useState('0');
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [actualBalance, setActualBalance] = useState('');
  const [adjustNote, setAdjustNote] = useState('余额校准');

  const totals = useMemo(() => portfolioTotals(accounts, bills), [accounts, bills]);
  const sorted = useMemo(() => [...accounts].sort((a, b) => a.sort - b.sort), [accounts]);
  const assets = sorted.filter((a) => accountNature(a) === 'asset');
  const liabilities = sorted.filter((a) => accountNature(a) === 'liability');
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const accountTransactions = useMemo(() => {
    if (!detail) return [];
    return bills
      .filter((b) => !b.deletedAt && (b.accountId === detail.id || b.toAccountId === detail.id))
      .sort((a, b) => b.occurredAt - a.occurredAt || b.createdAt - a.createdAt);
  }, [bills, detail]);
  const show = (cents: number) => (hide ? '****' : toYuan(cents));

  const trend = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const offset = i - 11;
      const end = offset === 0
        ? Date.now()
        : new Date(now.getFullYear(), now.getMonth() + offset + 1, 0, 23, 59, 59, 999).getTime();
      return { label: `${new Date(end).getMonth() + 1}月`, value: portfolioTotals(accounts, bills, end).netWorth };
    });
  }, [accounts, bills]);

  const openAdd = (type: AccountType) => {
    setEditing(null);
    setEditType(type);
    setName('');
    setNote('');
    setOpening('0');
    setTypeOpen(false);
    setEditorOpen(true);
  };

  const openEdit = (account: Account) => {
    setEditing(account);
    setEditType(account.type);
    setName(account.name);
    setNote(account.note ?? '');
    setOpening(toYuanTrim(account.initialCents ?? 0));
    setDetail(null);
    setEditorOpen(true);
  };

  const saveAccount = async () => {
    const n = name.trim();
    const cents = amountToCents(opening);
    if (!n) return toast('请输入账户名称', 'err');
    if (cents === null) return toast('请输入正确余额', 'err');
    const next: Account = editing
      ? { ...editing, name: n, note: note.trim(), type: editType, icon: accountIcon(editType), initialCents: cents }
      : { id: uuid(), name: n, note: note.trim(), type: editType, icon: accountIcon(editType), sort: accounts.length, initialCents: cents, adjustments: [], updatedAt: Date.now() };
    await upsertAccount(next);
    setEditorOpen(false);
    toast(editing ? '账户已更新' : '账户已添加');
  };

  const startAdjust = (account: Account) => {
    const current = accountBalanceAt(account, bills);
    setActualBalance(toYuanTrim(current));
    setAdjustNote('余额校准');
    setDetail(account);
    setAdjustOpen(true);
  };

  const saveAdjustment = async () => {
    if (!detail) return;
    const target = amountToCents(actualBalance);
    if (target === null) return toast('请输入正确余额', 'err');
    const current = accountBalanceAt(detail, bills);
    const delta = target - current;
    if (delta === 0) {
      setAdjustOpen(false);
      return toast('余额没有变化', 'info');
    }
    const updated: Account = {
      ...detail,
      adjustments: [
        ...(detail.adjustments ?? []),
        { id: uuid(), deltaCents: delta, balanceAfterCents: target, occurredAt: Date.now(), note: adjustNote.trim() || '余额校准' },
      ],
    };
    await upsertAccount(updated);
    setDetail(updated);
    setAdjustOpen(false);
    toast('余额已校准');
  };

  const remove = async (account: Account) => {
    const ok = await confirm({ title: `删除账户「${account.name}」？`, message: '有关联账单的账户不能删除', confirmText: '删除', danger: true });
    if (!ok) return;
    const success = await deleteAccount(account.id);
    if (success) setDetail(null);
    toast(success ? '已删除' : '该账户已有账单，不能删除', success ? 'ok' : 'err');
  };

  return (
    <div className="min-h-full bg-surface pb-28">
      <header className="pt-safe px-4 pt-3 pb-5">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">资产管家</h1>
          <button className="p-2 -mr-2" aria-label="隐藏金额" onClick={() => setSettings({ hideAmount: !hide })}>
            {hide ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
        <div className="rounded-2xl p-5 text-on-primary shadow-lg" style={{ background: 'linear-gradient(135deg, var(--primary), #e5bd55)' }}>
          <p className="text-xs opacity-70">净资产</p>
          <p className="text-3xl font-bold mt-1">¥ {show(totals.netWorth)}</p>
          <div className="grid grid-cols-2 gap-4 mt-5 pt-4 border-t border-black/10">
            <div><p className="text-xs opacity-65">总资产</p><p className="font-semibold mt-0.5">¥ {show(totals.assets)}</p></div>
            <div><p className="text-xs opacity-65">总负债</p><p className="font-semibold mt-0.5">¥ {show(totals.liabilities)}</p></div>
          </div>
        </div>
      </header>

      <main className="px-3 space-y-3">
        <section className="rounded-2xl bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">常用功能</h2>
            <span className="text-xs text-ink-3">点击进入独立页面</span>
          </div>
          <div className="grid grid-cols-4 gap-x-2 gap-y-3">
            <FeatureButton icon={<CalendarClock size={20} />} label="还款时间轴" onClick={() => navigate('/repayment')} emphasis />
            <FeatureButton icon={<ChartPie size={20} />} label="6211 财务" onClick={() => navigate('/allocation-6211')} />
            <FeatureButton icon={<Repeat2 size={20} />} label="周期记账" onClick={() => navigate('/settings/recurring')} />
            <FeatureButton icon={<Tags size={20} />} label="分类管理" onClick={() => navigate('/settings/categories')} />
            <FeatureButton icon={<DatabaseBackup size={20} />} label="数据备份" onClick={() => navigate('/settings/backup')} />
          </div>
        </section>

        <section className="rounded-2xl bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">净资产趋势</h2>
            <span className="text-xs text-ink-3">近 12 个月</span>
          </div>
          <TrendChart values={trend.map((x) => x.value)} hide={hide} />
          <div className="flex justify-between text-[10px] text-ink-3 mt-1">
            <span>{trend[0]?.label}</span><span>{trend[5]?.label}</span><span>{trend[11]?.label}</span>
          </div>
        </section>

        <section className="rounded-2xl bg-card p-4">
          <h2 className="font-semibold mb-4">资产与负债</h2>
          <div className="flex items-center gap-5">
            <PortfolioRing assets={totals.assets} liabilities={totals.liabilities} />
            <div className="flex-1 space-y-3 text-sm">
              <Legend color={COLORS[0]!} label="资产" value={`¥ ${show(totals.assets)}`} />
              <Legend color="#d86a7a" label="负债" value={`¥ ${show(totals.liabilities)}`} />
              <Legend color="#8995a8" label="净资产" value={`¥ ${show(totals.netWorth)}`} />
            </div>
          </div>
        </section>

        <AccountGroup title="资产账户" items={assets} bills={bills} hide={hide} onOpen={setDetail} />
        <AccountGroup title="负债账户" items={liabilities} bills={bills} hide={hide} onOpen={setDetail} />

        <button className="w-full h-12 rounded-2xl bg-primary text-on-primary font-semibold flex items-center justify-center gap-1.5" onClick={() => setTypeOpen(true)}>
          <Plus size={19} /> 添加账户
        </button>
      </main>

      <Sheet open={typeOpen} onClose={() => setTypeOpen(false)} title="选择账户类型">
        <div className="px-4 pb-6">
          {(['asset', 'liability'] as const).map((group) => (
            <div key={group} className="mb-4">
              <p className="text-xs text-ink-3 mb-2">{group === 'asset' ? '资产' : '负债'}</p>
              <div className="grid grid-cols-3 gap-2">
                {ACCOUNT_TYPES.filter((x) => x.group === group).map((item) => (
                  <button key={item.value} className="rounded-xl bg-fill py-3 px-1 flex flex-col items-center gap-1" onClick={() => openAdd(item.value)}>
                    <AccountGlyph type={item.value} size={21} />
                    <span className="text-xs font-medium">{item.label}</span>
                    <span className="text-[9px] text-ink-3">{item.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Sheet>

      <Sheet open={editorOpen} onClose={() => setEditorOpen(false)} title={editing ? '编辑账户' : `添加${accountTypeLabel(editType)}`}>
        <div className="px-4 pb-6 space-y-3">
          <Field label="账户名称"><input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} placeholder="例如：工资卡" className="field-input" /></Field>
          <Field label={accountNature({ type: editType } as Account) === 'asset' ? '初始余额' : '当前欠款'}>
            <div className="flex items-center gap-2"><span className="text-ink-3">¥</span><input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} className="field-input flex-1" /></div>
          </Field>
          <Field label="备注（可选）"><input value={note} maxLength={30} onChange={(e) => setNote(e.target.value)} placeholder="开户行、卡号后四位等" className="field-input" /></Field>
          <p className="text-xs text-ink-3">保存后，记账选择此账户，余额会自动增减。</p>
          <button className="w-full h-11 rounded-xl bg-primary text-on-primary font-medium" onClick={() => void saveAccount()}>保存</button>
        </div>
      </Sheet>

      <Sheet open={!!detail && !adjustOpen} onClose={() => setDetail(null)} title={detail?.name ?? ''}>
        {detail && (
          <div className="px-4 pb-6">
            <div className="rounded-2xl bg-fill p-4 mb-4">
              <p className="text-xs text-ink-3">{accountNature(detail) === 'asset' ? '当前余额' : '当前欠款'}</p>
              <p className="text-2xl font-bold mt-1">¥ {show(accountBalanceAt(detail, bills))}</p>
              <p className="text-xs text-ink-3 mt-1">{accountTypeLabel(detail.type)}{detail.note ? ` · ${detail.note}` : ''}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-5">
              <button className="h-11 rounded-xl bg-primary text-on-primary font-medium" onClick={() => startAdjust(detail)}>校准余额</button>
              <button className="h-11 rounded-xl bg-fill font-medium flex items-center justify-center gap-1" onClick={() => openEdit(detail)}><Pencil size={16} /> 编辑</button>
            </div>
            <div className="flex items-center justify-between mb-2"><p className="text-sm font-semibold">账户流水</p><span className="text-xs text-ink-3">{accountTransactions.length} 笔</span></div>
            <div className="divide-y divide-line mb-5">
              {accountTransactions.length === 0 ? <p className="text-xs text-ink-3 py-4">暂无账户流水</p> : accountTransactions.map((bill) => {
                const effect = billEffectOnAccount(bill, detail);
                const isOut = bill.kind === 'transfer' && bill.accountId === detail.id;
                const other = accountMap.get(isOut ? bill.toAccountId ?? '' : bill.accountId ?? '');
                const label = bill.kind === 'transfer'
                  ? isOut
                    ? `转出至 ${other?.name ?? '未知账户'}`
                    : accountNature(detail) === 'liability'
                      ? `从 ${other?.name ?? '未知账户'} 还款`
                      : `从 ${other?.name ?? '未知账户'} 转入`
                  : categoryMap.get(bill.categoryId)?.name ?? '未分类';
                return (
                  <div key={bill.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0"><p className="text-sm truncate">{label}</p><p className="text-xs text-ink-3 truncate">{new Date(bill.occurredAt).toLocaleDateString('zh-CN')}{bill.note ? ` · ${bill.note}` : ''}</p></div>
                    <span className={`text-sm font-semibold shrink-0 ${effect > 0 ? 'text-success' : effect < 0 ? 'text-danger' : 'text-ink'}`}>{effect > 0 ? '+' : ''}{show(effect)}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-sm font-semibold mb-2">余额校准记录</p>
            <div className="divide-y divide-line">
              {(detail.adjustments ?? []).length === 0 ? <p className="text-xs text-ink-3 py-4">暂无校准记录</p> : [...(detail.adjustments ?? [])].reverse().map((item) => (
                <div key={item.id} className="py-3 flex justify-between text-sm">
                  <div><p>{item.note || '余额校准'}</p><p className="text-xs text-ink-3">{new Date(item.occurredAt).toLocaleDateString('zh-CN')}</p></div>
                  <div className="text-right"><p>{item.deltaCents > 0 ? '+' : ''}{show(item.deltaCents)}</p><p className="text-xs text-ink-3">校准后 {show(item.balanceAfterCents)}</p></div>
                </div>
              ))}
            </div>
            <button className="w-full h-10 mt-4 text-danger flex items-center justify-center gap-1" onClick={() => void remove(detail)}><Trash2 size={16} /> 删除账户</button>
          </div>
        )}
      </Sheet>

      {adjustOpen && (
        <div className="fixed inset-0 z-50" role="presentation">
          <button className="absolute inset-0 w-full h-full bg-scrim" aria-label="关闭校准余额" onClick={() => setAdjustOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="校准余额"
            className="absolute left-4 right-4 rounded-2xl bg-card border border-line shadow-lg p-4"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 28px)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">校准余额</h3>
              <button className="p-2 -mr-2 text-ink-3" aria-label="关闭" onClick={() => setAdjustOpen(false)}><X size={20} /></button>
            </div>
            <p className="text-xs text-ink-3 mb-3">输入你现在实际看到的余额，系统会自动记录差额。</p>
            <div className="grid grid-cols-[1fr_0.8fr] gap-2 mb-3">
              <label className="block">
                <span className="block text-xs text-ink-3 mb-1">{detail && accountNature(detail) === 'liability' ? '实际欠款' : '实际余额'}</span>
                <div className="h-12 rounded-xl bg-fill px-3 flex items-center gap-2">
                  <span className="text-ink-3">¥</span>
                  <input autoFocus inputMode="decimal" value={actualBalance} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setActualBalance(e.target.value)} className="field-input flex-1" />
                </div>
              </label>
              <label className="block">
                <span className="block text-xs text-ink-3 mb-1">说明</span>
                <div className="h-12 rounded-xl bg-fill px-3 flex items-center">
                  <input value={adjustNote} maxLength={30} onChange={(e) => setAdjustNote(e.target.value)} className="field-input" />
                </div>
              </label>
            </div>
            <button className="w-full h-11 rounded-xl bg-primary text-on-primary font-medium" onClick={() => void saveAdjustment()}>确认校准</button>
          </div>
        </div>
      )}
    </div>
  );
}

function FeatureButton({ icon, label, onClick, emphasis = false }: { icon: ReactNode; label: string; onClick: () => void; emphasis?: boolean }) {
  return (
    <button className="min-w-0 min-h-[76px] rounded-xl flex flex-col items-center justify-start gap-1.5 px-1 py-1 text-center" onClick={onClick}>
      <span className={`w-11 h-11 rounded-xl flex items-center justify-center ${emphasis ? 'bg-primary text-on-primary' : 'bg-fill text-ink-2'}`}>{icon}</span>
      <span className="w-full text-[11px] font-medium truncate">{label}</span>
    </button>
  );
}

function AccountGroup({ title, items, bills, hide, onOpen }: { title: string; items: Account[]; bills: ReturnType<typeof useData.getState>['bills']; hide: boolean; onOpen: (a: Account) => void }) {
  return (
    <section className="rounded-2xl bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-line flex justify-between"><h2 className="font-semibold">{title}</h2><span className="text-xs text-ink-3">{items.length} 个账户</span></div>
      {items.length === 0 ? <p className="px-4 py-5 text-sm text-ink-3">还没有{title}</p> : items.map((a) => (
        <button key={a.id} className="w-full px-4 py-3 flex items-center gap-3 border-b border-line last:border-0 text-left" onClick={() => onOpen(a)}>
          <span className="w-10 h-10 rounded-xl bg-fill flex items-center justify-center text-ink-2"><AccountGlyph type={a.type} size={20} /></span>
          <span className="flex-1 min-w-0"><span className="block text-sm font-medium truncate">{a.name}</span><span className="block text-xs text-ink-3">{accountTypeLabel(a.type)}</span></span>
          <span className="text-sm font-semibold">¥ {hide ? '****' : toYuan(accountBalanceAt(a, bills))}</span>
          <ChevronRight size={15} className="text-ink-3" />
        </button>
      ))}
    </section>
  );
}

function TrendChart({ values, hide }: { values: number[]; hide: boolean }) {
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  const points = values.map((v, i) => `${8 + (i / Math.max(values.length - 1, 1)) * 304},${105 - ((v - min) / range) * 88}`).join(' ');
  return (
    <div>
      <svg viewBox="0 0 320 120" className="w-full h-32" role="img" aria-label="净资产趋势">
        <defs><linearGradient id="asset-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--primary)" stopOpacity=".28"/><stop offset="1" stopColor="var(--primary)" stopOpacity="0"/></linearGradient></defs>
        <line x1="8" y1="105" x2="312" y2="105" stroke="var(--line)" />
        <polygon points={`8,105 ${points} 312,105`} fill="url(#asset-fill)" />
        <polyline points={points} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="text-center text-xs text-ink-3 -mt-3">当前净资产 <b className="text-ink">¥ {hide ? '****' : toYuan(values[values.length - 1] ?? 0)}</b></p>
    </div>
  );
}

function PortfolioRing({ assets, liabilities }: { assets: number; liabilities: number }) {
  const total = Math.max(0, assets) + Math.max(0, liabilities);
  const assetPct = total ? (Math.max(0, assets) / total) * 100 : 100;
  return <div className="w-28 h-28 rounded-full shrink-0 relative" style={{ background: `conic-gradient(${COLORS[0]} 0 ${assetPct}%, #d86a7a ${assetPct}% 100%)` }}><div className="absolute inset-4 rounded-full bg-card flex items-center justify-center text-xs text-ink-3">资产结构</div></div>;
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} /><span className="text-ink-3">{label}</span><b className="ml-auto">{value}</b></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="block text-xs text-ink-3 mb-1.5">{label}</span><div className="h-12 rounded-xl bg-fill px-3 flex items-center">{children}</div></label>;
}

function AccountGlyph({ type, size = 20 }: { type: AccountType; size?: number }) {
  const props = { size, strokeWidth: 1.8 };
  if (type === 'bank' || type === 'card') return <Landmark {...props} />;
  if (type === 'credit') return <CreditCard {...props} />;
  if (type === 'ewallet') return <Smartphone {...props} />;
  if (type === 'investment') return <TrendingUp {...props} />;
  if (type === 'receivable') return <HandCoins {...props} />;
  if (type === 'custom_asset') return <Gem {...props} />;
  if (type === 'loan') return <House {...props} />;
  if (type === 'custom_liability') return <BadgeDollarSign {...props} />;
  return <Wallet {...props} />;
}
