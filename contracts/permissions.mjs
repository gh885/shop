/**
 * 权限码注册表 —— 权限码词表的**唯一真相源**。
 *
 * 改这里，不改 `Permissions.java` / `permission-codes.ts`（那两份是 `pnpm permissions:gen` 的产物，
 * 手改的那一次会在下一个人重生成时静默消失）。`node scripts/permissions-codegen.mjs --check` 把
 * 生成物与这份表核回来。
 *
 * 这份表只管**词表**（有哪些码、属于哪个域、值等于名字）。它刻意不管另外两件事，因为那两件事的真相
 * 在别处、抄进来就是造第二份且当场开始腐烂：
 * - 「哪个岗位授予它」= `StaffRole` 枚举 + `SellerGrants.GRANTABLE`，由 `PermissionVocabularyTest`
 *   在运行时求值核文档表的「授予」列；
 * - 「哪个端点消费它」= `@RequirePermission` 注解扫描，核文档表的「消费端点」列。
 * 文档表 `docs/conventions/permission-codes.md` 是这两份扫描结果 + 本表词表的人读镜像，同样由门禁逐格核。
 *
 * 字段：
 * - domain   分节标题（生成物里是 `// admin 域…` / `// seller 域…`）；数组顺序 = 生成物顺序
 * - code     SCREAMING_SNAKE_CASE，键与值恒等（改名 = 契约破坏）
 * - doc      Java javadoc 与 TS 注释的正文，纯散文（不写 markdown 强调、不写 javadoc 标签）
 * - reserved 可选，为真时只登记词表、不产出常量：文档占位码（无 Java 常量、无挂点）
 *
 * 「值一个字符都没改」——权限码写错的代价不是报错，而是那道判权静默换了个形状，
 * 判码字面量只许住在 owner 里由门禁（`权限码字面量只许住在owner里`）核对。
 */

/** @typedef {{domain: string, code: string, doc: string, reserved?: boolean}} PermissionCard */

const ADMIN = "admin 域（平台员工，kind=staff）"
const SELLER = "seller 域（店铺子账号，店主可授予）"

export const PERMISSION_CODES = [
    {
        domain: ADMIN,
        code: "SHOP_REVIEW",
        doc: "入驻审核（通过与拒绝），岗位 REVIEWER",
    },
    {
        domain: ADMIN,
        code: "CMS_MANAGE",
        doc: "CMS 内容维护（banner/导航/推荐位），岗位 OPS",
    },
    {
        domain: ADMIN,
        code: "CATEGORY_MANAGE",
        doc: "平台类目维护，岗位 OPS",
    },
    {
        domain: ADMIN,
        code: "LOGISTICS_MANAGE",
        doc: "物流轨迹维护（补录节点、纠错），岗位 OPS",
    },
    {
        domain: ADMIN,
        code: "COUPON_OPS",
        doc: "平台优惠券运营（查询、作废），岗位 OPS",
    },
    {
        domain: ADMIN,
        code: "AUDIT_VIEW",
        doc: "操作审计查询（按操作人/对象/时间反查治理账本、导出），三个岗位都持有",
    },
    {
        domain: ADMIN,
        code: "SHOP_GOVERNANCE",
        doc: "平台侧店铺治理（封店/解封），岗位 REVIEWER + OPS",
    },
    {
        domain: ADMIN,
        code: "STAFF_MANAGE",
        doc: "员工与岗位管理（创建员工、分配岗位、禁用），仅 SUPER_ADMIN。禁用半边已由 AdminAccountController 消费；创建/分配岗位仍 P2",
    },
    {
        domain: SELLER,
        code: "PRODUCT_MANAGE",
        doc: "商品增删改、规格 SKU、上下架",
    },
    {
        domain: SELLER,
        code: "ORDER_FULFILL",
        doc: "卖家订单查看 + 发货",
    },
    {
        domain: SELLER,
        code: "ADDRESS_MANAGE",
        doc: "店铺发货/退货/揽收地址管理（面单寄件人）",
    },
    {
        domain: SELLER,
        code: "SHIPPING_MANAGE",
        doc: "运费模板（按收货地区与件数计费、不配送地区）",
    },
    {
        domain: SELLER,
        code: "COUPON_MANAGE",
        doc: "店铺优惠券（建券、停券、名额查看）",
    },
    {
        domain: SELLER,
        code: "MEMBER_MANAGE",
        doc: "成员管理（端点实际由 ShopService.requireOwner 把关，仅店主）——文档占位，无 Java 常量、无挂点",
        reserved: true,
    },
    {
        domain: SELLER,
        code: "SHOP_MANAGE",
        doc: "店铺设置 / 注销——文档占位，端点当前不存在，无 Java 常量、无挂点",
        reserved: true,
    },
]
