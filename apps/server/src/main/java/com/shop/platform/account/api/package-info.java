/**
 * Account 模块对外命名接口：跨模块只读查询——{@code UserReadQuery}（手机号拼装 / 按手机号找人，shop 成员与审核用；
 * 状态闸门谓词 {@code isActive}，order 下单校验买家账号用）、
 * {@code AddressReadQuery}（order 结算取收货快照 {@code AddressSnapshotView}）。
 */
@org.springframework.modulith.NamedInterface("api")
package com.shop.platform.account.api;
