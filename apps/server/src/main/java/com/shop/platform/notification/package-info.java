@ApplicationModule(
        displayName = "Notification [generic]",
        allowedDependencies = {"trade :: events", "payment :: events", "governance :: events", "fulfillment :: events"})
package com.shop.platform.notification;

import org.springframework.modulith.ApplicationModule;
