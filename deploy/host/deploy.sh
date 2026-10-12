#!/usr/bin/env bash
# 发布 / 回滚（以部署用户跑，不需要 root；需要在 docker 组里）。
#
#   bash ~/shop-app/deploy.sh ~/shop-app/images/<sha>.env     # 发布或回滚到这份镜像清单
#
# images.env 由 CI 产出，形如：
#   SHOP_VERSION=abc1234
#   SHOP_SERVER_IMAGE=ghcr.nju.edu.cn/gh885/shop-server@sha256:…
#   SHOP_WEB_IMAGE=ghcr.nju.edu.cn/gh885/shop-web@sha256:…
#   SHOP_STATIC_IMAGE=ghcr.nju.edu.cn/gh885/shop-static@sha256:…
# 回滚 = 用上一份 images.env 再跑一遍（images/ 目录保留历史）。数据库不回滚，口径见 production-readiness.md。
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_ROOT="/var/www/shop"
IMAGES_ENV="${1:?用法：deploy.sh <images.env>}"
[ -f "$IMAGES_ENV" ] || { echo "找不到 $IMAGES_ENV"; exit 1; }
[ -f "$APP_DIR/.env" ] || { echo "缺 $APP_DIR/.env，先跑 setup-host.sh"; exit 1; }

set -a
# shellcheck source=/dev/null
. "$IMAGES_ENV"
set +a
: "${SHOP_VERSION:?images.env 缺 SHOP_VERSION}"
: "${SHOP_SERVER_IMAGE:?}" "${SHOP_WEB_IMAGE:?}" "${SHOP_STATIC_IMAGE:?}"
echo "==> 发布 $SHOP_VERSION"

cd "$APP_DIR"
compose() { docker compose --env-file .env --env-file "$IMAGES_ENV" "$@"; }

# 1. 拉镜像（经南大镜像站，按 digest）
compose pull

# 2. 取静态产物 → releases/<sha>，原子切换 current
RELEASE_DIR="$WEB_ROOT/releases/$SHOP_VERSION"
if [ ! -d "$RELEASE_DIR/seller" ]; then
    cid="$(docker create "$SHOP_STATIC_IMAGE")"
    mkdir -p "$RELEASE_DIR"
    docker cp "$cid:/srv/." "$RELEASE_DIR/"
    docker rm "$cid" >/dev/null
fi
ln -sfn "$RELEASE_DIR" "$WEB_ROOT/current.tmp" && mv -T "$WEB_ROOT/current.tmp" "$WEB_ROOT/current"

# 3. 起/换容器
compose up -d --remove-orphans

# 4. 等后端就绪（Flyway 迁移在启动时跑）
for i in $(seq 1 40); do
    if curl -sf -m 2 http://127.0.0.1:18080/actuator/health >/dev/null 2>&1; then
        echo "==> 后端 UP（$((i*3))s）"; break
    fi
    [ "$i" -eq 40 ] && { echo "后端 120s 内未就绪，看日志：docker compose logs server"; exit 1; }
    sleep 3
done
curl -sf -m 5 -o /dev/null http://127.0.0.1:13000/ -w "==> web SSR HTTP %{http_code}\n"

# 5. 记录本次清单、清理：保留最近 3 个 release 目录与悬空镜像
mkdir -p "$APP_DIR/images"
cp -f "$IMAGES_ENV" "$APP_DIR/images/$SHOP_VERSION.env" 2>/dev/null || true
find "$WEB_ROOT/releases" -mindepth 1 -maxdepth 1 -type d ! -name bootstrap -printf '%T@ %p
' | sort -rn | tail -n +4 | cut -d' ' -f2- | xargs -r rm -rf
docker image prune -f >/dev/null
echo "==> 完成：$SHOP_VERSION"
