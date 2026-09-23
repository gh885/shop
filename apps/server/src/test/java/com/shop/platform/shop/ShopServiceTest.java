package com.shop.platform.shop;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.when;

import com.shop.platform.account.api.UserReadQuery;
import com.shop.platform.common.BusinessException;
import com.shop.platform.shop.mapper.ShopMapper;
import com.shop.platform.shop.mapper.ShopMember;
import com.shop.platform.shop.mapper.ShopMemberMapper;
import com.shop.platform.shop.mapper.ShopReviewMapper;
import com.shop.platform.shop.model.MemberRole;
import com.shop.platform.shop.model.MemberStatus;
import com.shop.platform.shop.service.ShopMemberItem;
import com.shop.platform.shop.service.ShopService;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * 店铺成员号码可见性单测（GEN-51，与 ORD-62 同口径）：列表只给本人明文、明文逐条索取的闸门。
 *
 * <p>成员生命周期（邀请/确认/移除/调权）归 {@code ShopInviteIT} 的真库链路，这里只钉号码这一件事。
 */
@ExtendWith(MockitoExtension.class)
class ShopServiceTest {

    private final UUID shopId = UUID.randomUUID();

    private final UUID ownerId = UUID.randomUUID();

    private final UUID ownerMemberId = UUID.randomUUID();

    private final UUID otherMemberId = UUID.randomUUID();

    private final UUID otherUserId = UUID.randomUUID();

    @Mock
    private ShopMapper shopMapper;

    @Mock
    private ShopMemberMapper shopMemberMapper;

    @Mock
    private ShopReviewMapper shopReviewMapper;

    @Mock
    private UserReadQuery userReadQuery;

    @InjectMocks
    private ShopService shopService;

    private ShopMember member(UUID id, UUID userId, UUID shop) {
        return ShopMember.builder()
                .id(id)
                .shopId(shop)
                .userId(userId)
                .role(MemberRole.MEMBER)
                .status(MemberStatus.ACTIVE)
                .permissions(List.of())
                .build();
    }

    @Nested
    class 成员列表号码 { // GET /shops/{shopId}/members

        /** 本人那行给明文（自己的号没必要瞒自己），别人那行给掩码：一屏列表不该是一屏号码 */
        @Test
        void 本人明文_他人掩码() {
            when(shopMemberMapper.isActiveMember(shopId, ownerId)).thenReturn(true);
            when(shopMemberMapper.selectByShop(shopId))
                    .thenReturn(List.of(
                            member(ownerMemberId, ownerId, shopId), member(otherMemberId, otherUserId, shopId)));
            when(userReadQuery.phonesByIds(anyList()))
                    .thenReturn(Map.of(ownerId, "13800001234", otherUserId, "13900005678"));

            List<ShopMemberItem> items = shopService.members(shopId, ownerId);

            assertThat(items).extracting(ShopMemberItem::phone).containsExactly("13800001234", "139****5678");
        }

        @Test
        void 非本店成员_403() {
            when(shopMemberMapper.isActiveMember(shopId, otherUserId)).thenReturn(false);

            assertThatThrownBy(() -> shopService.members(shopId, otherUserId))
                    .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                            .isEqualTo(403));
        }
    }

    @Nested
    class 查看成员号码明文 { // POST /shops/{shopId}/members/{memberId}/phone

        @Test
        void 返回明文() {
            when(shopMemberMapper.isActiveMember(shopId, ownerId)).thenReturn(true);
            when(shopMemberMapper.selectById(otherMemberId)).thenReturn(member(otherMemberId, otherUserId, shopId));
            when(userReadQuery.phoneById(otherUserId)).thenReturn(Optional.of("13900005678"));

            assertThat(shopService.memberPhone(shopId, otherMemberId, ownerId)).isEqualTo("13900005678");
        }

        /** 别店的成员行拿不到号，且与「这行不存在」同一话术：不泄露「某 id 是不是别店成员」 */
        @Test
        void 跨店索取_404() {
            when(shopMemberMapper.isActiveMember(shopId, ownerId)).thenReturn(true);
            when(shopMemberMapper.selectById(otherMemberId))
                    .thenReturn(member(otherMemberId, otherUserId, UUID.randomUUID()));

            assertThatThrownBy(() -> shopService.memberPhone(shopId, otherMemberId, ownerId))
                    .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                            .isEqualTo(404));
        }

        @Test
        void 非本店成员_403() {
            when(shopMemberMapper.isActiveMember(shopId, otherUserId)).thenReturn(false);

            assertThatThrownBy(() -> shopService.memberPhone(shopId, otherMemberId, otherUserId))
                    .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                            .isEqualTo(403));
        }
    }
}
