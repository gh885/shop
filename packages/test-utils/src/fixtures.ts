import type {
    CategoryAttrNodeResponse,
    CategoryAttrResponse,
    CategoryAttrValueResponse,
    CategoryNode,
    Coupon,
    CouponTemplateResponse,
    MyCouponResponse,
    NavEntryResponse,
    ProductResponse,
    RecommendTabResponse,
    SellerOrderListItemResponse,
    ShippingTemplateFeeTier,
    ShippingTemplateRegionRule,
    ShippingTemplateResponse,
} from "@shop/api/sdk"

/**
 * 契约形状测试夹具：只放「返回类型是 @shop/api/sdk 契约类型、且 ≥2 文件共用默认值」的形状，组件私有局部形状各随其主不收。
 * 默认值取「合法且中性」一档，用例只断言自己关心的字段；id 不统一发（各测试认自己那批 uuid，由调用方 wrapper 传入）。
 * 另开 `@shop/test-utils/fixtures` 子入口：纯逻辑测试只要夹具，从 barrel 进会连带把 msw/RTL/jest-dom 拉进模块图、白付几百毫秒。
 */

/** 一张可用的满 100 减 10 券（`userCouponId` 必须显式给：选券断言按 id 比）。 */
export function makeCoupon(overrides: Partial<Coupon> & Pick<Coupon, "userCouponId">): Coupon {
    return {
        name: "店铺券",
        threshold: { amount: 10000, currency: "CNY" },
        discount: { amount: 1000, currency: "CNY" },
        expireAt: "2026-12-31T23:59:59Z",
        usable: true,
        unavailableReason: null,
        ...overrides,
    }
}

/** 券包里的券（`listMyCoupons` 的响应行）：未使用、领取来源、未关联订单。 */
export function makeMyCouponResponse(overrides: Partial<MyCouponResponse> = {}): MyCouponResponse {
    return {
        id: "00000000-0000-4000-8000-0000000000c1",
        shopId: "00000000-0000-4000-8000-0000000000a1",
        shopName: "测试店",
        name: "满100减10",
        threshold: { amount: 10000, currency: "CNY" },
        type: "FULL_REDUCTION",
        discount: { amount: 1000, currency: "CNY" },
        effectiveAt: "2026-01-01T00:00:00Z",
        expireAt: "2026-01-31T00:00:00Z",
        status: "UNUSED",
        source: "CLAIM",
        orderId: null,
        unavailableReason: null,
        ...overrides,
    }
}

/** 券模板（卖家建券的回执 / 列表行）：默认满 100 减 10、生效中、已发 30 已用 12。 */
export function makeCouponTemplate(
    overrides: Partial<CouponTemplateResponse> = {},
): CouponTemplateResponse {
    return {
        id: "6f1a5b1e-2f3c-4a5d-8e9f-000000000001",
        name: "新春满减券",
        type: "FULL_REDUCTION",
        threshold: { amount: 10000, currency: "CNY" },
        discount: { amount: 1000, currency: "CNY" },
        // 取正午而非零点：展示用的日期本地化后在任何时区都落回同一天
        validFrom: "2026-01-01T12:00:00Z",
        validTo: "2026-02-01T12:00:00Z",
        totalQuantity: 100,
        issuedQuantity: 30,
        usedQuantity: 12,
        status: "ACTIVE",
        createdAt: "2025-12-20T08:00:00Z",
        ...overrides,
    }
}

/** 首页推荐词条：默认「猜你喜欢」= 无目标的站内流。 */
export function makeRecommendTab(
    overrides: Partial<RecommendTabResponse> = {},
): RecommendTabResponse {
    return {
        id: "00000000-0000-4000-8000-0000000000f1",
        name: "猜你喜欢",
        target: null,
        targetType: null,
        isDefault: true,
        sortOrder: 0,
        status: "ENABLED",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        ...overrides,
    }
}

/** 首页导航词条（`GET /home/nav` 与 `GET /admin/nav` 同一契约）：默认「无 icon、无 target、无 subs、sortOrder 0」的中性叶子；有跳转的那档才是用例特意 override 出来的。 */
export function makeNavEntry(overrides: Partial<NavEntryResponse> = {}): NavEntryResponse {
    return {
        id: "00000000-0000-4000-8000-0000000000d1",
        navKey: "home",
        title: "导航词条",
        iconKey: null,
        target: null,
        targetType: null,
        subs: [],
        sortOrder: 0,
        status: "ENABLED",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        ...overrides,
    }
}

/** 商品（详情 / 列表行同一契约）：默认草稿态——无价、无规格、零库存，上架态由各文件 wrapper 覆盖。 */
export function makeProductResponse(overrides: Partial<ProductResponse> = {}): ProductResponse {
    return {
        id: "00000000-0000-4000-8000-0000000000c1",
        shopId: "00000000-0000-4000-8000-0000000000a1",
        categoryId: "00000000-0000-4000-8000-0000000000b1",
        name: "测试商品",
        subtitle: null,
        detailImages: [],
        mainImage: null,
        images: [],
        specs: [],
        params: [],
        minPrice: null,
        maxPrice: null,
        stock: 0,
        soldCount: 0,
        status: "DRAFT",
        sevenDayReturn: true,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        ...overrides,
    }
}

/** 类目规格模板节点（`GET /admin/categories/:id/attrs` 的响应行）：一个维度 + 它的值域。只给 id 与文本，attrId/sort/source 由位置推出（默认 = 平台值、按数组序）。 */
export function makeCategoryAttrNode(
    attr: Partial<CategoryAttrResponse> & Pick<CategoryAttrResponse, "id">,
    values: (Partial<CategoryAttrValueResponse> &
        Pick<CategoryAttrValueResponse, "id" | "value">)[],
): CategoryAttrNodeResponse {
    return {
        attr: {
            categoryId: "00000000-0000-4000-8000-0000000000b1",
            name: "颜色",
            kind: "SPEC",
            required: true,
            allowCustom: true,
            allowImage: false,
            sort: 0,
            status: "ENABLED",
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
            ...attr,
        },
        values: values.map((value, index): CategoryAttrValueResponse => ({
            attrId: attr.id,
            sort: index,
            source: "PLATFORM",
            image: null,
            createdAt: "2026-01-01T00:00:00Z",
            ...value,
        })),
    }
}

/** 类目树节点：默认「一级、启用、无图标、没有子节点」。parentId 全零 uuid = 本仓库「一级类目、上面没有父」的表示，别与 admin 拍平索引时给一级挂的合成 key `CATEGORY_ROOT_ID`（`"__category_root__"`）混用。 */
export function makeCategoryNode(
    overrides: Partial<CategoryNode> & Pick<CategoryNode, "id" | "name">,
): CategoryNode {
    return {
        parentId: "00000000-0000-0000-0000-000000000000",
        level: 1,
        sort: 0,
        status: "ENABLED",
        iconUrl: null,
        children: [],
        ...overrides,
    }
}

/** 卖家订单列表行：默认「已付款、无售后、可发货、实付 199」。收件电话给明文，掩码口径由用例自己覆盖。 */
export function makeSellerOrderListItem(
    overrides: Partial<SellerOrderListItemResponse> & Pick<SellerOrderListItemResponse, "id">,
): SellerOrderListItemResponse {
    return {
        orderNo: "2026092300001",
        status: "PAID",
        afterSaleStatus: "NONE",
        availableActions: ["SHIP"],
        payAmount: { amount: 19900, currency: "CNY" },
        receiverName: "张三",
        receiverPhone: "13800000000",
        itemCount: 1,
        items: [],
        shipExpireAt: null,
        createdAt: "2026-09-23T10:00:00Z",
        ...overrides,
    }
}

/** 一档按件运费：12 元首费 / 5 元续费（分 + 币种，wire 上的 Money 形状） */
export function makeShippingFeeTier(
    overrides: Partial<ShippingTemplateFeeTier> = {},
): ShippingTemplateFeeTier {
    return {
        id: "6f1a5b1e-2f3c-4a5d-8e9f-000000000009",
        firstQuantity: 1,
        firstFee: { amount: 1200, currency: "CNY" },
        addQuantity: 2,
        addFee: { amount: 500, currency: "CNY" },
        ...overrides,
    }
}

/** 一条指定地区规则。响应里它把档位包在 `rule` 下（请求里是平的），这层不对称正是投影测试要钉的 */
export function makeShippingRegionRule(
    overrides: Partial<ShippingTemplateRegionRule> = {},
): ShippingTemplateRegionRule {
    return {
        rule: makeShippingFeeTier(),
        regionPrefixes: ["31", "32"],
        ...overrides,
    }
}

/** 一份可用的运费模板。默认「不开包邮、无地区规则、无不配送」，各档都由 overrides 给 */
export function makeShippingTemplate(
    overrides: Partial<ShippingTemplateResponse> = {},
): ShippingTemplateResponse {
    return {
        id: "6f1a5b1e-2f3c-4a5d-8e9f-000000000001",
        shopId: "6f1a5b1e-2f3c-4a5d-8e9f-000000000002",
        freeShipping: false,
        freeOverQuantity: null,
        freeOverAmount: null,
        defaultRule: makeShippingFeeTier(),
        regionRules: [],
        excludedRegions: [],
        ...overrides,
    }
}
