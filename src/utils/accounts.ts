import type { Account, AccountType, Bill } from '../types';

export const ACCOUNT_TYPES: { value: AccountType; label: string; group: 'asset' | 'liability'; icon: string; hint: string }[] = [
  { value: 'cash', label: '现金', group: 'asset', icon: 'Wallet', hint: '纸币、零钱' },
  { value: 'bank', label: '储蓄卡', group: 'asset', icon: 'Landmark', hint: '银行卡、存款' },
  { value: 'ewallet', label: '虚拟账户', group: 'asset', icon: 'Smartphone', hint: '微信、支付宝' },
  { value: 'investment', label: '投资理财', group: 'asset', icon: 'TrendingUp', hint: '基金、股票、黄金' },
  { value: 'receivable', label: '应收款', group: 'asset', icon: 'HandCoins', hint: '别人欠我的钱' },
  { value: 'custom_asset', label: '其他资产', group: 'asset', icon: 'Gem', hint: '自定义资产' },
  { value: 'credit', label: '信用卡', group: 'liability', icon: 'CreditCard', hint: '信用卡待还' },
  { value: 'loan', label: '贷款', group: 'liability', icon: 'House', hint: '房贷、车贷、借款' },
  { value: 'custom_liability', label: '其他负债', group: 'liability', icon: 'BadgeDollarSign', hint: '自定义负债' },
];

export function accountNature(account: Account): 'asset' | 'liability' {
  return account.type === 'credit' || account.type === 'loan' || account.type === 'custom_liability' ? 'liability' : 'asset';
}

export function accountTypeLabel(type: AccountType): string {
  if (type === 'card') return '银行卡';
  return ACCOUNT_TYPES.find((x) => x.value === type)?.label ?? '其他资产';
}

/**
 * 计算某个账户在指定时刻的余额。资产返回可用余额，负债返回尚欠金额；二者都用正数表达。
 */
export function accountBalanceAt(account: Account, bills: Bill[], asOf = Number.POSITIVE_INFINITY): number {
  let balance = account.initialCents ?? 0;
  const nature = accountNature(account);
  for (const a of account.adjustments ?? []) {
    if (a.occurredAt <= asOf) balance += a.deltaCents;
  }
  for (const bill of bills) {
    if (bill.deletedAt || bill.occurredAt > asOf) continue;
    balance += billEffectOnAccount(bill, account);
  }
  return balance;
}

/** 单笔记录对账户余额/欠款的影响，正数表示该账户显示余额增加。 */
export function billEffectOnAccount(bill: Bill, account: Account): number {
  const nature = accountNature(account);
  if (bill.kind === 'transfer') {
    let delta = 0;
    if (bill.accountId === account.id) delta += nature === 'asset' ? -bill.amountCents : bill.amountCents;
    if (bill.toAccountId === account.id) delta += nature === 'asset' ? bill.amountCents : -bill.amountCents;
    return delta;
  }
  if (bill.accountId !== account.id) return 0;
  if (nature === 'asset') return bill.type === 'income' ? bill.amountCents : -bill.amountCents;
  return bill.type === 'expense' ? bill.amountCents : -bill.amountCents;
}

export function portfolioTotals(accounts: Account[], bills: Bill[], asOf = Number.POSITIVE_INFINITY) {
  let assets = 0;
  let liabilities = 0;
  const balances = new Map<string, number>();
  for (const account of accounts) {
    const balance = accountBalanceAt(account, bills, asOf);
    balances.set(account.id, balance);
    if (accountNature(account) === 'asset') assets += balance;
    else liabilities += balance;
  }
  return { assets, liabilities, netWorth: assets - liabilities, balances };
}

export function accountIcon(type: AccountType): string {
  if (type === 'card') return 'Landmark';
  return ACCOUNT_TYPES.find((x) => x.value === type)?.icon ?? 'Wallet';
}
