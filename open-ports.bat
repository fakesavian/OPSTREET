@echo off
echo Opening OPFun dev ports in Windows Firewall...
netsh advfirewall firewall delete rule name="OPFun Web 3000" >nul 2>&1
netsh advfirewall firewall delete rule name="OPFun API 3001" >nul 2>&1
netsh advfirewall firewall add rule name="OPFun Web 3000" dir=in action=allow protocol=TCP localport=3000
netsh advfirewall firewall add rule name="OPFun API 3001" dir=in action=allow protocol=TCP localport=3001
echo Done. Port 3000 (web) and 3001 (API) are now open.
pause
