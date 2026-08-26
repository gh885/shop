package com.shop.platform.common;

import java.util.List;

/**
 * 权限码契约（前后端共同语言）。唯一真相源：docs/permission-implementation.md「权限码表」。
 *
 * <p>规则：SCREAMING_SNAKE_CASE；只增不改名不删除（改名 = 契约破坏）。
 * 放 common 是因为 admin/cms/product 多个模块的 controller 都要引用，
 * 放任何单模块都会制造跨模块依赖。
 */
public final class Permissions {

    // ---- admin 域（平台员工，kind=staff） ----

    /** 入驻审核（通过与拒绝），岗位 REVIEWER */
    public static final String SHOP_REVIEW = "SHOP_REVIEW";

    /** CMS 内容维护（banner/导航/推荐位），岗位 OPS */
    public static final String CMS_MANAGE = "CMS_MANAGE";

    /** 平台类目维护，岗位 OPS */
    public static final String CATEGORY_MANAGE = "CATEGORY_MANAGE";

    /** 员工与岗位管理（创建员工、分配岗位、禁用），仅 SUPER_ADMIN。消费端 P2（员工管理 CRUD） */
    public static final String STAFF_MANAGE = "STAFF_MANAGE";

    // ---- seller 域（店铺子账号，P1 启用标注） ----

    /** 商品增删改、规格 SKU、上下架 */
    public static final String PRODUCT_MANAGE = "PRODUCT_MANAGE";

    /** 卖家订单查看 + 发货 */
    public static final String ORDER_FULFILL = "ORDER_FULFILL";

    /**
     * 全量权限码（文档顺序）。SUPER_ADMIN 在 me 出参展开成这份清单给前端；
     * 判权内部仍用通配符（见 PermissionResolver.WILDCARD），两处新增码要同步。
     */
    public static List<String> all() {
        return List.of(SHOP_REVIEW, CMS_MANAGE, CATEGORY_MANAGE, STAFF_MANAGE, PRODUCT_MANAGE, ORDER_FULFILL);
    }

    private Permissions() {}
}
