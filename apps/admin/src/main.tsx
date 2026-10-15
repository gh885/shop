import { mountSpa } from "@shop/app-kit/shell"
import { createMonitor } from "@shop/monitoring"
import { router } from "./router"
import { appI18n } from "./shared/lib/i18n"

// oxlint-disable-next-line import/no-unassigned-import -- Vite 入口样式副作用导入
import "./styles.css"

// 监控：默认装三个采集插件（全局错误 / Web Vitals / 白屏检测），不用逐个列。
// 放在 mountSpa 之前——「挂载就崩」那一类必须接得住。PV 在 mountSpa 里上报
// （spa-entry.tsx，与 seller / web 同一份接线）；渲染错误由 router.tsx 的 defaultOnCatch 接。
// version/env 构建期注入，与后端信封同名（GEN-48）。
createMonitor({
    app: "admin",
    version: import.meta.env.VITE_APP_VERSION ?? "dev",
    env: import.meta.env.VITE_APP_ENV ?? "dev",
    endpoint: import.meta.env.VITE_RUM_ENDPOINT,
})

// 入口本体（StrictMode / QueryClient / 重置边界）在 @shop/app-kit 的 mountSpa，与 seller 同源
mountSpa(router, { i18n: appI18n })
