# 我的账本

一款面向个人使用的移动端记账 PWA。支持日常收支、账户转账、信用卡还款、资产负债、周期账单、统计图表和账号云同步，可在 iPhone、Android 和桌面浏览器中使用。

> 本项目是独立的个人记账工具，与“鲨鱼记账”官方产品无关。项目基于 MIT 开源项目继续开发，并保留原许可证与来源说明。

## 主要功能

- 邮箱注册与登录，未登录不能进入账本。
- 每个账号使用独立的本地数据库，切换账号不会混合账单、账户或照片。
- 快速记录支出、收入、转账和信用卡还款；转账与还款不计入收支。
- 现金、银行卡、电子钱包、投资、应收款、信用卡、贷款及自定义资产/负债账户。
- 账单自动影响关联账户余额，可手动校准余额并查看校准记录。
- 点击账户查看该账户的收入、支出、转入、转出和还款流水。
- 每月、每年周期账单，到期提醒后可确认入账或跳过本期。
- 月度预算、消费洞察、分类排行、趋势图和年度报告。
- 多账本、分类管理、搜索和 30 天账单回收站。
- 导入微信支付、支付宝和本应用 CSV；导出 CSV 或完整 JSON 备份。
- 账单凭证照片、账号头像及头像云端同步。
- Supabase 账号云同步，账单快照可使用 AES-GCM 客户端加密。
- PWA 离线缓存、深色模式、iPhone 安全区域和软键盘适配。

## 数据与隐私

- 当前账号的数据首先保存在当前设备的 IndexedDB 中。
- 本地数据库按照 Supabase 用户 ID 隔离，退出登录后立即从界面和内存中清除。
- 第一次升级到账号隔离版本时，旧版未分账号的数据只归入第一个登录的账号。
- 账单云同步使用 Supabase `vaults` 表及行级安全策略，每个用户只能访问自己的记录。
- 数据口令不上传服务器；设置口令后，账单在设备上加密后再上传。
- 头像存放在私有 `avatars` 存储桶中，账单照片存放在私有 `photos` 存储桶中。
- `.env.local`、服务密钥、数据库密码和个人数据不得提交到仓库。

浏览器会按照“网站地址”划分本地数据。更换 IP、域名或端口后，可能看到另一套本地缓存；登录并完成云同步后可恢复账号数据。重要数据仍建议定期导出 JSON。

## 技术栈

- React 18 + TypeScript
- Vite 5
- Tailwind CSS 3
- Zustand
- IndexedDB（`idb`）
- Supabase Auth、Postgres 和 Storage
- Chart.js
- Workbox / vite-plugin-pwa

## 本地运行

需要 Node.js 18 或更高版本，推荐 Node.js 20。

```bash
npm install
npm run dev -- --host
```

启动后：

- 电脑访问终端显示的 `Local` 地址。
- 同一 Wi-Fi 下，手机访问终端显示的 `Network` 地址。
- iPhone 请使用 Safari 打开，然后选择“分享 → 添加到主屏幕”。

Windows 上如果 Node 安装在 `D:\nodejs`：

```powershell
& 'D:\nodejs\npm.cmd' install
& 'D:\nodejs\npm.cmd' run dev -- --host
```

生产构建：

```bash
npm run build
npm run preview
```

## 配置 Supabase

复制环境变量示例：

```bash
cp .env.example .env.local
```

Windows 也可以直接新建 `.env.local`，填写：

```text
VITE_SUPABASE_URL=https://你的项目.supabase.co
VITE_SUPABASE_ANON_KEY=你的 Publishable key
```

只允许在前端使用 Supabase 的 Publishable key 或旧版 `anon public` key。不要使用 `service_role`、`sb_secret_...` 或数据库密码。

还需要在 Supabase 的 SQL Editor 中完成：

1. 按 [`docs/supabase-setup.md`](docs/supabase-setup.md) 创建 `vaults` 表和本人读写的 RLS 策略。
2. 执行 [`docs/avatar-storage.sql`](docs/avatar-storage.sql)，创建私有头像存储区。
3. 若需要账单照片云同步，再按照 [`docs/VIP功能方案.md`](docs/VIP功能方案.md) 创建 `photos` 存储桶及对应策略。

## 部署到 GitHub Pages

仓库已经包含 GitHub Actions 工作流。推送到 `main` 后：

1. 在仓库 `Settings → Secrets and variables → Actions` 新建：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. 在 `Settings → Pages` 中将 Source 选择为 `GitHub Actions`。
3. 打开仓库的 `Actions` 页面，等待 `Deploy to GitHub Pages` 完成。

部署地址通常是：

```text
https://你的GitHub用户名.github.io/仓库名/
```

首次部署后，还应在 Supabase 的 `Authentication → URL Configuration` 中将 Site URL 改成正式部署地址，保证邮箱确认和找回密码链接可以返回应用。

## 项目目录

```text
src/
  components/   通用界面组件
  db/           本地数据库、迁移和账号隔离
  features/     记一笔等主要交互
  pages/        明细、图表、资产、我的和设置页面
  store/        数据、账号资料和界面状态
  sync/         Supabase、云备份与加密同步
  utils/        金额、日期、导入、图片处理等工具
docs/           Supabase 配置、功能说明和截图
deploy/         可选的 Cloudflare Worker 与 SQL
```

## 注意事项

- 这是个人项目，首次正式使用前请自行验证数据导入、同步和恢复流程。
- 不要只依赖浏览器缓存保存重要账单，建议定期导出完整 JSON。
- 本地开发地址依赖电脑持续运行；需要手机长期独立访问时，请部署到 HTTPS 网站。

## 许可证与来源

本项目遵循 [MIT License](LICENSE)。基于 [`joshjeoa/shark-ledger`](https://github.com/joshjeoa/shark-ledger) 的 MIT 许可代码继续开发，并保留原版权声明。
