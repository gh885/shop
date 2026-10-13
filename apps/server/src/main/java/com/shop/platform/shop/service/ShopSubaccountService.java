package com.shop.platform.shop.service;

import com.shop.platform.account.api.SubaccountCommand;
import com.shop.platform.account.api.SubaccountReadQuery;
import com.shop.platform.account.api.SubaccountSummary;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Validate;
import com.shop.platform.infra.observability.BizEvent;
import com.shop.platform.shop.mapper.ShopMemberMapper;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 店主侧的「子账号管理」：建号 / 列表 / 改权 / 停启用 / 重置口令 / 移除 / 取号码明文。
 *
 * <p>为什么不把这几个端点直接做成账号模块的接口：闸门是「你是不是这个店的店主」，那是店铺资源的归属判定，
 * 只有 shop 模块手里有 {@code shop_members} 的 OWNER 行。所以这一层只做两件事——<b>过店主闸门</b>，
 * 然后<b>把动词交给 account :: api</b>；凭证本身的不变式（登录名唯一、口令策略、激活状态机）不住这里。
 *
 * <p>子账号不是「店铺成员行」：它与店的绑定是凭证上的 {@code shop_id}，所以本类不做任何
 * {@code shop_members} 的写操作——那张表现在只承载店主身份（一人一店的名额与归属）。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ShopSubaccountService {

    private final ShopMemberMapper shopMemberMapper;
    private final SubaccountReadQuery subaccountReadQuery;
    private final SubaccountCommand subaccountCommand;

    /** 建号（落待激活，员工验过本人手机号后才能用） */
    @Transactional
    public SubaccountItem create(
            UUID shopId, UUID ownerId, String loginName, String phone, String password, List<String> permissions) {
        requireOwner(shopId, ownerId);
        return SubaccountItem.masked(subaccountCommand.create(shopId, loginName, phone, password, permissions));
    }

    /** 本店子账号列表（号码掩码） */
    public List<SubaccountItem> list(UUID shopId, UUID ownerId) {
        requireOwner(shopId, ownerId);
        return subaccountReadQuery.listByShop(shopId).stream()
                .map(SubaccountItem::masked)
                .toList();
    }

    /** 改权（全量替换），下一请求即生效 */
    @Transactional
    public void replacePermissions(UUID shopId, UUID ownerId, UUID subaccountId, List<String> permissions) {
        requireOwner(shopId, ownerId);
        requireInShop(shopId, subaccountId);
        subaccountCommand.replacePermissions(subaccountId, permissions);
    }

    /** 停用 / 启用（启用对没验过号的行回待激活，见 account 侧的 setEnabled） */
    @Transactional
    public void setEnabled(UUID shopId, UUID ownerId, UUID subaccountId, boolean enabled) {
        requireOwner(shopId, ownerId);
        requireInShop(shopId, subaccountId);
        subaccountCommand.setEnabled(subaccountId, enabled);
    }

    /** 店主重置口令（子账号没有短信自助找回） */
    @Transactional
    public void resetPassword(UUID shopId, UUID ownerId, UUID subaccountId, String password) {
        requireOwner(shopId, ownerId);
        requireInShop(shopId, subaccountId);
        subaccountCommand.resetPassword(subaccountId, password);
    }

    /** 移除：删凭证行（与「停用」的区别见 account 侧 remove） */
    @Transactional
    public void remove(UUID shopId, UUID ownerId, UUID subaccountId) {
        requireOwner(shopId, ownerId);
        requireInShop(shopId, subaccountId);
        subaccountCommand.remove(subaccountId);
    }

    /**
     * 取号码明文：列表里恒掩码，真要拨号的场景走这一跳，逐条索取、每次留痕（号码本身不进事件）。
     * 与列表同档闸门，别店的子账号与不存在的子账号同为 404。
     */
    public String revealPhone(UUID shopId, UUID ownerId, UUID subaccountId) {
        requireOwner(shopId, ownerId);
        SubaccountSummary row = requireInShop(shopId, subaccountId);
        BizEvent.of("shop_subaccount.phone_revealed")
                .put("shop_id", shopId)
                .put("subaccount_id", subaccountId)
                .put("operator_id", ownerId)
                .emit();
        return row.phone();
    }

    // 内部：店主闸门（子账号管理是店主专属，与邀请/移除同一条 403 话术）
    private void requireOwner(UUID shopId, UUID ownerId) {
        if (!shopMemberMapper.isActiveOwner(shopId, ownerId)) {
            throw BusinessException.forbidden("只有店主可以执行该操作");
        }
    }

    /** 目标子账号必须属于本店：别店的行与不存在的行同为 404「子账号不存在」 */
    private SubaccountSummary requireInShop(UUID shopId, UUID subaccountId) {
        return Validate.present(subaccountReadQuery.findInShop(subaccountId, shopId), "子账号不存在");
    }
}
