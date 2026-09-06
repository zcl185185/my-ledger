import { Database, HardDrive, LogIn, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SettingsShell } from './SettingsShell';
import { useData } from '../../store/data';
import { useProfile } from '../../store/profile';
import { useUI } from '../../store/ui';
import { setLocalOnlySelected } from '../../utils/localMode';

export function LocalStoragePage() {
  const navigate = useNavigate();
  const confirm = useUI((state) => state.confirm);
  const bills = useData((state) => state.bills);
  const activeBillCount = bills.filter((bill) => !bill.deletedAt).length;

  const switchToCloud = async () => {
    const ok = await confirm({
      title: '切换到云端登录？',
      message: '本地账本会继续留在这台设备，不会自动上传。登录后将打开独立的云端账本。',
      confirmText: '切换',
    });
    if (!ok) return;
    setLocalOnlySelected(false);
    useData.getState().deactivate();
    useProfile.getState().deactivate();
    window.location.hash = '/';
    window.location.reload();
  };

  return (
    <SettingsShell title="仅本地存储">
      <div className="px-3 pt-3 space-y-3">
        <div className="rounded-2xl bg-card p-5 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-fill text-primary">
            <HardDrive size={24} />
          </span>
          <h2 className="mt-3 font-semibold">当前为仅本地模式</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-3">现有 {activeBillCount} 笔账单只保存在这个浏览器中，不会上传到 Supabase。</p>
        </div>

        <div className="rounded-2xl bg-card p-4 space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium"><ShieldCheck size={17} className="text-ink-2" />隐私说明</p>
          <ul className="space-y-2 text-xs leading-relaxed text-ink-3">
            <li>• 公网服务器只提供页面文件，不保存你的账单内容。</li>
            <li>• 更换设备或浏览器后，本地数据不会自动出现。</li>
            <li>• 清除网站数据可能删除账本，请定期导出备份。</li>
          </ul>
        </div>

        <button
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary font-medium text-on-primary"
          onClick={() => navigate('/settings/data')}
        >
          <Database size={18} />导出或导入本地备份
        </button>

        <button
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-card text-sm font-medium text-ink"
          onClick={() => void switchToCloud()}
        >
          <LogIn size={18} />切换到云端登录
        </button>

        <p className="px-2 text-center text-[11px] leading-relaxed text-ink-3">切换后不会删除或上传本地账本；再次选择“仅在本机使用”即可回来。</p>
      </div>
    </SettingsShell>
  );
}
