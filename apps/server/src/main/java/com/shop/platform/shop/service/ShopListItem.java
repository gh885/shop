package com.shop.platform.shop.service;

import com.shop.platform.shop.mapper.Shop;

/**
 * 我的店铺列表行：店铺本体 + 最近一次驳回理由。
 *
 * <p>理由只在店铺当前状态为 REJECTED 时非空——审核员写驳回理由的唯一读者是卖家自己（补材料重提），
 * 已通过/已封禁的店不带历史理由，免得列表上挂一条早已作废的批注。
 */
public record ShopListItem(Shop shop, String rejectReason) {}
