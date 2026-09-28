import { ADMIN_EMPLOYEE_NO, ADMIN_PASSWORD, API_URL, DEV_CAPTCHA_CODE, DEV_SMS_CODE } from "./env"

/** 造数调用的失败：带上状态码与响应体片段，直接进 trace 与 CI 日志 */
export class ApiError extends Error {
    readonly status: number
    readonly detail: string

    constructor(status: number, detail: string, message: string) {
        super(message)
        this.status = status
        this.detail = detail
        this.name = "ApiError"
    }
}

export interface CallOptions {
    token?: string
    /** 卖家上下文的 X-Shop-Id：所有 /seller/** 调用必带 */
    shopId?: string
    body?: unknown
}

/** 只回未知形状：每处取值都过 asRecord/field 断形，不在这里偷偷盖上调用方想要的类型 */
export async function call(
    method: string,
    path: string,
    options: CallOptions = {},
): Promise<unknown> {
    const headers: Record<string, string> = {}
    if (options.token) headers.authorization = `Bearer ${options.token}`
    if (options.shopId) headers["x-shop-id"] = options.shopId
    if (options.body !== undefined) headers["content-type"] = "application/json"

    const response = await fetch(API_URL + path, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
    const text = await response.text()
    if (!response.ok) {
        throw new ApiError(
            response.status,
            text.slice(0, 500),
            `${method} ${path} → ${response.status} ${text.slice(0, 300)}`,
        )
    }
    return json(text)
}

/** 空响应体（201 无正文的写接口）读回来就是 undefined，调用方不取它的返回值 */
function json(text: string): unknown {
    return text ? (JSON.parse(text) as unknown) : undefined
}

/** 响应里读一个字段：断形并在错误信息里说清是哪一步、缺什么，比让 undefined 顺着往下传好查 */
export function field(value: unknown, key: string, where: string): string {
    const holder = asRecord(value, where)
    const got = holder[key]
    if (typeof got !== "string" || got.length === 0) {
        throw new Error(`${where} 的 ${key} 不是非空字符串：${JSON.stringify(got)}`)
    }
    return got
}

export function asRecord(value: unknown, where: string): Record<string, unknown> {
    if (!isRecord(value)) {
        throw new Error(`${where} 的响应不是对象：${JSON.stringify(value)}`)
    }
    return value
}

export function asList(value: unknown, where: string): Record<string, unknown>[] {
    if (!Array.isArray(value)) throw new Error(`${where} 的响应不是数组：${JSON.stringify(value)}`)
    return value.map((item) => asRecord(item, `${where}[]`))
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

// ---------------------------------------------------------------- 账号

/**
 * 注册 = 首次短信登录（无独立注册端点）。发码前必须过图形验证码，dev 通道下固定码直通，
 * 所以每轮 E2E 都能用自己的手机号，不碰演示库的固定账号（ACC-35）。
 */
export async function register(phone: string, nickname?: string): Promise<string> {
    const captcha = await call("GET", "/auth/captcha")
    await call("POST", "/auth/sms-code", {
        body: {
            phone,
            captchaId: field(captcha, "captchaId", "GET /auth/captcha"),
            captchaCode: DEV_CAPTCHA_CODE,
        },
    })
    const pair = await call("POST", "/auth/login/sms", {
        body: { phone, code: DEV_SMS_CODE, deviceId: "e2e" },
    })
    const token = field(pair, "accessToken", "POST /auth/login/sms")
    if (nickname) await call("PUT", "/auth/profile", { token, body: { nickname } })
    return token
}

/**
 * 给刚注册的账号设登录密码（无旧密码即首设）。
 * 浏览器侧因此走密码登录：造数时那个手机号刚发过一次码，紧接着再点「获取验证码」会撞 60s 重发窗。
 */
export async function setPassword(token: string, newPassword: string): Promise<void> {
    await call("POST", "/auth/password", { token, body: { newPassword } })
}

// ---------------------------------------------------------------- 店铺

/** 平台审核放行：店铺 PENDING_REVIEW → ACTIVE，卖家上下文才可用。员工账号来自迁移种子 */
export async function createApprovedShop(sellerToken: string, name: string): Promise<string> {
    const shop = await call("POST", "/shops", { token: sellerToken, body: { name } })
    const shopId = field(shop, "id", "POST /shops")
    const adminToken = await loginAsAdmin()
    const page = asRecord(
        await call("GET", "/admin/reviews?pageNum=1&pageSize=200", { token: adminToken }),
        "GET /admin/reviews",
    )
    const review = asList(page.records, "reviews.records").find((row) => row.shopId === shopId)
    if (!review) throw new Error(`店铺 ${shopId} 没出现在入驻审核队列里`)
    await call("POST", `/admin/reviews/${field(review, "id", "review")}/approve`, {
        token: adminToken,
    })
    return shopId
}

async function loginAsAdmin(): Promise<string> {
    const pair = await call("POST", "/admin/auth/login", {
        body: { employeeNo: ADMIN_EMPLOYEE_NO, password: ADMIN_PASSWORD, deviceId: "e2e" },
    })
    return field(pair, "accessToken", "POST /admin/auth/login")
}

/** 发货地址：卖家发货台取默认发货地址，缺了发货弹窗提交不了 */
export async function createShipAddress(
    sellerToken: string,
    shopId: string,
    detail: string,
): Promise<void> {
    await call("POST", "/seller/addresses", {
        token: sellerToken,
        shopId,
        body: {
            contactName: "E2E发货人",
            phone: "13800000000",
            regionCode: "310115",
            province: "上海市",
            city: "上海市",
            district: "浦东新区",
            detail,
            defaultShip: true,
        },
    })
}

// ---------------------------------------------------------------- 商品

export interface ProductFixture {
    productId: string
    /** SPU 名（商品列表与详情页的标题） */
    name: string
    skuId: string
    skuName: string
    price: number
    /** 买家详情页 `?spec=` 要的属性对（类目模板给的「颜色分类/存储容量」这类） */
    attributes: { name: string; value: string }[]
}

/**
 * 造一个「可售」商品：草稿 → 按类目模板写规格（后端据此生成 SKU 笛卡尔积）→ 补价格库存 → 上架。
 * 规格值与必填参数都从 attr-template 反查取第一个，不硬编码平台属性 id。
 */
export async function createPublishedProduct(
    sellerToken: string,
    shopId: string,
    categoryId: string,
    name: string,
): Promise<ProductFixture> {
    const template = asList(
        await call("GET", `/api/categories/${categoryId}/attr-template`),
        "attr-template",
    )
    const specNodes = template.filter((node) => asRecord(node.attr, "attr").kind === "SPEC")
    const requiredParamNodes = template.filter(
        (node) =>
            asRecord(node.attr, "attr").kind === "PARAM" &&
            asRecord(node.attr, "attr").required === true,
    )

    const created = await call("POST", "/seller/products", {
        token: sellerToken,
        shopId,
        body: {
            categoryId,
            name,
            params: requiredParamNodes.map((node) => {
                const attr = asRecord(node.attr, "attr")
                const value = asList(node.values, "attr.values")[0]
                return {
                    attrId: field(attr, "id", "attr"),
                    name: field(attr, "name", "attr"),
                    value: field(value, "value", "param value"),
                }
            }),
        },
    })
    const productId = field(created, "id", "POST /seller/products")

    await call("PUT", `/seller/products/${productId}/specs`, {
        token: sellerToken,
        shopId,
        body: {
            specs: specNodes.map((node) => ({
                attrId: field(asRecord(node.attr, "attr"), "id", "attr"),
                valueIds: [field(asList(node.values, "attr.values")[0], "id", "spec value")],
            })),
        },
    })

    const detail = asRecord(
        await call("GET", `/seller/products/${productId}`, { token: sellerToken, shopId }),
        "GET /seller/products/{id}",
    )
    const skus = asList(detail.skus ?? [], "product.skus")
    if (skus.length === 0) throw new Error(`商品 ${productId} 写完规格没有生成 SKU`)

    const price = 19900
    await call("PUT", `/seller/products/${productId}/skus`, {
        token: sellerToken,
        shopId,
        body: {
            items: skus.map((sku) => ({
                skuId: field(sku, "id", "sku"),
                price: { amount: price, currency: "CNY" },
                stock: 50,
            })),
        },
    })
    await call("POST", `/seller/products/${productId}/publish`, { token: sellerToken, shopId })

    const sku = skus[0]
    return {
        productId,
        name: field(created, "name", "POST /seller/products"),
        skuId: field(sku, "id", "sku"),
        skuName: typeof sku?.name === "string" ? sku.name : "",
        price,
        attributes: asList(sku?.attributes ?? [], "sku.attributes").map((attr) => ({
            name: field(attr, "name", "sku attr"),
            value: field(attr, "value", "sku attr"),
        })),
    }
}

// ---------------------------------------------------------------- 买家与下单

export async function createBuyerAddress(buyerToken: string, detail: string): Promise<string> {
    const created = await call("POST", "/user/addresses", {
        token: buyerToken,
        body: {
            receiverName: "E2E买家",
            phone: "13800000001",
            regionCode: "310115",
            province: "上海市",
            city: "上海市",
            district: "浦东新区",
            detail,
            isDefault: true,
        },
    })
    return field(created, "id", "POST /user/addresses")
}

/** 下单并支付到 PAID：卖家「待发货」列表就是这么来的（MOCK 渠道 confirm 直接置成功） */
export async function createPaidOrder(
    buyerToken: string,
    addressId: string,
    skuId: string,
    quantity = 1,
): Promise<{ orderId: string; orderNo: string }> {
    const lines = [{ skuId, quantity }]
    await call("POST", "/orders/preview", { token: buyerToken, body: { addressId, lines } })
    const created = asRecord(
        await call("POST", "/orders/create", {
            token: buyerToken,
            body: { checkoutKey: crypto.randomUUID(), addressId, lines },
        }),
        "POST /orders/create",
    )
    const order = asList(created.orders, "created.orders")[0]
    const orderId = field(order, "id", "created order")
    const payment = await call("POST", "/payments", {
        token: buyerToken,
        body: { orderId },
    })
    await call("POST", `/payments/${field(payment, "id", "payment")}/confirm`, {
        token: buyerToken,
    })
    return { orderId, orderNo: field(order, "orderNo", "created order") }
}

// ---------------------------------------------------------------- 物流

export interface TrackingNodeInput {
    shipmentId: string
    nodeCode: string
    description: string
    location: string
    occurredAt: string
}

/**
 * 补录轨迹节点走平台 admin API：这条入口在管理端还没有 UI（apps/admin 未接），
 * 产品里另一个写入方是承运商 webhook，它要验签、E2E 造不出签名。
 */
export async function recordTrackingNode(input: TrackingNodeInput): Promise<void> {
    await call("POST", `/admin/logistics/shipments/${input.shipmentId}/tracking-nodes`, {
        token: await loginAsAdmin(),
        body: {
            nodeCode: input.nodeCode,
            occurredAt: input.occurredAt,
            description: input.description,
            location: input.location,
        },
    })
}
