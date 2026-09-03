import { useMemo, useRef, useState } from 'react';
import { Camera, ChevronRight, ImagePlus, Info, Loader2, Settings, Share, Trash2 } from 'lucide-react';
import { useData } from '../store/data';
import { useSettings } from '../store/settings';
import { dayKey } from '../utils/date';
import { isIOS, isStandalone } from '../utils/compat';
import { Sheet } from '../components/Sheet';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '../store/profile';
import { useUI } from '../store/ui';

export function MinePage() {
  const bills = useData((s) => s.bills);
  const nickname = useProfile((s) => s.nickname);
  const avatarUrl = useProfile((s) => s.avatarUrl);
  const setAvatar = useProfile((s) => s.setAvatar);
  const removeAvatar = useProfile((s) => s.removeAvatar);
  const setSettings = useSettings((s) => s.set);
  const toast = useUI((s) => s.toast);
  const confirm = useUI((s) => s.confirm);
  const navigate = useNavigate();
  const [guideOpen, setGuideOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const active = bills.filter((b) => !b.deletedAt);
    const days = new Set(active.map((b) => dayKey(b.occurredAt))).size;
    return { days, count: active.length };
  }, [bills]);

  const pickAvatar = async (file?: File) => {
    if (!file || avatarBusy) return;
    setAvatarBusy(true);
    try {
      await setAvatar(file);
      toast('头像已保存', 'ok');
      setAvatarOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : '头像保存失败';
      toast(message.startsWith('头像云端上传失败') ? `头像已保存在本机；${message}` : message, 'err');
      if (message.startsWith('头像云端上传失败')) setAvatarOpen(false);
    } finally {
      setAvatarBusy(false);
      if (avatarInput.current) avatarInput.current.value = '';
    }
  };

  const clearAvatar = async () => {
    const ok = await confirm({ title: '删除头像？', message: '将删除当前账号的本机和云端头像。', confirmText: '删除', danger: true });
    if (!ok) return;
    setAvatarBusy(true);
    try {
      await removeAvatar();
      toast('头像已删除', 'ok');
      setAvatarOpen(false);
    } catch (error) {
      toast(error instanceof Error ? `本机头像已删除；${error.message}` : '头像删除失败', 'err');
      setAvatarOpen(false);
    } finally {
      setAvatarBusy(false);
    }
  };

  return (
    <div className="h-full overflow-auto bg-surface pb-28">
      <header className="bg-header pt-safe">
        <div className="px-4 pt-6 pb-8">
          <div className="flex items-center gap-3">
            <button className="relative h-14 w-14 shrink-0 rounded-full bg-header-fill text-header-fill-ink" onClick={() => setAvatarOpen(true)} aria-label="设置头像">
              {avatarUrl ? (
                <img src={avatarUrl} alt="头像" className="h-14 w-14 rounded-full object-cover" />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center text-xl font-bold">{nickname.slice(0, 1) || '我'}</span>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[var(--header-bg)] bg-primary text-on-primary">
                <Camera size={11} />
              </span>
            </button>
            <span className="text-xl font-bold">{nickname}</span>
          </div>
          <div className="grid grid-cols-2 text-center mt-6">
            <span>
              <b className="text-2xl">{stats.days}</b>
              <p className="text-xs mt-1">记账总天数</p>
            </span>
            <span>
              <b className="text-2xl">{stats.count}</b>
              <p className="text-xs mt-1">记账总笔数</p>
            </span>
          </div>
        </div>
      </header>

      <div className="px-3 -mt-3 space-y-3">
        <div className="bg-card rounded-2xl divide-y divide-line">
          <Row icon={<Settings size={20} />} label="设置" onClick={() => navigate('/settings')} />
          <Row
            icon={<Share size={20} />}
            label="添加到主屏幕"
            onClick={() => {
              if (isStandalone()) return;
              setGuideOpen(true);
              setSettings({ guideSeen: true });
            }}
          />
          <Row icon={<Info size={20} />} label="关于" onClick={() => navigate('/settings/about')} />
        </div>
      </div>

      <Sheet open={guideOpen} onClose={() => setGuideOpen(false)} title="添加到主屏幕">
        <div className="px-4 pb-6 text-sm text-ink-2 space-y-2">
          {isIOS ? (
            <>
              <p>1. 点击 Safari 底部的「分享」按钮</p>
              <p>2. 向下滑动，选择「添加到主屏幕」</p>
              <p>3. 点击右上角「添加」，即可像原生 App 一样打开</p>
            </>
          ) : (
            <>
              <p>1. 点击浏览器菜单</p>
              <p>2. 选择「添加到主屏幕」/「安装应用」</p>
            </>
          )}
          <p className="text-xs text-ink-3 pt-2">安装后离线也可正常使用，数据保存在本机。</p>
        </div>
      </Sheet>

      <Sheet open={avatarOpen} onClose={() => !avatarBusy && setAvatarOpen(false)} title="设置头像">
        <div className="px-4 pb-6">
          <div className="mb-5 flex justify-center">
            <div className="h-24 w-24 overflow-hidden rounded-full bg-fill text-3xl font-bold text-ink-2">
              {avatarUrl ? <img src={avatarUrl} alt="头像预览" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center">{nickname.slice(0, 1) || '我'}</span>}
            </div>
          </div>
          <input
            ref={avatarInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void pickAvatar(event.target.files?.[0])}
          />
          <button disabled={avatarBusy} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary font-medium text-on-primary disabled:opacity-60" onClick={() => avatarInput.current?.click()}>
            {avatarBusy ? <Loader2 size={17} className="animate-spin" /> : <ImagePlus size={17} />}
            从相册选择
          </button>
          {avatarUrl && (
            <button disabled={avatarBusy} className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-fill text-sm text-danger disabled:opacity-60" onClick={() => void clearAvatar()}>
              <Trash2 size={16} /> 删除头像
            </button>
          )}
          <p className="mt-3 text-center text-xs leading-relaxed text-ink-3">图片会自动居中裁剪并压缩，保存到当前账号。</p>
        </div>
      </Sheet>
    </div>
  );
}

function Row({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="w-full flex items-center gap-3 px-4 py-4 text-left" onClick={onClick}>
      <span className="text-ink-2">{icon}</span>
      <span className="flex-1 text-sm">{label}</span>
      <ChevronRight size={16} className="text-ink-3" />
    </button>
  );
}
