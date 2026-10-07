import { lighthousePath } from "./runtime.mjs"
import { getScenario, pageIsReady } from "./scenarios.mjs"
const { Audit } = await import(lighthousePath("core/audits/audit.js"))
const { NetworkRecords } = await import(lighthousePath("core/computed/network-records.js"))

export default class ShopPageAudit extends Audit {
    static get meta() {
        return {
            id: "shop-page-ready",
            title: "Expected application page is ready",
            failureTitle: "Application page is not ready",
            description:
                "Requires the intended page, visible content and a successful business API response; login/error/skeleton pages are invalid measurements.",
            requiredArtifacts: ["ShopPage", "DevtoolsLog", "URL"],
        }
    }
    static async audit(artifacts, context) {
        const app = getScenario()
        const page = app.pages.find(
            (item) => item.path === new URL(artifacts.URL.requestedUrl).pathname,
        )
        const records = await NetworkRecords.request(artifacts.DevtoolsLog, context)
        return {
            score: page && pageIsReady(page, artifacts.ShopPage, records, app.origin) ? 1 : 0,
            displayValue:
                "path=" +
                artifacts.ShopPage.path +
                ", visible=" +
                artifacts.ShopPage.visible +
                ", content=" +
                artifacts.ShopPage.hasText +
                ", loading=" +
                artifacts.ShopPage.loading,
        }
    }
}
