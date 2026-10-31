/** E2E 运行参数：全部来自环境变量，本地默认值与 AGENTS.md 的端口表一致；唯一真相是这里，测试文件不再各自散落 localhost 端口。 */

import { loadDevEnv } from "../../scripts/dotenv.mjs"

/** dev 口令与数据面偏好的唯一来源是 `apps/server/.env`（Spring 读同一份）。接过来是为与 scripts/seed-demo.mjs 同口径：数据面在云上时只认 process.env 会拿默认 `shop_dev` 连远端库、DB 反查必挂。接法收在 dotenv.mjs，不抄第二份。 */
loadDevEnv()

/** 后端（Spring Boot）：无 `/api` 前缀，只有公开读接口自身路径以 /api 开头 */
export const API_URL = process.env.E2E_API_URL ?? "http://localhost:8080"
export const WEB_URL = process.env.E2E_WEB_URL ?? "http://localhost:3000"
/** 卖家工作台未起时留空：卖家侧用例据此跳过，而不是把整轮 E2E 判死 */
export const SELLER_URL = process.env.E2E_SELLER_URL

/** 开发环境固定短信验证码（DevSmsChannel）；配了真实通道就不是这个值 */
export const DEV_SMS_CODE = process.env.E2E_DEV_SMS_CODE ?? "666666"
/** 开发环境固定图形验证码（DevCaptchaChannel，shop.auth.captcha-channel=dev 才装配） */
export const DEV_CAPTCHA_CODE = process.env.E2E_DEV_CAPTCHA_CODE ?? "DEV4"

/** 平台员工账号：由 LocalStaffSeed 启动时创建（要 SHOP_SEED_PASSWORD，CI 起后端时注入），故可默认 */
export const ADMIN_LOGIN_NAME = process.env.E2E_ADMIN_LOGIN_NAME ?? "admin"
/** 与后端同源：种子口令在 apps/server/.env 的 SHOP_SEED_PASSWORD，本地不另配一份 */
export const ADMIN_PASSWORD =
    process.env.E2E_ADMIN_PASSWORD ?? process.env.SHOP_SEED_PASSWORD ?? "admin123"

/** 数据面连接（仅用于类目授权直写，见 db.ts）：与 scripts/seed-demo.mjs 同一组变量名 */
export const DB = {
    host: process.env.SHOP_DB_HOST ?? "localhost",
    port: Number(process.env.SHOP_DB_PORT ?? 15432),
    user: process.env.SHOP_DB_USER ?? "shop",
    name: process.env.SHOP_DB_NAME ?? "shop",
    // 默认与 compose.dev.yml 的 POSTGRES_PASSWORD 一致；CI 由 job env 覆盖
    password: process.env.SHOP_DB_PASSWORD ?? "shop",
    distro: process.env.SHOP_WSL_DISTRO ?? "Ubuntu",
}

/** 造数用的商品挂靠类目：每轮 globalSetup 现建（迁移种子没有类目数据），不再指向固定 id */

/** globalSetup 写出的本轮清单，测试与 CI 诊断产物都读它 */
export const MANIFEST_PATH = process.env.E2E_FIXTURE_MANIFEST ?? "e2e/.fixture/run.json"
