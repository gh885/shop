import type { AddressView, CategoryTreeNode } from "@shop/api/sdk"

/**
 * 契约形状测试夹具：只放「返回类型是 @shop/api/sdk 契约类型、且 ≥2 文件共用默认值」的形状，组件私有局部形状各随其主不收。
 * 默认值取「合法且中性」一档，用例只断言自己关心的字段；id 不统一发（各测试认自己那批 uuid，由调用方 wrapper 传入）。
 * 另开 `@shop/test-utils/fixtures` 子入口：纯逻辑测试只要夹具，从 barrel 进会连带把 msw/RTL/jest-dom 拉进模块图、白付几百毫秒。
 */

/** 类目树节点：默认「一级、启用、无图标、没有子节点」。parentId 全零 uuid = 本仓库「一级类目、上面没有父」的表示，别与 admin 拍平索引时给一级挂的合成 key `CATEGORY_ROOT_ID`（`"__category_root__"`）混用。 */
export function makeCategoryNode(
    overrides: Partial<CategoryTreeNode> & Pick<CategoryTreeNode, "id" | "name">,
): CategoryTreeNode {
    return {
        parentId: "00000000-0000-0000-0000-000000000000",
        level: 1,
        sort: 0,
        status: "ENABLED",
        leaf: false,
        mountable: true,
        code: "",
        children: [],
        ...overrides,
    }
}

/** 收货地址视图：默认「上海、默认地址」。归 AddressFormDialog 及以后可能的地址相关测试共用 */
export function makeAddress(overrides: Partial<AddressView> = {}): AddressView {
    return {
        id: "6f1a5b1e-2f3c-4a5d-8e9f-000000000001",
        receiverName: "张三",
        phone: "13800000000",
        regionCode: "310101",
        province: "上海市",
        city: "上海市",
        district: "黄浦区",
        detail: "南京东路 1 号",
        label: "HOME",
        isDefault: true,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
        ...overrides,
    }
}
