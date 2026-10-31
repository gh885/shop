import {
    approveMerchant,
    createBuyerAddress,
    createFixtureCategory,
    createPaidOrder,
    createPublishedProduct,
    createFreeShippingTemplate,
    loginAdmin,
    registerBuyer,
    registerSeller,
    sellerMe,
} from "./fixtures/api"
import { grantCategory } from "./fixtures/db"
import { writeManifest, type RunManifest } from "./fixtures/run"

/**
 * 每轮 E2E 的造数：只走公开 HTTP 接口，跑在第一个测试之前。
 * 类目也现建（迁移种子没有类目数据）；产出全部带本轮 runId（登录名/店名/商品名/地址/运单号），
 * 手机号与订单号每轮新起——测试既不需演示库残留、也不会和上一轮的自己打架。
 * 失败时这份清单连同 trace/video 进 CI 产物，够人工照着接口重放。
 */
export default async function globalSetup(): Promise<void> {
    const runId = newRunId()
    const password = `E2e${runId}pw`
    const sellerLoginName = `e2e-seller-${runId}`
    const buyerPhone = newPhone()

    const sellerToken = await registerSeller(sellerLoginName, password, `E2E商家${runId}`)
    const me = await sellerMe(sellerToken)
    await approveMerchant(`E2E商家${runId}`)

    // 类目要管理员令牌；admin 由 LocalStaffSeed 用 SHOP_SEED_PASSWORD 建（CI 起后端时注入）
    const adminToken = await loginAdmin()
    const categoryId = await createFixtureCategory(adminToken, runId)
    grantCategory(me.merchantId, categoryId)

    const product = await createPublishedProduct(
        sellerToken,
        me.shopId,
        categoryId,
        `E2E测试机${runId}`,
    )

    void createFreeShippingTemplate(sellerToken, me.shopId, runId)

    const buyerToken = await registerBuyer(buyerPhone, password, `E2E买家${runId}`)
    const addressId = await createBuyerAddress(buyerToken, `E2E小区${runId}栋`)
    const order = await createPaidOrder(
        sellerToken,
        buyerToken,
        addressId,
        product.listingId,
        product.skuId,
    )

    const manifest: RunManifest = {
        runId,
        seller: {
            loginName: sellerLoginName,
            password,
            merchantId: me.merchantId,
            shopId: me.shopId,
            shopName: me.shopName,
        },
        buyer: { phone: buyerPhone, password, addressId },
        product: {
            productId: product.productId,
            skuId: product.skuId,
            name: product.name,
            skuName: product.skuName,
            price: product.price,
            attributes: product.attributes,
        },
        order,
        trackingNo: `E2E${runId}`,
        createdAt: new Date().toISOString(),
    }
    await writeManifest(manifest)
    console.log(
        `[e2e] fixture run=${runId} shop=${me.shopId} order=${order.orderNo} product=${product.productId}`,
    )
}

/** 6 位轮次标识：时间戳 base36 + 随机尾巴，够短能塞进各种名称字段，够长不会天天撞 */
function newRunId(): string {
    const stamp = Date.now().toString(36).slice(-5).toUpperCase()
    const salt = Math.random().toString(36).slice(2, 4).toUpperCase()
    return `${stamp}${salt}`
}

/** 本轮专属买家手机号：139 段 + 8 位随机（避开演示库的 1380000xxxx 号段）。9000 万空间下两轮相撞可忽略；真撞了注册会撞唯一索引当场失败，不会静默登进别人的号。 */
function newPhone(): string {
    const base = process.env.E2E_PHONE_BASE
        ? Number(process.env.E2E_PHONE_BASE)
        : 10_000_000 + Math.floor(Math.random() * 80_000_000)
    return `139${base}`
}
