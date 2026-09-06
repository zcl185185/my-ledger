/**
 * 仅本地模式与云端账号使用完全不同的数据空间。
 * 该标记只保存在当前浏览器；服务器和 Supabase 都不会收到它。
 */
const APP_MODE_KEY = 'shark-app-mode';

export const LOCAL_ONLY_ACCOUNT_ID = '__local_only__';

export function isLocalOnlySelected(): boolean {
  try {
    return localStorage.getItem(APP_MODE_KEY) === 'local';
  } catch {
    return false;
  }
}

export function setLocalOnlySelected(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(APP_MODE_KEY, 'local');
    else localStorage.removeItem(APP_MODE_KEY);
  } catch {
    /* 存储不可用时仍允许本次会话进入，App 状态会继续生效。 */
  }
}

export function isLocalOnlyAccount(accountId: string | null | undefined): boolean {
  return accountId === LOCAL_ONLY_ACCOUNT_ID;
}
