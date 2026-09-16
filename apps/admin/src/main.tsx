import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"

import { createAppQueryClient } from "@shop/app-kit"

import { router } from "./router"

// oxlint-disable-next-line import/no-unassigned-import -- Vite 入口样式副作用导入
import "./styles.css"

// 默认值（staleTime 兜底等）唯一真相源在 @shop/app-kit：三端必须一致，
// 否则「忘写 staleTime 的查询」在这里会 mount 即重拉，在 web 却不会
const queryClient = createAppQueryClient()

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
        </QueryClientProvider>
    </StrictMode>,
)
