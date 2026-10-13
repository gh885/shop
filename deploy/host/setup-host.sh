#!/usr/bin/env bash
# 云主机一次性初始化（需要 root）。幂等：重复跑只补缺的部分，不覆盖已有密钥与证书。
#
#   sudo PUBLIC_IP=1.2.3.4 bash setup-host.sh
#
# 做的事：装 certbot（snap）→ 建目录 → 生成 ~/shop-app/.env（密钥现场生成、库口令抄自 ~/shop-infra/.env）
#         → 签 Let's Encrypt IP 证书 → 装 nginx 站点 → reload。
# 不做的事：拉镜像、起容器（那是 deploy.sh，不需要 root）；开安全组端口（443/8443/9443 要在阿里云控制台放行）。
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-xun}"
HOME_DIR="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
APP_DIR="$HOME_DIR/shop-app"
INFRA_ENV="$HOME_DIR/shop-infra/.env"
WEB_ROOT="/var/www/shop"
ACME_WEBROOT="/var/www/html"            # nginx 默认站 root，80 口已对公网开放
IMAGE_ORIGIN="${IMAGE_ORIGIN:-http://tkowmtfov.hb-bkt.clouddn.com}"   # 七牛测试域名（仅 http）
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ "$(id -u)" -eq 0 ] || { echo "要用 root 跑：sudo bash $0"; exit 1; }
[ -f "$INFRA_ENV" ] || { echo "找不到 $INFRA_ENV（数据面的口令文件），先按 deploy/dataplane.compose.yml 把数据面起来"; exit 1; }
command -v nginx >/dev/null || { echo "主机没有 nginx"; exit 1; }
command -v docker >/dev/null || { echo "主机没有 docker"; exit 1; }

PUBLIC_IP="${PUBLIC_IP:-$(curl -s -m 5 http://100.100.100.200/latest/meta-data/eipv4 || true)}"
[ -n "$PUBLIC_IP" ] || { echo "拿不到公网 IP，手动传：PUBLIC_IP=x.x.x.x"; exit 1; }
echo "==> 公网 IP：$PUBLIC_IP；部署用户：$DEPLOY_USER"

# ---------- 1. certbot（snap 装最新版；apt 里的 2.9 不支持 IP 证书）----------
if ! command -v certbot >/dev/null || ! certbot --version 2>/dev/null | grep -qE "certbot (5\.[4-9]|5\.[1-9][0-9]|[6-9]\.)"; then
    echo "==> 安装 certbot（snap）"
    snap install core >/dev/null 2>&1 || true
    snap refresh core >/dev/null 2>&1 || true
    snap install --classic certbot
    ln -sf /snap/bin/certbot /usr/bin/certbot
fi
echo "==> certbot：$(certbot --version 2>&1)"

# ---------- 1b. 主机防火墙 ----------
# 这台机的 ufw 默认拒绝入站（只放了 22/80/8080），不开的话安全组开了也没用：实测全球节点测 443 全部超时。
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
    for p in 443 8443 9443; do ufw allow "$p/tcp" >/dev/null; done
    echo "==> ufw 已放行 443/8443/9443（安全组是另一道，要在控制台开）"
fi

# ---------- 2. 目录 ----------
install -d -o "$DEPLOY_USER" -g www-data -m 755 "$WEB_ROOT" "$WEB_ROOT/releases"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 755 "$APP_DIR" "$APP_DIR/logs" "$APP_DIR/images"
install -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 644 "$SRC_DIR/../app/compose.yml" "$APP_DIR/compose.yml"
install -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 755 "$SRC_DIR/deploy.sh" "$APP_DIR/deploy.sh"

# ---------- 3. ~/shop-app/.env（只在不存在时生成；密钥不覆盖）----------
if [ ! -f "$APP_DIR/.env" ]; then
    echo "==> 生成 $APP_DIR/.env"
    PG_PASSWORD="$(grep -E '^PG_PASSWORD=' "$INFRA_ENV" | cut -d= -f2-)"
    REDIS_PASSWORD="$(grep -E '^REDIS_PASSWORD=' "$INFRA_ENV" | cut -d= -f2-)"
    PEPPER="$(openssl rand -hex 32)"
    JWT_PRIV="$(openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -outform DER | base64 -w0)"
    JWT_PUB="$(echo "$JWT_PRIV" | base64 -d | openssl pkey -inform DER -pubout -outform DER | base64 -w0)"
    sed -e "s|^SPRING_DATASOURCE_PASSWORD=.*|SPRING_DATASOURCE_PASSWORD=$PG_PASSWORD|" \
        -e "s|^SPRING_DATA_REDIS_PASSWORD=.*|SPRING_DATA_REDIS_PASSWORD=$REDIS_PASSWORD|" \
        -e "s|^SHOP_SECURITY_PEPPER=.*|SHOP_SECURITY_PEPPER=$PEPPER|" \
        -e "s|^SHOP_JWT_PRIVATE_KEY=.*|SHOP_JWT_PRIVATE_KEY=$JWT_PRIV|" \
        -e "s|^SHOP_JWT_PUBLIC_KEY=.*|SHOP_JWT_PUBLIC_KEY=$JWT_PUB|" \
        -e "s|__PUBLIC_IP__|$PUBLIC_IP|g" \
        "$SRC_DIR/../app/env.example" > "$APP_DIR/.env"
    chown "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR/.env"
    chmod 600 "$APP_DIR/.env"
else
    echo "==> $APP_DIR/.env 已存在，不动"
fi

# ---------- 4. Let's Encrypt IP 证书（6 天短期；续期由 snap 装的定时器负责）----------
shopt -s nullglob
live_dirs=(/etc/letsencrypt/live/*/)
shopt -u nullglob
if [ "${#live_dirs[@]}" -eq 0 ]; then
    echo "==> 先用 staging 演练一次"
    certbot certonly --webroot -w "$ACME_WEBROOT" --ip-address "$PUBLIC_IP" \
        --preferred-profile shortlived --non-interactive --agree-tos --register-unsafely-without-email --dry-run
    echo "==> 正式签发"
    certbot certonly --webroot -w "$ACME_WEBROOT" --ip-address "$PUBLIC_IP" \
        --preferred-profile shortlived --non-interactive --agree-tos --register-unsafely-without-email \
        --deploy-hook "systemctl reload nginx"
fi
live_dirs=(/etc/letsencrypt/live/*/)
LIVE_DIR="${live_dirs[0]}"
echo "==> 证书目录：$LIVE_DIR"
certbot certificates 2>/dev/null | grep -E "Expiry|Certificate Name" || true

# ---------- 5. nginx 站点 ----------
IMAGE_HOST="${IMAGE_ORIGIN#*://}"; IMAGE_HOST="${IMAGE_HOST%%/*}"
install -d /etc/nginx/snippets
sed -e "s|__LIVE_DIR__|$LIVE_DIR|g" "$SRC_DIR/nginx/snippets/shop-ssl.conf" > /etc/nginx/snippets/shop-ssl.conf
install -m 644 "$SRC_DIR/nginx/snippets/shop-proxy.conf" /etc/nginx/snippets/shop-proxy.conf
install -m 644 "$SRC_DIR/nginx/snippets/shop-security-headers.conf" /etc/nginx/snippets/shop-security-headers.conf
sed -e "s|__IMAGE_ORIGIN__|$IMAGE_ORIGIN|g" -e "s|__IMAGE_HOST__|$IMAGE_HOST|g" \
    "$SRC_DIR/nginx/shop.conf" > /etc/nginx/sites-available/shop
ln -sfn /etc/nginx/sites-available/shop /etc/nginx/sites-enabled/shop
# 静态根目录还没有 current 时 nginx -t 也能过（root 不存在只在请求时 404），但 /var/www/shop/current 要先有个占位
[ -e "$WEB_ROOT/current" ] || { install -d -o "$DEPLOY_USER" -g www-data "$WEB_ROOT/releases/bootstrap/seller" "$WEB_ROOT/releases/bootstrap/admin"; ln -sfn "$WEB_ROOT/releases/bootstrap" "$WEB_ROOT/current"; }
nginx -t
systemctl reload nginx
echo "==> nginx 已加载 shop 站点：https://$PUBLIC_IP（web）/ :8443（seller）/ :9443（admin）"

cat <<EOF

完成。接下来：
  1. 阿里云安全组放行 443、8443、9443（入方向 TCP）。
  2. 以 $DEPLOY_USER 身份跑首次发布：bash $APP_DIR/deploy.sh <images.env>
     （images.env 由 CI 的 build-images 工作流产出，见 docs/release/deploy-runbook.md）
  3. 验证续期：certbot renew --dry-run
EOF
