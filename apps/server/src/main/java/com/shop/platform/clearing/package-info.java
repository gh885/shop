@ApplicationModule(
        displayName = "Clearing [core]",
        allowedDependencies = {"trade :: events", "payment :: events"})
package com.shop.platform.clearing;

import org.springframework.modulith.ApplicationModule;
