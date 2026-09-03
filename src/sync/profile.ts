import { getSharedSupabase, isAccountConfigured } from './account';

const AVATAR_BUCKET = 'avatars';

async function requireCurrentAccount(accountId: string) {
  if (!isAccountConfigured()) throw new Error('账号服务尚未配置');
  const sb = await getSharedSupabase();
  const { data: { session } } = await sb.auth.getSession();
  if (!session || session.user.id !== accountId) throw new Error('登录账号已变化，请重试');
  return { sb, session };
}

export async function loadCloudProfile(accountId: string): Promise<{ nickname?: string; avatar?: Blob; hasAvatar?: boolean }> {
  const { sb, session } = await requireCurrentAccount(accountId);
  const nickname = typeof session.user.user_metadata?.nickname === 'string' ? session.user.user_metadata.nickname.trim() : '';
  const hasAvatar = typeof session.user.user_metadata?.has_avatar === 'boolean' ? session.user.user_metadata.has_avatar : undefined;
  const { data, error } = await sb.storage.from(AVATAR_BUCKET).download(`${accountId}/avatar.jpg`);
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes('not found') || message.includes('does not exist') || message.includes('object not found')) {
      return { nickname: nickname || undefined, hasAvatar };
    }
    // 头像存储桶尚未创建时不阻止用户进入应用，本地头像仍然可用。
    return { nickname: nickname || undefined, hasAvatar };
  }
  return { nickname: nickname || undefined, avatar: data, hasAvatar: true };
}

export async function saveCloudNickname(accountId: string, nickname: string): Promise<void> {
  const { sb } = await requireCurrentAccount(accountId);
  const { error } = await sb.auth.updateUser({ data: { nickname } });
  if (error) throw new Error(`昵称云端保存失败：${error.message}`);
}

export async function uploadCloudAvatar(accountId: string, avatar: Blob): Promise<void> {
  const { sb } = await requireCurrentAccount(accountId);
  const { error } = await sb.storage.from(AVATAR_BUCKET).upload(`${accountId}/avatar.jpg`, avatar, {
    contentType: 'image/jpeg',
    cacheControl: '3600',
    upsert: true,
  });
  if (error) throw new Error(`头像云端上传失败：${error.message}`);
  await sb.auth.updateUser({ data: { has_avatar: true, avatar_updated_at: Date.now() } });
}

export async function deleteCloudAvatar(accountId: string): Promise<void> {
  const { sb } = await requireCurrentAccount(accountId);
  const { error } = await sb.storage.from(AVATAR_BUCKET).remove([`${accountId}/avatar.jpg`]);
  if (error) throw new Error(`头像云端删除失败：${error.message}`);
  const { error: metaError } = await sb.auth.updateUser({ data: { has_avatar: false, avatar_updated_at: Date.now() } });
  if (metaError) throw new Error(`头像状态更新失败：${metaError.message}`);
}
