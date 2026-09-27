package com.shop.platform.account;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.account.model.StaffRole;
import com.shop.platform.account.model.StaffStatus;
import com.shop.platform.account.service.StaffService;
import com.shop.platform.common.BusinessException;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 员工治理的<b>真并发</b>验证（真库 + 真线程）：末位超管保护与「一人一处处置」在竞争下是否还成立。
 *
 * <p>为什么必须真起线程：{@code StaffService.updateStaffStatus} 此前的形状是「读整行 → 判是不是最后一个
 * 在岗超管 → updateById 写回整行」。行级条件更新挡得住「同一行被抢着处置两次」，却挡不住
 * <b>两个最后超管在同一刻被分别禁用</b>——两边的写各不碰对方的行，各自的计数都还看见对方在岗，于是双双放行，
 * 平台就此再也无人能建员工、调岗位、封店（STAFF_MANAGE 只挂超管通配）。串行用例永远跑不出这一格。
 *
 * <p>串行那一面（禁用最后一个超管给 409、状态与审计行同事务）在同一文件里，两者断言的是不同的失败面。
 */
@SpringBootTest
class StaffGovernanceIT extends IntegrationTestSupport {

    @Autowired
    private StaffService staffService;

    private final UUID operator = UUID.randomUUID();

    /**
     * 把库里已有的在岗超管挪开：Flyway 种过一个超管（V23 把 {@code employee_no = 'admin'} 升成 SUPER_ADMIN），
     * 它不归本类管，却永远占着计数里的一个名额——不挪开，「最后一个在岗超管」这种状态根本造不出来
     * （计数恒 ≥2，末位保护看着像失效，其实是前提没成立）。挪走与复原都只碰 ACTIVE 的那几行。
     */
    @BeforeEach
    void parkPreexistingSuperAdmins() {
        List<String> preexisting = jdbc.queryForList(
                "SELECT id::text FROM account.staff WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE'", String.class);
        for (String id : preexisting) {
            jdbc.update("UPDATE account.staff SET status = 'DISABLED' WHERE id = ?::uuid", id);
            db.onDelete("UPDATE account.staff SET status = 'ACTIVE' WHERE id = ?::uuid", id);
        }
    }

    /** 造一个员工并登记清理（账本按 target_id 圈定，purge 逆序 → 员工行先登记、审计行后登记） */
    private UUID seedStaff(String employeeNo, StaffRole role, StaffStatus status) {
        UUID staffId = UUID.randomUUID();
        jdbc.update(
                "INSERT INTO account.staff (id, employee_no, password_hash, display_name, status, role)"
                        + " VALUES (?::uuid, ?, '$2a$12$x', ?, ?, ?)",
                staffId.toString(),
                employeeNo,
                "员工" + employeeNo,
                status.name(),
                role.name());
        db.onDelete("DELETE FROM account.staff WHERE id = ?::uuid", staffId.toString());
        db.onDelete("DELETE FROM audit.audit_records WHERE target_id = ?", staffId.toString());
        return staffId;
    }

    private long activeSuperAdmins() {
        Long count = jdbc.queryForObject(
                "SELECT count(*) FROM account.staff WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE'", Long.class);
        assertTrue(count != null);
        return count;
    }

    private long auditRows(UUID targetId, String action) {
        Long count = jdbc.queryForObject(
                "SELECT count(*) FROM audit.audit_records WHERE target_id = ? AND action = ?",
                Long.class,
                targetId.toString(),
                action);
        assertTrue(count != null);
        return count;
    }

    private String statusOf(UUID staffId) {
        return jdbc.queryForObject("SELECT status FROM account.staff WHERE id = ?::uuid", String.class, staffId);
    }

    /**
     * 起跑 N 个任务，返回成功笔数。任务内的 BusinessException 记为「被闸门挡回」，
     * 其它异常照旧抛出（{@code Future.get} 带超时，卡住即红，不会挂死整条测试）。
     */
    private int race(List<Runnable> tasks) throws Exception {
        CountDownLatch startGun = new CountDownLatch(1);
        AtomicInteger succeeded = new AtomicInteger();
        try (ExecutorService pool = Executors.newFixedThreadPool(tasks.size())) {
            List<Future<?>> futures = new ArrayList<>();
            for (Runnable task : tasks) {
                futures.add(pool.submit(() -> {
                    startGun.await(); // 全员就位后同时开抢，最大化竞争窗口
                    try {
                        task.run();
                        succeeded.incrementAndGet();
                    } catch (BusinessException e) {
                        assertEquals(409, e.getHttpStatus(), "被闸门挡回应该是 409，不是把异常漏成别的状态码");
                    }
                    return null;
                }));
            }
            startGun.countDown();
            for (Future<?> f : futures) {
                f.get(30, TimeUnit.SECONDS);
            }
        }
        return succeeded.get();
    }

    /** 核心不变式：只剩两个在岗超管时同时下手禁掉这两个，最多只能成一个——平台不能无人可治理 */
    @Test
    void 并发禁用两个在岗超管_至少留一个_账本只一行() throws Exception {
        UUID first = seedStaff("E-SU-1", StaffRole.SUPER_ADMIN, StaffStatus.ACTIVE);
        UUID second = seedStaff("E-SU-2", StaffRole.SUPER_ADMIN, StaffStatus.ACTIVE);

        int succeeded = race(List.of(
                () -> staffService.updateStaffStatus(first, StaffStatus.DISABLED, operator),
                () -> staffService.updateStaffStatus(second, StaffStatus.DISABLED, operator)));

        assertEquals(1, succeeded, "两边都放行 = 末位保护在竞争下失效");
        assertEquals(1, activeSuperAdmins());
        assertEquals(
                1,
                auditRows(first, "account.staff.status_changed") + auditRows(second, "account.staff.status_changed"));
    }

    /** 同一行被抢着处置：只有一边落成，会话吊销与账本都只算一次 */
    @Test
    void 并发禁用同一员工_只落一次_账本只一行() throws Exception {
        UUID target = seedStaff("E-SU-T", StaffRole.SUPER_ADMIN, StaffStatus.ACTIVE);
        seedStaff("E-SU-B", StaffRole.SUPER_ADMIN, StaffStatus.ACTIVE); // 再留一个在岗超管，免得末位保护先拦下来
        List<Runnable> tasks = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            tasks.add(() -> staffService.updateStaffStatus(target, StaffStatus.DISABLED, operator));
        }

        assertEquals(1, race(tasks));

        assertEquals("DISABLED", statusOf(target));
        assertEquals(1, auditRows(target, "account.staff.status_changed"));
    }

    @Test
    void 禁用最后一个在岗超管_409_状态与账本都不动() {
        UUID only = seedStaff("E-SU-ONLY", StaffRole.SUPER_ADMIN, StaffStatus.ACTIVE);

        BusinessException ex = assertThrows(
                BusinessException.class, () -> staffService.updateStaffStatus(only, StaffStatus.DISABLED, operator));

        assertEquals(409, ex.getHttpStatus());
        assertEquals("ACTIVE", statusOf(only));
        assertEquals(0, auditRows(only, "account.staff.status_changed"));
    }

    @Test
    void 降级唯一在岗超管_409_岗位保持原样() {
        UUID only = seedStaff("E-SU-DEM", StaffRole.SUPER_ADMIN, StaffStatus.ACTIVE);

        BusinessException ex = assertThrows(
                BusinessException.class, () -> staffService.updateStaffRole(only, StaffRole.OPS, operator));

        assertEquals(409, ex.getHttpStatus());
        assertEquals(
                "SUPER_ADMIN",
                jdbc.queryForObject("SELECT role FROM account.staff WHERE id = ?::uuid", String.class, only));
        assertEquals(0, auditRows(only, "account.staff.role_changed"));
    }

    /**
     * 八个线程同时把同一个人调到同一岗位：账本只许一行。输家怎么走都行（读到新岗即「空动作」静默返回、
     * 读到旧岗则条件更新 0 行给 409），不变的是账本——「没发生过的变更」不许留痕。
     */
    @Test
    void 并发调到同一岗位_账本只一行() throws Exception {
        UUID staffId = seedStaff("E-SU-REPEAT", StaffRole.REVIEWER, StaffStatus.ACTIVE);
        List<Runnable> tasks = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            tasks.add(() -> staffService.updateStaffRole(staffId, StaffRole.OPS, operator));
        }

        race(tasks);

        assertEquals(
                "OPS", jdbc.queryForObject("SELECT role FROM account.staff WHERE id = ?::uuid", String.class, staffId));
        assertEquals(1, auditRows(staffId, "account.staff.role_changed"));
    }
}
