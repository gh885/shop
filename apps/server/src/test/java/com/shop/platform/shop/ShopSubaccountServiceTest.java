package com.shop.platform.shop;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.shop.platform.account.api.SubaccountCommand;
import com.shop.platform.account.api.SubaccountReadQuery;
import com.shop.platform.account.api.SubaccountStatus;
import com.shop.platform.account.api.SubaccountSummary;
import com.shop.platform.common.BusinessException;
import com.shop.platform.shop.mapper.ShopMemberMapper;
import com.shop.platform.shop.service.ShopSubaccountService;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * 子账号管理的单测：店主闸门 + 号码可见性（GEN-51 / ACC-79）。
 *
 * <p>凭证本身的不变式（登录名唯一、口令策略、激活状态机）归 account 域，
 * 端到端链路归 {@code ShopSubaccountIT} 的真库用例——这里只钉「谁有权管」与「号码怎么出」。
 */
@ExtendWith(MockitoExtension.class)
class ShopSubaccountServiceTest {

    private final UUID shopId = UUID.randomUUID();

    private final UUID ownerId = UUID.randomUUID();

    private final UUID outsiderId = UUID.randomUUID();

    private final UUID subaccountId = UUID.randomUUID();

    @Mock
    private ShopMemberMapper shopMemberMapper;

    @Mock
    private SubaccountReadQuery subaccountReadQuery;

    @Mock
    private SubaccountCommand subaccountCommand;

    @InjectMocks
    private ShopSubaccountService service;

    private SubaccountSummary row(UUID shop) {
        return new SubaccountSummary(
                subaccountId,
                shop,
                "kefu01",
                "13900005678",
                SubaccountStatus.ACTIVE,
                List.of("ORDER_FULFILL"),
                OffsetDateTime.now(),
                OffsetDateTime.now());
    }

    @Test
    void 列表_号码一律掩码() {
        when(shopMemberMapper.isActiveOwner(shopId, ownerId)).thenReturn(true);
        when(subaccountReadQuery.listByShop(shopId)).thenReturn(List.of(row(shopId)));

        var items = service.list(shopId, ownerId);

        assertThat(items).extracting(i -> i.phone()).containsExactly("139****5678");
    }

    @Test
    void 非店主_列表403() {
        when(shopMemberMapper.isActiveOwner(shopId, outsiderId)).thenReturn(false);

        assertThatThrownBy(() -> service.list(shopId, outsiderId))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                        .isEqualTo(403));
    }

    /** 列表恒掩码，明文只从逐条索取那一跳出，且必须过与列表同一道店主闸门 */
    @Test
    void 索取号码明文_走店主闸门后返回原文() {
        when(shopMemberMapper.isActiveOwner(shopId, ownerId)).thenReturn(true);
        when(subaccountReadQuery.findInShop(subaccountId, shopId)).thenReturn(Optional.of(row(shopId)));

        assertThat(service.revealPhone(shopId, ownerId, subaccountId)).isEqualTo("13900005678");
    }

    /** 别店的子账号与不存在的子账号同一句 404：不泄露「这个 id 是不是别家店的」 */
    @Test
    void 跨店索取_404且不走到取号那一步() {
        when(shopMemberMapper.isActiveOwner(shopId, ownerId)).thenReturn(true);
        when(subaccountReadQuery.findInShop(subaccountId, shopId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.revealPhone(shopId, ownerId, subaccountId))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                        .isEqualTo(404));
    }

    @Test
    void 非店主_索取号码403() {
        when(shopMemberMapper.isActiveOwner(shopId, outsiderId)).thenReturn(false);

        assertThatThrownBy(() -> service.revealPhone(shopId, outsiderId, subaccountId))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                        .isEqualTo(403));
    }

    @Test
    void 建号_过闸门后委派给账号域命令() {
        when(shopMemberMapper.isActiveOwner(shopId, ownerId)).thenReturn(true);
        when(subaccountCommand.create(any(), any(), any(), any(), any())).thenReturn(row(shopId));

        var item = service.create(shopId, ownerId, "kefu01", "13900005678", "Password123", List.of("ORDER_FULFILL"));

        assertThat(item.loginName()).isEqualTo("kefu01");
        verify(subaccountCommand)
                .create(eq(shopId), eq("kefu01"), eq("13900005678"), eq("Password123"), eq(List.of("ORDER_FULFILL")));
    }

    @Test
    void 非本店子账号_改权404且不落写() {
        when(shopMemberMapper.isActiveOwner(shopId, ownerId)).thenReturn(true);
        when(subaccountReadQuery.findInShop(subaccountId, shopId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.replacePermissions(shopId, ownerId, subaccountId, List.of()))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                        .isEqualTo(404));
    }
}
