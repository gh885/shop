# Error Codes

只有前端**无法仅通过 HTTP status 区分**时才定义 code，否则省略 code，让 `detail` 承载用户提示。

| Code                   | HTTP | 前端行为                                         | 后端触发场景                                      |
| ---------------------- | ---- | ------------------------------------------------ | ------------------------------------------------- |
| `SMS_RATE_LIMIT`       | 429  | 显示倒计时（60s 后重试 / 今日已达上限）          | 同一 IP 或手机号频繁请求验证码                    |
| `SMS_DAILY_LIMIT`      | 429  | 提示"今日验证码获取次数已达上限"                 | 同一手机号当日发送量超过日限（20 条）             |
| `SMS_CODE_EXPIRED`     | 400  | 提示"已过期"，自动进入重新获取流程               | 验证码超时（5 分钟）或尝试次数超限                |
| `SMS_CODE_INVALID`     | 400  | 输入框标红，提示"验证码错误"                     | 验证码比对不通过                                  |
| `TOKEN_EXPIRED`        | 401  | 静默调用 refresh 续期；失败则降级为未登录        | JWT access token 超过有效期（10 分钟）            |
| `INVALID_TOKEN`        | 401  | 清除用户状态，跳转登录页                         | 未携带 token / 格式无效 / 类型错误 / 签名校验失败 |
| `REFRESH_TOKEN_REUSED` | 410  | 弹窗提示"账号已在其他设备登录"，清除状态跳登录页 | Refresh token 已被消费过（重放检测）              |
| `USER_DISABLED`        | 403  | 提示"账号已被禁用"，引导联系客服                 | 用户状态非 ACTIVE                                 |
| `STAFF_DISABLED`       | 403  | 提示"账号已被禁用"，引导联系平台管理员           | 平台员工登录时状态非 ACTIVE（StaffService.login） |
| `PASSWORD_NOT_SET`     | 401  | 提示并引导切换验证码登录                         | 密码登录时账号存在但未设置密码                    |

## 设计原则

- **code 不是 HTTP status 的复述**：`RESOURCE_NOT_FOUND` / `FORBIDDEN` 不加，404/403 本身已表达
- **code 不是 debug 信息**：`AUTH_PASSWORD_TOO_SHORT` / `VALIDATION_ERROR` 不加，被前端校验拦截或 `errors` 列表承载
- **code 不预设未来场景**：只在当前有明确区分需求时加
