# Jack AI Studio · Jack 本地 AI 工作室

一个中英双语的工作室网站，部署在 GitHub Pages 上（纯静态），账号和数据放在 Supabase。

- **首页**：工作室介绍、服务、合作方式、回复时间
- **展览馆**：做过的项目卡片（已上线 / 开发中 / 演示），可点开看详情
- **联系**：表单留言（写入 Supabase 的 `contact_messages`），网站上不公开任何邮箱或电话
- **登录 / 注册**：邮箱 + 密码（Supabase Auth），找回密码
- **管理员审核开通**（代替邮箱确认）：新注册的账号一律是「待审核」，只能看到一个等待页（中英文，Jack 通过后自动进入，不用刷新）；Jack 在 **我的项目 → 用户** 页面核实身份后点「通过」，对方才能看到任何项目
- **我的项目（Dashboard）**，按角色显示：
  - **客户 client**（新注册默认）：审核通过后，只看到关联到自己邮箱的项目：进度、阶段、里程碑、项目动态；可以「确认验收」待验收的里程碑、给项目留言
  - **管理员 admin**（Jack）：建项目、改进度和里程碑、发动态（客户可见 / 内部）、看留言、看联系消息收件箱、审核新账号（导航上显示待审核数量）、设置用户角色
  - **家人 family**（只读）：所有项目的进度、未来 14 天的截止日期、最新动态（包括内部动态）；看不到收件箱和客户邮箱
- 进度、动态、留言通过 Supabase Realtime 实时刷新；切回浏览器标签页时也会刷新

没有配置 Supabase 时，网站自动进入 **演示模式**：使用内置示例数据（只存在内存里，刷新就重置），页面顶部有「演示模式 / Demo mode」横幅和身份切换器（访客 / 客户 / 待审核用户 / 管理员 / 家人），可以点开每个页面看效果。在演示模式里注册会创建一个待审核账号，切到「管理员」在「用户」页审核，再切回「待审核用户」就能看到审核前后的区别。

---

## 目录结构

```
studio-site/
├─ index.html
├─ package.json / vite.config.ts / tsconfig.json
├─ .env.example                 环境变量示例
├─ .github/workflows/deploy.yml  推送到 main 自动部署到 GitHub Pages
├─ fonts/fusion-pixel/          像素字体原文件和许可证（OFL），构建时自动裁成子集
├─ scripts/vite-plugins.mjs     构建插件：裁剪像素字体、页脚上的构建版本号
├─ scripts/og-card.html         链接预览图的模板（改完按文件开头的命令重新生成 public/og.png）
├─ public/portfolio/            展览馆截图
├─ public/og.png                分享链接时显示的预览图（1200×630）
├─ public/404.html              把没有 # 的地址（如 /jack-ai-studio/showcase）转到站内对应页面
├─ supabase/
│  ├─ schema.sql                在 Supabase SQL Editor 里运行的完整数据库脚本（新项目用这个）
│  ├─ migrations/
│  │  └─ 002_admin_approval.sql 已上线的项目升级用：加上「管理员审核开通」
│  ├─ test_rls.py               在本地真实 Postgres 上测试权限规则
│  └─ test/                     测试用文件（都不要在 Supabase 上运行）
│     ├─ supabase_stub.sql      auth 模拟
│     └─ schema_before_approval.sql  加审核之前的旧 schema，用来测试升级
└─ src/
   ├─ data/projects.ts          ← 展览馆项目（改这里）
   ├─ i18n/strings.ts           ← 所有界面文字（中文 + 英文）
   ├─ lib/permissions.ts        角色权限判断
   ├─ store/                    数据层：demoStore（演示）/ supabaseStore（正式，supabase-js 用到时才下载）
   ├─ pages/                    各个页面（登录、重设密码和 dashboard/ 是单独的文件，打开时才下载）
   ├─ components/fx/            动画：首页的 ASCII 显卡（WebGL）、作品频道、项目示意动画、读数等
   ├─ styles/                   tokens.css 是颜色和字体，其余按用途分文件
   └─ __tests__/                Vitest 单元测试
```

### 视觉设计

- 风格是「工作站控制台」：深色石墨底、暖白文字、唯一的强调色是琥珀色（像仪器上的指示灯）。浅色主题是同一套版式印在纸上的样子，右上角可以切换（深色 → 浅色 → 跟随系统）。
- 字体：标题用 Hubot Sans（GitHub 出的开源字体），标签和小字用 Fusion Pixel 像素字体（支持中文），读数用 DSEG7 七段数码管字体。三种都是 OFL 开源许可。
- 像素字体完整文件约 700 KB，`npm run dev` / `npm run build` 时会自动扫描 `src/` 里用到的字，裁成约 20 KB 的子集（生成在 `src/assets/generated/`，不提交）。新加的文字下次启动或构建时自动带上。
- 像素字体只在 12px 或 24px 时清晰，用 `var(--pixel)` 时请保持这两个字号。
- 首页的显卡是实时渲染的：WebGL2 光线步进出显卡的形状，再换成字符画；鼠标移上去风扇会加速，鼠标下的字符会被「解码」。不支持 WebGL2 的浏览器会直接不显示这张图。
  - 宽度 1200px 以上，显卡在右半边，不压住文字；1200px 以下移到文字下面；**手机（720px 以下）不显示**：手机上字符画只有四十几个字宽，标签也放不下，看起来就是一堆乱码，而且很耗电。
  - 靠右边的标签放不下时会自动改成朝左。
- 标题的「解码」效果（随机字符一个个变成正确文字）**只在有鼠标的宽屏电脑上播放**。手机、平板和设置了「减少动态效果」的访客直接看到文字：手机上这个效果会被当成乱码，而且手机加载慢时会拖到两三秒。中文位置解码时用全角符号（＃＊＋…），不用随机汉字，免得读起来像乱码。`src/__tests__/scramble.test.ts` 会检查这两点。
- 文字颜色分三档：`--text`、`--text-muted`、`--text-dim`（小标签，在所有底色上对比度都在 4.5:1 以上），另有只用于装饰的 `--text-faint`（标题第二行、分隔斜杠、熄灭的指示灯）。
- 「作品」区每个项目都有一段示意动画（`components/fx/Scenes.tsx`），页面上标明了「示意动画」，真实截图在项目详情页里。
- 系统设置了「减少动态效果」的访客，所有动画都会停在完成状态。

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

### 加载了什么

- 打开首页只下载网站自己的代码和 React（约 105 KB，gzip 后）。
- supabase-js（约 60 KB）**用到时才下载**：浏览器里存着登录记录（老用户）、从邮件链接回来、点「登录」、提交联系表单。第一次来的访客完全不下载它，也不会连 Supabase。逻辑在 `src/lib/supabase.ts` 和 `src/store/lazySupabaseStore.ts`。
- 登录、重设密码和「我的项目」是单独的文件，打开时才下载（页面空闲几秒后会提前悄悄下载登录页，点的时候是秒开的；省流量模式下不提前下载）。
- React 和 supabase-js 各自是单独的文件，网站更新时文件名不变，回访的人不用重新下载。
- 像素字体（约 22 KB）在 `index.html` 里预加载（`scripts/vite-plugins.mjs` 的 `preloadFonts`），否则它晚到时首屏顶部那行状态会从两行变一行，整页往上跳。
- 首屏以下的区块用了 `content-visibility: auto`，滑到附近才排版。
- **网站更新时正开着的页面**：更新会删掉旧文件，这时再点「登录」等按需加载的页面会找不到文件。网站会自动刷新一次（`src/lib/chunkErrors.ts`，一分钟内最多一次，防止死循环）；还是不行就显示「这个页面没能打开」和刷新按钮（`src/components/RouteErrorBoundary.tsx`），不会白屏。

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
   - **已经上线、运行过旧版 schema.sql 的项目**：改为运行 `supabase/migrations/002_admin_approval.sql`（可以重复运行，不会删改已有数据；已有的管理员和家人自动设为「已通过」，已有的客户变成「待审核」，需要在「用户」页面通过一次）。
3. **登录跳转地址**：左侧 **Authentication → URL Configuration**
   - **Site URL** 填你的 Pages 地址，例如 `https://你的用户名.github.io/仓库名/`（结尾带 `/`）
   - **Redirect URLs** 添加 `https://你的用户名.github.io/仓库名/**`；本地调试再加 `http://localhost:5173/**`
   - 注册确认和重置密码的邮件链接会跳回这个地址（网站用的是 HashRouter，所以跳回的是根地址，不带 `#/...`）
4. **关闭「确认邮箱」**（第 2 步的数据库脚本运行之后再关）：**Authentication → Sign In / Providers → Email** 里关掉 *Confirm email*。关掉后注册会直接登录，但账号是「待审核」，什么项目都看不到，直到你在网站上审核通过。**审核就是新的安全关口**：项目按邮箱关联客户，任何人都能用客户的邮箱注册，所以点「通过」之前一定要核实对方身份（比如在微信上确认这个邮箱是他本人的）。如果有人抢先用客户的邮箱注册了：拒绝它，再到 **Authentication → Users** 删除这个用户，真正的客户才能用这个邮箱注册。
5. **邮件发送**：Supabase 自带的邮件服务限制很严（目前只给项目团队成员发信，而且每小时只有几封）。关掉确认邮箱后，注册不再需要邮件，但「忘记密码」仍然要发邮件；想让客户自己重置密码，需要到 **Authentication → Emails → SMTP Settings** 配置你自己的 SMTP 服务。邮件模板也可以在 **Emails → Templates** 改成中文。
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

1. 先在网站上用自己的邮箱 **注册**（会看到等待审核页，正常）。
2. 到 Supabase **SQL Editor** 运行（换成真实邮箱）：

```sql
-- 把自己设为管理员
update public.profiles set role = 'admin' where email = lower('你的邮箱');
```

   管理员始终算「已通过」，不会被审核状态锁在外面。

3. 家人也先在网站上注册，然后在网站 **我的项目 → 用户** 页面点「通过」，再把角色改成「家人」；或者在 SQL Editor 里：

```sql
-- 设为家人（只读）并通过审核
update public.profiles set role = 'family', approval_status = 'approved' where email = lower('家人的邮箱');
```

成为管理员之后，审核和改角色都在网站 **我的项目 → 用户** 页面完成：最上面是「待审核」列表（通过 / 拒绝），被拒绝的账号单独列出，可以「恢复」为待审核；已开通的账号可以改角色或「撤销开通」。导航上的数字是待审核账号数，有人注册时实时更新。角色和审核状态都由数据库触发器保护：只有管理员（或 SQL Editor）能改，任何人都改不了自己的。SQL Editor 里的审核命令在 `schema.sql` 最后（第 8 节）。

### 给客户开项目

管理员在 **我的项目 → 新建项目** 里填「客户邮箱」。客户用 **同一个邮箱** 注册、你核实身份并点「通过」后，就能看到这个项目（邮箱大小写不影响）。客户如果之后修改了登录邮箱，账号会自动回到「待审核」，需要你重新通过。

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

`supabase/test_rls.py` 会在本机启动一个真实的 Postgres（通过 `pgserver` 包，不需要单独安装），模拟 Supabase 的 `auth` 部分，然后分三种情况测试：全新安装（`schema.sql` 跑两次 + 升级脚本跑两次）、从旧 schema 升级（旧 schema + 升级脚本跑两次）、带已有数据的线上升级。前两种各以不同身份检查约 210 条规则（待审核 / 被拒绝的账号什么都看不到、不能自己通过审核、客户看不到别人的项目和内部动态、不能改自己的角色和进度、家人只读且看不到收件箱和客户邮箱、访客只能提交联系表单、确认验收只能由项目客户在「待验收」状态下进行，等等），并检查全新安装和升级后的数据库结构完全一致。

```bash
python3 -m venv .venv-rls        # pgserver 只支持 Python 3.9–3.12
.venv-rls/bin/pip install pgserver "psycopg[binary]"
.venv-rls/bin/python supabase/test_rls.py
# 反向验证：故意放宽一条规则，测试必须失败
.venv-rls/bin/python supabase/test_rls.py --weaken client-read
```

⚠ 不要用 `--dsn` 指向你的 Supabase 正式数据库，这个脚本会建库和写测试数据。

---

## 安全说明

- **Publishable key 本来就是公开的**。它会被打包进网页，任何人都能看到，这是设计如此。真正保护数据的是数据库里的 **行级安全（RLS）**：每张表都开启了 RLS，每个请求按登录用户的身份过滤。
- 不要把 *secret key* / *service_role key* 放进网站或 GitHub 变量。
- **客户邮箱对家人隐藏**：RLS 只能按「行」过滤，不能隐藏某一列。所以 `projects.client_email` 用的是列级权限：API 角色可以读 `projects` 的其他所有列，但不能读 `client_email`。管理员通过 `admin_projects()` 函数读取（函数里先检查是不是管理员）。以后给 `projects` 加新列时，记得再运行一次 `grant select (新列名) on public.projects to authenticated;`。
- **确认验收** 用的是一个专门的数据库函数 `approve_milestone()`：只允许项目自己的客户、只在「待验收」状态、只改状态和验收人/时间，客户没有任何直接修改里程碑的权限。
- **角色**：新注册一律是客户（注册时传什么角色都会被忽略）；改角色由触发器拦截，只有管理员能改。
- **审核开通（代替邮箱确认）**：新注册一律是「待审核」，只能读到自己的那一行 `profiles`。所有客户和家人的读写（项目、里程碑、动态、留言、确认验收）都要求 `is_approved()`；管理员始终算已通过。`approval_status` / `approved_at` / `approved_by` 由触发器保护，只有管理员能改，通过时间和通过人由触发器自动记录、无法伪造。修改登录邮箱会让账号回到「待审核」（关掉确认邮箱后，Supabase 会立即生效邮箱修改）。
- **联系表单**：未登录访客只能「插入」，不能读取；数据库里有长度和取值检查。表单有一个隐藏的蜜罐字段过滤简单的机器人，但无法阻止有人直接调用 API 刷消息。如果以后遇到垃圾消息，可以在 Supabase 里开启 CAPTCHA 或加限流。
- **确认邮箱可以关闭，但前提是先运行了审核脚本**（见上面第 2、4 步）。旧版数据库没有审核关口，关掉确认邮箱等于任何人都能看到客户项目。
- Supabase 免费项目长时间没人访问会被暂停，到控制台点一下即可恢复。

---

## 其他说明

- 回复时间：加州时间每天上午 9 点到次日凌晨 1 点，2 小时内回复。对应北京时间凌晨 1 点到下午 5 点（美国夏令时期间是 0 点到下午 4 点）。首页和联系页的时间条、页头的「回复时段 / 非回复时段」按当前时间自动计算。文字在 `src/i18n/strings.ts` 的 `home.hours` / `home.hoursAlt`。
- 网站不加载任何境外字体或第三方脚本（Google Fonts 在国内打不开），用系统自带的中文字体。
- 路由用的是 HashRouter（地址形如 `/#/showcase`），因为 GitHub Pages 没有单页应用的回退机制。有人输入没有 `#` 的地址（比如 `/jack-ai-studio/showcase`）时，`public/404.html` 会把他转到 `/#/showcase`。
- 每个页面会设置自己的标签页标题（如「展览馆 · Jack AI Studio」、项目名），跟随语言。
- **链接预览**：`index.html` 里的 `og:*` / `twitter:*` 标签和 `public/og.png`，在 Upwork、LinkedIn、iMessage、Slack 等地方分享链接时显示。这些标签里的网址写的是 `https://jl0711.github.io/jack-ai-studio/`，以后换成自己的域名时要一起改（`404.html` 会自动识别域名，不用改）。微信里的链接卡片不一定用这张图（自定义微信分享卡片需要公众号的 JS-SDK）。
- 图标：`public/favicon.svg`（浏览器标签）和 `public/apple-touch-icon.png`（iPhone 添加到主屏幕）。
