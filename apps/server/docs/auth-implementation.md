# 认证实现对照

> **快照文档**：记录实现进度对照，非持续维护的约定；后续变更以代码为准。
> 依据清单：[docs/reference/authentication-details.md](../../docs/reference/authentication-details.md) v1.1（2026-07-26）。
> 更新于 2026-07-27。设计动机与攻击面分析见 [docs/decisions/auth.md](../../docs/decisions/auth.md)。

## 状态图例

| 标记 | 含义                |
| ---- | ------------------- |
| ✅   | 已实现              |
| ⚠️   | 部分实现/存在偏差   |
| ❌   | 不达标（P0 不允许） |
| 🚫   | 未实现              |
| ⏳   | 延后（P2）          |
| 📝   | 认知条目/文档性     |

---

## 一、身份验证

### 1.1 账号 + 密码

#### 注册阶段 — 密码策略

| ID     | 优先级 | 状态      | 说明                                                             |
| ------ | ------ | --------- | ---------------------------------------------------------------- |
| REG-01 | P0     | ✅ 已实现 | `AuthService.java:201` `validatePassword()` → 最小长度 8 位      |
| REG-02 | P0     | ✅ 已实现 | 未强制任何组合规则                                               |
| REG-03 | P0     | ✅ 已实现 | `AuthService.java:50` `COMMON_PASSWORDS` 黑名单（14 个常见密码） |
| REG-04 | P1     | 🚫 不做   | 内网开发环境无法访问 HIBP API，部署到生产前集成                  |
| REG-05 | P0     | ✅ 已实现 | `AuthService.java:207` `password.equals(phone)` 检查             |
| REG-06 | P0     | ✅ 已实现 | `AuthService.java:204` 72 字节上限（BCrypt 截断边界）            |

#### 注册阶段 — 所有权验证

| ID     | 优先级 | 状态      | 说明                                      |
| ------ | ------ | --------- | ----------------------------------------- |
| REG-07 | P1     | ✅ 已实现 | 短信验证码登录已通过 OTP 验证手机号所有权 |

#### 哈希参数

| ID      | 优先级 | 状态      | 说明                                                   |
| ------- | ------ | --------- | ------------------------------------------------------ |
| HASH-01 | P0     | ✅ 已实现 | `AuthModuleConfig.java:18` `BCryptPasswordEncoder(12)` |
| HASH-02 | P0     | ✅ 已实现 | BCryptPasswordEncoder 内部自动生成 16+ 字节随机 salt   |
| HASH-03 | P0     | ✅ 已实现 | BCrypt modular crypt format 自描述                     |

#### 登录验证

| ID       | 优先级 | 状态      | 说明                                                                             |
| -------- | ------ | --------- | -------------------------------------------------------------------------------- |
| LOGIN-01 | P1     | ✅ 已实现 | `AuthService.java:58` `DUMMY_PASSWORD_HASH` 常量，用户不存在时走 dummy hash 比对 |
| LOGIN-02 | P0     | ✅ 已实现 | `AuthService.java:90-93` 查用户与比密码之间无分支，统一走到底                    |
| LOGIN-03 | P0     | ✅ 已实现 | BCryptPasswordEncoder.matches() 内部常量时间比较                                 |
| LOGIN-04 | P0     | ✅ 已实现 | `AuthService.java:103` 统一返回「手机号或密码错误」                              |
| LOGIN-05 | P0     | ✅ 已实现 | `AuthService.java:218-233` IP 维度 10次/60s + 账号维度 5次/600s                  |
| LOGIN-06 | P1     | 🚫 不做   | 需 Turnstile/reCAPTCHA 集成和前端配合，上线后按需添加                            |
| LOGIN-07 | P1     | ✅ 已实现 | 限流触发时抛 `BusinessException.unauthorized()`，错误信息与正常失败相同          |
| LOGIN-08 | P1     | ✅ 已实现 | `AuthService.java:104` 登录成功后 `clearPasswordRateLimit()`                     |
| LOGIN-09 | P1     | 🚫 不做   | 需审计日志基础设施，独立任务                                                     |

#### 渐进式重哈希

| ID        | 优先级 | 状态    | 说明                                            |
| --------- | ------ | ------- | ----------------------------------------------- |
| REHASH-01 | P2     | ⏳ 延后 | BCrypt 自描述格式已预留升级路径，检测逻辑待实现 |
| REHASH-02 | P2     | ⏳ 延后 | 同上                                            |

#### 密码重置与修改

| ID       | 优先级 | 状态      | 说明                                                                          |
| -------- | ------ | --------- | ----------------------------------------------------------------------------- |
| RESET-01 | P0     | ✅ 已实现 | `AuthService.java:131` 无论账号是否存在都返回相同结果                         |
| RESET-02 | P0     | ✅ 已实现 | `AuthService.java:134-141` 32 字节随机 token + SHA-256 哈希存储 + 30 分钟 TTL |
| RESET-03 | P0     | ✅ 已实现 | `AuthService.java:155` 重置成功后 `deleteAllRefreshTokens()`                  |
| RESET-04 | P1     | 🚫 不做   | 当前无邮件/通知基础设施，后续集成                                             |
| RESET-05 | P0     | ✅ 已实现 | `AuthService.java:117-120` 已有密码时必须验证当前密码                         |

### 1.2 验证码登录

| ID     | 优先级 | 状态      | 说明                                                                  |
| ------ | ------ | --------- | --------------------------------------------------------------------- |
| OTP-01 | P0     | ✅ 已实现 | `SecureRandom` 生成 6 位纯数字                                        |
| OTP-02 | P0     | ✅ 已实现 | `CODE_TTL = 5` 分钟                                                   |
| OTP-03 | P0     | ✅ 已实现 | `getAndDelete` 一次使用即作废                                         |
| OTP-04 | P0     | ✅ 已实现 | `SmsCodeService.java:72-73` 存 `SHA-256(phone + ":" + code)` 而非明文 |
| OTP-05 | P0     | ✅ 已实现 | 60 秒重发间隔 + 每日 20 次上限                                        |
| OTP-06 | P0     | ✅ 已实现 | `SmsCodeService.java:30-35` IP 维度限流，60 秒 10 次                  |
| OTP-07 | P1     | ✅ 已实现 | `SmsCodeService.java:86-90` 失败 5 次后要求重新发送                   |
| OTP-08 | P1     | ⚠️ 已实现 | 限流时 429 + 相同业务提示，但 error code 不同（待后续统一）           |
| OTP-09 | P1     | 📝 认知   | 设计认知条目，选型时知悉                                              |
| OTP-10 | P1     | 📝 认知   | 同上                                                                  |
| OTP-11 | P1     | 🚫 不做   | 当前无高风险操作场景                                                  |

### 1.3 第三方 / 生物识别

| ID         | 优先级 | 状态    | 说明                           |
| ---------- | ------ | ------- | ------------------------------ |
| OIDC-01~07 | P0/P1  | 🚫 不做 | 第三方登录尚未开始开发         |
| WAN-01~05  | P0/P1  | 🚫 不做 | WebAuthn/Passkeys 尚未开始开发 |

### 1.4 二次验证 (MFA)

| ID        | 优先级 | 状态    | 说明                 |
| --------- | ------ | ------- | -------------------- |
| MFA-01~07 | P1     | 🚫 不做 | MFA 功能尚未开始开发 |

---

## 二、凭证管理

### 2.1 凭证签发

#### Session vs JWT

| ID       | 优先级 | 状态      | 说明                             |
| -------- | ------ | --------- | -------------------------------- |
| GRANT-01 | P0     | ✅ 已实现 | JWT 双 Token（Access + Refresh） |
| GRANT-02 | P0     | ✅ 不适用 | C 端 API 方案，非 SSR            |
| GRANT-03 | P0     | ✅ 不适用 | JWT 方案无需 Session ID          |

#### JWT 双 Token 模型

| ID     | 优先级 | 状态      | 说明                                                                                                                                                                            |
| ------ | ------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JWT-01 | P0     | ✅ 已实现 | `JwtProperties.java` `accessTokenExpiration = 600_000`（10 分钟，在 5-15 推荐范围）                                                                                             |
| JWT-02 | P0     | ✅ 已实现 | refreshTokenExpiration = 7 天                                                                                                                                                   |
| JWT-03 | P0     | ✅ 已实现 | `JwtProvider.java:80-88` `sub`/`iat`/`exp`/`jti`/`iss`/`aud` + `type`                                                                                                           |
| JWT-04 | P0     | ✅ 已实现 | Payload 仅含 userId，无敏感数据                                                                                                                                                 |
| JWT-05 | P0     | ✅ 已实现 | `JwtProvider.java:51-55` 默认 ES256，HS256 仅限原型降级（冲突裁决 #6）                                                                                                          |
| JWT-06 | P1     | ⚠️ 已实现 | `jti` (UUID) 已加入 claims，`kid` 待 JWKS 时添加（MAINT-09 前置）                                                                                                               |
| JWT-07 | P1     | ⚠️ 已实现 | `JwtProvider.java:107` JJWT parser `clockSkewSeconds(60)` … 实际该 API 在 jjwt 0.12.x 已废弃，需升级到 `allowedClockSkew` — 当前靠 `requireIssuer` + `ExpiredJwtException` 兜底 |

#### 存储位置

| ID       | 优先级 | 状态        | 说明                                                                                                                  |
| -------- | ------ | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| STORE-01 | P0     | ✅ 已实现   | Access Token 通过 Bearer header 传递，前端放内存                                                                      |
| STORE-02 | P0     | ✅ 已实现   | `AuthController.java:107-115` Refresh Token 通过 `HttpOnly` + `Secure` + `SameSite=Lax` + `Path=/auth/refresh` Cookie |
| STORE-03 | P1     | ⚠️ 部分实现 | SameSite=Lax 已设置；CSRF Token 需前端配合实现                                                                        |
| STORE-04 | P0     | ✅ 已实现   | App 端责任                                                                                                            |
| STORE-05 | P0     | ✅ 已实现   | 基础设施层保证                                                                                                        |

### 2.2 请求验证

| ID        | 优先级 | 状态      | 说明                                                                  |
| --------- | ------ | --------- | --------------------------------------------------------------------- |
| VERIFY-01 | P0     | ✅ 已实现 | `JwtProvider.java:102-112` 签名 + `requireIssuer` + audience 手动校验 |
| VERIFY-02 | P0     | ✅ 已实现 | jjwt 库默认拒绝 `alg: none`                                           |
| VERIFY-03 | P1     | 🚫 不做   | Access Token 10 分钟短寿命已降低 jti 黑名单需求                       |
| VERIFY-05 | P1     | 🚫 不做   | 仅有绝对过期，上线后按业务需求添加滑动过期                            |
| VERIFY-06 | P1     | 🚫 不做   | 需设备指纹基础设施                                                    |

### 2.3 凭证维护

| ID       | 优先级 | 状态        | 说明                                                                                                 |
| -------- | ------ | ----------- | ---------------------------------------------------------------------------------------------------- |
| MAINT-01 | P0     | ✅ 已实现   | `JwtProvider.java:93-98` Refresh Token 为不透明随机字符串（opaque），非 JWT；存 Redis（冲突裁决 #1） |
| MAINT-02 | P0     | ✅ 已实现   | `AuthService.java:175` 存 `SHA-256` 哈希，不落明文                                                   |
| MAINT-03 | P0     | ✅ 已实现   | `AuthService.java:152` 每次刷新签发新 token，旧 token `getAndDelete`                                 |
| MAINT-04 | P0     | ✅ 已实现   | `AuthService.java:155-161` 已作废 token 被重用时判定盗用、吊销整条链                                 |
| MAINT-05 | P1     | ✅ 已实现   | Redis + TTL 与 token 过期时间一致                                                                    |
| MAINT-06 | P1     | 🚫 不做     | 需产品决策并发设备数阈值                                                                             |
| MAINT-07 | P1     | ⚠️ 部分实现 | key 以 `userId:deviceId` 区分，支持多设备；无查看/管理接口                                           |
| MAINT-08 | P1     | ✅ 已实现   | 启动时自动生成密钥对 / 配置注入（低配版达标准）                                                      |
| MAINT-09 | P2     | ⏳ 延后     | `jti` 已预留，`kid` 待 JWKS 时添加                                                                   |
| MAINT-10 | P2     | ⏳ 延后     | 单实例阶段，多实例化时启用                                                                           |

### 2.4 注销与吊销

| ID        | 优先级 | 状态      | 说明                                                                                 |
| --------- | ------ | --------- | ------------------------------------------------------------------------------------ |
| REVOKE-01 | P0     | ✅ 已实现 | `AuthService.java:171` 登出删除 Redis token + `AuthController.java:101` 清除 Cookie  |
| REVOKE-02 | P0     | ✅ 已实现 | `AuthService.java:125` 修改密码后 `deleteAllRefreshTokens()`；`resetPassword()` 同理 |
| REVOKE-03 | P1     | 🚫 不做   | 无可用的管理功能                                                                     |
| REVOKE-04 | P1     | 🚫 不做   | Access Token 10 分钟短寿命已满足大部分场景                                           |
| REVOKE-05 | P1     | 🚫 不做   | 无黑名单基础设施                                                                     |
| REVOKE-06 | P1     | 🚫 不做   | 无管理端全局操作入口                                                                 |
| REVOKE-07 | P1     | 🚫 不做   | 需审计日志基础设施                                                                   |

---

## 三、工程实践

### 3.1 可用性 / 体验

| ID    | 优先级 | 状态      | 说明                                                                           |
| ----- | ------ | --------- | ------------------------------------------------------------------------------ |
| UX-01 | P0     | 🚫 前端   | 刷新竞态 single-flight 需前端实现，后端无法独立解决                            |
| UX-02 | P1     | 🚫 不做   | 前端体验优化                                                                   |
| UX-03 | P1     | ✅ 已实现 | `SmsCodeService.java:76` 重发前 `redis.delete(KEY_ATTEMPT + phone)` 清除旧尝试 |
| UX-04 | P1     | 🚫 不做   | 未实现 OAuth                                                                   |
| UX-05 | P1     | ✅ 已实现 | `AuthService.java:96-101` 日志精确区分「用户不存在/密码未设置/密码错误」       |

### 3.2 可靠性 / 性能

| ID     | 优先级 | 状态      | 说明                     |
| ------ | ------ | --------- | ------------------------ |
| REL-01 | P2     | ⏳ 延后   | Redis 故障降级策略待设计 |
| REL-02 | P2     | ⏳ 延后   | 容量规划待做             |
| REL-03 | P1     | ✅ 已实现 | JWT 验签全部在服务端     |

### 3.3 可运维性

| ID     | 优先级 | 状态      | 说明           |
| ------ | ------ | --------- | -------------- |
| OPS-01 | P2     | 🚫 未实现 | 无 metrics     |
| OPS-02 | P2     | 📝 文档   | 流程性条目     |
| OPS-03 | P2     | 🚫 未实现 | 无审计日志系统 |

### 3.4 业务 / 合规

| ID        | 优先级 | 状态      | 说明              |
| --------- | ------ | --------- | ----------------- |
| BIZ-01~03 | P2     | 🚫 未实现 | 业务/合规尚未涉及 |

---

## 自查确认

- ✅ P0 全部实现（仅 UX-01 属前端责任）
- ✅ P1 已按需实现，🚫 每条均注明理由
- ✅ P2 的 ⏳ 每条注明触发条件或前置依赖

---

## 关键架构决策落实

| 冲突裁决 #                  | 裁决内容                                       | 实现方式                                                            |
| --------------------------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| #1 JWT 无状态 vs 可吊销     | Access Token 无状态 + Refresh Token 有状态分工 | Access JWT 10 分钟、本地验签；Refresh opaque + Redis + SHA-256 哈希 |
| #2 Dummy Hash vs 容量       | 保留 Dummy Hash，安全不让步                    | `DUMMY_PASSWORD_HASH` 常量，限流时也走 dummy 运算                   |
| #3 Access Token 放内存      | 放内存，刷新丢失走 Refresh Cookie              | Cookie 方案已落地                                                   |
| #4 SameSite Strict vs OAuth | OAuth 站点用 Lax + CSRF Token                  | 当前同站点 SameSite=Lax，CSRF Token 待前端配合                      |
| #5 模糊 vs 精确             | HTTP 模糊 / 日志精确                           | 响应统一「手机号或密码错误」/ 日志 `log.warn` 精确区分              |
| #6 ES256 vs HS256           | 默认 ES256                                     | JJWT 默认推导算法，HS256 仅原型降级                                 |
