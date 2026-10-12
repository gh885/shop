# 卖家 / 平台两端的静态产物。它不是用来「跑」的：主机 nginx 直接托管这些文件，
# 镜像只是把产物随同一条 GHCR 链路送到主机（deploy.sh 用 docker create + docker cp 取出来，
# 落到 /var/www/shop/releases/<sha>/），避免再开一条跨境 scp。
#
# 构建上下文由 CI 拼出：seller/ 与 admin/ 两个目录就是各自的 dist（index.html + assets/）。
FROM scratch

LABEL org.opencontainers.image.source="https://github.com/gh885/shop" \
      org.opencontainers.image.description="shop seller + admin static bundles"

COPY seller /srv/seller
COPY admin /srv/admin

# scratch 镜像没有 CMD 的话 docker create 会拒绝；这条永远不会被执行。
CMD ["/srv"]
