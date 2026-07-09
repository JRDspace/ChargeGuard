# Privacy

Maintainer: Janaki Rajesh D.  
Website: https://janakirajesh.com  
GitHub: https://github.com/JRDspace  
Contact: janakirajeshduvvuri@outlook.com

ChargeGuard runs locally on your computer.

It does not:

- collect personal data
- send analytics
- use a cloud service
- upload battery, device, or network information

It reads:

- laptop battery status from the operating system
- the WiZ plug IP from your local `.env` file

It sends:

- local UDP commands to the configured WiZ smart plug on your LAN

Logs are stored locally. On Windows, logs are written to:

```text
%LOCALAPPDATA%\ChargeGuard\chargeguard.log
```

You can delete the logs at any time.
