import { fileURLToPath } from "node:url"
export default {
    extends: "lighthouse:default",
    settings: {
        onlyCategories: ["performance", "shop"],
        locale: "zh-CN",
        disableStorageReset: true,
    },
    artifacts: [
        {
            id: "ShopPage",
            gatherer: fileURLToPath(new URL("./page-gatherer.mjs", import.meta.url)),
        },
    ],
    audits: [fileURLToPath(new URL("./page-audit.mjs", import.meta.url))],
    categories: {
        shop: {
            title: "Page validity",
            description: "A fast login or error page is not a passing measurement.",
            auditRefs: [
                { id: "shop-page-ready", weight: 1 },
                { id: "http-status-code", weight: 1 },
            ],
        },
    },
}
