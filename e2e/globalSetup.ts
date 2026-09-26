import {
    createApprovedShop,
    createBuyerAddress,
    createPaidOrder,
    createPublishedProduct,
    createShipAddress,
    register,
    setPassword,
} from "./fixtures/api"
import { FIXTURE_CATEGORY_ID } from "./fixtures/env"
import { writeManifest, type RunManifest } from "./fixtures/run"

/**
 * 每轮 E2E 的造数：只走公开 HTTP 接口，跑在第一个测试之前。
 *
 * 产出全部带本轮 runId（店名/商品名/地址/运单号），手机号与订单号每轮新起，
 * 所以测试既不需要演示库残留，也不会和上一轮的自己打架。失败时这份清单连同
 * trace/video 一起进 CI 产物，够人工照着接口重放。
 */
export default async function globalSetup(): Promise<void> {
    const runId = newRunId()
    const password = `E2e${runId}pw`
    const sellerPhone = newPhone()
    const buyerPhone = newPhone()

    const sellerToken = await register(sellerPhone, `E2E卖家${runId}`)
    await setPassword(sellerToken, password)

    const shopName = `E2E店${runId}`
    const shopId = await createApprovedShop(sellerToken, shopName)
    await createShipAddress(sellerToken, shopId, `E2E路${runId}号`)
    const product = await createPublishedProduct(
        sellerToken,
        shopId,
        FIXTURE_CATEGORY_ID,
        `E2E测试机${runId}`,
    )

    const buyerToken = await register(buyerPhone, `E2E买家${runId}`)
    await setPassword(buyerToken, password)
    const addressId = await createBuyerAddress(buyerToken, `E2E小区${runId}栋`)
    const order = await createPaidOrder(buyerToken, addressId, product.skuId)

    const manifest: RunManifest = {
        runId,
        seller: { phone: sellerPhone, password, shopId, shopName },
        buyer: { phone: buyerPhone, password, addressId },
        product,
        order,
        trackingNo: `E2E${runId}`,
        createdAt: new Date().toISOString(),
    }
    await writeManifest(manifest)
    console.log(
        `[e2e] fixture run=${runId} shop=${shopId} order=${order.orderNo} product=${product.productId}`,
    )
}

/** 6 位轮次标识：时间戳 base36 + 随机尾巴，够短能塞进各种名称字段，够长不会天天撞 */
function newRunId(): string {
    const stamp = Date.now().toString(36).slice(-5).toUpperCase()
    const salt = Math.random().toString(36).slice(2, 4).toUpperCase()
    return `${stamp}${salt}`
}

/**
 * 本轮专属手机号：139 段 + 8 位随机（避开演示库的 1380000xxxx 号段）。
 * 9000 万空间下同一环境两轮相撞可忽略；真撞了会登进别人的号，而 createApprovedShop
 * 会因为「新店不在审核队列」当场失败，不会静默串到别人的数据上。
 */
function newPhone(): string {
    const base = process.env.E2E_PHONE_BASE
        ? Number(process.env.E2E_PHONE_BASE)
        : 10_000_000 + Math.floor(Math.random() * 80_000_000)
    return `139${base}`
}
