@ApplicationModule(
        displayName = "Cart [staging]",
        allowedDependencies = {"catalog :: api", "seller :: api", "trade :: events"})
package com.shop.platform.cart;

import org.springframework.modulith.ApplicationModule;
