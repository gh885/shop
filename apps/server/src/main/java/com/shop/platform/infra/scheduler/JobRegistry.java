package com.shop.platform.infra.scheduler;

import com.shop.platform.common.BusinessException;
import jakarta.annotation.PreDestroy;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 全部定时任务的注册表，给管理端触发口（{@link JobAdminController}）用。
 *
 * <p>任务自己声明（实现 {@link ManualJob}），Spring 收集，这里只查——不在这儿维护
 * 一份"任务清单"映射：中心化清单必然漏掉新任务，而漏掉的那个恰恰是没人记得的那个。
 * 重名直接启动失败：两个任务共用一个锁名会互相吞轮次，这比跑起来再查容易发现得多。
 *
 * <p>手动触发跑在专属虚拟线程上，不搭 HTTP 线程：任务可能很慢（退款重试最坏一批 × 渠道超时），
 * 等它就是占着 Tomcat 线程干耗。反馈不靠响应靠指标——触发是 202，结果看
 * {@code shop.job.*}（时长/失败/处理条数）和日志，那套观测就是这条反馈回路。
 */
@Component
public class JobRegistry {

    private static final Logger log = LoggerFactory.getLogger(JobRegistry.class);

    private final Map<String, ManualJob> byName = new LinkedHashMap<>();

    private final ExecutorService triggers = Executors.newThreadPerTaskExecutor(
            Thread.ofVirtual().name("job-trigger-", 0).factory());

    public JobRegistry(List<ManualJob> jobs) {
        for (ManualJob job : jobs) {
            ManualJob previous = byName.putIfAbsent(job.jobName(), job);
            if (previous != null) {
                throw new IllegalStateException("任务名重复: " + job.jobName() + "（"
                        + previous.getClass().getName() + " / " + job.getClass().getName() + "）");
            }
        }
    }

    /** 任务名，字典序。 */
    public List<String> names() {
        return byName.keySet().stream().sorted().toList();
    }

    /** 不认识的名字 404，并把可用清单带上：触发一个不存在的任务多半是名字拼错，静默成功比报错糟。 */
    public ManualJob require(String name) {
        ManualJob job = byName.get(name);
        if (job == null) {
            throw BusinessException.notFound("任务不存在: " + name + "，可用: " + names());
        }
        return job;
    }

    /** 异步触发一轮。异常在这里兜住打 ERROR——execute 的异常会沉进没人看的 Future。 */
    public void triggerAsync(ManualJob job) {
        triggers.execute(() -> {
            try {
                job.runNow();
            } catch (RuntimeException e) {
                log.error("手动触发任务失败：{}", job.jobName(), e);
            }
        });
    }

    @PreDestroy
    void shutdown() {
        triggers.shutdown();
    }
}
