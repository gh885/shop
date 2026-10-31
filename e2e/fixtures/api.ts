import { ADMIN_LOGIN_NAME, ADMIN_PASSWORD, API_URL } from "./env"

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

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------- 账号

/**
 * 买家注册即有密码（注册入参自带 password），不存在「短信首登 + 补设密码」两步；
 * 注册成功直接签发会话，不再走图形验证码 + 短信码那套（那是短信登录路径用的）。
 */
export async function registerBuyer(
    phone: string,
    password: string,
    displayName: string,
): Promise<string> {
    const pair = await call("POST", "/api/buyer/register", {
        body: { phone, password, displayName },
    })
    return field(pair, "accessToken", "POST /api/buyer/register")
}

/** 卖家注册：loginName + password。注册一个事务里写 merchant + 主账号 + 默认 shop，入驻申请单进 governance 队列。 */
export async function registerSeller(
    loginName: string,
    password: string,
    name: string,
): Promise<string> {
    const pair = await call("POST", "/api/seller/register", { body: { name, loginName, password } })
    return field(pair, "accessToken", "POST /api/seller/register")
}

/** 卖家身份：merchantId（审核用）与默认 shopId（商品挂靠、发货范围用）。 */
export async function sellerMe(
    token: string,
): Promise<{ merchantId: string; shopId: string; shopName: string }> {
    const me = asRecord(await call("GET", "/api/seller/me", { token }), "GET /api/seller/me")
    return {
        merchantId: field(me, "merchantId", "seller/me"),
        shopId: field(me, "shopId", "seller/me"),
        shopName: field(me, "shopName", "seller/me"),
    }
}

/** admin 令牌：类目造数（/api/admin/**）用；员工账号由 LocalStaffSeed 建。 */
export async function loginAdmin(): Promise<string> {
    const pair = await call("POST", "/api/staff/login", {
        body: { loginName: ADMIN_LOGIN_NAME, password: ADMIN_PASSWORD },
    })
    return field(pair, "accessToken", "POST /api/staff/login")
}

// ---------------------------------------------------------------- 入驻审核

/**
 * 平台审核放行：入驻申请单 applied → active（governance 在其事务里直接回写），canSell 门从此放行。
 * 注册 → 档案入队走跨模块事件（事务提交后消费），这里轮询队列等它出现，而不是假定已就位。
 */
export async function approveMerchant(merchantName: string): Promise<void> {
    const adminToken = await loginAdmin()
    for (let attempt = 0; attempt < 20; attempt++) {
        const queue = asList(
            await call("GET", "/api/admin/governance/sellers?status=applied", {
                token: adminToken,
            }),
            "GET /api/admin/governance/sellers",
        )
        const item = queue.find((row) => row.name === merchantName)
        if (item) {
            await call(
                "POST",
                `/api/admin/governance/sellers/${field(item, "merchantId", "governance queue item")}/approve`,
                { token: adminToken },
            )
            return
        }
        await sleep(500)
    }
    throw new Error(`商家 ${merchantName} 十秒内没出现在入驻审核队列里`)
}

// ---------------------------------------------------------------- 类目

/**
 * 造一个叶子类目（每轮新建，root → 分组 → 叶子；种子迁移里没有类目数据）。
 * autoApprove 让商品提报直通上架——E2E 不必再走 admin listing 审核；
 * 一个可选的销售规格属性给商品页的规格选择留数据，required=false 让参数不用填。
 */
export async function createFixtureCategory(adminToken: string, runId: string): Promise<string> {
    const root = await call("POST", "/api/admin/categories", {
        token: adminToken,
        body: { code: `e2e-root-${runId}`, name: `E2E根类目${runId}` },
    })
    const mid = await call("POST", "/api/admin/categories", {
        token: adminToken,
        body: {
            parentId: field(root, "categoryId", "POST /api/admin/categories root"),
            code: `e2e-mid-${runId}`,
            name: `E2E分组${runId}`,
        },
    })
    const leaf = await call("POST", "/api/admin/categories", {
        token: adminToken,
        body: {
            parentId: field(mid, "categoryId", "POST /api/admin/categories mid"),
            code: `e2e-leaf-${runId}`,
            name: `E2E叶子类目${runId}`,
            config: {
                identityKeys: ["none"],
                skuIdentityKinds: ["none"],
                matchStrategies: [],
                brandPolicy: "optional",
                autoApprove: true,
                attributes: [
                    {
                        code: "color",
                        name: "颜色",
                        valueType: "enum",
                        options: ["黑色", "白色"],
                        salesSpec: true,
                        required: false,
                    },
                ],
            },
        },
    })
    // 叶子建出来是 DRAFT，必须显式 activate 才能挂商品（分组建好即用，叶子要先配齐再启用）
    await call("PUT", `/api/admin/categories/${field(leaf, "categoryId", "leaf")}/status`, {
        token: adminToken,
        body: { status: "active" },
    })
    return field(leaf, "categoryId", "POST /api/admin/categories leaf")
}

// ---------------------------------------------------------------- 商品

export interface ProductFixture {
    productId: string
    /** 提报产生的挂店记录：下单行要带着它，服务端按它定「这家店的这个商品」 */
    listingId: string
    name: string
    skuId: string
    skuName: string
    price: number
    /** 买家详情页规格按钮要的属性对（类目配置给的） */
    attributes: { name: string; value: string }[]
}

/**
 * 造一个「可售」商品：草稿（SKU 价格内联在创建请求里）→ 提报挂店（免审类目直通 ONLINE）。
 * 规格值从类目配置反查第一个销售规格，不硬编码属性 id；价格与库存都在创建时一次给足。
 */
export async function createPublishedProduct(
    sellerToken: string,
    shopId: string,
    categoryId: string,
    name: string,
): Promise<ProductFixture> {
    const config = asRecord(
        await call("GET", `/api/seller/categories/${categoryId}/config`, { token: sellerToken }),
        "GET /api/seller/categories/{id}/config",
    )
    const specAttr = asList(config.attributes, "config.attributes")
        .map((attr) => asRecord(attr, "attribute"))
        .find((attr) => attr.salesSpec === true)
    if (!specAttr) throw new Error(`类目 ${categoryId} 没有销售规格属性`)
    const specValue = asList(specAttr.values, "attribute.values")[0]
    const specText = field(specValue, "value", "spec value")

    const created = await call("POST", "/api/seller/products", {
        token: sellerToken,
        body: {
            title: name,
            categoryId,
            skus: [
                {
                    specs: { [field(specAttr, "id", "attribute")]: specText },
                    price: { amount: 19900, currency: "CNY" },
                },
            ],
        },
    })
    const productId = field(created, "spuId", "POST /api/seller/products")

    const detail = asRecord(
        await call("GET", `/api/seller/products/${productId}`, { token: sellerToken }),
        "GET /api/seller/products/{id}",
    )
    const skus = asList(detail.skus ?? [], "product.skus")
    if (skus.length === 0) throw new Error(`商品 ${productId} 创建后没有 SKU`)
    const sku = skus[0]

    // 库存独立于创建请求：SKU 建出来是 0，调完才有得卖
    await call("PUT", `/api/seller/products/${productId}/stock`, {
        token: sellerToken,
        body: {
            requestId: crypto.randomUUID(),
            lines: skus.map((line) => ({ skuId: field(line, "skuId", "sku"), onHand: 50 })),
        },
    })

    const listing = await call("POST", `/api/seller/products/${productId}/listings`, {
        token: sellerToken,
        body: { shopId },
    })
    const listingId = field(listing, "listingId", "listing")
    if (field(listing, "status", "listing") !== "ONLINE") {
        throw new Error(`商品 ${productId} 提报后不是 ONLINE：${JSON.stringify(listing)}`)
    }

    return {
        productId,
        listingId: listingId,
        name,
        skuId: field(sku, "skuId", "sku"),
        skuName: typeof sku?.name === "string" ? sku.name : "",
        price: 19900,
        attributes: [{ name: field(specAttr, "name", "attribute"), value: specText }],
    }
}

// ---------------------------------------------------------------- 运费模板

/**
 * 店铺没有启用的运费模板时报价直接 409（SHIPPING_TEMPLATE_MISSING），结算页出不来。
 * 默认项（areaCodes: []）兜住全部地区，运费 0——E2E 不关心运费数字，只关心能算下去。
 */
export async function createFreeShippingTemplate(
    sellerToken: string,
    shopId: string,
    runId: string,
): Promise<void> {
    const created = await call("POST", "/api/seller/shipping-templates", {
        token: sellerToken,
        body: {
            shopId,
            name: `E2E运费模板${runId}`,
            chargeBy: "weight",
            freeOver: 0,
            regions: [{ areaCodes: [], first: 1, firstFee: 0, additional: 1, additionalFee: 0 }],
        },
    })
    await call(
        "POST",
        `/api/seller/shipping-templates/${field(created, "id", "template")}/activate`,
        {
            token: sellerToken,
        },
    )
}

// ---------------------------------------------------------------- 买家与下单

export async function createBuyerAddress(buyerToken: string, detail: string): Promise<string> {
    const created = await call("POST", "/api/buyer/addresses", {
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
    return field(created, "id", "POST /api/buyer/addresses")
}

/**
 * 下单并支付到 PAID：卖家「待发货」列表就是这么来的（MOCK 渠道 confirm 直接置成功）。
 *
 * 新契约是 quote 驱动：先询价拿 quoteId（金额以服务端为准），再按 quoteId 下单。
 * 一次结算产出一张主订单（orderGroup），子订单挂在它下面；付款按主订单一次付清。
 */
export async function createPaidOrder(
    sellerToken: string,
    buyerToken: string,
    addressId: string,
    listingId: string,
    skuId: string,
    quantity = 1,
): Promise<{ orderId: string; orderNo: string }> {
    const lines = [{ lineNo: 1, skuId, listingId, quantity }]
    // 报价必须带地址：落单复价按地址簿区划码重算并与报价单对指纹，不含地址的报价必被 PRICE_CHANGED 打回
    const quote = asRecord(
        await call("POST", "/api/buyer/quotes", {
            token: buyerToken,
            body: {
                address: { provinceCode: "31", cityCode: "3101", districtCode: "310115" },
                lines,
            },
        }),
        "POST /api/buyer/quotes",
    )
    const placed = asRecord(
        await call("POST", "/api/buyer/orders", {
            token: buyerToken,
            body: {
                quoteId: field(quote, "quoteId", "quote"),
                addressId,
                lines,
                idempotencyKey: crypto.randomUUID(),
            },
        }),
        "POST /api/buyer/orders",
    )
    const orderGroupId = field(placed, "orderGroupId", "placed order")
    const sellerOrderIds = placed.sellerOrderIds
    const sellerOrderId =
        Array.isArray(sellerOrderIds) && typeof sellerOrderIds[0] === "string"
            ? sellerOrderIds[0]
            : undefined
    if (!sellerOrderId) throw new Error("下单响应没有 sellerOrderIds")

    const pay = asRecord(
        await call("POST", `/api/buyer/orders/${orderGroupId}/pay`, { token: buyerToken }),
        "POST /api/buyer/orders/{id}/pay",
    )
    await call("POST", `/api/buyer/payments/${field(pay, "paymentId", "payment")}/confirm`, {
        token: buyerToken,
    })

    // 卖家列表按子单号展示与发货，买家侧按主订单 id 导航——两个号都从服务端拿，不自己拼
    const sellerOrder = asRecord(
        await call("GET", `/api/seller/orders/${sellerOrderId}`, { token: sellerToken }),
        "GET /api/seller/orders/{id}",
    )
    return { orderId: orderGroupId, orderNo: field(sellerOrder, "orderNo", "seller order") }
}

// ---------------------------------------------------------------- 物流

export interface TrackingNodeInput {
    trackingNo: string
    /** 平台标准码（collected/in_transit/out_for_delivery/delivered/...），驱动包裹状态机 */
    standardCode: string
    note: string
    occurredAt: string
}

/**
 * 补录轨迹节点走平台 admin API：这条入口在管理端还没有 UI（apps/admin 未接），产品里另一个
 * 写入方是承运商推送端点，它要验签、E2E 造不出签名。按运单号定位，不再需要先反查包裹 id。
 */
export async function recordTrackingNode(input: TrackingNodeInput): Promise<void> {
    await call("POST", "/api/admin/logistics/traces", {
        token: await loginAdmin(),
        body: {
            carrierCode: "sf",
            trackingNo: input.trackingNo,
            standardCode: input.standardCode,
            note: input.note,
            occurredAt: input.occurredAt,
        },
    })
}
