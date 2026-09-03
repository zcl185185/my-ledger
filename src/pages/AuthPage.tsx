import { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2, Mail } from 'lucide-react';
import { useUI } from '../store/ui';
import { authErrorMessage, sendResetEmail, signIn, signOut, signUp, updatePassword } from '../sync/account';

type Mode = 'login' | 'register' | 'forgot' | 'recovery';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthPage({ recovery = false }: { recovery?: boolean }) {
  const toast = useUI((state) => state.toast);
  const [mode, setMode] = useState<Mode>(recovery ? 'recovery' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (recovery) setMode('recovery');
  }, [recovery]);

  const submit = async () => {
    if (busy) return;
    if (mode !== 'recovery' && !EMAIL_RE.test(email)) {
      toast('请输入正确的邮箱地址', 'err');
      return;
    }
    if (mode !== 'forgot' && password.length < 8) {
      toast('密码至少 8 位', 'err');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else if (mode === 'register') {
        const { needConfirm } = await signUp(email, password);
        toast(needConfirm ? '确认邮件已发送，请点击邮件中的链接后回来登录' : '注册成功');
        if (needConfirm) {
          setPassword('');
          setMode('login');
        }
      } else if (mode === 'forgot') {
        await sendResetEmail(email);
        toast('重置密码邮件已发送，请查收');
        setMode('login');
      } else {
        await updatePassword(password);
        toast('密码已更新，请重新登录');
        await signOut().catch(() => {});
        setPassword('');
        setMode('login');
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : authErrorMessage(error), 'err');
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'register' ? '注册账号' : mode === 'forgot' ? '找回密码' : mode === 'recovery' ? '设置新密码' : '登录账号';
  const description = mode === 'register'
    ? '注册后，你的账本会与其他账号完全隔离。'
    : mode === 'forgot'
      ? '输入注册邮箱，我们会向你发送重置链接。'
      : mode === 'recovery'
        ? '请输入至少 8 位的新密码。'
        : '登录后进入属于你的本地账本。';

  return (
    <div className="h-full overflow-y-auto bg-surface px-5 pt-safe pb-safe">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col">
        <div className="flex flex-1 min-h-[220px] flex-col items-center justify-center py-8">
          <div className="flex h-24 w-24 items-center justify-center rounded-[28px] bg-primary text-5xl font-semibold text-on-primary shadow-lg">¥</div>
          <h1 className="mt-5 text-2xl font-semibold tracking-wide text-ink">我的账本</h1>
          <p className="mt-2 text-xs text-ink-3">每个账号，一本独立账本</p>
        </div>

        <div className="mb-4 rounded-2xl bg-card p-4 shadow-lg">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-3">{description}</p>
          </div>

          {mode !== 'recovery' && (
            <label className="mb-3 block">
              <span className="mb-1 block text-xs text-ink-3">邮箱</span>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 text-ink-3" size={16} />
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value.trim())}
                  placeholder="请输入邮箱"
                  className="h-11 w-full rounded-xl bg-fill pl-10 pr-3 text-sm text-ink outline-none"
                />
              </div>
            </label>
          )}

          {mode !== 'forgot' && (
            <label className="mb-3 block">
              <span className="mb-1 block text-xs text-ink-3">{mode === 'recovery' ? '新密码' : '密码'}</span>
              <div className="relative">
                <KeyRound className="absolute left-3 top-3.5 text-ink-3" size={16} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="至少 8 位"
                  className="h-11 w-full rounded-xl bg-fill pl-10 pr-11 text-sm text-ink outline-none"
                />
                <button
                  type="button"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  className="absolute right-0 top-0 flex h-11 items-center px-3 text-ink-3"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
          )}

          <button
            disabled={busy}
            className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-medium text-on-primary disabled:opacity-60"
            onClick={() => void submit()}
          >
            {busy && <Loader2 size={17} className="animate-spin" />}
            {mode === 'login' ? '登录并进入' : mode === 'register' ? '注册' : mode === 'forgot' ? '发送重置邮件' : '保存新密码'}
          </button>

          {mode !== 'recovery' && (
            <div className="mt-4 flex justify-between text-xs text-ink-3">
              <button onClick={() => setMode(mode === 'forgot' ? 'login' : 'forgot')}>
                {mode === 'forgot' ? '返回登录' : '忘记密码？'}
              </button>
              <button onClick={() => setMode(mode === 'register' ? 'login' : 'register')}>
                {mode === 'register' ? '已有账号，去登录' : '没有账号，去注册'}
              </button>
            </div>
          )}
        </div>
        <p className="pb-2 text-center text-[11px] leading-relaxed text-ink-3">账本保存在当前账号的独立空间中，退出后不会展示给其他账号。</p>
      </div>
    </div>
  );
}
