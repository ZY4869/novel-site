# Cloudflare Pages：Git 自动部署 + D1/R2 绑定 + 自定义域名挂载（Novel Site）

本文档适用于本仓库（`novel-site`）：纯静态 HTML/CSS/JS + Cloudflare Pages Functions（后端 API），数据用 **D1**（SQLite）与 **R2**（对象存储）。

- **线上运行**：部署完成后，站点在 Cloudflare 上运行，你本机/服务器不需要常开。
- **你需要本机或 CI 的时刻**：首次创建资源、初始化数据库、后续更新发布（`git push` 自动部署或手动部署）。

官方文档参考（建议收藏）：
- Git 集成：<https://developers.cloudflare.com/pages/configuration/git-integration/>
- Functions 绑定（D1/R2/Secrets）：<https://developers.cloudflare.com/pages/functions/bindings/>
- 自定义域名：<https://developers.cloudflare.com/pages/configuration/custom-domains/>
- Build 配置：<https://developers.cloudflare.com/pages/configuration/build-configuration/>
- Pages 使用 `wrangler.toml`（进阶）：<https://developers.cloudflare.com/pages/functions/wrangler-configuration/>

---

## 0. 这个项目到底怎么跑起来的（一句话）

浏览器访问静态页面（`index.html/book.html/read.html/admin.html`）→ 页面同域请求 `/api/*` → Pages Functions 处理请求 → 元数据在 **D1**（`env.DB`），正文/封面/字体在 **R2**（`env.R2`）。

本项目关键绑定名（必须一致）：
- D1 binding：`DB`
- R2 binding：`R2`
- 必需 Secret：`ADMIN_PASSWORD`（用于创建默认管理员）
- 建议 Secret：`IP_SALT`（用于访问统计的 IP 哈希加盐）

---

## 1. 前置准备

你需要：
- Cloudflare 账号（有权限创建 Pages / D1 / R2）
- 域名已在 Cloudflare 托管 DNS（你已确认）
- 一个 Git 托管（**GitHub 或 GitLab**，Pages 仅支持这两类托管；不支持自建 Git 服务）

本地工具（推荐，但不是必须全部安装）：
- Git
- Node.js 18+（用于安装/运行 `wrangler`）
- Wrangler CLI（用于创建 D1/R2、初始化数据库，或手动设置 secrets）

安装 wrangler（任选其一）：
```bash
npm i -g wrangler
wrangler -v
wrangler login
```

> 如果你不想装 CLI：D1/R2 的创建和 SQL 初始化也可以在 Cloudflare 控制台完成（下文会给两种方法）。

---

## 2. 把当前项目放到 Git 仓库（GitHub / GitLab）

### 2.1 GitHub（示例）
1. 在 GitHub 新建一个空仓库（建议不要勾选自动生成 README/License，以免产生冲突）
2. 在本地项目根目录执行：

```bash
git init
git add .
git commit -m "chore: init novel-site"

# 替换为你的仓库地址
git remote add origin https://github.com/<you>/<repo>.git

# 如果默认分支不是 main，请根据你的情况改
git branch -M main
git push -u origin main
```

### 2.2 GitLab（示例）
流程类似：创建空项目 → 添加远程 → push。
```bash
git init
git add .
git commit -m "chore: init novel-site"
git remote add origin https://gitlab.com/<you>/<repo>.git
git branch -M main
git push -u origin main
```

---

## 3. 创建 Cloudflare 资源（只做一次）

你需要创建两样东西：
- **D1 数据库**：建议叫 `novel-db`
- **R2 Bucket**：建议叫 `novel-storage`

> ⚠️ 重要：本仓库的 `wrangler.toml` 里包含 `[[d1_databases]] database_id = "..."`，它通常来自**作者账号**，你必须替换成你自己账号下 D1 的 `database_id`，否则 Git 自动部署会报错：  
> `D1 binding 'DB' references database '...' which was not found`  
> 同理，`[[r2_buckets]] bucket_name` 也必须是你账号下真实存在的桶名，否则会报：`R2 bucket '...' not found`。

### 3.1 方法 A：在 Cloudflare 控制台创建（不装 CLI 也可以）
1. Cloudflare Dashboard → **Workers & Pages** → **D1** → Create database
2. Cloudflare Dashboard → **R2** → Create bucket

创建后记下来：
- D1 的数据库名（比如 `novel-db`）
- D1 的 `database_id`（UUID）
- R2 的 bucket 名（比如 `novel-storage`）

### 3.2 方法 B：用 wrangler 创建（推荐，便于复制/自动化）
```bash
wrangler d1 create novel-db
wrangler r2 bucket create novel-storage
```

> 注意：`wrangler d1 create` 输出里会包含 `database_id`。你需要把它写回 `wrangler.toml`（用于 Git 自动部署 / 以及本地开发）。

### 3.3 把 D1/R2 写回 `wrangler.toml`（建议做一次，避免部署失败）
1. 打开 `wrangler.toml`
2. 把 `database_id = "..."` 替换为你自己 D1 的 ID
3. 如果你 R2 桶名不是 `novel-storage`，把 `bucket_name` 改成你的实际桶名
4. `git commit` + `git push` 触发 Pages 重新部署

获取 D1 `database_id` 的方式：
- 控制台：Workers & Pages → D1 → 选择数据库 → 详情页里复制 Database ID（UUID）
- CLI：`wrangler d1 list`（会列出名称与 ID）

---

## 4. 创建 Pages 项目并连接 Git（开启自动部署）

1. Cloudflare Dashboard → **Workers & Pages** → **Pages**
2. Create a project / Connect to Git
3. 选择你的 GitHub/GitLab 与对应仓库
4. 选择生产分支（例如 `main`）

结果：
- 之后你 **每次 push 到生产分支**，Cloudflare Pages 都会自动构建并发布（自动部署）。
- 可选：分支/PR 会生成 Preview 部署（后面会讲如何关闭）。

---

## 5. Build 配置（本项目是纯静态，无需构建）

在 Pages 项目的 Build 配置页面：
- Framework preset：选择 **None**（或 “No framework”）
- Build command：
  - 优先：留空
  - 如果界面强制必填：填 `exit 0`
- Build output directory：
  - 推荐填 `.`（当前目录）
  - 如果报 “输出目录不存在”，再调整为 `/` 或清空重新部署（以控制台实际提示为准）
- Root directory：仓库根目录（留空或 `/`）

---

## 6. 配置 Pages Functions 的 Bindings（生产 + 预览）

打开 Pages 项目：
**Settings（设置）→ Functions / Bindings（不同 UI 版本入口名称略有差异）**

### 6.1 必需绑定（变量名必须和代码一致）

| 类型 | 变量名（必须） | 你要选择/填写的资源 | 是否必须 |
|---|---|---|---|
| D1 Database Binding | `DB` | 选择你创建的 D1（如 `novel-db`） | 必须 |
| R2 Bucket Binding | `R2` | 选择你创建的 R2（如 `novel-storage`） | 必须 |
| Secret（加密） | `ADMIN_PASSWORD` | 管理员初始密码（强密码） | 必须 |
| Secret（加密） | `IP_SALT` | 任意随机字符串（建议设置） | 建议 |

重要说明：
- **`ADMIN_PASSWORD` 必须设置**：后端在创建默认管理员（`admin`）时依赖它；没设置会拒绝创建默认管理员。
- 绑定/Secrets 修改后：需要 **Redeploy**（重新部署）才会在新部署中生效。

### 6.2 生产环境 vs 预览环境
- **生产环境（Production）**：必须完整配置上述绑定
- **预览环境（Preview）**：
  - 如果你希望预览链接也能正常使用 `/api/*`，建议同样配置 bindings & secrets
  - 如果不配置，通常只会影响预览环境，不影响生产

---

## 7. 初始化 D1 数据库表（只做一次）

你必须执行本仓库的 `schema.sql`，否则表不存在会导致 API/后台异常。

### 7.1 方法 A：用 wrangler 执行（推荐）
```bash
# 确保已登录
wrangler whoami

# 初始化表结构（远程 D1）
wrangler d1 execute novel-db --file schema.sql --remote
```

如果你数据库名不是 `novel-db`，把命令里的 `novel-db` 换成你的实际名称。

### 7.2 方法 B：在 D1 控制台执行
1. Cloudflare Dashboard → Workers & Pages → D1 → 选择你的数据库
2. 打开 Console（SQL 执行界面）
3. 把 `schema.sql` 内容粘贴进去执行

### 7.3 migrations 什么时候需要跑？
`migrations/` 目录用于“老版本数据库升级”。**新建数据库且已执行 `schema.sql` 的情况下，一般不需要再执行迁移文件。**

如果你确实是从旧版本升级：
- 先备份（可在 D1 控制台导出或用 `wrangler d1 export` 等方式，具体以你当前 wrangler 版本命令为准）
- 再按迁移文件顺序逐个执行

---

## 8. 首次验证（验收清单）

部署完成 + bindings 配好 + schema 初始化后，按以下清单验收：

1. 访问站点首页：`https://<你的项目>.pages.dev/`
   - 能打开页面
   - 网络请求 `/api/books` 正常返回（没数据也应返回空列表）
2. 访问后台：`https://<你的域名或 pages.dev>/admin.html`
   - 用用户名 `admin` + 你设置的 `ADMIN_PASSWORD` 登录
3. 后台操作：
   - 新建书籍
   - 新建章节（创建后阅读页能正常打开）
   - 上传封面后，访问 `/api/covers/<bookId>` 能返回图片
   - 上传字体（woff2）后，阅读页能加载字体

---

## 9. 日常更新（Git 自动部署工作流）

### 9.1 正常更新
```bash
git add .
git commit -m "feat: update"
git push
```
push 到生产分支后，Pages 会自动部署新版本。

### 9.2 暂停自动部署（减少无意义构建）
在 Pages 项目设置里通常可以：
- 关闭 Production branch 的自动部署
- 或关闭 Preview deployments（避免非主分支/PR 也触发构建）

> 具体开关位置可能随 UI 调整，但入口一般在 Pages 项目的 “Builds & Deployments / Git settings / Deployment settings” 一类页面。

### 9.3 回滚
Pages 控制台的 Deployments 列表通常支持一键回滚到某个历史部署（Rollback）。

---

## 10. “CF 挂载”：绑定自定义域名到 Pages（域名已在 Cloudflare DNS）

目标：让 `example.com` 或 `novel.example.com` 指向你的 Pages 项目，并自动启用 HTTPS。

步骤：
1. Cloudflare Dashboard → Workers & Pages → Pages → 选择你的项目
2. 进入 **Custom domains**
3. 点击 **Set up a domain**，输入你的域名（如 `novel.example.com` 或根域 `example.com`）
4. 按向导完成验证

因为你的 DNS 已托管在 Cloudflare：
- Cloudflare 通常会自动创建/调整需要的 DNS 记录（常见为 CNAME 指向 `<project>.pages.dev`）。

强烈建议：
- **不要只在 DNS 里手动加记录，而不在 Pages 里添加 Custom domain**；正确做法是“先在 Pages 里绑定域名”，让 Cloudflare 自动处理记录与证书。

常见现象：
- HTTPS 证书签发可能需要几分钟到更久（取决于域名/缓存/验证状态），耐心等待并按控制台提示排查。

---

## 11. 本地开发（可选）

如果你要在本机预览 Pages Functions + 静态页面：
（一行写法，Windows/macOS/Linux 都可用）
```bash
wrangler pages dev . --port 3355 --d1 DB=<your-database-id> --r2 R2=novel-storage --binding ADMIN_PASSWORD=your_password
```

（多行写法 - Bash/WSL）
```bash
wrangler pages dev . --port 3355 \
  --d1 DB=<your-database-id> \
  --r2 R2=novel-storage \
  --binding ADMIN_PASSWORD=your_password
```

（多行写法 - PowerShell）
```powershell
wrangler pages dev . --port 3355 `
  --d1 DB=<your-database-id> `
  --r2 R2=novel-storage `
  --binding ADMIN_PASSWORD=your_password
```

提示：
- 本仓库的 `wrangler.toml` 也包含了 `DB/R2` 绑定信息；你可以按需更新其中的 `database_id`，让本地开发更顺畅。
- 本地开发用的 `ADMIN_PASSWORD` 建议不要复用线上强密码（避免误泄露）。

---

## 12. 常见问题排查（Checklist）

### 12.1 构建失败：输出目录不存在 / 找不到文件
- 确认 Build output directory 是 `.`（或按错误提示调整）
- Build command 留空或 `exit 0`
- Root directory 指向仓库根目录

### 12.2 运行时报错：`DB` / `R2` 未定义
- Pages 项目里检查 bindings 是否已添加
- 变量名必须是 `DB` 和 `R2`
- 修改后重新部署一次（Redeploy）

### 12.3 后台登录失败 / 默认管理员没有
- 检查 `ADMIN_PASSWORD` 是否已作为 **Secret** 设置在对应环境
- 修改后 Redeploy
- 确认 D1 已执行 `schema.sql`（`admin_users` 等表必须存在）

### 12.4 自定义域名 522 / 访问异常
- 确认你是在 Pages 项目里添加了 Custom domain（而不是只改 DNS）
- 等待证书签发完成
- 检查 Cloudflare DNS 记录是否被错误覆盖/冲突

### 12.5 部署时报错：`D1 ... was not found` / `R2 bucket ... not found`
- 这通常表示你仓库里的 `wrangler.toml` 仍然是“作者账号”的资源 ID/桶名
- 处理方式：
  - D1：在你自己的 Cloudflare 账号创建 D1，复制它的 `database_id`，替换 `wrangler.toml` 里的 `database_id` 后再 push
  - R2：确认桶在同账号下存在，且 `wrangler.toml` 的 `bucket_name` 与实际一致

---

## 13. 进阶：把 bindings/secrets 配置写进仓库（可选）

Cloudflare Pages 支持“使用 `wrangler.toml` 作为配置来源”的模式（官方称 Wrangler configuration）。

适用场景：
- 你希望用 Git 管理 bindings/配置，减少手工点控制台带来的漂移

注意事项：
- 启用后，同名配置通常以 `wrangler.toml` 为准，控制台对应字段可能不可编辑或会被覆盖
- secrets 仍然不建议写入仓库（应使用控制台 Secrets 或 CI 注入）

参考官方说明：<https://developers.cloudflare.com/pages/functions/wrangler-configuration/>
