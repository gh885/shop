@ApplicationModule(
        displayName = "Returns [core]",
        allowedDependencies = {"trade :: api", "payment :: api", "payment :: events"})
package com.shop.platform.returns;

import org.springframework.modulith.ApplicationModule;
