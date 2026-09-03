import type { RecurringBill } from '../types';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function recurringPeriodKey(item: RecurringBill, now = new Date()): string {
  return item.frequency === 'monthly' ? `${now.getFullYear()}-${pad(now.getMonth() + 1)}` : String(now.getFullYear());
}

export function recurringDueAt(item: RecurringBill, now = new Date()): number {
  const year = now.getFullYear();
  const month = item.frequency === 'monthly' ? now.getMonth() : Math.max(0, Math.min(11, (item.monthOfYear ?? 1) - 1));
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.max(1, Math.min(lastDay, item.dayOfMonth));
  return new Date(year, month, day, 12, 0, 0).getTime();
}

export function isRecurringDue(item: RecurringBill, now = new Date()): boolean {
  if (!item.enabled || item.lastHandledKey === recurringPeriodKey(item, now)) return false;
  return now.getTime() >= recurringDueAt(item, now);
}

export function recurringScheduleLabel(item: RecurringBill): string {
  return item.frequency === 'monthly'
    ? `每月 ${item.dayOfMonth} 日`
    : `每年 ${item.monthOfYear ?? 1} 月 ${item.dayOfMonth} 日`;
}
