#!/bin/bash
# Novel Site 一键部署脚本
# 使用方法: chmod +x setup.sh && ./setup.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "📚 Novel Site 一键部署"
echo "========================"
echo ""

# 检查 wrangler
if ! command -v wrangler &> /dev/null; then
    warn "未检测到 wrangler，正在安装..."
    npm install -g wrangler || error "wrangler 安装失败，请先安装 Node.js 18+"
fi
info "wrangler 已就绪"

# 检查登录状态
if ! wrangler whoami &> /dev/null 2>&1; then
    warn "请先登录 Cloudflare"
    wrangler login || error "登录失败"
fi
info "Cloudflare 已登录"

# 创建 D1 数据库
echo ""
echo "📦 创建 D1 数据库..."
DB_OUTPUT=$(wrangler d1 create novel-db 2>&1) || {
    if echo "$DB_OUTPUT" | grep -q "already exists"; then
        warn "数据库 novel-db 已存在，跳过创建"
        DB_ID=$(wrangler d1 list 2>&1 | grep novel-db | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
    else
        error "创建数据库失败: $DB_OUTPUT"
    fi
}

if [ -z "$DB_ID" ]; then
    DB_ID=$(echo "$DB_OUTPUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
fi

if [ -z "$DB_ID" ]; then
    error "无法获取数据库 ID，请手动检查: wrangler d1 list"
fi
info "D1 数据库 ID: $DB_ID"

# 更新 wrangler.toml
sed -i "s/database_id = \".*\"/database_id = \"$DB_ID\"/" wrangler.toml
info "wrangler.toml 已更新"

# 创建 R2 存储桶
echo ""
echo "🪣 创建 R2 存储桶..."
R2_OUTPUT=$(wrangler r2 bucket create novel-storage 2>&1) || {
    if echo "$R2_OUTPUT" | grep -q "already exists"; then
        warn "存储桶 novel-storage 已存在，跳过创建"
    else
        error "创建存储桶失败: $R2_OUTPUT"
    fi
}
info "R2 存储桶已就绪"

# 初始化数据表
echo ""
echo "🗄️ 初始化数据表..."
wrangler d1 execute novel-db --file schema.sql --remote || error "数据表初始化失败"
info "数据表已创建"

# 设置管理员密码
echo ""
echo "🔐 设置管理员密码"
echo "   要求: 至少8位，包含字母和数字"
echo ""

while true; do
    read -s -p "   请输入管理员密码: " ADMIN_PWD
    echo ""
    if [ ${#ADMIN_PWD} -lt 8 ]; then
        warn "密码至少8位，请重新输入"
        continue
    fi
    if ! echo "$ADMIN_PWD" | grep -qE '[a-zA-Z]'; then
        warn "密码需包含字母，请重新输入"
        continue
    fi
    if ! echo "$ADMIN_PWD" | grep -qE '[0-9]'; then
        warn "密码需包含数字，请重新输入"
        continue
    fi
    read -s -p "   确认密码: " ADMIN_PWD2
    echo ""
    if [ "$ADMIN_PWD" != "$ADMIN_PWD2" ]; then
        warn "两次输入不一致，请重新输入"
        continue
    fi
    break
done

# 创建 Pages 项目并设置 secret
echo ""
echo "🚀 部署到 Cloudflare Pages..."

# 先部署一次创建项目
wrangler pages deploy . --project-name novel-site || error "部署失败"
info "Pages 项目已创建"

# 设置密码 secret
echo "$ADMIN_PWD" | wrangler pages secret put ADMIN_PASSWORD --project-name novel-site || {
    warn "自动设置密码失败，请手动执行:"
    echo "   wrangler pages secret put ADMIN_PASSWORD --project-name novel-site"
}
info "管理员密码已设置"

# 重新部署使 secret 生效
wrangler pages deploy . --project-name novel-site || error "重新部署失败"

echo ""
echo "========================"
echo ""
info "🎉 部署完成！"
echo ""
echo "   📖 站点地址: https://novel-site.pages.dev"
echo "   🔧 管理后台: https://novel-site.pages.dev/admin.html"
echo "   👤 用户名: admin"
echo "   🔑 密码: 你刚才设置的密码"
echo ""
echo "   如需自定义域名，请在 Cloudflare Dashboard → Pages → novel-site → Custom domains 中添加"
echo ""
