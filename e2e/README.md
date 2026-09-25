# E2E

真实浏览器路径覆盖，连接运行中的 web 与 Spring Boot，不在测试进程内 mock API。

## 本地运行

```bash
pnpm db:up
pnpm seed:demo
pnpm dev:server
pnpm dev:web
pnpm test:e2e
```

首次运行需要安装浏览器：

```bash
pnpm exec playwright install chromium
```

可用环境变量：

- `E2E_WEB_URL`：web 地址，默认 `http://localhost:3000`
- `E2E_API_URL`：后端地址，默认 `http://localhost:8080`
- `E2E_BUYER_PHONE`：有地址且可下单的演示买家，默认 `13800001001`
- `E2E_BUYER_PASSWORD`：演示买家密码，默认 `shop123456`

认证 setup 通过真实登录弹窗取得 httpOnly refresh cookie 并缓存到 `e2e/playwright/.auth/buyer.json`；业务用例的新浏览器上下文会走应用现有 `bootstrapAuth()` 静默刷新，验证真实会话恢复。
