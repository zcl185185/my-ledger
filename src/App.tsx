import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { HashRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { useData } from './store/data';
import { useSettings } from './store/settings';
import { useUI } from './store/ui';
import { setupAppHeight } from './utils/compat';
import { applyTheme } from './utils/theme';
import { setupSyncLifecycle } from './sync/manager';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TabBar } from './components/TabBar';
import { Toasts } from './components/Toasts';
import { ConfirmSheet } from './components/ConfirmSheet';
import { EntrySheet } from './features/EntrySheet';
import { DetailPage } from './pages/DetailPage';
import { PageSkeleton } from './components/PageSkeleton';
import { AuthPage } from './pages/AuthPage';
import { getSession, isAccountConfigured, onAuthEvent, setupAccountLifecycle, syncVault } from './sync/account';
import { useProfile } from './store/profile';
import { decodeQuickEntryData, parseQuickEntryText } from './utils/quickEntry';

// 开发地址可能曾经安装过生产版 PWA。开发模式下移除旧 Service Worker，
// 避免手机一直拿到旧的 index.html/JavaScript；不会触碰 IndexedDB 账单数据。
if (import.meta.env.DEV && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => void registration.unregister());
  });
  if ('caches' in window) {
    void caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
  }
}

// 非首屏路由懒加载：主包只含明细页，图表/发现/设置等按需拉取
const ChartPage = lazy(() => import('./pages/ChartPage').then((m) => ({ default: m.ChartPage })));
const AssetsPage = lazy(() => import('./pages/AssetsPage').then((m) => ({ default: m.AssetsPage })));
const DiscoverPage = lazy(() => import('./pages/DiscoverPage').then((m) => ({ default: m.DiscoverPage })));
const MinePage = lazy(() => import('./pages/MinePage').then((m) => ({ default: m.MinePage })));
const SettingsHome = lazy(() => import('./pages/settings/SettingsHome').then((m) => ({ default: m.SettingsHome })));
const CategoriesPage = lazy(() => import('./pages/settings/CategoriesPage').then((m) => ({ default: m.CategoriesPage })));
const AccountsPage = lazy(() => import('./pages/settings/AccountsPage').then((m) => ({ default: m.AccountsPage })));
const LedgersPage = lazy(() => import('./pages/settings/LedgersPage').then((m) => ({ default: m.LedgersPage })));
const DataPage = lazy(() => import('./pages/settings/DataPage').then((m) => ({ default: m.DataPage })));
const BackupPage = lazy(() => import('./pages/settings/BackupPage').then((m) => ({ default: m.BackupPage })));
const AccountPage = lazy(() => import('./pages/settings/AccountPage').then((m) => ({ default: m.AccountPage })));
const AboutPage = lazy(() => import('./pages/settings/AboutPage').then((m) => ({ default: m.AboutPage })));
const RecurringPage = lazy(() => import('./pages/settings/RecurringPage').then((m) => ({ default: m.RecurringPage })));
const ReportPage = lazy(() => import('./pages/ReportPage').then((m) => ({ default: m.ReportPage })));

/** PWA 更新提示：SW 检测到新版本时弹横幅，用户确认后刷新 */
try {
  let updateFn: (reloadPage?: boolean) => Promise<void>;
  updateFn = registerSW({
    onNeedRefresh() {
      useUI.getState().setUpdateReady(true, () => void updateFn(true));
    },
    onOfflineReady() {
      /* 静默：首次缓存完成即可离线使用 */
    },
  });
} catch {
  /* Service Worker 不可用（如 file:// 或旧浏览器）时忽略 */
}

type AuthStatus = 'checking' | 'signedOut' | 'signedIn' | 'recovery' | 'unconfigured';

function BrandLoading({ message }: { message?: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-header px-6 text-center">
      <div className="w-20 h-20 rounded-3xl bg-primary flex items-center justify-center text-4xl font-bold text-on-primary shadow-lg">¥</div>
      <p className="mt-4 text-sm font-medium text-header-ink">我的账本</p>
      {message && <p className="mt-2 text-xs leading-relaxed text-ink-3">{message}</p>}
    </div>
  );
}

export default function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>(() => (isAccountConfigured() ? 'checking' : 'unconfigured'));
  const [session, setSession] = useState<Session | null>(null);
  const themeColor = useSettings((state) => state.themeColor);
  const appearance = useSettings((state) => state.appearance);

  useEffect(() => {
    setupAppHeight();
    setupSyncLifecycle();
    setupAccountLifecycle();
  }, []);

  useEffect(() => {
    if (!isAccountConfigured()) return;
    let alive = true;
    let authEventSeen = false;
    void getSession().then((current) => {
      if (!alive || authEventSeen) return;
      setSession(current);
      setAuthStatus(current ? 'signedIn' : 'signedOut');
    }).catch(() => {
      if (alive) setAuthStatus('signedOut');
    });
    const off = onAuthEvent({
      onSignedIn: (next) => {
        if (!alive) return;
        authEventSeen = true;
        const loadedAccount = useData.getState().accountId;
        if (loadedAccount && loadedAccount !== next.user.id) {
          useData.getState().deactivate();
          useProfile.getState().deactivate();
        }
        setSession(next);
        setAuthStatus('signedIn');
      },
      onSignedOut: () => {
        if (!alive) return;
        authEventSeen = true;
        useData.getState().deactivate();
        useProfile.getState().deactivate();
        setSession(null);
        setAuthStatus('signedOut');
      },
      onPasswordRecovery: () => {
        if (!alive) return;
        authEventSeen = true;
        useData.getState().deactivate();
        useProfile.getState().deactivate();
        setSession(null);
        setAuthStatus('recovery');
      },
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--primary', themeColor);
    applyTheme(appearance);
  }, [themeColor, appearance]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(useSettings.getState().appearance);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  if (authStatus === 'unconfigured') {
    return <BrandLoading message="账号服务尚未配置，暂时无法登录。请先完成 Supabase 配置。" />;
  }
  if (authStatus === 'checking') return <BrandLoading message="正在检查登录状态…" />;
  if (authStatus === 'signedOut' || authStatus === 'recovery') {
    return (
      <ErrorBoundary>
        <AuthPage recovery={authStatus === 'recovery'} />
        <Toasts />
      </ErrorBoundary>
    );
  }
  if (!session) return <BrandLoading />;
  return <LedgerApp accountId={session.user.id} />;
}

function LedgerApp({ accountId }: { accountId: string }) {
  const ready = useData((s) => s.ready);
  const mode = useData((s) => s.mode);
  const writeFailed = useData((s) => s.writeFailed);
  const updateReady = useUI((s) => s.updateReady);
  const runUpdate = useUI((s) => s.runUpdate);

  const lastVisibleRefresh = useRef(0);
  useEffect(() => {
    let active = true;
    void useProfile.getState().activate(accountId);
    void useData.getState().init(accountId).then(() => {
      if (active) void syncVault().catch(() => {/* 错误已写入当前账号状态，稍后可在账号页查看 */});
    });
    // 照片云自动上传：保险库同步成功后防抖执行（登录态下才实际运行）
    const onVaultSynced = () => {
      void import('./vip/photoCloud').then((m) => m.schedulePhotoCloudSync());
    };
    window.addEventListener('vault-synced', onVaultSynced);
    // 空闲预取 TabBar 三个懒加载页面的 chunk：冷启动后首次切换不再闪骨架屏
    // （每个 chunk 仅几 KB；图表库 208KB 仍保持按需加载，不影响首装体积策略）
    const idle = typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback.bind(window) : (cb: () => void) => window.setTimeout(cb, 2200);
    idle(() => {
      void import('./pages/ChartPage');
      void import('./pages/AssetsPage');
      void import('./pages/DiscoverPage');
      void import('./pages/MinePage');
    });
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastVisibleRefresh.current < 5000) return; // 节流：防频繁切后台触发全量重载
      lastVisibleRefresh.current = now;
      void useData.getState().refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('vault-synced', onVaultSynced);
    };
  }, [accountId]);

  if (!ready) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-header">
        <div className="w-20 h-20 rounded-3xl bg-card flex items-center justify-center text-4xl font-bold text-ink shadow-lg">
          ¥
        </div>
        <p className="mt-4 text-sm font-medium text-header-ink">我的账本</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <div className="relative h-full overflow-hidden">
          {writeFailed ? (
            <div className="fixed top-0 left-0 right-0 z-50 pt-safe px-3 pb-2 text-xs text-center bg-danger text-white">
              数据保存失败（存储空间不足或已损坏）：新记录可能未持久化，请立即导出备份
            </div>
          ) : mode !== 'idb' ? (
            <div
              className={`fixed top-0 left-0 right-0 z-50 pt-safe px-3 pb-2 text-xs text-center ${
                mode === 'memory' ? 'bg-danger text-white' : 'bg-primary text-on-primary'
              }`}
            >
              {mode === 'memory'
                ? '存储不可用：数据仅保存在内存中，关闭页面即丢失，请导出备份'
                : 'IndexedDB 不可用（可能处于私密模式），已降级为本地存储，建议尽快导出或云备份'}
            </div>
          ) : null}

          {updateReady && (
            <div className="fixed top-0 left-0 right-0 z-50 pt-safe px-3 pb-2 bg-toast-bg text-toast-ink text-xs flex items-center justify-between gap-2">
              <span>检测到新版本可用</span>
              <div className="flex gap-3">
                <button className="font-medium underline" onClick={() => runUpdate?.()}>
                  立即更新
                </button>
                <button onClick={() => useUI.getState().setUpdateReady(false)}>稍后</button>
              </div>
            </div>
          )}

          <div className="h-full overflow-y-auto hide-scrollbar">
            <Suspense fallback={<PageSkeleton />}>
              <Routes>
              <Route path="/" element={<DetailPage />} />
              <Route path="/quick-entry" element={<QuickEntryPage />} />
              <Route path="/chart" element={<ChartPage />} />
              <Route path="/assets" element={<AssetsPage />} />
              <Route path="/discover" element={<DiscoverPage />} />
              <Route path="/mine" element={<MinePage />} />
              <Route path="/settings" element={<SettingsHome />} />
              <Route path="/settings/categories" element={<CategoriesPage />} />
              <Route path="/settings/accounts" element={<AccountsPage />} />
              <Route path="/settings/ledgers" element={<LedgersPage />} />
              <Route path="/settings/data" element={<DataPage />} />
              <Route path="/settings/backup" element={<BackupPage />} />
              <Route path="/settings/account" element={<AccountPage />} />
              <Route path="/settings/about" element={<AboutPage />} />
              <Route path="/settings/recurring" element={<RecurringPage />} />
              <Route path="/report" element={<ReportPage />} />
              <Route path="*" element={<DetailPage />} />
              </Routes>
            </Suspense>
          </div>

          <TabBar />
          <EntrySheet />
          <ConfirmSheet />
          <Toasts />
        </div>
      </HashRouter>
    </ErrorBoundary>
  );
}

/**
 * iOS 快捷指令入口：OCR 原文放在 URL 的 # 片段中，不会作为请求发送给服务器。
 * 读取后立刻替换回首页地址，避免刷新时重复弹出。
 */
function QuickEntryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const categories = useData((s) => s.categories);
  const accounts = useData((s) => s.accounts);
  const consumed = useRef(false);

  useEffect(() => {
    // 正常情况立即解析；只有 iOS 尚未把完整 hash 交给页面时才短间隔重试。
    let retryTimer: number | undefined;

    const readAndOpen = (attempt: number) => {
      if (consumed.current) return;
      const hashQueryIndex = window.location.hash.indexOf('?');
      const hashSearch = hashQueryIndex >= 0 ? window.location.hash.slice(hashQueryIndex) : '';
      const params = new URLSearchParams(location.search);
      const hashParams = new URLSearchParams(hashSearch);
      hashParams.forEach((value, key) => params.set(key, value));
      if (!params.has('text') && !params.has('data')) {
        if (attempt < 3) retryTimer = window.setTimeout(() => readAndOpen(attempt + 1), 100);
        return;
      }

      const encodedData = params.get('data');
      const legacyText = params.get('text') ?? '';
      const text = encodedData ? (decodeQuickEntryData(encodedData) ?? legacyText) : legacyText;
      // 少于 20 个字符通常表示 iOS 仍在更新 hash；短暂重试，避免锁定不完整文本。
      if (text.trim().length < 20 && attempt < 3) {
        retryTimer = window.setTimeout(() => readAndOpen(attempt + 1), 100);
        return;
      }
      consumed.current = true;
      const draft = parseQuickEntryText(text, categories, accounts);
      const recognized: string[] = [];
      if (draft.amount) recognized.push(`金额 ¥${draft.amount}`);
      if (draft.note) recognized.push(`商家 ${draft.note}`);
      // 清掉 OCR 原文，避免刷新后重复弹出，也避免敏感账单文字继续留在地址栏。
      const outerParams = new URLSearchParams(window.location.search);
      outerParams.delete('text');
      outerParams.delete('data');
      const outerSearch = outerParams.toString();
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${outerSearch ? `?${outerSearch}` : ''}${window.location.hash}`,
      );

      // 先同步打开全局记账弹窗，再由 HashRouter 正式返回首页。这样路由组件会卸载，
      // Safari 下次复用同一标签页时会重新挂载入口，不会被 consumed 状态拦截。
      const base64WasLineWrapped = Boolean(encodedData && !text.trim() && encodedData.length === 76);
      useUI.getState().openQuickEntry(draft);
      useUI.getState().toast(
        draft.recognitionWarning
          ? draft.recognitionWarning
          : base64WasLineWrapped
            ? 'Base64 在第 76 个字符处被换行截断；请展开“Base64 编码”，把换行设为“无”'
          : encodedData && !text.trim()
            ? '快捷指令数据解码失败，请检查 Base64 编码步骤'
            : recognized.length
              ? `已识别${recognized.join('、')}，请确认`
              : text.trim()
                ? '已收到屏幕文字，但未找到金额，请手动填写'
                : '没有收到屏幕识别文字，请检查快捷指令变量',
        recognized.length && !draft.recognitionWarning && !base64WasLineWrapped ? 'info' : 'err',
      );
      navigate('/', { replace: true });
    };

    readAndOpen(0);
    return () => {
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [accounts, categories, location.search, navigate]);

  return <DetailPage />;
}
