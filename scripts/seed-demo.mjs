#!/usr/bin/env node
/**
 * 演示数据填充：给「真实浏览器里跑各种情况」补一套可复现、可流转的数据面。
 *
 * 为什么需要它（2026-09 体检出的四处断点，都是查库查实而非推测）：
 *   1. 16 个用户 password_hash 全为 NULL —— 密码登录路径 0% 可用；浏览器自动化只能走短信，
 *      而发码要过图形验证码，Playwright 拿不到稳定登录态。
 *   2. 店铺与商品是错位的：V44 五家旗舰店有 26 SPU 但 owner_id 是占位值（不指向真实用户、无成员），
 *      而有真实 OWNER 成员的六家店商品数为 0 —— 卖家工作台登进去是空目录。
 *   3. 运费模板 0 行 —— 下单运费恒为 0（CheckoutResolver 拿不到报价就回落 Money.zero），
 *      「满额包邮 / 偏远加价 / 不配送地区」这些真实分支在浏览器里演不出来。
 *   4. 入驻审核队列只剩 1 条已 APPROVED 记录 —— admin 端无事可做。
 *
 * 干什么（幂等：只增、不改不删人工数据；跑第二遍等于什么都没发生）：
 *   A. 能登录的演示账号：4 买家（含全空态新号、停用号）+ 5 卖家 + 1 子账号 + 2 员工，密码统一。
 *   B. 打通店铺 ↔ 商品：旗舰店 owner 指向演示卖家并补 OWNER 成员；按 V43 类目规格模板给每家店
 *      扩 6 个形态各异的商品（在售/紧张/售罄/仓库中/草稿未定价/无规格单 SKU）。
 *   C. 卖家基础设施：五种运费口径（整店包邮 / 满额包邮+偏远加价 / 满件包邮+不配送区 / 按件计费 / 故意不配）
 *      + 商家发货退货地址。
 *   D. 买家前置条件：地址簿、收藏、购物车（一满一空）、券包（可用/将过期/未生效/已过期）。
 *   E. 可流转的活单：每店 6 笔「还能动」的单——待付款（券已锁）、待发货、临近超时未发货、在途、
 *      仅退款待处理、退货待确认收货；带支付记录、库存账本、状态日志、运单轨迹、售后时间线。
 *   F. 平台审核队列：3 家 PENDING + 1 家 REJECTED，另给五家旗舰店补 APPROVED 历史。
 *   G. 首页内容：导航条目与推荐词条补上停用/空 subs/不配图标/超长标题/空类目/短流等**合法**分支形状，
 *      并把词条量补到推荐条溢出第二页（V13 那 5 条只演得出「正常长相」一种；V13 的名实不符由 V59 迁移校正）。
 *
 * 跑法（需数据面已起：pnpm db:up）：
 *   pnpm seed:demo                  灌数据
 *   pnpm seed:demo -- --dry-run     只打印 SQL，不落库
 *
 * 红线：
 *   - 只连本地 shop 库 / shop 角色（SQL 里另有一道 current_database 守卫，双保险）。
 *   - 绝不覆盖已有密码（UPDATE ... WHERE password_hash IS NULL），演示手机号被旁人占用则直接放弃写入。
 *   - 本脚本产出的行统一落在 019d0000-0000-4000-8000-% 号段，活单前缀 DEMO-LIVE-：
 *     既不撞 DevOrderDataSeeder 的 DEV% 启动清理，也不撞 seed-buyer-demo.sql 的 DEMO-BF8A- 历史快照。
 *   - 不提供 --reset：删自己造的数据会连带删掉浏览器里已流转过的单，想干净重灌请清库让 Flyway 重来。
 */
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import net from "node:net"

const DISTRO = process.env.SHOP_WSL_DISTRO ?? "Ubuntu"
const DB = {
    host: process.env.SHOP_DB_HOST ?? "localhost",
    port: Number(process.env.SHOP_DB_PORT ?? 15432),
    user: process.env.SHOP_DB_USER ?? "shop",
    name: process.env.SHOP_DB_NAME ?? "shop",
    password: process.env.SHOP_DB_PASSWORD ?? "shop_dev",
}

const PASSWORD = "shop123456"
/**
 * BCrypt(cost 12, $2a$) of PASSWORD。重造：
 *   wsl -d Ubuntu -- python3 -c "import bcrypt;print(bcrypt.hashpw(b'shop123456', bcrypt.gensalt(12, prefix=b'2a')).decode())"
 * Spring 的 BCryptPasswordEncoder 从哈希自带 cost 读取代价因子，与运行时配置无关，故可硬编码。
 */
const PASSWORD_HASH = "$2a$12$ydfuNtxfrpxPToFvHogi7eReSQNfWP2J/T1lquWWX.t3Ahd9.wKdG"

/** 本脚本专属号段：与迁移种子的 01900000-… 区分开，好认也好反查 */
const BLOCK = "019d0000-0000-4000-8000-"
const sid = (...key) =>
    BLOCK +
    createHash("md5")
        .update(`seed:${key.join("/")}`)
        .digest("hex")
        .slice(0, 12)
/** 由 key 定出的整数：同一份代码跑两次必须长出同一批数据，否则幂等无从谈起 */
const pick = (key, n) =>
    Number.parseInt(createHash("md5").update(`seed:pick:${key}`).digest("hex").slice(0, 8), 16) % n

/** 已渲染好的 SQL 片段（时间表达式、jsonb _cast 等），insertRows 原样透传 */
const x = (s) => ({ sql: s })
const lit = (v) => {
    if (v === null || v === undefined) return "NULL"
    if (typeof v === "object" && "sql" in v) return v.sql
    if (typeof v === "number" || typeof v === "boolean") return String(v)
    return `'${String(v).replaceAll("'", "''")}'`
}
const jsonb = (v) => x(lit(JSON.stringify(v)) + "::jsonb")
/** PG 数组字面量要带花括号：直接给出可拼 `::uuid[]` 的字符串 */
const arr = (vs) => lit(`{${vs.join(",")}}`)
const ago = (interval) => x(`now() - interval ${lit(interval)}`)
const ahead = (interval) => x(`now() + interval ${lit(interval)}`)
const now = x("now()")

/** 显式 id + ON CONFLICT (id) DO NOTHING 就是幂等的全部机制 */
function insert(table, cols, rows) {
    if (rows.length === 0) return ""
    const body = rows.map((r) => `    (${r.map(lit).join(", ")})`)
    return `INSERT INTO ${table} (${cols.join(", ")})\nVALUES\n${body.join(",\n")}\nON CONFLICT (id) DO NOTHING;`
}

// 演示账号矩阵

const BUYERS = [
    {
        phone: "13800001001",
        nickname: "林小满",
        tag: "重度买家",
        unlocks: "活单 6 态、地址簿 3 条、购物车 6 件、券包 4 张、收藏一屏",
    },
    {
        phone: "13800001002",
        nickname: "陈默",
        tag: "新买家·全空态",
        unlocks: "0 地址 / 0 车 / 0 单 / 0 收藏，只 1 张券：空态引导 + 首次下单全流程",
    },
    {
        phone: "13800001003",
        nickname: "苏晓",
        tag: "流程买家",
        unlocks: "待付款单 1 笔（券已锁）、西藏地址撞稻香店「不配送地区」",
    },
    {
        phone: "13800001009",
        nickname: "赵强",
        status: "DISABLED",
        tag: "停用账号",
        unlocks: "登录/下单被拒的 403 与错误文案",
    },
]

/** 卖家与 V44 旗舰店一一对应；brand/models 用来生成不像占位符的商品名，shipFrom 是商家发货地址 */
const SELLERS = [
    {
        phone: "13800002001",
        nickname: "沈亦舟",
        shop: "01900000-0000-7000-8000-0000000008d1",
        brand: "星尘",
        models: ["X9 Pro", "Air 5", "Ultra SE", "Lite 2", "Max 12", "Go S3"],
        shipFrom: ["440305", "广东省", "深圳市", "南山区", "科苑南路演示数码仓 1 号库"],
    },
    {
        phone: "13800002002",
        nickname: "许清和",
        shop: "01900000-0000-7000-8000-0000000008d2",
        brand: "素纪",
        models: ["通勤系列", "法式系列", "重磅系列", "廓形系列", "度假系列", "基础系列"],
        shipFrom: ["330110", "浙江省", "杭州市", "余杭区", "文一西路演示服饰园 B 座"],
    },
    {
        phone: "13800002003",
        nickname: "田秋禾",
        shop: "01900000-0000-7000-8000-0000000008d3",
        brand: "稻香",
        models: ["当季系列", "臻选礼盒", "家庭装", "轻食系列", "原产地直发", "小规格"],
        shipFrom: ["230184", "黑龙江省", "哈尔滨市", "五常市", "民乐乡演示粮仓 3 号"],
    },
    {
        phone: "13800002004",
        nickname: "陆文舟",
        shop: "01900000-0000-7000-8000-0000000008d4",
        brand: "栖木",
        models: ["原木系列", "极简系列", "收纳系列", "北欧款", "小户型", "设计师款"],
        shipFrom: ["440606", "广东省", "佛山市", "顺德区", "乐从演示家具物流园 8 号"],
    },
    {
        phone: "13800002005",
        nickname: "范知雨",
        shop: "01900000-0000-7000-8000-0000000008d5",
        brand: "轻颜",
        models: ["温和系列", "急救系列", "日常系列", "控油系列", "防晒线", "旅行装"],
        shipFrom: ["330104", "浙江省", "杭州市", "上城区", "下沙演示美妆仓 2 号库"],
    },
]
const CLERK = { phone: "13800002006", nickname: "小店员" }
const STAFF = [
    { no: "reviewer01", name: "审核专员", role: "REVIEWER" },
    { no: "ops01", name: "运营专员", role: "OPS" },
]
const ALL_ACCOUNTS = [...BUYERS, ...SELLERS, CLERK]
const userId = (phone) => sid("user", phone)
const DEMO_SHOP_IDS = SELLERS.map((s) => s.shop)

// psql 通道

function portOpen(port) {
    return new Promise((resolve) => {
        const s = net.connect({ host: "127.0.0.1", port })
        const done = (ok) => {
            s.destroy()
            resolve(ok)
        }
        s.setTimeout(900)
        s.once("connect", () => done(true))
        s.once("timeout", () => done(false))
        s.once("error", () => done(false))
    })
}

function psql(sql, { tuplesOnly = false } = {}) {
    const cmd =
        `PGPASSWORD=${lit(DB.password).slice(1, -1)} psql -X -v ON_ERROR_STOP=1 -h ${DB.host} -p ${DB.port} -U ${DB.user} -d ${DB.name} -f -` +
        (tuplesOnly ? " -tA" : " -q")
    const r = spawnSync("wsl.exe", ["-d", DISTRO, "--", "bash", "-lc", cmd], {
        input: sql,
        encoding: "utf8",
        maxBuffer: 128 << 20,
    })
    if (r.error) throw r.error
    if (r.status !== 0) {
        process.stderr.write(`${r.stderr}\n`)
        throw new Error(`psql 退出码 ${r.status}`)
    }
    return r.stdout.trim()
}

function queryJson(sql) {
    const text = psql(sql, { tuplesOnly: true })
    return text ? JSON.parse(text) : null
}

// 读地基

/** 商品必须长在 V43 类目模板上（attrId/valueId 对得上），否则卖家工作台一编辑就报错 */
function readFoundation() {
    const cats =
        queryJson(`select json_agg(t) from (
            select c.id, c.name,
              (select json_agg(json_build_object('id', a.id, 'name', a.name, 'values',
                       (select json_agg(json_build_object('id', v.id, 'value', v.value) order by v.sort)
                          from product.category_attr_values v where v.attr_id = a.id))
                       order by a.sort)
                 from product.category_attrs a
                where a.category_id = c.id and a.kind = 'SPEC' and a.status = 'ENABLED') spec_attrs,
              (select json_agg(json_build_object('id', a.id, 'name', a.name, 'sample',
                       (select v.value from product.category_attr_values v where v.attr_id = a.id order by v.sort limit 1))
                       order by a.sort)
                 from product.category_attrs a
                where a.category_id = c.id and a.kind = 'PARAM' and a.status = 'ENABLED') param_attrs
            from product.categories c
           where c.status = 'ENABLED' and c.level = 3
             and exists (select 1 from product.category_attrs a
                          where a.category_id = c.id and a.kind = 'SPEC' and a.status = 'ENABLED')
           order by c.id) t`) ?? []
    const bands =
        queryJson(`select json_agg(t) from (
            select shop_id::text shop_id, category_id::text category_id, coalesce(min(min_price), 0) base
              from product.products group by 1, 2) t`) ?? []
    return { cats, bands }
}

// A 账号

function buildAccounts() {
    const phones = ALL_ACCOUNTS.map((u) => u.phone)
    const ids = phones.map(userId)
    const users = ALL_ACCOUNTS.map((u) => [
        userId(u.phone),
        u.phone,
        null,
        u.nickname,
        null,
        u.status ?? "ACTIVE",
        now,
        now,
    ])
    const staff = STAFF.map((s) => [
        sid("staff", s.no),
        s.no,
        PASSWORD_HASH,
        s.name,
        "ACTIVE",
        now,
        now,
        s.role,
    ])
    return [
        `DO $guard$ BEGIN
    IF EXISTS(SELECT 1 FROM account.users WHERE phone = ANY(${arr(phones)}::text[]) AND id <> ALL(${arr(ids)}::uuid[])) THEN
        RAISE EXCEPTION '演示手机号已被本脚本之外的记录占用，放弃写入';
    END IF;
END $guard$;`,
        insert(
            "account.users",
            [
                "id",
                "phone",
                "password_hash",
                "nickname",
                "avatar_key",
                "status",
                "created_at",
                "updated_at",
            ],
            users,
        ),
        insert(
            "account.staff",
            [
                "id",
                "employee_no",
                "password_hash",
                "display_name",
                "status",
                "created_at",
                "updated_at",
                "role",
            ],
            staff,
        ),
        // 只填空位：谁手工设过密码就永远不覆盖它
        `UPDATE account.users SET password_hash = ${lit(PASSWORD_HASH)}, updated_at = now()
 WHERE id = ANY(${arr(ids)}::uuid[]) AND password_hash IS NULL;`,
    ].join("\n\n")
}

// B 店铺归属 + 目录

const OWNER_PLACEHOLDER = (i) => `01900000-0000-7000-8000-0000000007d${i + 1}`

function buildOwnership() {
    const repoint = SELLERS.map(
        (s, i) => `-- 只把「不指向真实用户」的占位 owner 换成演示卖家，人工改过的不动
UPDATE shop.shops SET owner_id = ${lit(userId(s.phone))}, updated_at = now()
 WHERE id = ${lit(s.shop)} AND owner_id = ${lit(OWNER_PLACEHOLDER(i))};`,
    ).join("\n")
    const members = SELLERS.map((s) => [
        sid("member", s.shop, s.phone),
        s.shop,
        userId(s.phone),
        "OWNER",
        "ACTIVE",
        now,
        now,
        jsonb([]),
    ])
    members.push([
        sid("member", SELLERS[0].shop, CLERK.phone),
        SELLERS[0].shop,
        userId(CLERK.phone),
        "MEMBER",
        "ACTIVE",
        now,
        now,
        jsonb(["PRODUCT_MANAGE", "ORDER_FULFILL"]),
    ])
    return [
        repoint,
        insert(
            "shop.shop_members",
            [
                "id",
                "shop_id",
                "user_id",
                "role",
                "status",
                "created_at",
                "updated_at",
                "permissions",
            ],
            members,
        ),
    ].join("\n\n")
}

/** 一家店六个商品位，每个位一种形态；售罄与草稿是买家/卖家页面上最缺的两态 */
const PRODUCT_FORMS = [
    { status: "PUBLISHED", stock: 240, dims: 2 },
    { status: "PUBLISHED", stock: 20, dims: 2 },
    { status: "PUBLISHED", stock: 2, dims: 1 },
    { status: "PUBLISHED", stock: 0, dims: 2 },
    { status: "WAREHOUSE", stock: 60, dims: 0 },
    { status: "DRAFT", stock: 30, dims: 1 },
]

function specDims(cat, form) {
    const attrs = cat.spec_attrs ?? []
    if (form.dims === 0 || attrs.length === 0) return []
    return attrs
        .slice(0, Math.min(form.dims, attrs.length))
        .map((a) => ({
            id: a.id,
            name: a.name,
            values: (a.values ?? []).filter(Boolean).slice(0, 3),
        }))
        .filter((a) => a.values.length > 0)
}

const cartesian = (dims) =>
    dims.reduce(
        (acc, d) =>
            acc.flatMap((combo) =>
                d.values.map((v) => [
                    ...combo,
                    { attrId: d.id, name: d.name, valueId: v.id, value: v.value },
                ]),
            ),
        [[]],
    )

function buildCatalog({ cats, bands }) {
    const usable = cats.filter((c) => (c.spec_attrs?.length ?? 0) > 0)
    if (usable.length === 0)
        throw new Error("类目规格模板为空：先起一次后端，让 V33 与 db/seed 里的 V43 种子落地")
    const products = []
    const skus = []
    const stock = []

    for (const [si, seller] of SELLERS.entries()) {
        const own = new Set(
            bands.filter((b) => b.shop_id === seller.shop).map((b) => b.category_id),
        )
        const pool = usable.filter((c) => own.has(c.id))
        const shopCats = pool.length > 0 ? pool : [...usable.slice(si), ...usable.slice(0, si)]
        for (const [pi, form] of PRODUCT_FORMS.entries()) {
            const cat = shopCats[(pi + si) % shopCats.length]
            const base =
                Math.max(
                    800,
                    bands.find((b) => b.shop_id === seller.shop && b.category_id === cat.id)
                        ?.base ?? 0,
                ) || 4900 + si * 3000
            const name = `${seller.brand} ${cat.name} ${seller.models[pi % seller.models.length]}`
            const pid = sid("product", seller.shop, String(pi))
            const dims = specDims(cat, form)
            const combos = cartesian(dims)
            const specs = dims.map((d) => ({
                attrId: d.id,
                name: d.name,
                values: d.values.map((v) => ({ valueId: v.id, value: v.value })),
            }))
            const params = (cat.param_attrs ?? [])
                .slice(0, 2)
                .map((a) => ({ attrId: a.id, name: a.name, value: a.sample ?? "详见商品详情" }))
            const prices = []

            combos.forEach((combo, ci) => {
                const skuId = sid("sku", pid, String(ci))
                const undrafted = form.status === "DRAFT" && ci === combos.length - 1
                const price = undrafted ? null : Math.round((base * (1 + 0.15 * ci)) / 100) * 100
                prices.push(price)
                skus.push([
                    skuId,
                    pid,
                    `SE${si}${String(pi).padStart(2, "0")}${String(ci).padStart(2, "0")}`,
                    combo.length === 0 ? name : `${name} ${combo.map((c) => c.value).join(" ")}`,
                    jsonb(
                        combo.map((c) => ({
                            attrId: c.attrId,
                            valueId: c.valueId,
                            name: c.name,
                            value: c.value,
                        })),
                    ),
                    `https://picsum.photos/seed/seed-s${si}p${pi}c${ci}/600/600`,
                    price,
                    price === null ? null : Math.round((price * 1.25) / 100) * 100,
                    "CNY",
                    form.status === "PUBLISHED" && pi === 1 && ci === 1 ? "DISABLED" : "ON_SALE",
                    ago(`${3 + pi * 4} days`),
                    now,
                    combo.map((c) => c.valueId).join(":"),
                ])
                stock.push([
                    sid("stock", skuId),
                    skuId,
                    form.stock === 0 ? 0 : Math.max(0, form.stock - ci),
                    0,
                    0,
                    ago(`${3 + pi * 4} days`),
                    now,
                ])
            })

            const priced = prices.filter((p) => p !== null)
            products.push([
                pid,
                seller.shop,
                cat.id,
                name,
                params.map((p) => `${p.name} ${p.value}`).join(" · ") ||
                    "演示数据 · 由 pnpm seed:demo 生成",
                `https://picsum.photos/seed/seed-s${si}p${pi}main/600/600`,
                jsonb(
                    [1, 2, 3, 4].map(
                        (k) => `https://picsum.photos/seed/seed-s${si}p${pi}g${k}/600/600`,
                    ),
                ),
                jsonb(
                    [1, 2, 3].map(
                        (k) => `https://picsum.photos/seed/seed-s${si}p${pi}d${k}/750/1000`,
                    ),
                ),
                jsonb(specs),
                jsonb(params),
                priced.length === 0 ? null : Math.min(...priced),
                priced.length === 0 ? null : Math.max(...priced),
                "CNY",
                form.status,
                pick(pid, 900),
                ago(`${3 + pi * 4} days`),
                now,
            ])
        }
    }
    return {
        sql: [
            insert(
                "product.products",
                [
                    "id",
                    "shop_id",
                    "category_id",
                    "name",
                    "subtitle",
                    "main_image",
                    "images",
                    "detail_images",
                    "specs",
                    "params",
                    "min_price",
                    "max_price",
                    "currency",
                    "status",
                    "sold_count",
                    "created_at",
                    "updated_at",
                ],
                products,
            ),
            insert(
                "product.skus",
                [
                    "id",
                    "product_id",
                    "sku_code",
                    "name",
                    "attributes",
                    "image",
                    "price",
                    "original_price",
                    "currency",
                    "status",
                    "created_at",
                    "updated_at",
                    "spec_key",
                ],
                skus,
            ),
            insert(
                "inventory.sku_stock",
                ["id", "sku_id", "stock", "frozen_stock", "version", "created_at", "updated_at"],
                stock,
            ),
        ].join("\n\n"),
        products,
        skus,
        stock,
    }
}

// C 运费 + 商家地址

/** 一家店一种运费口径；最后一家故意不配——运费回落 0 也得有人演 */
const SHIPPING_FORMS = [
    { label: "整店包邮", freeShipping: true, defaultRule: [1, 0, 1, 0] },
    {
        label: "满 99 包邮，新疆/内蒙古偏远加价",
        freeOverAmount: 9900,
        defaultRule: [1, 800, 1, 200],
        regions: [
            [
                [1, 2500, 1, 1200],
                ["65", "15"],
            ],
            [[1, 3000, 1, 1500], ["54"]],
        ],
    },
    {
        label: "满 3 件包邮，西藏不配送",
        freeOverQuantity: 3,
        defaultRule: [1, 600, 2, 300],
        exclude: ["54"],
    },
    { label: "纯按件计费（无包邮）", defaultRule: [1, 1000, 1, 500] },
    { label: "未配置运费模板", skip: true },
]

/**
 * 按 ShippingFeeCalculator 的次序给活单估运费（不配送区 → 模板级包邮 → 最长前缀地区规则 → 默认规则）。
 * 造单时估的是快照值，浏览器里再走一遍真实报价应当对得上。
 */
function quoteShip(si, regionCode, quantity, itemAmount) {
    const form = SHIPPING_FORMS[si]
    if (form.skip || form.freeShipping) return 0
    if ((form.exclude ?? []).some((p) => regionCode.startsWith(p))) return null
    if (form.freeOverQuantity != null && quantity >= form.freeOverQuantity) return 0
    if (form.freeOverAmount != null && itemAmount >= form.freeOverAmount) return 0
    const region = (form.regions ?? []).find(([, prefixes]) =>
        prefixes.some((p) => regionCode.startsWith(p)),
    )
    const [fq, ff, aq, af] = region?.[0] ?? form.defaultRule
    if (quantity <= fq) return ff
    return ff + Math.ceil((quantity - fq) / aq) * af
}

function buildShipping() {
    const templates = []
    const rules = []
    const regions = []
    const exclusions = []
    const addresses = []

    for (const [i, seller] of SELLERS.entries()) {
        const form = SHIPPING_FORMS[i]
        const [code, province, city, district, detail] = seller.shipFrom
        if (!form.skip) {
            const tid = sid("shipping", seller.shop)
            templates.push([
                tid,
                seller.shop,
                Boolean(form.freeShipping),
                form.freeOverQuantity ?? null,
                form.freeOverAmount ?? null,
                "CNY",
                ago("20 days"),
                now,
            ])
            const addRule = ([fq, ff, aq, af], isDefault, tag) => {
                const rid = sid("shipping-rule", tid, tag)
                rules.push([rid, tid, isDefault, fq, ff, aq, af, "CNY", ago("20 days"), now])
                return rid
            }
            addRule(form.defaultRule, true, "default")
            for (const [j, [rule, prefixes]] of (form.regions ?? []).entries()) {
                const rid = addRule(rule, false, `region${j}`)
                for (const p of prefixes)
                    regions.push([sid("shipping-region", rid, p), rid, p, now])
            }
            for (const p of form.exclude ?? [])
                exclusions.push([sid("shipping-exclusion", tid, p), tid, p, now])
        }
        addresses.push(
            [
                sid("merchant-address", seller.shop, "ship"),
                seller.shop,
                "演示发货仓",
                "13800000010",
                code,
                province,
                city,
                district,
                detail,
                null,
                "ACTIVE",
                ago("20 days"),
                now,
                true,
                false,
                `${seller.brand}官方旗舰店`,
            ],
            [
                sid("merchant-address", seller.shop, "return"),
                seller.shop,
                "售后收件组",
                "13800000011",
                "310115",
                "上海市",
                "上海市",
                "浦东新区",
                "张江路演示退货仓 3 号门（虚构地址）",
                null,
                "ACTIVE",
                ago("20 days"),
                now,
                false,
                true,
                `${seller.brand}官方旗舰店`,
            ],
        )
    }
    return [
        insert(
            "shop.shipping_templates",
            [
                "id",
                "shop_id",
                "free_shipping",
                "free_over_quantity",
                "free_over_amount",
                "currency",
                "created_at",
                "updated_at",
            ],
            templates,
        ),
        insert(
            "shop.shipping_rules",
            [
                "id",
                "template_id",
                "is_default",
                "first_quantity",
                "first_fee",
                "add_quantity",
                "add_fee",
                "currency",
                "created_at",
                "updated_at",
            ],
            rules,
        ),
        insert(
            "shop.shipping_rule_regions",
            ["id", "rule_id", "region_prefix", "created_at"],
            regions,
        ),
        insert(
            "shop.shipping_exclusions",
            ["id", "template_id", "region_prefix", "created_at"],
            exclusions,
        ),
        insert(
            "shop.addresses",
            [
                "id",
                "shop_id",
                "contact_name",
                "phone",
                "region_code",
                "province",
                "city",
                "district",
                "detail",
                "postal_code",
                "status",
                "created_at",
                "updated_at",
                "default_ship",
                "default_return",
                "company_name",
            ],
            addresses,
        ),
    ].join("\n\n")
}

// D 券

function buildCoupons() {
    const rows = []
    SELLERS.forEach((s, i) => {
        rows.push(
            [
                sid("coupon", s.shop, "full"),
                s.shop,
                `满 99 减 ${10 + i}`,
                9900,
                1000 + i * 100,
                "CNY",
                "SELLER",
                ago("1 day"),
                ahead("30 days"),
                500,
                0,
                "ACTIVE",
                ago("10 days"),
                now,
            ],
            [
                sid("coupon", s.shop, "noThreshold"),
                s.shop,
                "无门槛 5 元券",
                0,
                500,
                "CNY",
                "SELLER",
                ago("1 day"),
                ahead("7 days"),
                200,
                0,
                "ACTIVE",
                ago("10 days"),
                now,
            ],
            [
                sid("coupon", s.shop, "stopped"),
                s.shop,
                "已停发的活动券",
                19900,
                3000,
                "CNY",
                "SELLER",
                ago("30 days"),
                ahead("30 days"),
                100,
                0,
                "STOPPED",
                ago("30 days"),
                now,
            ],
        )
    })
    return insert(
        "coupon.coupon_templates",
        [
            "id",
            "shop_id",
            "name",
            "threshold_amount",
            "discount_amount",
            "currency",
            "bearer",
            "valid_from",
            "valid_to",
            "total_quantity",
            "issued_quantity",
            "status",
            "created_at",
            "updated_at",
        ],
        rows,
    )
}
/** 券模板 → 用户券：钱包四态各一张；usable = 现在就能在下单时用掉 */
const WALLET = [
    {
        buyer: 0,
        shopIdx: 0,
        kind: "full",
        status: "UNUSED",
        usable: true,
        effective: ago("1 day"),
        expire: ahead("30 days"),
    },
    {
        buyer: 0,
        shopIdx: 1,
        kind: "full",
        status: "UNUSED",
        usable: true,
        effective: ago("9 days"),
        expire: ahead("6 hours"),
        note: "即将到期",
    },
    {
        buyer: 0,
        shopIdx: 2,
        kind: "full",
        status: "UNUSED",
        effective: ahead("2 days"),
        expire: ahead("30 days"),
        note: "明日生效",
    },
    {
        buyer: 0,
        shopIdx: 3,
        kind: "full",
        status: "EXPIRED",
        effective: ago("30 days"),
        expire: ago("1 day"),
    },
    {
        buyer: 0,
        shopIdx: 4,
        kind: "noThreshold",
        status: "UNUSED",
        usable: true,
        effective: ago("1 day"),
        expire: ahead("20 days"),
    },
    {
        buyer: 1,
        shopIdx: 0,
        kind: "noThreshold",
        status: "UNUSED",
        effective: ago("1 day"),
        expire: ahead("20 days"),
        note: "全空态号唯一的一张券（不出单，留给浏览器自己用）",
    },
    {
        buyer: 2,
        shopIdx: 1,
        kind: "full",
        status: "UNUSED",
        usable: true,
        effective: ago("1 day"),
        expire: ahead("30 days"),
        note: "待付款单要用的券",
    },
]

function couponRow(w, i) {
    const buyer = BUYERS[w.buyer]
    const shop = SELLERS[w.shopIdx].shop
    const tpl = sid("coupon", shop, w.kind)
    const threshold = w.kind === "full" ? 9900 : 0
    const discount = w.kind === "full" ? 1000 + w.shopIdx * 100 : 500
    const name = w.kind === "full" ? `满 99 减 ${10 + w.shopIdx}` : "无门槛 5 元券"
    return {
        id: sid("user-coupon", buyer.phone, String(i)),
        row: [
            tpl,
            userId(buyer.phone),
            shop,
            name,
            threshold,
            discount,
            "CNY",
            "SELLER",
            w.effective,
            w.expire,
            w.status,
            "CLAIM",
            now,
            now,
        ],
        threshold,
        discount,
        shop,
        tpl,
        name,
        buyerIdx: w.buyer,
        shopIdx: w.shopIdx,
        usable: Boolean(w.usable),
    }
}

// D 买家侧

const ADDRESS_BOOK = {
    林小满: [
        [
            "林小满",
            "13800000001",
            "330106",
            "浙江省",
            "杭州市",
            "西湖区",
            "文三路演示小区 1 幢 602 室",
            "HOME",
            true,
        ],
        [
            "林小满",
            "13800000001",
            "330110",
            "浙江省",
            "杭州市",
            "余杭区",
            "文一西路演示科技园 A 座 1208 室",
            "WORK",
            false,
        ],
        [
            "林阿姨",
            "13800000002",
            "510107",
            "四川省",
            "成都市",
            "武侯区",
            "锦绣路演示花园 3 栋 201 室",
            "PARENTS",
            false,
        ],
    ],
    苏晓: [
        [
            "苏晓",
            "13800000003",
            "310115",
            "上海市",
            "上海市",
            "浦东新区",
            "张江路演示社区 8 号楼 1102 室",
            "HOME",
            true,
        ],
        [
            "苏晓",
            "13800000003",
            "540102",
            "西藏自治区",
            "拉萨市",
            "城关区",
            "北京中路演示办公点（演「该地区不配送」用）",
            "出差",
            false,
        ],
    ],
}

function buildBuyerSide(catalog) {
    const addresses = []
    const favorites = []
    const cart = []
    const published = catalog.products.filter((p) => p[13] === "PUBLISHED")
    const skuByProduct = new Map()
    for (const s of catalog.skus) {
        if (!skuByProduct.has(s[1])) skuByProduct.set(s[1], [])
        skuByProduct.get(s[1]).push(s)
    }
    const onSale = (pid) =>
        skuByProduct.get(pid)?.find((s) => s[9] === "ON_SALE" && s[6] !== null) ??
        skuByProduct.get(pid)?.[0]

    for (const buyer of BUYERS) {
        for (const [idx, a] of (ADDRESS_BOOK[buyer.nickname] ?? []).entries()) {
            addresses.push([
                sid("address", buyer.phone, String(idx)),
                userId(buyer.phone),
                a[0],
                a[1],
                a[2],
                a[3],
                a[4],
                a[5],
                a[6] + "（虚构地址）",
                a[7],
                a[8],
                ago(`${idx + 1} days`),
                now,
            ])
        }
        if (buyer.tag.startsWith("新买家") || buyer.status === "DISABLED") continue
        published
            .slice(0, buyer.nickname === "林小满" ? 12 : 3)
            .forEach((p, i) =>
                favorites.push([
                    sid("favorite", buyer.phone, p[0]),
                    userId(buyer.phone),
                    p[0],
                    ago(`${3 + i} hours`),
                ]),
            )
        // 林小满满车（含未勾选态）；苏晓一件待结算；陈默空车
        const want = buyer.nickname === "林小满" ? 6 : buyer.nickname === "苏晓" ? 1 : 0
        published.slice(0, want).forEach((p, i) => {
            const sku = onSale(p[0])
            if (!sku) return
            cart.push([
                sid("cart", buyer.phone, sku[0]),
                userId(buyer.phone),
                sku[0],
                1 + (i % 3),
                i % 4 !== 3,
                ago(`${20 + i * 40} minutes`),
                now,
            ])
        })
    }
    const wallet = WALLET.map(couponRow)
    const walletRows = []
    for (const w of wallet) walletRows.push([w.id, ...w.row])

    return [
        insert(
            "account.addresses",
            [
                "id",
                "user_id",
                "receiver_name",
                "phone",
                "region_code",
                "province",
                "city",
                "district",
                "detail",
                "label",
                "is_default",
                "created_at",
                "updated_at",
            ],
            addresses,
        ),
        insert("favorite.items", ["id", "user_id", "product_id", "created_at"], favorites),
        insert(
            "cart.items",
            ["id", "user_id", "sku_id", "quantity", "selected", "created_at", "updated_at"],
            cart,
        ),
        insert(
            "coupon.user_coupons",
            [
                "id",
                "template_id",
                "user_id",
                "shop_id",
                "name",
                "threshold_amount",
                "discount_amount",
                "currency",
                "bearer",
                "effective_at",
                "expire_at",
                "status",
                "source",
                "created_at",
                "updated_at",
            ],
            walletRows,
        ),
    ].join("\n\n")
}

// F 审核队列

function buildReviewQueue() {
    const queue = [
        {
            key: "pending-a",
            owner: BUYERS[0].phone,
            name: "演示·待审小店 A",
            status: "PENDING_REVIEW",
            age: "2 days",
        },
        {
            key: "pending-b",
            owner: BUYERS[0].phone,
            name: "演示·待审小店 B",
            status: "PENDING_REVIEW",
            age: "9 hours",
        },
        {
            key: "pending-c",
            owner: BUYERS[2].phone,
            name: "演示·压了三周的待审店",
            status: "PENDING_REVIEW",
            age: "21 days",
        },
        {
            key: "rejected-a",
            owner: BUYERS[2].phone,
            name: "演示·资质不全被拒店",
            status: "REJECTED",
            age: "5 days",
        },
    ]
    const shops = queue.map((s) => [
        sid("shop", s.key),
        userId(s.owner),
        s.name,
        null,
        s.status,
        ago(s.age),
        ago(s.age),
    ])
    const members = queue.map((s) => [
        sid("member", sid("shop", s.key), s.owner),
        sid("shop", s.key),
        userId(s.owner),
        "OWNER",
        "ACTIVE",
        ago(s.age),
        ago(s.age),
        jsonb([]),
    ])
    const reviews = queue.map((s) => [
        sid("review", s.key),
        sid("shop", s.key),
        s.status === "REJECTED" ? sid("staff", "reviewer01") : null,
        s.status === "REJECTED" ? "REJECTED" : "PENDING",
        s.status === "REJECTED" ? "营业执照照片模糊，请重新上传" : null,
        s.status === "REJECTED" ? ago("4 days") : null,
        ago(s.age),
        ago(s.age),
    ])
    const history = DEMO_SHOP_IDS.map((shop) => [
        sid("review", shop),
        shop,
        "01900000-0000-7000-8000-000000000001",
        "APPROVED",
        null,
        ago("180 days"),
        ago("181 days"),
        ago("180 days"),
    ])
    return [
        insert(
            "shop.shops",
            ["id", "owner_id", "name", "logo_key", "status", "created_at", "updated_at"],
            shops,
        ),
        insert(
            "shop.shop_members",
            [
                "id",
                "shop_id",
                "user_id",
                "role",
                "status",
                "created_at",
                "updated_at",
                "permissions",
            ],
            members,
        ),
        insert(
            "shop.shop_reviews",
            [
                "id",
                "shop_id",
                "staff_id",
                "status",
                "reason",
                "decided_at",
                "created_at",
                "updated_at",
            ],
            [...reviews, ...history],
        ),
    ].join("\n\n")
}

// G 首页内容

/**
 * 首页导航与推荐条补形状。V13（经 V59 规范化后）全是「正常长相」，浏览器里只演得出有内容一种；
 * 这里补的是其余**合法**分支，target 一律按名字现查真实启用类目 id，不抄 V13 的固定 UUID（类目被人改过就静默失效）。
 * 规范同 V59 头注释，并被 buildAssertions 钉住：CATEGORY 型的 target 必须命中真实启用类目、名字含该类目名，
 * icon_key 只写前端 ICON_BY_KEY 里的键或留空（留空即走兜底图标）。不造指向不存在对象的行——脏输入的兜底
 * 归 FeedIT 与 home/queries.test 覆盖，不该占用运营可见的数据面。
 *   导航 —— 空 subs（hover 不展开面板）/ 组缺 items 与 items 为空（契约两条路）/ 不配 icon_key（兜底图标）/
 *           超长标题（截断 + title 提示）/ 只填了标题（target 与 subs 全空）/ 停用条目（前台不吐、后台可启用）/
 *           另一个导航位（前台 home 查询不含它，后台按 navKey 筛选用得上）
 *   词条 —— 补到溢出第二页（RecommendBar 的左右翻页按钮此前在浏览器里压根出不来）/ 二级子树召回 /
 *           只有 1 件上架的叶子（首屏即「没有更多了」）/ 0 上架的真实类目（空流）/ 长词条名（宽度测量与 nowrap）/
 *           停用词条
 */
function readCmsAnchors() {
    return (
        queryJson(`select json_agg(t) from (
            with recursive reach(root_id, id) as (
                select c.id, c.id from product.categories c where c.status = 'ENABLED'
                union all
                select r.root_id, ch.id from reach r
                  join product.categories ch on ch.parent_id = r.id and ch.status = 'ENABLED'
            )
            select c.id::text as id, c.name, c.level,
                   (select count(*) from product.products p
                     where p.status = 'PUBLISHED'
                       and p.category_id in (select id from reach r where r.root_id = c.id)) as pub
              from product.categories c
             where c.status = 'ENABLED'
             order by c.level, c.sort, c.id
        ) t`) ?? []
    )
}

const pub = (a) => (a ? a.pub : 0)

function buildCms(anchors) {
    const byName = (name, level) => anchors.find((a) => a.name === name && a.level === level)
    /** 一级类目里 V13 词条没配到的三个 */
    const topLevel = ["电脑办公", "家居家装", "美妆个护"].map((n) => byName(n, 1)).filter(Boolean)
    /** 二级类目按上架数取前二：演「词条指二级、召回靠子树展开」 */
    const midLevel = anchors
        .filter((a) => a.level === 2 && pub(a) >= 2)
        .toSorted((a, b) => b.pub - a.pub || a.name.localeCompare(b.name))
        .slice(0, 2)
    const leaves = anchors.filter((a) => a.level === 3)
    const oneLeaf = leaves
        .filter((a) => a.pub === 1)
        .toSorted((a, b) => a.name.localeCompare(b.name))[0]
    const emptyLeaf = leaves
        .filter((a) => a.pub === 0)
        .toSorted((a, b) => a.name.localeCompare(b.name))[0]
    const longCat = byName("休闲食品", 2) ?? midLevel[0]
    const offCat = byName("数码配件", 2) ?? midLevel[1] ?? longCat

    const tab = (name, target, type, order, status) => ({
        id: sid("tab", name),
        name,
        target,
        type,
        order,
        status: status ?? "ENABLED",
    })
    const tabOf = (cat, order, status) => cat && tab(cat.name, cat.id, "CATEGORY", order, status)
    const tabs = [
        ...topLevel.map((c, i) => tabOf(c, 10 + i)),
        ...midLevel.map((c, i) => tabOf(c, 13 + i)),
        tabOf(oneLeaf, 15),
        tabOf(emptyLeaf, 16),
        longCat && tab(`${longCat.name} · 第二件半价长词条名`, longCat.id, "CATEGORY", 17),
        tabOf(offCat, 18, "DISABLED"),
    ].filter(Boolean)

    const nav = (title, icon, target, type, subs, order, key, status) => ({
        id: sid("nav", title),
        key: key ?? "home",
        title,
        icon,
        target,
        type,
        subs,
        order,
        status: status ?? "ENABLED",
    })
    const boxLeaf = byName("收纳用品", 3)
    const cleanLeaf = byName("清洁用品", 3)
    const plainLeaf = byName("牙膏", 3)
    const homeCat = byName("家居家装", 1)
    const phoneLeaf = byName("智能手机", 3)
    const wearCat = byName("服饰鞋包", 1)
    const navs = [
        boxLeaf && nav(boxLeaf.name, "toy", boxLeaf.id, "CATEGORY", [], 9),
        cleanLeaf &&
            nav(
                cleanLeaf.name,
                "gift",
                cleanLeaf.id,
                "CATEGORY",
                [{ name: "这一组没有词条" }, { name: cleanLeaf.name, items: [] }],
                10,
            ),
        plainLeaf &&
            nav(
                plainLeaf.name,
                null,
                plainLeaf.id,
                "CATEGORY",
                [{ name: plainLeaf.name, items: [plainLeaf.name] }],
                11,
            ),
        homeCat &&
            nav(
                `${homeCat.name} / 家具 / 家居日用 / 床 / 沙发 / 桌椅 / 收纳用品 / 清洁用品 / 床上用品（超长标题看截断）`,
                "furniture",
                homeCat.id,
                "CATEGORY",
                [
                    {
                        name: "分组词条很多的一行",
                        items: ["床", "沙发", "桌椅", "收纳用品", "清洁用品", "床上用品", "T恤"],
                    },
                ],
                12,
            ),
        nav("只填了标题的一条", null, null, null, [], 13),
        phoneLeaf &&
            nav(
                phoneLeaf.name,
                "phone",
                phoneLeaf.id,
                "CATEGORY",
                [{ name: phoneLeaf.name, items: [phoneLeaf.name] }],
                14,
                "home",
                "DISABLED",
            ),
        wearCat &&
            nav(
                wearCat.name,
                "bag-toy",
                wearCat.id,
                "CATEGORY",
                [{ name: wearCat.name, items: ["男装", "女装", "鞋靴"] }],
                1,
                "footer",
            ),
    ].filter(Boolean)

    return [
        insert(
            "cms.recommend_tabs",
            [
                "id",
                "name",
                "target",
                "target_type",
                "is_default",
                "sort_order",
                "status",
                "created_at",
                "updated_at",
            ],
            tabs.map((t) => [t.id, t.name, t.target, t.type, false, t.order, t.status, now, now]),
        ),
        insert(
            "cms.nav_entries",
            [
                "id",
                "nav_key",
                "title",
                "icon_key",
                "target",
                "target_type",
                "subs",
                "sort_order",
                "status",
                "created_at",
                "updated_at",
            ],
            navs.map((n) => [
                n.id,
                n.key,
                n.title,
                n.icon,
                n.target,
                n.type,
                jsonb(n.subs),
                n.order,
                n.status,
                now,
                now,
            ]),
        ),
    ].join("\n\n")
}

// E 活单

/** 只造「还能动」的单：买家能付/能收/能申，卖家能发/能审。终态历史交给 seed-buyer-demo.sql，两边不重复。 */
const LIVE_ORDERS = [
    {
        tag: "PENDING",
        status: "PENDING_PAYMENT",
        age: "2 minutes",
        coupon: true,
        note: "待付款·券已锁定：点去支付或取消都能走通",
    },
    { tag: "TOSHIP", status: "PAID", age: "6 hours", note: "待发货：卖家工作台点发货能走通" },
    {
        tag: "DUESHIP",
        status: "PAID",
        age: "5 days",
        shipExpire: ahead("40 minutes"),
        note: "临近发货时限：工作台倒计时与催发货（时限真过掉会被 30s 一巡的 OrderTimeoutJob 自动取消退款，故只演将要到期）",
    },
    {
        tag: "TRANSIT",
        status: "SHIPPED",
        age: "2 days",
        shipment: "IN_TRANSIT",
        note: "在途有轨迹：买家可确认收货",
    },
    {
        tag: "REFUND",
        status: "COMPLETED",
        age: "8 days",
        ticket: "REFUND_ONLY",
        note: "仅退款待商家处理：卖家可同意或拒绝",
    },
    {
        tag: "RETURNGOODS",
        status: "COMPLETED",
        age: "11 days",
        ticket: "RETURN_REFUND",
        note: "退货已寄出：卖家可确认收到退货",
    },
]

const TEMP_HELPERS = `
CREATE FUNCTION pg_temp.seed_stock(p_sku uuid, p_oid uuid, p_movement text, p_n integer) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE s inventory.sku_stock%ROWTYPE; ds integer := 0; df integer := 0;
BEGIN
    SELECT * INTO STRICT s FROM inventory.sku_stock WHERE sku_id = p_sku FOR UPDATE;
    CASE p_movement
        WHEN 'FREEZE'  THEN df := p_n;
        WHEN 'CAPTURE' THEN ds := -p_n; df := -p_n;
        WHEN 'RELEASE' THEN df := -p_n;
        ELSE RAISE EXCEPTION 'Unsupported movement %', p_movement;
    END CASE;
    UPDATE inventory.sku_stock SET stock = stock + ds, frozen_stock = frozen_stock + df,
        version = version + 1, updated_at = now() WHERE sku_id = p_sku;
    INSERT INTO inventory.stock_movements(sku_id, order_id, type, quantity, before_stock, after_stock, before_available, after_available)
    VALUES(p_sku, p_oid, p_movement, ds, s.stock, s.stock + ds, s.stock - s.frozen_stock, s.stock + ds - s.frozen_stock - df);
END $fn$;

CREATE FUNCTION pg_temp.seed_log(p_oid uuid, p_prev text, p_target text, p_action text, p_actor text, p_at timestamptz, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $fn$
    INSERT INTO orders.order_status_log(order_id, from_status, to_status, action, actor_type, created_at, reason)
    VALUES(p_oid, p_prev, p_target, p_action, p_actor, p_at, p_reason);
$fn$;

CREATE FUNCTION pg_temp.seed_ship(p_oid uuid, p_state text, p_suffix text, p_direction text) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE o orders.orders%ROWTYPE; sid uuid := uuidv7(); sent timestamptz; ended timestamptz;
    nodes text[] := ARRAY['PICKED_UP','ARRIVED_HUB','DEPARTED_HUB','OUT_FOR_DELIVERY','DELIVERED'];
    texts text[] := ARRAY['演示：包裹已揽收','演示：到达杭州分拨中心','演示：离开分拨中心，发往收件城市','演示：快递员正在派送','演示：包裹已签收'];
    k integer; count_nodes integer;
BEGIN
    SELECT * INTO STRICT o FROM orders.orders WHERE id = p_oid;
    sent := CASE WHEN p_direction = 'RETURN' THEN now() - interval '20 hours' ELSE o.shipped_at END;
    ended := CASE WHEN p_state = 'DELIVERED' THEN CASE WHEN p_direction = 'RETURN' THEN now() - interval '8 hours' ELSE o.delivered_at END
                    ELSE LEAST(sent + interval '20 hours', now() - interval '1 hour') END;
    INSERT INTO logistics.shipments(id, order_id, user_id, shop_id, direction, carrier_name, carrier_code, tracking_no, status,
        shipped_at, delivered_at, created_at, updated_at, ship_from_contact_name, ship_from_phone, ship_from_province, ship_from_city, ship_from_district, ship_from_detail)
    VALUES(sid, o.id, o.user_id, o.shop_id, p_direction, '顺丰速运', NULL, o.order_no || '-' || p_suffix, p_state, sent,
        CASE WHEN p_state = 'DELIVERED' THEN ended END, sent, COALESCE(ended, sent),
        '演示发货员', '13800000010', '浙江省', '杭州市', '余杭区', '演示仓库 1 号（虚构地址）');
    -- 刻意不给 carrier_code：合成运单不该被拿去查真实承运商
    count_nodes := CASE p_state WHEN 'PENDING_PICKUP' THEN 0 WHEN 'PICKED_UP' THEN 1 WHEN 'IN_TRANSIT' THEN 3 WHEN 'DELIVERING' THEN 4 WHEN 'DELIVERED' THEN 5 ELSE 3 END;
    FOR k IN 1..count_nodes LOOP
        INSERT INTO logistics.tracking_nodes(shipment_id, node_code, description, location, occurred_at, dedupe_key)
        VALUES(sid, nodes[k], texts[k], CASE WHEN k < 4 THEN '杭州分拨中心' ELSE o.receiver_city END, sent + (ended - sent) * k / count_nodes, sid::text || ':' || k);
    END LOOP;
END $fn$;`

function buildLiveOrders(catalog) {
    const statements = []
    const wallet = WALLET.map(couponRow)
    const publishedByShop = new Map(
        SELLERS.map((s) => [
            s.shop,
            catalog.products.filter((p) => p[1] === s.shop && p[13] === "PUBLISHED"),
        ]),
    )
    const skuByProduct = new Map()
    for (const s of catalog.skus) {
        if (!skuByProduct.has(s[1])) skuByProduct.set(s[1], [])
        skuByProduct.get(s[1]).push(s)
    }
    /** 停用号不出单；陈默是全空态号也不出单 */
    const activeBuyers = BUYERS.map((b, i) => i).filter((i) => !BUYERS[i].status && i !== 1)
    /** 下单即冻结：可用库存要随单扣减，否则同一只 SKU 被 6 笔单重复吃库存，账本会撞上 CHECK */
    const available = new Map(catalog.stock.map((r) => [r[1], r[2]]))

    for (const [si, seller] of SELLERS.entries()) {
        const pool = publishedByShop.get(seller.shop) ?? []
        // 券跟着店走：待付款单由「在这家店正好有可用券的买家」下出来，锁券这张单才成立
        const holder = wallet.find((w) => w.usable && w.shopIdx === si)
        for (const [oi, scn] of LIVE_ORDERS.entries()) {
            if (pool.length === 0) continue
            const buyer =
                BUYERS[
                    scn.coupon && holder
                        ? holder.buyerIdx
                        : activeBuyers[(si + oi) % activeBuyers.length]
                ]
            const lines = []
            const fillable = (s, qty) =>
                s[9] === "ON_SALE" &&
                s[6] !== null &&
                available.get(s[0]) >= qty &&
                !lines.some((l) => l.sku[0] === s[0])
            for (let li = 0; li <= oi % 2; li++) {
                const want = 1 + ((oi + li) % 2)
                // 从本单该用的那只起顺着池子找：指定那只可能售罄，或库存已被同店前面的单吃光
                for (let k = 0; k < pool.length; k++) {
                    const p = pool[(oi * 2 + li + k) % pool.length]
                    const candidates = skuByProduct.get(p[0]) ?? []
                    const sku =
                        candidates.find((s) => fillable(s, want)) ??
                        candidates.find((s) => fillable(s, 1))
                    if (!sku) continue
                    const qty = Math.min(want, available.get(sku[0]))
                    available.set(sku[0], available.get(sku[0]) - qty)
                    lines.push({ product: p, sku, qty })
                    break
                }
            }
            if (lines.length === 0) continue

            const oid = sid("order", seller.shop, scn.tag)
            const orderNo = `DEMO-LIVE-${String(si + 1).padStart(2, "0")}${String(oi + 1).padStart(2, "0")}`
            const created = ago(scn.age)
            const quantity = lines.reduce((a, l) => a + l.qty, 0)
            const itemAmount = lines.reduce((a, l) => a + l.sku[6] * l.qty, 0)
            const addr = (ADDRESS_BOOK[buyer.nickname] ?? [])[0] ?? [
                "演示收件人",
                "13800000000",
                "310115",
                "上海市",
                "上海市",
                "浦东新区",
                "张江路演示社区 8 号楼 1102 室",
            ]
            const shippingFee = quoteShip(si, addr[2], quantity, itemAmount) ?? 0
            const locked = scn.coupon && holder && itemAmount >= holder.threshold ? holder : null
            const discount = locked ? Math.min(locked.discount, itemAmount + shippingFee) : 0
            const payAmount = itemAmount + shippingFee - discount
            const paid = scn.status !== "PENDING_PAYMENT"
            const shippedAt =
                scn.status === "SHIPPED" || scn.status === "COMPLETED"
                    ? x(`(${created.sql}) + interval '10 hours'`)
                    : null
            const deliveredAt =
                scn.status === "COMPLETED" ? x(`(${created.sql}) + interval '2 days'`) : null
            const completedAt =
                scn.status === "COMPLETED" ? x(`(${deliveredAt.sql}) + interval '2 hours'`) : null

            statements.push(
                `-- ${seller.brand} · ${scn.note}`,
                `INSERT INTO orders.orders
    (id, order_no, user_id, shop_id, status, item_amount, shipping_fee, pay_amount, discount_amount, user_coupon_id, coupon_bearer, currency,
     receiver_name, receiver_phone, receiver_province, receiver_city, receiver_district, receiver_detail, receiver_region_code, buyer_message,
     paid_at, shipped_at, delivered_at, completed_at, pay_expire_at, ship_expire_at, receive_expire_at, apply_expire_at, after_sale_status, created_at, updated_at)
VALUES
    (${lit(oid)}, ${lit(orderNo)}, ${lit(userId(buyer.phone))}, ${lit(seller.shop)}, ${lit(scn.status)},
     ${itemAmount}, ${shippingFee}, ${payAmount}, ${discount}, ${locked ? lit(locked.id) : "NULL"}, ${locked ? "'SELLER'" : "NULL"}, 'CNY',
     ${lit(addr[0])}, ${lit(addr[1])}, ${lit(addr[3])}, ${lit(addr[4])}, ${lit(addr[5])}, ${lit(addr[6] + "（虚构地址）")}, ${lit(addr[2])},
     ${lit(`[演示] ${scn.note}`)},
     ${lit(paid ? x(`(${created.sql}) + interval '2 minutes'`) : null)},
     ${lit(shippedAt)}, ${lit(deliveredAt)}, ${lit(completedAt)},
     ${lit(scn.tag === "PENDING" ? ahead("13 minutes") : x(`(${created.sql}) + interval '15 minutes'`))},
     ${paid ? lit(scn.shipExpire ?? ahead("3 days")) : "NULL"},
     ${lit(scn.status === "SHIPPED" ? ahead("5 days") : null)},
     ${lit(scn.status === "COMPLETED" ? ahead("4 days") : null)},
     ${lit(scn.ticket ? (scn.ticket === "REFUND_ONLY" ? "APPLYING" : "RETURNING") : "NONE")},
     ${lit(created)}, now());`,
            )

            for (const l of lines) {
                statements.push(
                    `INSERT INTO orders.items(id, order_id, product_id, sku_id, name, image, price, original_price, currency, quantity, amount, created_at)
VALUES(${lit(sid("item", oid, l.sku[0]))}, ${lit(oid)}, ${lit(l.product[0])}, ${lit(l.sku[0])}, ${lit(l.sku[3])}, ${lit(l.sku[5])}, ${l.sku[6]}, ${lit(l.sku[7])}, 'CNY', ${l.qty}, ${l.sku[6] * l.qty}, ${lit(created)});`,
                    `SELECT pg_temp.seed_stock(${lit(l.sku[0])}, ${lit(oid)}, 'FREEZE', ${l.qty});`,
                )
                if (paid)
                    statements.push(
                        `SELECT pg_temp.seed_stock(${lit(l.sku[0])}, ${lit(oid)}, 'CAPTURE', ${l.qty});`,
                    )
            }
            statements.push(
                `SELECT pg_temp.seed_log(${lit(oid)}, NULL, 'PENDING_PAYMENT', 'CREATE', 'BUYER', ${lit(created)});`,
            )
            if (locked)
                statements.push(`UPDATE coupon.user_coupons SET status = 'LOCKED', order_id = ${lit(oid)}, locked_at = ${lit(created)}, applied_discount_amount = ${discount}, updated_at = now()
  WHERE id = ${lit(locked.id)} AND status = 'UNUSED';
INSERT INTO coupon.coupon_usages(id, user_coupon_id, order_id, user_id, shop_id, action, discount_amount, currency, created_at)
VALUES(${lit(sid("usage", oid))}, ${lit(locked.id)}, ${lit(oid)}, ${lit(userId(buyer.phone))}, ${lit(locked.shop)}, 'LOCK', ${discount}, 'CNY', ${lit(created)})
ON CONFLICT (id) DO NOTHING;`)
            if (paid)
                statements.push(
                    `SELECT pg_temp.seed_log(${lit(oid)}, 'PENDING_PAYMENT', 'PAID', 'PAY', 'BUYER', (${created.sql}) + interval '2 minutes');`,
                    `INSERT INTO payment.payments(id, order_id, order_no, user_id, amount, currency, status, paid_at, created_at)
VALUES(${lit(sid("payment", oid))}, ${lit(oid)}, ${lit(orderNo)}, ${lit(userId(buyer.phone))}, ${payAmount}, 'CNY', 'SUCCESS', (${created.sql}) + interval '2 minutes', (${created.sql}) + interval '2 minutes')
ON CONFLICT (id) DO NOTHING;`,
                )
            if (shippedAt)
                statements.push(
                    `SELECT pg_temp.seed_log(${lit(oid)}, 'PAID', 'SHIPPED', 'SHIP', 'SELLER', ${shippedAt.sql});`,
                    `SELECT pg_temp.seed_ship(${lit(oid)}, ${lit(scn.shipment ?? "DELIVERED")}, 'F1', 'FORWARD');`,
                    `UPDATE orders.orders SET logistics_company = '顺丰速运', tracking_no = ${lit(`${orderNo}-F1`)} WHERE id = ${lit(oid)};`,
                )
            if (completedAt) {
                statements.push(
                    `SELECT pg_temp.seed_log(${lit(oid)}, 'SHIPPED', 'COMPLETED', 'RECEIVE', 'BUYER', ${completedAt.sql});`,
                )
                for (const l of lines)
                    statements.push(
                        `UPDATE product.products SET sold_count = sold_count + ${l.qty} WHERE id = ${lit(l.product[0])} AND sold_count < 10000;`,
                    )
            }
            if (scn.ticket) {
                const tid = sid("ticket", oid)
                const ticketStatus = scn.ticket === "REFUND_ONLY" ? "APPLYING" : "RETURNING"
                statements.push(`INSERT INTO aftersale.tickets(id, order_id, user_id, shop_id, type, status, reason, refund_amount, currency, created_at, updated_at, return_logistics_company, return_tracking_no)
VALUES(${lit(tid)}, ${lit(oid)}, ${lit(userId(buyer.phone))}, ${lit(seller.shop)}, ${lit(scn.ticket)}, ${lit(ticketStatus)},
    ${lit(`[演示] ${scn.note}`)}, ${payAmount}, 'CNY', (${completedAt.sql}) + interval '1 day', (${completedAt.sql}) + interval '1 day',
    ${scn.ticket === "RETURN_REFUND" ? "'顺丰速运'" : "NULL"}, ${scn.ticket === "RETURN_REFUND" ? lit(`${orderNo}-R1`) : "NULL"})
ON CONFLICT (id) DO NOTHING;
INSERT INTO aftersale.ticket_events(id, ticket_id, actor, action, note, created_at)
VALUES(${lit(sid("ticket-event", tid, "apply"))}, ${lit(tid)}, 'BUYER', 'APPLY', ${lit(`[演示] 买家提交售后申请`)}, (${completedAt.sql}) + interval '1 day')
ON CONFLICT (id) DO NOTHING;`)
                if (scn.ticket === "RETURN_REFUND")
                    statements.push(
                        `INSERT INTO aftersale.ticket_events(id, ticket_id, actor, action, note, created_at)
VALUES(${lit(sid("ticket-event", tid, "agree"))}, ${lit(tid)}, 'SELLER', 'AGREE_RETURN', '同意退货，请按退货地址寄回', (${completedAt.sql}) + interval '2 days')
ON CONFLICT (id) DO NOTHING;
SELECT pg_temp.seed_ship(${lit(oid)}, 'IN_TRANSIT', 'R1', 'RETURN');
INSERT INTO aftersale.ticket_events(id, ticket_id, actor, action, note, created_at)
VALUES(${lit(sid("ticket-event", tid, "sent"))}, ${lit(tid)}, 'BUYER', 'RETURN_GOODS', '顺丰速运 退货在途', now() - interval '20 hours')
ON CONFLICT (id) DO NOTHING;`,
                    )
            }
        }
    }
    return statements.join("\n")
}

// 断言

function buildAssertions() {
    const ids = ALL_ACCOUNTS.map((u) => userId(u.phone))
    return `DO $check$
DECLARE bad text;
BEGIN
    IF current_database() <> ${lit(DB.name)} OR current_user <> ${lit(DB.user)} THEN
        RAISE EXCEPTION '本脚本只允许跑在本地 % 库 / % 角色', ${lit(DB.name)}, ${lit(DB.user)};
    END IF;
    IF (SELECT count(*) FROM shop.shops WHERE id::text LIKE '01900000-0000-7000-8000-0000000008d%') <> 5 THEN
        RAISE EXCEPTION 'V44 演示店铺不足 5 家：先起一次后端让 Flyway 追上';
    END IF;
    IF EXISTS(SELECT 1 FROM shop.shops s WHERE s.id = ANY(${arr(DEMO_SHOP_IDS)}::uuid[])
              AND NOT EXISTS (SELECT 1 FROM account.users u WHERE u.id = s.owner_id)) THEN
        RAISE EXCEPTION '旗舰店 owner 仍指向占位值：owner 重定向没生效';
    END IF;
    IF EXISTS(SELECT 1 FROM account.users WHERE id = ANY(${arr(ids)}::uuid[]) AND password_hash IS NULL) THEN
        RAISE EXCEPTION '演示账号密码没落地，密码登录路径仍是死的';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM shop.shop_members WHERE user_id = ${lit(userId(CLERK.phone))} AND role = 'MEMBER') THEN
        RAISE EXCEPTION '子账号成员关系缺失';
    END IF;
    IF (SELECT count(*) FROM shop.shipping_templates) < 4 THEN
        RAISE EXCEPTION '运费模板不足 4 份';
    END IF;
    IF (SELECT count(*) FROM shop.shop_reviews WHERE status = 'PENDING') < 3 THEN
        RAISE EXCEPTION '入驻审核队列没铺起来';
    END IF;
    -- 首页外壳：词条不足 12 条时推荐条溢不出第二页，翻页按钮在浏览器里无从点起
    IF (SELECT count(*) FROM cms.recommend_tabs WHERE status = 'ENABLED') < 12 THEN
        RAISE EXCEPTION '推荐词条不足 12 条：首页推荐条翻页态演不出来';
    END IF;
    IF (SELECT count(*) FROM cms.nav_entries WHERE nav_key = 'home' AND status = 'ENABLED') < 13 THEN
        RAISE EXCEPTION '首页导航启用条目不足 13 条：空 subs / 兜底图标 / 超长标题等形态没灌进去';
    END IF;
    -- CMS 数据面只放合法行（V59 的口径）：CATEGORY 型的 target 必须命中真实启用类目，名字还得含该类目名。
    -- 脏 target 的兜底归 FeedIT 与 home/queries.test，不占运营看得见的数据面。
    IF EXISTS(
        SELECT 1 FROM (
            SELECT name AS w, target FROM cms.recommend_tabs WHERE target_type = 'CATEGORY'
            UNION ALL
            SELECT title, target FROM cms.nav_entries WHERE target_type = 'CATEGORY'
        ) q
        WHERE q.target !~ '^[0-9a-f-]{36}$'
           OR NOT EXISTS (SELECT 1 FROM product.categories c
                           WHERE c.id = (CASE WHEN q.target ~ '^[0-9a-f-]{36}$' THEN q.target::uuid END)
                             AND c.status = 'ENABLED'
                             AND q.w LIKE '%' || c.name || '%')
    ) THEN
        RAISE EXCEPTION 'CMS 里有 CATEGORY 行的名字或 target 对不上真实启用类目';
    END IF;
    FOR bad IN SELECT o.order_no FROM orders.orders o WHERE o.order_no LIKE 'DEMO-LIVE-%'
               AND o.pay_amount <> o.item_amount + o.shipping_fee - o.discount_amount
    LOOP RAISE EXCEPTION '金额不自洽：%', bad; END LOOP;
    FOR bad IN SELECT o.order_no FROM orders.orders o WHERE o.order_no LIKE 'DEMO-LIVE-%' AND o.paid_at IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM payment.payments p WHERE p.order_id = o.id)
    LOOP RAISE EXCEPTION '已付款却没有支付记录：%', bad; END LOOP;
    IF EXISTS(SELECT 1 FROM inventory.sku_stock WHERE stock < 0 OR frozen_stock < 0) THEN
        RAISE EXCEPTION '库存账本被写坏（出现负数）';
    END IF;
    IF EXISTS(SELECT 1 FROM inventory.sku_stock WHERE stock < frozen_stock) THEN
        RAISE EXCEPTION '冻结库存超过实物库存：可用库存成了负数';
    END IF;
    RAISE NOTICE '断言通过：账号 / 店铺归属 / 目录 / 运费 / 券 / 审核队列 / 首页内容 全部到位';
END $check$;`
}

const row = (role, who, note) => console.log(`  ${role.padEnd(4)}  ${who.padEnd(22)}  ${note}`)

function printSummary() {
    console.log(`\n演示账号（统一密码 ${PASSWORD}；admin 端仍是 admin/admin123）`)
    BUYERS.forEach((b) => row("买家", `${b.phone} ${b.nickname}`, `${b.tag} —— ${b.unlocks}`))
    SELLERS.forEach((s) =>
        row("卖家", `${s.phone} ${s.nickname}`, `${s.brand}系旗舰店 OWNER，可发商品/发货/处理售后`),
    )
    row(
        "子账号",
        `${CLERK.phone} ${CLERK.nickname}`,
        "星尘店 MEMBER，仅 PRODUCT_MANAGE + ORDER_FULFILL：演无权态",
    )
    STAFF.forEach((s) => row("员工", s.no, `${s.role} 岗，密码 ${PASSWORD}`))
    console.log(`
  5 家旗舰店各 +6 SPU（在售/库存紧张/售罄/仓库中/无规格/草稿未定价），各 6 笔可流转活单：
  待付款（券已锁）、待发货、临近超时未发货、在途可确认收货、仅退款待处理、退货待确认收货。
  买家「陈默」是刻意留的全空态号；「赵强」停用；苏晓的西藏地址会撞稻香店的「该地区不配送」拦截。
  历史快照（各终态 28 单）仍由 scripts/seed-buyer-demo.sql 提供，两者互不重叠。
  首页：导航补 7 种合法形态（空 subs / 缺 items 的组 / 不配 icon_key / 超长标题 / 只填标题 / 停用 / 另一导航位），
  词条补到溢出第二页——翻页按钮、只有 1 件的短流、0 上架的空流都能在浏览器里点出来；
  名实不符的 V13 种子由 V59 迁移校正，脏 target 一类不合规范的行由脚本断言挡在库外。`)
}

// main

async function main() {
    const dryRun = process.argv.includes("--dry-run")
    if (!dryRun && !(await portOpen(DB.port))) {
        console.error(
            `PostgreSQL :${DB.port} 连不上 —— 先跑 pnpm db:up（多半是 WSL 的 VM 被回收了）`,
        )
        process.exit(1)
    }
    const foundation = readFoundation()
    const catalog = buildCatalog(foundation)
    const cmsAnchors = readCmsAnchors()
    const prelude = `BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '180s';
SELECT pg_advisory_xact_lock(hashtext('seed-demo-v1'));`

    const mainSql = [
        prelude,
        buildAccounts(),
        buildOwnership(),
        catalog.sql,
        buildShipping(),
        buildCoupons(),
        buildBuyerSide(catalog),
        buildReviewQueue(),
        buildCms(cmsAnchors),
        buildAssertions(),
        "COMMIT;",
    ]
        .filter(Boolean)
        .join("\n\n")
    // 活单单独一段：它改库存账本与销量，重复灌没有意义，库里已有 DEMO-LIVE- 单就整段跳过
    // （不用 psql 的 `\if`：反引号里的命令会经 sh eval，带括号的 SQL 直接被 shell 咬死）
    const ordersSeeded =
        queryJson(
            `select json_agg(1) from (select 1 from orders.orders where order_no like 'DEMO-LIVE-%' limit 1) t`,
        ) !== null
    const ordersSql = [
        prelude,
        TEMP_HELPERS,
        `DO $g$ BEGIN IF current_database() <> ${lit(DB.name)} OR current_user <> ${lit(DB.user)} THEN RAISE EXCEPTION '本脚本只允许跑在本地 ${DB.name} 库'; END IF; END $g$;`,
        buildLiveOrders(catalog),
        buildAssertions(),
        "COMMIT;",
    ].join("\n")

    if (dryRun) {
        console.log(
            `-- ===== 前置数据 =====\n${mainSql}\n\n-- ===== 可流转活单 =====\n${ordersSeeded ? "-- 库里已有 DEMO-LIVE- 活单，实跑时这段整个跳过。" : ordersSql}`,
        )
        return
    }
    psql(mainSql)
    if (ordersSeeded)
        console.log("\n活单：库里已有 DEMO-LIVE- 前缀的单（含浏览器里流转过的），这段整个跳过。")
    else psql(ordersSql)
    printSummary()
}

try {
    await main()
} catch (error) {
    console.error(String(error?.message ?? error))
    process.exit(1)
}
