package com.shop.platform.testsupport;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 直连开发库（WSL2 PostgreSQL）的集成测试基类：每个测试方法发一个 {@link TestDb}，
 * 结束自动 {@code purge()}。子类只负责 {@code @SpringBootTest} 注解与业务断言，
 * 清理一律经 {@code db.onDelete(...)} 登记，禁止再手写 {@code @AfterEach} 删数。
 */
public abstract class IntegrationTestSupport {

    @Autowired
    protected JdbcTemplate jdbc;

    protected TestDb db;

    @BeforeEach
    void initTestDb() {
        db = new TestDb(jdbc);
    }

    @AfterEach
    void purgeTestData() {
        if (db != null) {
            db.purge();
        }
    }
}
