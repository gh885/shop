import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { App } from "./App"
import "./styles.css"

const container = document.getElementById("root")
if (!container) {
    throw new Error("#root 不存在")
}

// 平台自用：不做重试风暴，失败就在界面上说清楚（自建平台最怕"悄悄重试把日志刷满"）
const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

createRoot(container).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <App />
        </QueryClientProvider>
    </StrictMode>,
)
