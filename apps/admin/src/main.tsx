import { mountSpa } from "@shop/app-kit"

import { router } from "./router"
import { adminMessages } from "./locales"
import { localeScope } from "./shared/lib/locale-scope"

// oxlint-disable-next-line import/no-unassigned-import -- Vite 入口样式副作用导入
import "./styles.css"

// 入口本体（StrictMode / QueryClient / 重置边界）在 @shop/app-kit 的 mountSpa，与 seller 同源
mountSpa(router, { resources: adminMessages, scope: localeScope })
