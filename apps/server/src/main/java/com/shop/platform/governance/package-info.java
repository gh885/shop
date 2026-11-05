/**
 * 审核通过/驳回、敏感词命中这些动作都要落操作留痕，走 {@code audit :: api}（平台模块，
 * module-map「平台能力」节：audit 有自己的表，是七个平台能力里唯一的模块）。
 */
@ApplicationModule(
        displayName = "Governance [core]",
        allowedDependencies = {"seller :: api", "seller :: events", "audit :: api"})
package com.shop.platform.governance;

import org.springframework.modulith.ApplicationModule;
