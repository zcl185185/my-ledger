export type BillType = 'expense' | 'income';

export interface Bill {
  id: string;
  ledgerId: string;
  type: BillType;
  amountCents: number;
  categoryId: string;
  tagIds: string[];
  note: string;
  accountId?: string;
  /** 普通收支不填；转账（含信用卡还款）使用 transfer，不计入收入和支出 */
  kind?: 'standard' | 'transfer';
  /** 转入账户；仅 kind=transfer 时使用 */
  toAccountId?: string;
  occurredAt: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  /** 凭证照片（本地 IndexedDB photos 表的 id 列表，最多 3 张）。不参与云备份/同步 */
  photoIds?: string[];
}

/** 凭证照片：仅存本地 IndexedDB（体积原因不进 JSON 备份/云同步通道） */
export interface Photo {
  id: string;
  billId: string;
  blob: Blob;
  createdAt: number;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  type: BillType;
  color?: string;
  sort: number;
  builtin: boolean;
  hidden?: boolean;
}

export type AccountType =
  | 'cash'
  | 'card'
  | 'bank'
  | 'credit'
  | 'ewallet'
  | 'investment'
  | 'loan'
  | 'receivable'
  | 'custom_asset'
  | 'custom_liability';

export interface BalanceAdjustment {
  id: string;
  /** 本次校准带来的差额；资产余额、负债余额均以正数表示 */
  deltaCents: number;
  balanceAfterCents: number;
  occurredAt: number;
  note?: string;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  icon: string;
  sort: number;
  initialCents?: number;
  note?: string;
  adjustments?: BalanceAdjustment[];
  updatedAt?: number;
}

export interface Tag {
  id: string;
  name: string;
  color?: string;
}

export interface Budget {
  yearMonth: string;
  amountCents: number;
  updatedAt?: number;
}

export interface Ledger {
  id: string;
  name: string;
  builtin: boolean;
}

export interface RecurringBill {
  id: string;
  name: string;
  type: BillType;
  amountCents: number;
  categoryId: string;
  accountId: string;
  note: string;
  frequency: 'monthly' | 'yearly';
  dayOfMonth: number;
  /** yearly 时使用，1-12 */
  monthOfYear?: number;
  enabled: boolean;
  /** 已处理（记入或跳过）的周期，如 2026-09 / 2026 */
  lastHandledKey?: string;
  createdAt: number;
  updatedAt: number;
}

/** 独立规划功能也进入账号数据仓库，随云端保险库跨设备同步。 */
export interface RepaymentPlan {
  id: string;
  name: string;
  dueDate: string;
  amountCents: number;
  note: string;
  updatedAt: number;
  paidAt?: number;
  deletedAt?: number;
}

export type AllocationBucketKey = 'needs' | 'security' | 'growth' | 'flexible';
export type AllocationExpenseType = 'fixed' | 'monthly';

export interface AllocationExpense {
  id: string;
  bucket: AllocationBucketKey;
  name: string;
  amountCents: number;
  type: AllocationExpenseType;
  updatedAt: number;
}

export interface AllocationBucketDetail {
  location: string;
  description: string;
}

export type AllocationBucketDetails = Record<AllocationBucketKey, AllocationBucketDetail>;

export interface MonthlyAllocationPlan {
  yearMonth: string;
  amountCents: number;
  incomeType: string;
  items: AllocationExpense[];
  swept: { needs: number; growth: number; flexible: number };
  bucketDetails?: AllocationBucketDetails;
  savedAt: number;
  deletedAt?: number;
}

export type TripStatus = 'active' | 'completed';
export type TripExpenseCategory = 'taxi' | 'lodging' | 'meal' | 'transport' | 'other';
export type TripPaymentSource = 'company' | 'allowance' | 'self';
export type TripClaimStatus = 'unsubmitted' | 'submitted' | 'paid';
export type TripInvoiceStatus = 'not_required' | 'pending' | 'ready';

export interface TripExpense {
  id: string;
  date: string;
  category: TripExpenseCategory;
  amountCents: number;
  units: number;
  paymentSource: TripPaymentSource;
  claimStatus: TripClaimStatus;
  invoiceStatus: TripInvoiceStatus;
  note: string;
  updatedAt: number;
  deletedAt?: number;
}

export interface BusinessTrip {
  id: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  travelDays: number;
  salaryDays: number;
  lodgingNights: number;
  dailySalaryCents: number;
  dailyAllowanceCents: number;
  lodgingLimitCents: number;
  status: TripStatus;
  expenses: TripExpense[];
  updatedAt: number;
  deletedAt?: number;
}

export interface FullDump {
  meta: { schemaVersion: number; exportedAt: number; appVersion: string };
  data: {
    bills: Bill[];
    categories: Category[];
    accounts: Account[];
    tags: Tag[];
    ledgers: Ledger[];
    budgets: Budget[];
    recurringBills: RecurringBill[];
    repaymentPlans: RepaymentPlan[];
    allocationPlans: MonthlyAllocationPlan[];
    businessTrips: BusinessTrip[];
  };
}

export interface BackupMeta {
  schemaVersion: number;
  exportedAt: number;
  appVersion: string;
  deviceId: string;
}

export type BackupFile =
  | { v: 1; enc: false; meta: BackupMeta; data: FullDump['data'] }
  | { v: 1; enc: true; kdf: 'PBKDF2-SHA256'; iter: number; salt: string; iv: string; ct: string };

export interface SyncConfig {
  enabled: boolean;
  adapter: 'gist' | 'webdav';
  encrypt: boolean;
  // gist
  token?: string;
  gistId?: string;
  // webdav（经 Cloudflare Worker 中继）
  relayUrl?: string;
  webdavUrl?: string;
  username?: string;
  appPassword?: string;
}
