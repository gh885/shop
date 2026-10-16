package com.shop.platform.common;

import java.util.List;

/**
 * 权限码契约（前后端共同语言）：全后端唯一的码定义处，注解码位只引用这里的常量，不再各抄一遍字面量。
 *
 * <p><b>本文件由 {@code node scripts/contracts/permissions-codegen.mjs} 从 {@code contracts/permissions.yaml}
 * 生成，不要手改</b>——手改的那一次会在下一个人跑 {@code pnpm permissions:gen} 时静默消失。
 * 加一个码或改一句说明都改那份注册表，顺序 = 数组顺序 = 文档表顺序；{@code --check} 把生成物与注册表
 * 核回来（按语义比，不按字节：排版归 spotless 管）。
 *
 * <p>规则：SCREAMING_SNAKE_CASE；值恒等于名；只增不改名不删除（改名 = 契约破坏）。
 * 放 common 是因为 shop/account/cms/product 多个模块的 controller 都要引用，放任何单模块都会制造跨模块依赖。
 *
 * <p>这份表只管词表。谁授予某码 = {@code StaffRole} + {@code SellerGrants}、谁消费某码 = {@code @RequirePermission}
 * 扫描，两件事的真相不住这里，由 {@code PermissionVocabularyTest} 在运行时求出并核文档表
 * （{@code docs/conventions/permission-codes.md}，那张表是这三处——注册表 + 两份扫描——的人读镜像）。
 */
public final class Permissions {

    // —— admin 域（平台员工，kind=staff） ——

    /**
     * 入驻审核（通过与拒绝），岗位 REVIEWER
     */
    public static final String SHOP_REVIEW = "SHOP_REVIEW";

    /**
     * CMS 内容维护（banner/导航/推荐位），岗位 OPS
     */
    public static final String CMS_MANAGE = "CMS_MANAGE";

    /**
     * 平台类目维护，岗位 OPS
     */
    public static final String CATEGORY_MANAGE = "CATEGORY_MANAGE";

    /**
     * 物流轨迹维护（补录节点、纠错），岗位 OPS
     */
    public static final String LOGISTICS_MANAGE = "LOGISTICS_MANAGE";

    /**
     * 平台优惠券运营（查询、作废），岗位 OPS
     */
    public static final String COUPON_OPS = "COUPON_OPS";

    /**
     * 操作审计查询（按操作人/对象/时间反查治理账本、导出），三个岗位都持有
     */
    public static final String AUDIT_VIEW = "AUDIT_VIEW";

    /**
     * 前端遥测排查（按影响会话数排序的问题聚合、事件明细与原件，含 userId/sessionId），岗位 OPS
     */
    public static final String RUM_VIEW = "RUM_VIEW";

    /**
     * 平台侧店铺治理（封店/解封），岗位 REVIEWER + OPS
     */
    public static final String SHOP_GOVERNANCE = "SHOP_GOVERNANCE";

    /**
     * 员工与岗位管理（创建员工、分配岗位、禁用），仅 SUPER_ADMIN。禁用半边已由 AdminAccountController 消费；创建/分配岗位仍 P2
     */
    public static final String STAFF_MANAGE = "STAFF_MANAGE";

    // —— seller 域（店铺子账号，店主可授予） ——

    /**
     * 商品增删改、规格 SKU、上下架
     */
    public static final String PRODUCT_MANAGE = "PRODUCT_MANAGE";

    /**
     * 卖家订单查看 + 发货
     */
    public static final String ORDER_FULFILL = "ORDER_FULFILL";

    /**
     * 店铺发货/退货/揽收地址管理（面单寄件人）
     */
    public static final String ADDRESS_MANAGE = "ADDRESS_MANAGE";

    /**
     * 运费模板（按收货地区与件数计费、不配送地区）
     */
    public static final String SHIPPING_MANAGE = "SHIPPING_MANAGE";

    /**
     * 店铺优惠券（建券、停券、名额查看）
     */
    public static final String COUPON_MANAGE = "COUPON_MANAGE";

    /**
     * 全量权限码（注册表 / 文档表顺序，不含 reserved 占位码）。SUPER_ADMIN 在 me 出参展开成这份清单给前端；
     * 判权内部仍用通配符，两处新增码要同步——这条同步现在由 codegen 与门禁保证，不再由注释管。
     */
    public static List<String> all() {
        return List.of(
                SHOP_REVIEW,
                CMS_MANAGE,
                CATEGORY_MANAGE,
                LOGISTICS_MANAGE,
                COUPON_OPS,
                AUDIT_VIEW,
                RUM_VIEW,
                SHOP_GOVERNANCE,
                STAFF_MANAGE,
                PRODUCT_MANAGE,
                ORDER_FULFILL,
                ADDRESS_MANAGE,
                SHIPPING_MANAGE,
                COUPON_MANAGE);
    }

    private Permissions() {}
}
