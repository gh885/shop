package com.shop.platform.shop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.shop.platform.common.BusinessException;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.mapper.ShopMemberMapper;
import com.shop.platform.shop.model.MemberStatus;
import com.shop.platform.shop.service.ShopService;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 店铺邀请的两段式收口集成验证（真库）：PENDING 邀请既能被被邀请人拒绝（decline），也能被店主撤回
 * （removeMember 删 PENDING 行），两条路都是<b>删行</b>不留 DECLINED 态——同店同人受
 * {@code uk_shop_members_shop_user} 唯一索引约束，删行后「再次邀请」天然可用，「我的待确认邀请」也不再挂。
 *
 * <p>拒绝只能本人（别人的邀请 ID 与不存在的行同为 404「邀请不存在或已失效」，不给两种答案）、只能拒 PENDING
 * （已同意后 decline 拿 409，拒绝不是退店通道）。
 */
@SpringBootTest
class ShopInviteIT extends IntegrationTestSupport {

    @Autowired
    private ShopService shopService;

    @Autowired
    private ShopMemberMapper shopMemberMapper;

    private final UUID ownerId = UUID.randomUUID();

    /** 被邀请人（真实账号：invite 按手机号找人，幽灵 uuid 找不到就 400） */
    private final UUID inviteeId = UUID.randomUUID();

    /** 另一个买家：验证「不能替别人拒绝」 */
    private final UUID strangerId = UUID.randomUUID();

    private final String inviteePhone = "13900001111";

    private UUID shopId;

    /** 开店 + 两个真实账号 + 清理登记；返回被邀请人可被找到的手机号 */
    private void seed() {
        Shop shop = shopService.createShop(ownerId, "邀请治理店", null);
        shopId = shop.getId();
        db.seedActiveUser(inviteeId, inviteePhone);
        db.seedActiveUser(strangerId, "13900002222");
        db.onDeleteShopSide(shopId);
    }

    /** 店主发出邀请，返回成员行 id（PENDING） */
    private UUID invite() {
        var member = shopService.invite(shopId, ownerId, inviteePhone, List.of());
        assertNotNull(member.getId());
        assertEquals(MemberStatus.PENDING, member.getStatus());
        return member.getId();
    }

    private String memberStatus(UUID memberId) {
        List<String> statuses = jdbc.queryForList(
                "SELECT status FROM shop.shop_members WHERE id = ?::uuid", String.class, memberId.toString());
        return statuses.isEmpty() ? null : statuses.getFirst();
    }

    @Test
    void 拒绝邀请_待确认列表清空_可被再次邀请() {
        seed();
        UUID memberId = invite();
        assertEquals(1, shopService.myInvites(inviteeId).size());

        shopService.declineInvite(memberId, inviteeId);

        // 1. 删行：既不在「我的待确认邀请」上挂着，也不占同店同人的唯一索引坑位
        assertNull(memberStatus(memberId));
        assertEquals(0, shopService.myInvites(inviteeId).size());
        // 2. 再次邀请成功（新的 PENDING 行，旧的已不存在）
        UUID again = invite();
        assertEquals("PENDING", memberStatus(again));
        assertEquals(1, shopService.myInvites(inviteeId).size());
    }

    /**
     * 别人替我裁决：accept 与 decline 都拿「邀请不存在或已失效」404，且邀请仍是 PENDING。
     * 钉的是同一句话、同一个状态码——只要有一侧给出 400/403，就把「这行存在」说给了探测者。
     */
    @Test
    void 他人代裁决_与缺席同一句话_邀请仍待确认() {
        seed();
        UUID memberId = invite();

        BusinessException declined =
                assertThrows(BusinessException.class, () -> shopService.declineInvite(memberId, strangerId));
        BusinessException accepted =
                assertThrows(BusinessException.class, () -> shopService.acceptInvite(memberId, strangerId));

        assertEquals(404, declined.getHttpStatus());
        assertEquals(404, accepted.getHttpStatus());
        assertEquals("邀请不存在或已失效", declined.getDetail());
        assertEquals(accepted.getDetail(), declined.getDetail()); // 两条路的回答一字不差
        assertEquals("PENDING", memberStatus(memberId)); // 别人碰不掉发给我的邀请
    }

    /** 已同意后没有「拒绝」这回事：409，且绝不因为口径混乱把 ACTIVE 成员删掉（退店只有店主移除一条路） */
    @Test
    void 已同意加入_再拒绝_409且成员行不被删() {
        seed();
        UUID memberId = invite();
        shopService.acceptInvite(memberId, inviteeId);

        BusinessException ex =
                assertThrows(BusinessException.class, () -> shopService.declineInvite(memberId, inviteeId));

        assertEquals(409, ex.getHttpStatus());
        assertEquals("ACTIVE", memberStatus(memberId));
    }

    /** 重复拒绝：行已删，无从区分「我拒过」与「从来没有这条」→ 与 accept 同一缺席口径 404（不返 204，那等于承认存在过） */
    @Test
    void 重复拒绝_404() {
        seed();
        UUID memberId = invite();
        shopService.declineInvite(memberId, inviteeId);

        BusinessException again =
                assertThrows(BusinessException.class, () -> shopService.declineInvite(memberId, inviteeId));

        assertEquals(404, again.getHttpStatus());
        assertEquals("邀请不存在或已失效", again.getDetail());
    }

    /** 店主撤回邀请 = removeMember 删 PENDING 行（同一条删除路径的第二种语义）：撤回后待确认列表清空、可再邀 */
    @Test
    void 店主撤回待确认邀请_对方列表清空_可再次邀请() {
        seed();
        UUID memberId = invite();

        shopService.removeMember(shopId, memberId, ownerId);

        assertNull(memberStatus(memberId));
        assertEquals(0, shopService.myInvites(inviteeId).size());
        assertNotNull(invite());
    }

    /** 成员列表：撤回/拒绝后不再有那条待确认行，店主自己的 OWNER 行不受影响 */
    @Test
    void 邀请被拒后_成员列表只剩店主() {
        seed();
        UUID memberId = invite();
        assertEquals(2, shopService.members(shopId, ownerId).size());

        shopService.declineInvite(memberId, inviteeId);

        assertEquals(1, shopService.members(shopId, ownerId).size());
    }

    /**
     * 确认是条件转移：行已被店主撤回（删 PENDING）后再转移命中 0 行。曾是读整行、setStatus、updateById——
     * 0 行也当成功，前端收到「已加入」而库里没有这个人。串行把「读 → 对方删 → 我写」摆出来就是那个并发窗口。
     */
    @Test
    void 邀请被撤回后_确认转移命中0行_不留幽灵成员() {
        seed();
        UUID memberId = invite();
        shopService.removeMember(shopId, memberId, ownerId);

        assertEquals(0, shopMemberMapper.activatePending(memberId, OffsetDateTime.now()));
        assertNull(memberStatus(memberId));
    }

    /** 重复确认：第二次抢不到 PENDING → ACTIVE 的转移，409「该邀请已处理」，成员行仍是 ACTIVE 不被动过 */
    @Test
    void 重复确认_409且成员行仍ACTIVE() {
        seed();
        UUID memberId = invite();
        shopService.acceptInvite(memberId, inviteeId);

        BusinessException again =
                assertThrows(BusinessException.class, () -> shopService.acceptInvite(memberId, inviteeId));

        assertEquals(409, again.getHttpStatus());
        assertEquals("该邀请已处理", again.getDetail());
        assertEquals("ACTIVE", memberStatus(memberId));
    }
}
