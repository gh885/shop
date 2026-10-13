package com.shop.platform.account.api;

import java.util.List;
import java.util.UUID;

/**
 * 子账号会话：卖家侧过滤器每请求装载判权所需的全部东西（凭证自带店铺 + 被授予的权限码）。
 *
 * <p>只包含 ACTIVE 行——停用与待激活都取不到会话（README 的口径：停用是「保留凭证、立即失效」，
 * 失效靠的就是这个查询每请求重跑，不吃缓存）。
 */
public record SubaccountSession(UUID id, UUID shopId, List<String> permissions) {}
