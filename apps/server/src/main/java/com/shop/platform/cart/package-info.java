@ApplicationModule(
        displayName = "Cart [support]",
        allowedDependencies = {"catalog :: api", "seller :: api", "trade :: events"})
package com.shop.platform.cart;

import org.springframework.modulith.ApplicationModule;
