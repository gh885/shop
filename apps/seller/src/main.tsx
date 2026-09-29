import { mountSpa } from "@shop/app-kit"
import { startSpaMonitoring } from "@shop/common"

import { router } from "./router"
import { sellerMessages } from "./locales"
import { localeScope } from "./shared/lib/locale-scope"

// oxlint-disable-next-line import/no-unassigned-import -- Vite 入口样式副作用导入
import "./styles.css"

// 监控：启全局监听 + 白屏检测。放在 mountSpa 之前——「挂载就崩」那一类必须接得住。
// PV 在 mountSpa 里上报（spa-entry.tsx，与 admin / web 同一份接线）；渲染错误由
// router.tsx 的 defaultOnCatch 接。version/env 构建期注入，与后端信封同名（GEN-48）；
// 接收端上线前保持默认关。
startSpaMonitoring("seller", {
    version: import.meta.env.VITE_APP_VERSION ?? "dev",
    env: import.meta.env.VITE_APP_ENV ?? "dev",
    endpoint: import.meta.env.VITE_RUM_ENDPOINT,
})

// 入口本体（StrictMode / QueryClient / 重置边界）在 @shop/app-kit 的 mountSpa，与 admin 同源
mountSpa(router, { resources: sellerMessages, scope: localeScope })
