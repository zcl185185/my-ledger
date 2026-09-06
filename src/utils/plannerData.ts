import type { BusinessTrip, MonthlyAllocationPlan, RepaymentPlan, TripExpense } from '../types';

const BUCKET_KEYS = ['needs', 'security', 'growth', 'flexible'] as const;
const TRIP_CATEGORIES = ['taxi', 'lodging', 'meal', 'transport', 'other'] as const;

export function isRepaymentPlan(value: unknown): value is RepaymentPlan {
  if (!value || typeof value !== 'object') return false;
  const plan = value as Partial<RepaymentPlan>;
  return typeof plan.id === 'string'
    && typeof plan.name === 'string'
    && typeof plan.dueDate === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(plan.dueDate)
    && Number.isInteger(plan.amountCents)
    && Number(plan.amountCents) > 0
    && typeof plan.note === 'string'
    && typeof plan.updatedAt === 'number'
    && (plan.paidAt === undefined || typeof plan.paidAt === 'number')
    && (plan.deletedAt === undefined || typeof plan.deletedAt === 'number');
}

export function isMonthlyAllocationPlan(value: unknown): value is MonthlyAllocationPlan {
  if (!value || typeof value !== 'object') return false;
  const plan = value as Partial<MonthlyAllocationPlan>;
  const details = plan.bucketDetails;
  const validDetails = details === undefined || (details && BUCKET_KEYS.every((key) =>
    typeof details[key]?.location === 'string' && typeof details[key]?.description === 'string'));
  const validItems = Array.isArray(plan.items) && plan.items.every((item) => item
    && typeof item === 'object'
    && typeof item.id === 'string'
    && BUCKET_KEYS.includes(item.bucket)
    && typeof item.name === 'string'
    && Number.isInteger(item.amountCents)
    && item.amountCents > 0
    && (item.type === 'fixed' || item.type === 'monthly')
    && typeof item.updatedAt === 'number');
  return typeof plan.yearMonth === 'string'
    && /^\d{4}-\d{2}$/.test(plan.yearMonth)
    && Number.isInteger(plan.amountCents)
    && Number(plan.amountCents) >= 0
    && typeof plan.incomeType === 'string'
    && validItems
    && Boolean(plan.swept)
    && Number.isInteger(plan.swept?.needs)
    && Number.isInteger(plan.swept?.growth)
    && Number.isInteger(plan.swept?.flexible)
    && Boolean(validDetails)
    && typeof plan.savedAt === 'number'
    && (plan.deletedAt === undefined || typeof plan.deletedAt === 'number');
}

export function isTripExpense(value: unknown): value is TripExpense {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<TripExpense>;
  return typeof item.id === 'string'
    && typeof item.date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(item.date)
    && TRIP_CATEGORIES.some((category) => category === item.category)
    && Number.isInteger(item.amountCents)
    && Number(item.amountCents) > 0
    && Number.isInteger(item.units)
    && Number(item.units) > 0
    && (item.paymentSource === 'company' || item.paymentSource === 'allowance' || item.paymentSource === 'self')
    && (item.claimStatus === 'unsubmitted' || item.claimStatus === 'submitted' || item.claimStatus === 'paid')
    && (item.invoiceStatus === 'not_required' || item.invoiceStatus === 'pending' || item.invoiceStatus === 'ready')
    && typeof item.note === 'string'
    && typeof item.updatedAt === 'number'
    && (item.deletedAt === undefined || typeof item.deletedAt === 'number');
}

export function isBusinessTrip(value: unknown): value is BusinessTrip {
  if (!value || typeof value !== 'object') return false;
  const trip = value as Partial<BusinessTrip>;
  return typeof trip.id === 'string'
    && typeof trip.title === 'string'
    && typeof trip.location === 'string'
    && typeof trip.startDate === 'string'
    && typeof trip.endDate === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(trip.startDate)
    && /^\d{4}-\d{2}-\d{2}$/.test(trip.endDate)
    && Number.isInteger(trip.travelDays)
    && Number(trip.travelDays) > 0
    && Number.isInteger(trip.salaryDays)
    && Number(trip.salaryDays) >= 0
    && Number.isInteger(trip.lodgingNights)
    && Number(trip.lodgingNights) >= 0
    && Number.isInteger(trip.dailySalaryCents)
    && Number(trip.dailySalaryCents) > 0
    && Number.isInteger(trip.dailyAllowanceCents)
    && Number(trip.dailyAllowanceCents) > 0
    && Number.isInteger(trip.lodgingLimitCents)
    && Number(trip.lodgingLimitCents) > 0
    && (trip.status === 'active' || trip.status === 'completed')
    && Array.isArray(trip.expenses)
    && trip.expenses.every(isTripExpense)
    && typeof trip.updatedAt === 'number'
    && (trip.deletedAt === undefined || typeof trip.deletedAt === 'number');
}

function readArray<T>(key: string, guard: (value: unknown) => value is T): T[] | null {
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  const parsed = JSON.parse(raw) as unknown;
  return Array.isArray(parsed) && parsed.every(guard) ? parsed : null;
}

/**
 * 从旧页面专用 localStorage 读取数据。这里只复制，不删除旧键；
 * 这样云同步或 IndexedDB 落盘失败时，原始数据仍可用于下一次恢复。
 */
export function readLegacyPlannerData(accountId: string): {
  repaymentPlans: RepaymentPlan[];
  allocationPlans: MonthlyAllocationPlan[];
  businessTrips: BusinessTrip[];
} {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let repaymentPlans = readArray(`ledger:repayment-plans-v2:${accountId}`, isRepaymentPlan);
  if (repaymentPlans === null) {
    const legacyRaw = localStorage.getItem(`ledger:repayment-rules:${accountId}`);
    repaymentPlans = [];
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as Array<Partial<RepaymentPlan> & { dayOfMonth?: number }>;
      if (Array.isArray(legacy)) {
        const monthDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        repaymentPlans = legacy.flatMap((item) => {
          if (typeof item.id !== 'string' || typeof item.name !== 'string' || !Number.isInteger(item.dayOfMonth) || !Number.isInteger(item.amountCents) || Number(item.amountCents) <= 0) return [];
          const day = Math.min(Math.max(Number(item.dayOfMonth), 1), monthDays);
          return [{
            id: item.id,
            name: item.name,
            dueDate: `${yearMonth}-${String(day).padStart(2, '0')}`,
            amountCents: Number(item.amountCents),
            note: typeof item.note === 'string' ? item.note : '',
            updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
          }];
        });
      }
    }
  }

  let allocationPlans = readArray(`ledger:allocation-6211-v2:${accountId}`, isMonthlyAllocationPlan);
  if (allocationPlans === null) {
    allocationPlans = [];
    const legacyRaw = localStorage.getItem(`ledger:allocation-6211:${accountId}`);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as { amountCents?: number; incomeType?: string; savedAt?: number };
      if (Number.isInteger(legacy.amountCents) && Number(legacy.amountCents) > 0) {
        allocationPlans = [{
          yearMonth,
          amountCents: Number(legacy.amountCents),
          incomeType: typeof legacy.incomeType === 'string' ? legacy.incomeType : '工资收入',
          items: [],
          swept: { needs: 0, growth: 0, flexible: 0 },
          savedAt: typeof legacy.savedAt === 'number' ? legacy.savedAt : Date.now(),
        }];
      }
    }
  }

  return {
    repaymentPlans,
    allocationPlans,
    businessTrips: readArray(`ledger:business-trips-v1:${accountId}`, isBusinessTrip) ?? [],
  };
}
