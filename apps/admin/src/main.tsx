import { mountSpa } from "@shop/app-kit/shell"
import { createMonitor } from "@shop/monitoring"
import { router } from "./router"
import { appI18n } from "./shared/lib/i18n"

// oxlint-disable-next-line import/no-unassigned-import -- Vite 入口样式副作用导入
import "./styles.css"

// createMonitor 必须早于 mountSpa：要接得住「挂载就崩」那一类
createMonitor({
    app: "admin",
    version: import.meta.env.VITE_APP_VERSION ?? "dev",
    env: import.meta.env.VITE_APP_ENV ?? "dev",
    endpoint: import.meta.env.VITE_RUM_ENDPOINT,
})

mountSpa(router, { i18n: appI18n })
