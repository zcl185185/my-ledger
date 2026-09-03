import { create } from 'zustand';
import { repo } from '../db/repo';
import type { Account, Bill, Budget, Category, Ledger, RecurringBill, Tag } from '../types';
import { uuid } from '../utils/compat';
import type { StorageMode } from '../db/schema';
import { refreshSyncUI, scheduleSync } from '../sync/manager';

interface DataState {
  ready: boolean;
  accountId: string | null;
  mode: StorageMode;
  /** 最近一次持久化写入是否失败（配额满/存储损坏），App 顶部横幅据此提醒导出 */
  writeFailed: boolean;
  bills: Bill[];
  categories: Category[];
  accounts: Account[];
  tags: Tag[];
  ledgers: Ledger[];
  budgets: Budget[];
  recurringBills: RecurringBill[];
  currentLedgerId: string;
  init: (accountId: string) => Promise<void>;
  deactivate: () => void;
  sync: () => void;
  refresh: () => Promise<void>;
  setCurrentLedger: (id: string) => void;
  addBill: (input: { type: Bill['type']; amountCents: number; categoryId: string; note: string; accountId?: string; toAccountId?: string; kind?: Bill['kind']; occurredAt: number; tagIds?: string[]; ledgerId?: string; photoIds?: string[] }) => Promise<Bill>;
  updateBill: (bill: Bill) => Promise<void>;
  removeBill: (id: string) => Promise<void>;
  restoreBill: (id: string) => Promise<void>;
  upsertCategory: (c: Category) => Promise<void>;
  deleteCategory: (id: string) => Promise<boolean>;
  upsertAccount: (a: Account) => Promise<void>;
  deleteAccount: (id: string) => Promise<boolean>;
  upsertLedger: (l: Ledger) => Promise<void>;
  setBudget: (yearMonth: string, cents: number | null) => Promise<void>;
  upsertRecurringBill: (item: RecurringBill) => Promise<void>;
  deleteRecurringBill: (id: string) => Promise<void>;
}

/** 集合上次快照：内容未变时复用旧数组引用，避免未变化的表触发订阅者重渲。
 * repo 的变更均为整条替换/新增/生成新数组，未变条目保持对象引用，故逐项 === 比较可靠。 */
const lastArrays = new Map<string, unknown[]>();

function stableArray<T>(key: string, source: readonly T[]): T[] {
  const prev = lastArrays.get(key) as T[] | undefined;
  if (prev && prev.length === source.length && prev.every((item, i) => item === source[i])) {
    return prev;
  }
  const copy = [...source];
  lastArrays.set(key, copy);
  return copy;
}

export const useData = create<DataState>((set, get) => ({
  ready: false,
  accountId: null,
  mode: 'memory',
  writeFailed: false,
  bills: [],
  categories: [],
  accounts: [],
  tags: [],
  ledgers: [],
  budgets: [],
  recurringBills: [],
  currentLedgerId: 'builtin-ledger',

  init: async (accountId) => {
    if (get().ready && get().accountId === accountId) return;
    set({ ready: false });
    lastArrays.clear();
    await repo.init(accountId);
    repo.onChange = () => get().sync();
    const saved = repo.getMeta<string>('currentLedgerId');
    set({ ready: true, accountId, mode: repo.mode, writeFailed: repo.writeFailed, currentLedgerId: saved ?? repo.data.ledgers[0]?.id ?? 'builtin-ledger' });
    get().sync();
    refreshSyncUI(); // 冷启动后依据已加载的配置刷新同步芯片状态
  },

  deactivate: () => {
    repo.close();
    lastArrays.clear();
    set({
      ready: false,
      accountId: null,
      mode: 'memory',
      writeFailed: false,
      bills: [],
      categories: [],
      accounts: [],
      tags: [],
      ledgers: [],
      budgets: [],
      recurringBills: [],
      currentLedgerId: 'builtin-ledger',
    });
  },

  sync: () =>
    set({
      bills: stableArray('bills', repo.data.bills),
      categories: stableArray('categories', repo.data.categories),
      accounts: stableArray('accounts', repo.data.accounts),
      tags: stableArray('tags', repo.data.tags),
      ledgers: stableArray('ledgers', repo.data.ledgers),
      budgets: stableArray('budgets', repo.data.budgets),
      recurringBills: stableArray('recurringBills', repo.data.recurringBills),
      writeFailed: repo.writeFailed,
    }),

  refresh: async () => {
    await repo.reload();
  },

  setCurrentLedger: (id) => {
    set({ currentLedgerId: id });
    void repo.setMeta('currentLedgerId', id);
  },

  addBill: async (input) => {
    const now = Date.now();
    const bill: Bill = {
      id: uuid(),
      ledgerId: input.ledgerId ?? get().currentLedgerId,
      type: input.type,
      amountCents: input.amountCents,
      categoryId: input.categoryId,
      tagIds: input.tagIds ?? [],
      note: input.note,
      accountId: input.accountId,
      toAccountId: input.toAccountId,
      kind: input.kind,
      occurredAt: input.occurredAt,
      createdAt: now,
      updatedAt: now,
      ...(input.photoIds?.length ? { photoIds: input.photoIds } : {}),
    };
    await repo.upsertBill(bill);
    scheduleSync();
    return bill;
  },

  updateBill: async (bill) => {
    await repo.upsertBill({ ...bill, updatedAt: Date.now() });
    scheduleSync();
  },

  removeBill: async (id) => {
    await repo.deleteBill(id, true);
    scheduleSync();
  },

  restoreBill: async (id) => {
    await repo.restoreBill(id);
    scheduleSync();
  },

  upsertCategory: async (c) => {
    await repo.upsertCategory(c);
    scheduleSync();
  },

  deleteCategory: async (id) => {
    const ok = await repo.deleteCategory(id);
    if (ok) scheduleSync();
    return ok;
  },

  upsertAccount: async (a) => {
    await repo.upsertAccount({ ...a, updatedAt: Date.now() });
    scheduleSync();
  },

  deleteAccount: async (id) => {
    const ok = await repo.deleteAccount(id);
    if (ok) scheduleSync();
    return ok;
  },

  upsertLedger: async (l) => {
    await repo.upsertLedger(l);
    scheduleSync();
  },

  setBudget: async (yearMonth, cents) => {
    await repo.setBudget(yearMonth, cents);
    scheduleSync();
  },

  upsertRecurringBill: async (item) => {
    await repo.upsertRecurringBill({ ...item, updatedAt: Date.now() });
    scheduleSync();
  },

  deleteRecurringBill: async (id) => {
    await repo.deleteRecurringBill(id);
    scheduleSync();
  },
}));
