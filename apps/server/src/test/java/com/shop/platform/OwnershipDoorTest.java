package com.shop.platform;

import static org.assertj.core.api.Assertions.assertThat;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaMethodCall;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * 归属闸门的形状：「这个资源不归你」只能由 {@link com.shop.platform.common.Validate} 的那道门说出口。
 *
 * <p>这条口径本来写在十几条业务规则里（PRD-25 / ORD-01 / CART-05 / CPN-10 / AFS-06 / ACC-47 / ACC-79…：
 * 缺席与越权同一句话、同一个 404），但实现各写一遍就会各挑一个状态码——本仓库真出现过
 * 跨店商品 403「商品不属于当前店铺」、跨店成员 400「成员不属于该店铺」、别人的邀请 400「不能确认发给别人的邀请」，
 * 三者都替调用方确认了「这行存在、只是别家的」，资源 ID 因此可被枚举。
 *
 * <p>没有例外清单。邀请门曾以「400 那句对误点链接的人是有效信息」为由留在闸门外，本轮收进来：
 * 一条口径要靠例外清单维持，下一个人就会照清单抄第二份。
 *
 * <p>两条规则（都是编译产物级的形状检查，不看语义所以不会误放也基本不误伤）：
 * <ol>
 *   <li><b>越权不说 403</b>：403 只许出现在「上下文/角色」那几道门里（缺店铺上下文、不是本店成员、账号被禁用、
 *       webhook 验签不过）——资源归属不是这类。这条能扫全靠 403 只有一个具名出口：本轮把 7 处
 *       {@code new BusinessException(403, …)} 一并收进 {@code BusinessException.forbidden}，
 *       否则构造器里的状态码常量在字节码里只是个 int，规则看不见；
 *   <li><b>归属判定不自己决定状态码</b>：一个方法里同时出现「取归属列（shopId/userId/ownerId）+ 在 UUID 上
 *       {@code equals} + {@code Validate.isTrue}」，就是在门外手搓一道归属门，必须改用
 *       {@code Validate.owned/requireOwned}。
 * </ol>
 *
 * <p>两条都配了「反证不空转」的断言，因为这类门禁最容易<b>假绿</b>：ArchUnit 的 {@code JavaAccess.getOwner()}
 * 返回的是发起方那个 code unit（不是被调类），拿它比类名永远不相等——于是「违规清单为空」看着全绿，
 * 其实一条都没扫到。比对被调类要用 {@code getTargetOwner()}；而 JDK 类型不在导入范围内，
 * 所以「比较了归属列」这条只能认「在 UUID 上调 equals」（枚举 / 布尔 / 字符串的 equals 是状态判断，不是归属）。
 */
class OwnershipDoorTest {

    /** 允许说 403 的门：挡的都是「你有没有资格在这个上下文里操作」，不是「这条资源归谁」 */
    private static final Set<String> FORBIDDEN_DOOR_OWNERS = Set.of(
            "com.shop.platform.infra.web.CurrentShopArgumentResolver",
            "com.shop.platform.shop.service.ShopService",
            "com.shop.platform.logistics.infra.kdniao.KdniaoPushReceiver",
            "com.shop.platform.account.service.AuthService",
            "com.shop.platform.account.service.StaffService",
            "com.shop.platform.account.service.AccountDeletionService",
            "com.shop.platform.order.service.OrderService");

    private static final Set<String> OWNER_GETTERS =
            Set.of("getShopId", "getUserId", "getOwnerId", "shopId", "userId", "ownerId");

    @Test
    void 越权不说403_归属只由闸门按不存在处理() {
        List<String> violations = new ArrayList<>();
        Set<String> saysForbidden = new HashSet<>();
        for (JavaClass clazz : imported()) {
            for (JavaMethod method : clazz.getMethods()) {
                if (!callsForbidden(method)) continue;
                saysForbidden.add(clazz.getName());
                if (!FORBIDDEN_DOOR_OWNERS.contains(clazz.getName())) {
                    violations.add(method.getFullName() + " 用 403 说「不归你」：资源归属一律按不存在（404）处理，"
                            + "改用 Validate.owned / Validate.requireOwned");
                }
            }
        }
        // 扫不到任何 403 出口就等于规则空转，那是假绿
        assertThat(saysForbidden).as("说 403 的类").isNotEmpty();
        assertThat(violations).as("越权话术出口").isEmpty();
    }

    @Test
    void 归属判定不自己决定状态码_必须走归属闸门() {
        List<String> violations = new ArrayList<>();
        Set<String> gated = new HashSet<>();
        Set<String> ownerComparisons = new HashSet<>();
        for (JavaClass clazz : imported()) {
            for (JavaMethod method : clazz.getMethods()) {
                if (isDoorCall(method)) {
                    gated.add(clazz.getSimpleName() + "." + method.getName());
                    continue;
                }
                // lambda 体编译成宿主类的合成方法：那里的 owner 比较是过滤（不给响应码），不是门
                if (method.getName().startsWith("lambda$")) continue;
                if (!comparesOwnerColumn(method)) continue;
                ownerComparisons.add(clazz.getSimpleName() + "." + method.getName());
                if (!decidesStatus(method)) continue;
                violations.add(method.getFullName() + " 在门外手搓归属判定：owner 列的比较 + 状态码请收成"
                        + " Validate.owned / Validate.requireOwned / Validate.presentOwned");
            }
        }
        // 反证 1：闸门真在被用（否则第二条永远成立）
        assertThat(gated).as("走归属闸门的调用点").isNotEmpty();
        // 反证 2：owner 列的比较在业务代码里到处都是，其中「顺手挑一个状态码」的一处都不许有
        assertThat(ownerComparisons).as("比较 owner 列的方法").isNotEmpty();
        assertThat(violations).as("归属闸门外的手搓判定").isEmpty();
    }

    /** 取值 + 比身份：归属列都是 UUID，所以只认「在 UUID 上调 equals」——枚举/布尔/字符串的 equals 是状态判断，不是归属 */
    private static boolean comparesOwnerColumn(JavaMethod method) {
        var calls = method.getMethodCallsFromSelf();
        boolean readsOwnerColumn = calls.stream().anyMatch(c -> OWNER_GETTERS.contains(c.getName()));
        boolean comparesIdentity = calls.stream()
                .anyMatch(c -> c.getName().equals("equals")
                        && c.getTargetOwner().getName().equals("java.util.UUID"));
        return readsOwnerColumn && comparesIdentity;
    }

    /** 用 {@code Validate.isTrue} 下判断＝在门外决定状态码 */
    private static boolean decidesStatus(JavaMethod method) {
        return method.getMethodCallsFromSelf().stream()
                .anyMatch(c -> c.getName().equals("isTrue")
                        && c.getTargetOwner().getName().equals("com.shop.platform.common.Validate"));
    }

    private static Iterable<JavaClass> imported() {
        return new ClassFileImporter()
                .withImportOption(new ImportOption.DoNotIncludeTests())
                .importPackages("com.shop.platform");
    }

    private static boolean callsForbidden(JavaMethod method) {
        return method.getMethodCallsFromSelf().stream().anyMatch(OwnershipDoorTest::isForbiddenCall);
    }

    private static boolean isForbiddenCall(JavaMethodCall call) {
        return call.getName().equals("forbidden")
                && call.getTargetOwner().getName().equals("com.shop.platform.common.BusinessException");
    }

    /** 已经走过闸门的方法（含以方法引用交出 owner 列的写法）不需要再看形状 */
    private static boolean isDoorCall(JavaMethod method) {
        return method.getMethodCallsFromSelf().stream()
                .anyMatch(c -> c.getTargetOwner().getName().equals("com.shop.platform.common.Validate")
                        && (c.getName().equals("owned")
                                || c.getName().equals("requireOwned")
                                || c.getName().equals("presentOwned")));
    }
}
