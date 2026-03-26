# Wind Archive Data Job

## Service File
`wind-archive-data.service`
```ini
[Unit]
Description=Archive old wind meter data

[Service]
Type=oneshot
User=root
WorkingDirectory=/root/wind-meter-server
ExecStart=/root/wind-meter-server/.venv/bin/python /root/wind-meter-server/archive_old_data/archive.py
```

## Timer File
`wind-archive-data.timer`
```ini
[Unit]
Description=Run wind data archive every 3 days

[Timer]
OnBootSec=10m
OnUnitActiveSec=3d
Persistent=true

[Install]
WantedBy=timers.target
```

## Run Manually

```bash
sudo systemctl start wind-archive-data.service
```

## Check Status and Logs

```bash
sudo systemctl status wind-archive-data.service
sudo journalctl -u wind-archive-data.service -n 100 --no-pager
```
