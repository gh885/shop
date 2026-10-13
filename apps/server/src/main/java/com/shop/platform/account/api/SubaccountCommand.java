package com.shop.platform.account.api;

import com.shop.platform.account.service.SubaccountService;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 子账号写命令（跨模块消费）：店铺侧的店主动作经这里落到账号域。
 *
 * <p>为什么写入口只此一处而不是店铺侧直接写表：子账号这一行同时是<b>凭证</b>（口令哈希、登录名唯一性、
 * 激活状态机）与<b>店铺授权</b>（权限码）。凭证那半边的不变式住在账号域（口令策略、唯一索引、
 * 激活必须验号），店铺侧只该说「谁、哪个店、做什么」，所以两个模块的接口停在 {@code create / setEnabled /
 * replacePermissions / resetPassword / remove} 这五个动词上。
 *
 * <p>店主闸门（「你是不是这个店的店主」）不在这里：那是店铺资源的归属判定，住在 shop 模块的 service。
 * 本命令假定调用方已经过了闸门。
 */
@Component
@RequiredArgsConstructor
public class SubaccountCommand {

    private final SubaccountService subaccountService;

    /** 建号（落 PENDING_ACTIVATION，等员工验号激活） */
    public SubaccountSummary create(
            UUID shopId, String loginName, String phone, String rawPassword, List<String> permissions) {
        return SubaccountSummary.from(subaccountService.create(shopId, loginName, phone, rawPassword, permissions));
    }

    /** 全量替换权限码（白名单外的码 400） */
    public void replacePermissions(UUID subaccountId, List<String> permissions) {
        subaccountService.replacePermissions(subaccountId, permissions);
    }

    /** 停用 / 启用；启用时没验过号的行回待激活，不会被「启用」抬成可用 */
    public void setEnabled(UUID subaccountId, boolean enabled) {
        subaccountService.setEnabled(subaccountId, enabled);
    }

    /** 店主重置口令（子账号没有短信自助找回） */
    public void resetPassword(UUID subaccountId, String rawPassword) {
        subaccountService.resetPassword(subaccountId, rawPassword);
    }

    /** 移除：删行，凭证不复存在 */
    public void remove(UUID subaccountId) {
        subaccountService.remove(subaccountId);
    }
}
