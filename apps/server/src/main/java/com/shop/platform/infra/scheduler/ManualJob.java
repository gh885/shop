package com.shop.platform.infra.scheduler;

/**
 * 可手动触发的定时任务。所有 {@code @Scheduled} 任务实现它：调度到点和管理端触发
 * 调的是<b>同一个</b> {@link #runNow()}——锁、幂等、观测一样不缺，手动绝不绕过
 * {@link JobLock}，否则两个实例同跑一个任务，正是锁要防的事。
 *
 * <p>名字就是锁名（{@code shop.job.*}）：注册表、指标、日志、触发口共用一套名字，
 * 排查时不需要翻译。
 */
public interface ManualJob {

    /** 任务名，同时是 {@link JobLock} 的锁名，{@code shop.job.<模块>.<动作>}。 */
    String jobName();

    /** 跑一轮。定时到点和管理端触发都走这里。 */
    void runNow();
}
