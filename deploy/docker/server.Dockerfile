# 后端运行镜像。构建上下文 = apps/server，且 target/platform-*.jar 已由 `pnpm package:server`
# （或 CI 的 mvn package）打好——镜像里不编译，只装运行时，这样 Dockerfile 不用懂 Maven，
# 也不把 JDK 带进生产镜像。
#
# 基础镜像用 Ubuntu 版 JRE（不是 alpine）：Spring Boot + Tomcat 在 musl 上的兼容性问题不值得省那几十 MB。
FROM eclipse-temurin:25-jre

LABEL org.opencontainers.image.source="https://github.com/gh885/shop" \
      org.opencontainers.image.description="shop server (Spring Boot)"

# 日志文件目录（application-prod.yml 默认 /var/log/shop/shop-server.log，ECS JSON）。
# uid 1000 与主机上的部署用户一致，compose 把 ./logs 挂进来后两边都能写。
RUN mkdir -p /var/log/shop && chown 1000:1000 /var/log/shop

WORKDIR /app
COPY --chown=1000:1000 target/platform-*.jar /app/app.jar

USER 1000:1000
EXPOSE 8080

# 堆大小交给容器限额（compose 的 mem_limit）按比例算，不在这里写死 -Xmx；
# 2 核小机器上 SerialGC 比 G1 省内存，吞吐差异在这个流量下看不出来。
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70 -XX:+UseSerialGC -Djava.security.egd=file:/dev/./urandom"

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
