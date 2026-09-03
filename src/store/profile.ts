import { create } from 'zustand';
import { useSettings } from './settings';
import { compressAvatar } from '../utils/image';
import { deleteCloudAvatar, loadCloudProfile, saveCloudNickname, uploadCloudAvatar } from '../sync/profile';

interface StoredProfile {
  nickname: string;
  avatarDataUrl?: string;
}

interface ProfileState {
  accountId: string | null;
  nickname: string;
  avatarUrl: string | null;
  loading: boolean;
  activate: (accountId: string) => Promise<void>;
  deactivate: () => void;
  setNickname: (nickname: string) => Promise<void>;
  setAvatar: (file: File) => Promise<void>;
  removeAvatar: () => Promise<void>;
}

const PROFILE_KEY = 'shark-profile';
const LEGACY_OWNER_KEY = 'shark-profile-legacy-owner';
const keyOf = (accountId: string) => `${PROFILE_KEY}:${accountId}`;

function readLocal(accountId: string): StoredProfile | null {
  try {
    const raw = localStorage.getItem(keyOf(accountId));
    return raw ? JSON.parse(raw) as StoredProfile : null;
  } catch {
    return null;
  }
}

function writeLocal(accountId: string, profile: StoredProfile): void {
  try {
    localStorage.setItem(keyOf(accountId), JSON.stringify(profile));
  } catch {
    /* 私密模式或空间不足时仍保留本次会话显示 */
  }
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('头像读取失败'));
    reader.readAsDataURL(blob);
  });
}

function firstNickname(accountId: string): string {
  try {
    const claimed = localStorage.getItem(LEGACY_OWNER_KEY);
    if (!claimed || claimed === accountId) {
      localStorage.setItem(LEGACY_OWNER_KEY, accountId);
      return useSettings.getState().nickname.trim() || '我';
    }
  } catch {
    /* ignore */
  }
  return '我';
}

export const useProfile = create<ProfileState>((set, get) => ({
  accountId: null,
  nickname: '我',
  avatarUrl: null,
  loading: false,

  activate: async (accountId) => {
    const local = readLocal(accountId) ?? { nickname: firstNickname(accountId) };
    set({ accountId, nickname: local.nickname || '我', avatarUrl: local.avatarDataUrl ?? null, loading: true });
    writeLocal(accountId, local);
    try {
      const cloud = await loadCloudProfile(accountId);
      if (get().accountId !== accountId) return;
      const nickname = cloud.nickname || local.nickname || '我';
      const avatarDataUrl = cloud.avatar ? await blobToDataURL(cloud.avatar) : cloud.hasAvatar === false ? undefined : local.avatarDataUrl;
      if (get().accountId !== accountId) return;
      writeLocal(accountId, { nickname, ...(avatarDataUrl ? { avatarDataUrl } : {}) });
      set({ nickname, avatarUrl: avatarDataUrl ?? null });
    } catch {
      // 离线或头像桶尚未配置：保留本机资料。
    } finally {
      if (get().accountId === accountId) set({ loading: false });
    }
  },

  deactivate: () => set({ accountId: null, nickname: '我', avatarUrl: null, loading: false }),

  setNickname: async (value) => {
    const accountId = get().accountId;
    if (!accountId) throw new Error('请先登录');
    const nickname = value.trim() || '我';
    const current = readLocal(accountId) ?? { nickname };
    writeLocal(accountId, { ...current, nickname });
    set({ nickname });
    await saveCloudNickname(accountId, nickname);
  },

  setAvatar: async (file) => {
    const accountId = get().accountId;
    if (!accountId) throw new Error('请先登录');
    if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
    const avatar = await compressAvatar(file);
    if (!avatar) throw new Error('图片处理失败，请换一张照片');
    const avatarDataUrl = await blobToDataURL(avatar);
    const current = readLocal(accountId) ?? { nickname: get().nickname };
    writeLocal(accountId, { ...current, avatarDataUrl });
    set({ avatarUrl: avatarDataUrl });
    await uploadCloudAvatar(accountId, avatar);
  },

  removeAvatar: async () => {
    const accountId = get().accountId;
    if (!accountId) throw new Error('请先登录');
    const current = readLocal(accountId) ?? { nickname: get().nickname };
    writeLocal(accountId, { nickname: current.nickname || '我' });
    set({ avatarUrl: null });
    await deleteCloudAvatar(accountId);
  },
}));
