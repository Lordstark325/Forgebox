# ForgeNet client applications

The Windows application enrolls a PC, discovers peers, writes `C:\ProgramData\ForgeNet\ForgeNet.conf`, and installs it through the official WireGuard tunnel service.

The Android application enrolls a phone and creates a WireGuard configuration. Use **Share WireGuard configuration** and import the text into the official WireGuard Android app. Android intentionally requires HTTPS. The 0.1.1 layout supports portrait and landscape, density-independent spacing, display cutout/system-bar insets, keyboard resizing, scrolling, and 48dp minimum touch targets.

Neither application turns the coordination server into a relay. At least one peer must have a reachable public UDP endpoint until ForgeRelay is implemented.
