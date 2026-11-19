# Jack AI Studio · Jack 本地 AI 工作室

一个中英双语的工作室网站，部署在 GitHub Pages 上（纯静态），账号和数据放在 Supabase。

- **首页**：工作室介绍、服务、合作方式、回复时间
- **展览馆**：做过的项目卡片（已上线 / 开发中 / 演示），可点开看详情
- **联系**：表单留言（写入 Supabase 的 `contact_messages`），网站上不公开任何邮箱或电话
- **登录 / 注册**：邮箱 + 密码（Supabase Auth），含注册确认邮件、找回密码
- **我的项目（Dashboard）**，按角色显示：
  - **客户 client**（新注册默认）：只看到关联到自己邮箱的项目：进度、阶段、里程碑、项目动态；可以「确认验收」待验收的里程碑、给项目留言
  - **管理员 admin**（Jack）：建项目、改进度和里程碑、发动态（客户可见 / 内部）、看留言、看联系消息收件箱、设置用户角色
  - **家人 family**（只读）：所有项目的进度、未来 14 天的截止日期、最新动态（包括内部动态）；看不到收件箱和客户邮箱
- 进度、动态、留言通过 Supabase Realtime 实时刷新；切回浏览器标签页时也会刷新

没有配置 Supabase 时，网站自动进入 **演示模式**：使用内置示例数据（只存在内存里，刷新就重置），页面顶部有「演示模式 / Demo mode」横幅和身份切换器（访客 / 客户 / 管理员 / 家人），可以点开每个页面看效果。

---

## 目录结构

```
studio-site/
├─ index.html
├─ package.json / vite.config.ts / tsconfig.json
├─ .env.example                 环境变量示例
├─ .github/workflows/deploy.yml  推送到 main 自动部署到 GitHub Pages
├─ public/portfolio/            展览馆截图
├─ supabase/
│  ├─ schema.sql                在 Supabase SQL Editor 里运行的完整数据库脚本
│  ├─ test_rls.py               在本地真实 Postgres 上测试权限规则
│  └─ test/supabase_stub.sql    测试用的 auth 模拟（不要在 Supabase 上运行）
└─ src/
   ├─ data/projects.ts          ← 展览馆项目（改这里）
   ├─ i18n/strings.ts           ← 所有界面文字（中文 + 英文）
   ├─ lib/permissions.ts        角色权限判断
   ├─ store/                    数据层：demoStore（演示）/ supabaseStore（正式）
   ├─ pages/                    各个页面
   └─ __tests__/                Vitest 单元测试
```

---

## 本地开发

需要 Node.js 20 或更新版本。

```bash
cd studio-site
npm install
npm run dev        # 打开终端里显示的地址，默认是演示模式
npm test           # 单元测试（Vitest）
npm run build      # 类型检查 + 打包到 dist/
```

想在本地连真实的 Supabase：复制 `.env.example` 为 `.env.local`，填上项目 URL 和 publishable key，再 `npm run dev`。`.env.local` 已在 `.gitignore` 里，不会被提交。

### 环境变量

| 变量名 | 说明 |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase 项目 URL，例如 `https://abcd1234.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key（`sb_publishable_...`） |
| `VITE_SUPABASE_ANON_KEY` | 可选：旧项目的 anon key，只有没填 publishable key 时才会用 |

两个都没填（或 URL 不是 https）→ 演示模式。

---

## Supabase 设置（一步一步）

1. **新建项目**：登录 [supabase.com](https://supabase.com) → New project。记下数据库密码（网站用不到，但以后管理要用）。
2. **建表和权限**：左侧 **SQL Editor** → New query → 把 `supabase/schema.sql` 全部内容粘进去 → **Run**。这个脚本可以重复运行。
3. **登录跳转地址**：左侧 **Authentication → URL Configuration**
   - **Site URL** 填你的 Pages 地址，例如 `https://你的用户名.github.io/仓库名/`（结尾带 `/`）
   - **Redirect URLs** 添加 `https://你的用户名.github.io/仓库名/**`；本地调试再加 `http://localhost:5173/**`
   - 注册确认和重置密码的邮件链接会跳回这个地址（网站用的是 HashRouter，所以跳回的是根地址，不带 `#/...`）
4. **保持「确认邮箱」开启**：**Authentication → Sign In / Providers → Email** 里的 *Confirm email* 必须是开启的（默认开启）。项目是按邮箱关联客户的，关掉它别人就能用客户的邮箱注册并看到项目。
5. **邮件发送（重要）**：Supabase 自带的邮件服务限制很严（目前只给项目团队成员发信，而且每小时只有几封）。正式给客户用之前，请到 **Authentication → Emails → SMTP Settings** 配置你自己的 SMTP 服务。邮件模板也可以在 **Emails → Templates** 改成中文。
6. **复制两个值**：
   - **Project URL**：Project Settings → Data API（或项目首页的 *Connect* 按钮）
   - **Publishable key**：Project Settings → **API Keys** → Publishable key（`sb_publishable_...`）
   - ⚠ 不要复制 *secret key* 或 *service_role key*，它们绝对不能放进网站
7. **填到 GitHub**：仓库 → **Settings → Secrets and variables → Actions → Variables** 标签页 → *New repository variable*，添加两个变量：
   - `VITE_SUPABASE_URL` = 第 6 步的 Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = 第 6 步的 publishable key

   注意是 **Variables**，不是 Secrets（工作流里用的是 `vars.*`）。
8. **开启 Pages**：仓库 → **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
9. **部署**：把代码推到 `main` 分支，**Actions** 页面会自动测试、打包并发布。改了变量以后，在 Actions 里对 *Deploy to GitHub Pages* 点 *Run workflow* 重新部署即可。

---

## 设置管理员（自己）和家人

1. 先在网站上用自己的邮箱 **注册** 并点开确认邮件。
2. 到 Supabase **SQL Editor** 运行（换成真实邮箱）：

```sql
-- 把自己设为管理员
update public.profiles set role = 'admin' where email = lower('你的邮箱');
```

3. 家人也先在网站上注册并确认邮箱，然后：

```sql
-- 设为家人（只读）
update public.profiles set role = 'family' where email = lower('家人的邮箱');
```

成为管理员之后，也可以直接在网站 **我的项目 → 用户** 页面改角色。角色变更由数据库触发器保护：只有管理员（或 SQL Editor）能改，任何人都改不了自己的角色。改完让对方刷新一下页面。

### 给客户开项目

管理员在 **我的项目 → 新建项目** 里填「客户邮箱」。客户用 **同一个邮箱** 注册并确认后，就能看到这个项目（邮箱大小写不影响）。

---

## 编辑展览馆项目

打开 `src/data/projects.ts`，每个项目是一个对象：

- `status`：`'live'`（已上线）/ `'in_progress'`（开发中）/ `'demo'`（演示）
- `title`、`summary`、`highlights` 都有 `zh` 和 `en` 两个版本
- `stack`：技术栈标签
- `images`：截图放在 `public/portfolio/`，这里写 `'portfolio/文件名.png'`（开头不要 `/`）
- 数组里的顺序就是页面上的顺序

只写真实的内容。截图里不能出现真实的人名、邮箱或照片。

界面上的其他文字都在 `src/i18n/strings.ts`，中英文成对出现（缺一个键 TypeScript 会报错）。

---

## 测试数据库权限（可选）

`supabase/test_rls.py` 会在本机启动一个真实的 Postgres（通过 `pgserver` 包，不需要单独安装），模拟 Supabase 的 `auth` 部分，加载 `schema.sql` 两次，然后以不同身份检查约 100 条规则（客户看不到别人的项目和内部动态、不能改自己的角色和进度、家人只读且看不到收件箱和客户邮箱、访客只能提交联系表单、确认验收只能由项目客户在「待验收」状态下进行，等等）。

```bash
python3 -m venv .venv-rls
.venv-rls/bin/pip install pgserver "psycopg[binary]"
.venv-rls/bin/python supabase/test_rls.py
```

⚠ 不要用 `--dsn` 指向你的 Supabase 正式数据库，这个脚本会建库和写测试数据。

---

## 安全说明

- **Publishable key 本来就是公开的**。它会被打包进网页，任何人都能看到，这是设计如此。真正保护数据的是数据库里的 **行级安全（RLS）**：每张表都开启了 RLS，每个请求按登录用户的身份过滤。
- 不要把 *secret key* / *service_role key* 放进网站或 GitHub 变量。
- **客户邮箱对家人隐藏**：RLS 只能按「行」过滤，不能隐藏某一列。所以 `projects.client_email` 用的是列级权限：API 角色可以读 `projects` 的其他所有列，但不能读 `client_email`。管理员通过 `admin_projects()` 函数读取（函数里先检查是不是管理员）。以后给 `projects` 加新列时，记得再运行一次 `grant select (新列名) on public.projects to authenticated;`。
- **确认验收** 用的是一个专门的数据库函数 `approve_milestone()`：只允许项目自己的客户、只在「待验收」状态、只改状态和验收人/时间，客户没有任何直接修改里程碑的权限。
- **角色**：新注册一律是客户（注册时传什么角色都会被忽略）；改角色由触发器拦截，只有管理员能改。
- **联系表单**：未登录访客只能「插入」，不能读取；数据库里有长度和取值检查。表单有一个隐藏的蜜罐字段过滤简单的机器人，但无法阻止有人直接调用 API 刷消息。如果以后遇到垃圾消息，可以在 Supabase 里开启 CAPTCHA 或加限流。
- **确认邮箱必须开启**（见上面第 4 步）。
- Supabase 免费项目长时间没人访问会被暂停，到控制台点一下即可恢复。

---

## 其他说明

- 回复时间写的是「北京时间每天 9–15 点 / 太平洋时间 6pm–12am」，这对应美国夏令时。冬令时（11 月到次年 3 月）北京 9–15 点对应太平洋时间 5pm–11pm，需要的话在 `src/i18n/strings.ts` 里改 `home.hours` / `home.hoursAlt`。
- 网站不加载任何境外字体或第三方脚本（Google Fonts 在国内打不开），用系统自带的中文字体。
- 路由用的是 HashRouter（地址形如 `/#/showcase`），因为 GitHub Pages 没有单页应用的回退机制。
