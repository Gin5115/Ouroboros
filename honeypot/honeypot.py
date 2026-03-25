#!/usr/bin/env python3
"""
Custom SSH Honeypot with Fake Shell and JSON Logging
Built for Cybersecurity Course Project
Based on teammate's paramiko SSH honeypot foundation
"""

import json
import os
import socket
import sys
import threading
import uuid
from datetime import datetime, timezone

import paramiko
import requests as http_requests

# ─── Configuration ───────────────────────────────────────────────────
HOST = "0.0.0.0"
PORT = 2223
HOSTNAME = "prod-db-server"
LOG_DIR = "logs"
LOG_FILE = os.path.join(LOG_DIR, "honeypot.json")
LOG_LOCK = threading.Lock()
BANNER = "SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.6"

# Gemini API configuration
GEMINI_API_KEY = ""  # Set your key here or via environment variable
GEMINI_MODEL = "gemini-2.5-flash-lite"

def get_gemini_key():
    return os.environ.get("GEMINI_API_KEY", GEMINI_API_KEY)

def gemini_generate_response(cmd, cwd, username, context=""):
    """Use Gemini to generate a realistic command response."""
    api_key = get_gemini_key()
    if not api_key:
        return None

    prompt = f"""You are simulating a real Ubuntu 22.04 Linux server terminal. Generate a realistic output for the following command as if it were executed on a production server.

Server context:
- Hostname: {HOSTNAME}
- User: {username}
- Current directory: {cwd}
- The server runs nginx, MySQL, Redis, and has Docker installed
- IP: 192.168.1.10, 2 CPU cores, 2GB RAM

Command: {cmd}

CRITICAL RULES:
- Return ONLY the raw terminal output, absolutely nothing else
- NEVER add explanations, notes, comments, or descriptions after the output
- NEVER add lines starting with "This output" or "Note:" or any commentary
- No markdown formatting, no code blocks, no backticks
- If the command would produce no output (like mkdir, touch), return exactly: EMPTY_OUTPUT
- Keep responses concise and realistic, matching what a real Ubuntu 22.04 server would show
- If the command is truly invalid, return exactly: bash: {cmd.split()[0] if cmd.split() else cmd}: command not found
- Your response must look EXACTLY like terminal output, nothing more"""

    try:
        res = http_requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={api_key}",
            json={"contents": [{"parts": [{"text": prompt}]}]},
            timeout=10
        )
        if res.ok:
            text = res.json().get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
            text = text.strip("`").replace("```", "").strip()
            if text == "EMPTY_OUTPUT":
                return ""
            if text:
                log_event({
                    "eventid": "honeypot.gemini.response",
                    "input": cmd,
                    "message": f"Gemini generated response for: {cmd}",
                })
                return text
    except Exception as e:
        print(f"[!] Gemini API error: {e}")

    return None

# Credentials that attackers can "successfully" log in with
VALID_CREDENTIALS = {
    "root": ["admin123", "root", "123456", "password", "toor"],
    "admin": ["admin", "password", "admin123"],
    "ubuntu": ["ubuntu"],
    "deploy": ["deploy123"],
    "mysql": ["mysql", "dbpass"],
}

# ─── Fake Filesystem ────────────────────────────────────────────────
FAKE_FS = {
    "/etc/passwd": (
        "root:x:0:0:root:/root:/bin/bash\n"
        "daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\n"
        "bin:x:2:2:bin:/bin:/usr/sbin/nologin\n"
        "sys:x:3:3:sys:/dev:/usr/sbin/nologin\n"
        "sshd:x:105:65534::/run/sshd:/usr/sbin/nologin\n"
        "mysql:x:106:110:MySQL Server,,,:/var/lib/mysql:/bin/false\n"
        "www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin\n"
        "deploy:x:1001:1001:Deploy User,,,:/home/deploy:/bin/bash\n"
        "admin:x:1002:1002:Admin,,,:/home/admin:/bin/bash\n"
    ),
    "/etc/shadow": (
        "root:$6$rounds=656000$fakesalt$fakehashvalue:19500:0:99999:7:::\n"
        "mysql:$6$rounds=656000$anothersalt$anotherhash:19500:0:99999:7:::\n"
        "admin:$6$rounds=656000$adminsalt$adminhashval:19500:0:99999:7:::\n"
    ),
    "/etc/hostname": f"{HOSTNAME}\n",
    "/etc/os-release": (
        'PRETTY_NAME="Ubuntu 22.04.3 LTS"\n'
        'NAME="Ubuntu"\n'
        'VERSION_ID="22.04"\n'
        'VERSION="22.04.3 LTS (Jammy Jellyfish)"\n'
        'ID=ubuntu\n'
        'ID_LIKE=debian\n'
    ),
    "/etc/hosts": (
        "127.0.0.1\tlocalhost\n"
        f"127.0.1.1\t{HOSTNAME}\n"
        "192.168.1.50\tdb-primary\n"
        "192.168.1.51\tdb-replica\n"
        "192.168.1.100\tapp-server\n"
    ),
    "/etc/crontab": (
        "# /etc/crontab: system-wide crontab\n"
        "SHELL=/bin/sh\n"
        "PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin\n"
        "17 * * * * root cd / && run-parts --report /etc/cron.hourly\n"
        "25 6 * * * root test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.daily )\n"
        "0 */6 * * * root /opt/backup/db-backup.sh\n"
    ),
    "/root/.bash_history": (
        "mysql -u root -p\n"
        "systemctl restart nginx\n"
        "cd /var/www/html\n"
        "git pull origin main\n"
        "docker ps\n"
        "cat /var/log/auth.log | tail -50\n"
        "df -h\n"
        "free -m\n"
    ),
    "/root/.ssh/authorized_keys": "",
    "/var/www/html/index.html": "<html><body><h1>Internal Portal</h1></body></html>\n",
    "/opt/backup/db-backup.sh": (
        "#!/bin/bash\n"
        "# Database backup script\n"
        "TIMESTAMP=$(date +%Y%m%d_%H%M%S)\n"
        "mysqldump -u backup_user -pBackup2024! --all-databases > /opt/backup/db_$TIMESTAMP.sql\n"
        "gzip /opt/backup/db_$TIMESTAMP.sql\n"
    ),
    "/home/deploy/.env": (
        "DB_HOST=192.168.1.50\n"
        "DB_USER=app_user\n"
        "DB_PASS=AppSecret2024!\n"
        "DB_NAME=production_db\n"
        "REDIS_URL=redis://192.168.1.60:6379\n"
        "API_KEY=sk-prod-a8f3k2j5h6g7d8s9\n"
        "AWS_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE\n"
        "AWS_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\n"
    ),
}

# Fake directory listings
FAKE_DIRS = {
    "/": "bin  boot  dev  etc  home  lib  media  mnt  opt  proc  root  run  sbin  srv  sys  tmp  usr  var",
    "/root": ".bash_history  .bashrc  .profile  .ssh  backup_notes.txt",
    "/home": "admin  deploy  ubuntu",
    "/home/deploy": ".env  app  docker-compose.yml  logs",
    "/home/admin": ".bashrc  .profile  Documents",
    "/tmp": "systemd-private-abc123",
    "/var": "backups  cache  lib  local  lock  log  mail  opt  run  spool  tmp  www",
    "/var/log": "auth.log  daemon.log  kern.log  mysql  nginx  syslog",
    "/var/www": "html",
    "/var/www/html": "index.html  assets  api",
    "/opt": "backup",
    "/opt/backup": "db-backup.sh  db_20240315_060000.sql.gz  db_20240316_060000.sql.gz",
    "/etc": "crontab  hostname  hosts  mysql  nginx  os-release  passwd  shadow  ssh  ssl",
}

# ─── Command Responses ──────────────────────────────────────────────
STATIC_RESPONSES = {
    "whoami": "root",
    "id": "uid=0(root) gid=0(root) groups=0(root)",
    "pwd": "/root",
    "hostname": HOSTNAME,
    "uname -a": f"Linux {HOSTNAME} 5.15.0-91-generic #101-Ubuntu SMP Thu Nov 16 14:04:09 UTC 2023 x86_64 x86_64 x86_64 GNU/Linux",
    "uname -r": "5.15.0-91-generic",
    "uname": "Linux",
    "uptime": " 14:32:01 up 127 days,  3:45,  1 user,  load average: 0.08, 0.03, 0.01",
    "w": " 14:32:01 up 127 days,  3:45,  1 user,  load average: 0.08, 0.03, 0.01\nUSER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT\nroot     pts/0    192.168.1.1      14:30    0.00s  0.02s  0.00s w",
    "last": (
        "root     pts/0        192.168.1.1      Thu Mar 25 14:30   still logged in\n"
        "root     pts/0        192.168.1.1      Wed Mar 24 09:15 - 17:30  (08:15)\n"
        "deploy   pts/1        192.168.1.100    Tue Mar 23 11:00 - 13:45  (02:45)\n"
        "root     pts/0        192.168.1.1      Mon Mar 22 08:00 - 18:00  (10:00)\n"
    ),
    "ifconfig": (
        "eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n"
        "        inet 192.168.1.10  netmask 255.255.255.0  broadcast 192.168.1.255\n"
        "        inet6 fe80::5054:ff:fe12:3456  prefixlen 64  scopeid 0x20<link>\n"
        "        ether 52:54:00:12:34:56  txqueuelen 1000  (Ethernet)\n"
        "        RX packets 2847563  bytes 1923847562 (1.9 GB)\n"
        "        TX packets 1923456  bytes 892345678 (892.3 MB)\n"
    ),
    "ip a": (
        "1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN\n"
        "    inet 127.0.0.1/8 scope host lo\n"
        "2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP\n"
        "    inet 192.168.1.10/24 brd 192.168.1.255 scope global eth0\n"
    ),
    "netstat -tlnp": (
        "Active Internet connections (only servers)\n"
        "Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name\n"
        "tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      1234/sshd\n"
        "tcp        0      0 0.0.0.0:80              0.0.0.0:*               LISTEN      5678/nginx\n"
        "tcp        0      0 0.0.0.0:443             0.0.0.0:*               LISTEN      5678/nginx\n"
        "tcp        0      0 127.0.0.1:3306          0.0.0.0:*               LISTEN      9012/mysqld\n"
        "tcp        0      0 127.0.0.1:6379          0.0.0.0:*               LISTEN      3456/redis-server\n"
    ),
    "ss -tlnp": (
        "State   Recv-Q  Send-Q   Local Address:Port    Peer Address:Port  Process\n"
        "LISTEN  0       128      0.0.0.0:22            0.0.0.0:*          users:((\"sshd\",pid=1234,fd=3))\n"
        "LISTEN  0       511      0.0.0.0:80            0.0.0.0:*          users:((\"nginx\",pid=5678,fd=6))\n"
        "LISTEN  0       128      127.0.0.1:3306        0.0.0.0:*          users:((\"mysqld\",pid=9012,fd=22))\n"
    ),
    "ps aux": (
        "USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n"
        "root           1  0.0  0.1 168940 11360 ?        Ss   Nov16   2:34 /sbin/init\n"
        "root         456  0.0  0.1  72308  6144 ?        Ss   Nov16   0:12 /usr/sbin/sshd -D\n"
        "mysql        789  0.1  2.5 1842560 204800 ?      Ssl  Nov16  45:23 /usr/sbin/mysqld\n"
        "www-data    1234  0.0  0.3 141120 24576 ?        S    Nov16   3:45 nginx: worker process\n"
        "redis       2345  0.0  0.1  61520  8192 ?        Ssl  Nov16   8:12 /usr/bin/redis-server\n"
        "root        3456  0.0  0.0  12108  3584 pts/0    Ss   14:30   0:00 -bash\n"
        "root        3789  0.0  0.0  13472  3200 pts/0    R+   14:32   0:00 ps aux\n"
    ),
    "df -h": (
        "Filesystem      Size  Used Avail Use% Mounted on\n"
        "udev            960M     0  960M   0% /dev\n"
        "tmpfs           198M  1.1M  197M   1% /run\n"
        "/dev/sda1        40G   18G   20G  48% /\n"
        "tmpfs           990M     0  990M   0% /dev/shm\n"
        "/dev/sda2       100G   45G   50G  48% /var/lib/mysql\n"
    ),
    "free -m": (
        "               total        used        free      shared  buff/cache   available\n"
        "Mem:            1980         892         234          12         854         932\n"
        "Swap:           2047          56        1991\n"
    ),
    "cat /proc/cpuinfo": (
        "processor\t: 0\n"
        "vendor_id\t: GenuineIntel\n"
        "cpu family\t: 6\n"
        "model\t\t: 85\n"
        "model name\t: Intel(R) Xeon(R) CPU E5-2686 v4 @ 2.30GHz\n"
        "stepping\t: 4\n"
        "cpu MHz\t\t: 2300.000\n"
        "cache size\t: 46080 KB\n"
        "cpu cores\t: 2\n"
    ),
    "crontab -l": (
        "# m h  dom mon dow   command\n"
        "0 */6 * * * /opt/backup/db-backup.sh\n"
        "*/5 * * * * /usr/local/bin/health-check.sh\n"
    ),
    "docker ps": (
        "CONTAINER ID   IMAGE          COMMAND                  CREATED        STATUS        PORTS                    NAMES\n"
        "a1b2c3d4e5f6   nginx:latest   \"/docker-entrypoint.…\"   3 months ago   Up 127 days   0.0.0.0:80->80/tcp       web-proxy\n"
        "b2c3d4e5f6a7   redis:7        \"docker-entrypoint.s…\"   3 months ago   Up 127 days   127.0.0.1:6379->6379/tcp redis-cache\n"
    ),
    "systemctl status mysql": (
        "● mysql.service - MySQL Community Server\n"
        "     Loaded: loaded (/lib/systemd/system/mysql.service; enabled)\n"
        "     Active: active (running) since Thu 2023-11-16 10:47:23 UTC; 127 days ago\n"
        "   Main PID: 789 (mysqld)\n"
        "     Status: \"Server is operational\"\n"
        "      Tasks: 38 (limit: 2340)\n"
        "     Memory: 200.5M\n"
    ),
    "history -c": "",
    "clear": "",
    "echo": "",
}


# ─── JSON Logger ─────────────────────────────────────────────────────
def log_event(event_data):
    """Write a JSON log entry to the log file."""
    event_data["timestamp"] = datetime.now(timezone.utc).isoformat()
    with LOG_LOCK:
        with open(LOG_FILE, "a") as f:
            f.write(json.dumps(event_data) + "\n")
    # Also print to console
    eid = event_data.get("eventid", "unknown")
    src = event_data.get("src_ip", "")
    msg = event_data.get("message", "")
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [{eid}] {src} - {msg}")


# ─── Fake Shell ──────────────────────────────────────────────────────
def handle_shell(channel, session_id, src_ip, username):
    """Provide a fake interactive shell to the attacker."""
    cwd = "/root" if username == "root" else f"/home/{username}"
    prompt_user = username
    channel.send(f"\r\nWelcome to Ubuntu 22.04.3 LTS (GNU/Linux 5.15.0-91-generic x86_64)\r\n\r\n")
    channel.send(f" * Documentation:  https://help.ubuntu.com\r\n")
    channel.send(f" * Management:     https://landscape.canonical.com\r\n")
    channel.send(f" * Support:        https://ubuntu.com/advantage\r\n\r\n")
    channel.send(f"Last login: Wed Mar 24 09:15:33 2025 from 192.168.1.1\r\n")

    def send_prompt():
        if username == "root":
            channel.send(f"\r\n{prompt_user}@{HOSTNAME}:{cwd}# ")
        else:
            channel.send(f"\r\n{prompt_user}@{HOSTNAME}:{cwd}$ ")

    send_prompt()
    command_buffer = ""

    try:
        while True:
            byte = channel.recv(1)
            if not byte:
                break

            char = byte.decode("utf-8", errors="ignore")

            # Enter key
            if char in ("\r", "\n"):
                cmd = command_buffer.strip()
                command_buffer = ""

                if not cmd:
                    send_prompt()
                    continue

                # Log the command
                log_event({
                    "eventid": "honeypot.command.input",
                    "src_ip": src_ip,
                    "session": session_id,
                    "input": cmd,
                    "message": f"Command: {cmd}",
                })

                # Handle exit
                if cmd in ("exit", "logout", "quit"):
                    channel.send("\r\nlogout\r\n")
                    log_event({
                        "eventid": "honeypot.session.closed",
                        "src_ip": src_ip,
                        "session": session_id,
                        "message": f"Session closed by attacker",
                    })
                    break

                # Process the command
                response = process_command(cmd, cwd, session_id, src_ip)

                # Handle cd
                if cmd.startswith("cd "):
                    target = cmd[3:].strip()
                    if target == "~":
                        cwd = "/root" if username == "root" else f"/home/{username}"
                    elif target == "..":
                        cwd = "/".join(cwd.rstrip("/").split("/")[:-1]) or "/"
                    elif target.startswith("/"):
                        cwd = target
                    else:
                        new_path = cwd.rstrip("/") + "/" + target
                        cwd = new_path
                    response = ""

                if response:
                    channel.send("\r\n" + response.replace("\n", "\r\n"))

                send_prompt()

            # Backspace
            elif char == "\x7f" or char == "\x08":
                if command_buffer:
                    command_buffer = command_buffer[:-1]
                    channel.send("\x08 \x08")

            # Ctrl+C
            elif char == "\x03":
                command_buffer = ""
                channel.send("^C")
                send_prompt()

            # Ctrl+D
            elif char == "\x04":
                channel.send("\r\nlogout\r\n")
                break

            # Tab (ignore)
            elif char == "\t":
                pass

            # Regular character
            elif char.isprintable():
                command_buffer += char
                channel.send(char)

    except Exception as e:
        print(f"[!] Shell error: {e}")
    finally:
        try:
            channel.close()
        except:
            pass


def process_command(cmd, cwd, session_id, src_ip):
    """Process a command and return the response."""

    # Direct match in static responses
    if cmd in STATIC_RESPONSES:
        return STATIC_RESPONSES[cmd]

    # cat command
    if cmd.startswith("cat "):
        filepath = cmd[4:].strip()
        if not filepath.startswith("/"):
            filepath = cwd.rstrip("/") + "/" + filepath
        if filepath in FAKE_FS:
            return FAKE_FS[filepath]
        # Try Gemini for unknown files
        gemini_response = gemini_generate_response(cmd, cwd, "root")
        if gemini_response is not None:
            return gemini_response
        return f"cat: {filepath}: No such file or directory"

    # ls command
    if cmd in ("ls", "ls -la", "ls -l", "ls -al", "ls -a", "dir"):
        check_dir = cwd
        parts = cmd.split()
        for p in parts[1:]:
            if not p.startswith("-"):
                check_dir = p if p.startswith("/") else cwd.rstrip("/") + "/" + p
                break

        if check_dir in FAKE_DIRS:
            if "-l" in cmd or "-la" in cmd or "-al" in cmd:
                entries = FAKE_DIRS[check_dir].split("  ")
                result = f"total {len(entries) * 4}\n"
                for entry in entries:
                    if entry.startswith("."):
                        perm = "drwx------"
                    elif "." in entry and not entry.startswith("."):
                        perm = "-rw-r--r--"
                    else:
                        perm = "drwxr-xr-x"
                    result += f"{perm} 1 root root 4096 Mar 15 10:30 {entry}\n"
                return result.rstrip()
            return FAKE_DIRS[check_dir]
        return f"ls: cannot access '{check_dir}': No such file or directory"

    # ls with path argument
    if cmd.startswith("ls "):
        parts = cmd.split()
        target = None
        for p in parts[1:]:
            if not p.startswith("-"):
                target = p
                break
        if target:
            check_dir = target if target.startswith("/") else cwd.rstrip("/") + "/" + target
            if check_dir in FAKE_DIRS:
                return FAKE_DIRS[check_dir]
            return f"ls: cannot access '{target}': No such file or directory"

    # wget / curl - fake download
    if cmd.startswith("wget ") or cmd.startswith("curl "):
        parts = cmd.split()
        url = None
        for p in parts[1:]:
            if p.startswith("http"):
                url = p
                break
        if url:
            filename = url.split("/")[-1] or "index.html"
            log_event({
                "eventid": "honeypot.session.file_download",
                "src_ip": src_ip,
                "session": session_id,
                "url": url,
                "shasum": uuid.uuid4().hex + uuid.uuid4().hex[:32],
                "message": f"File download: {url}",
            })
            if cmd.startswith("wget"):
                return (
                    f"--2025-03-25 14:32:01--  {url}\n"
                    f"Resolving {url.split('/')[2]}... 93.184.216.34\n"
                    f"Connecting to {url.split('/')[2]}|93.184.216.34|:80... connected.\n"
                    f"HTTP request sent, awaiting response... 200 OK\n"
                    f"Length: 48234 (47K) [application/octet-stream]\n"
                    f"Saving to: '{filename}'\n\n"
                    f"     0K .......... .......... .......... .......... .......  100% 2.45M=0.02s\n\n"
                    f"2025-03-25 14:32:01 (2.45 MB/s) - '{filename}' saved [48234/48234]"
                )
            else:
                return ""
        return f"{cmd.split()[0]}: missing URL"

    # chmod
    if cmd.startswith("chmod "):
        return ""

    # echo
    if cmd.startswith("echo "):
        content = cmd[5:].strip()
        # Handle append to file
        if ">>" in content:
            parts = content.split(">>")
            log_event({
                "eventid": "honeypot.file.write",
                "src_ip": src_ip,
                "session": session_id,
                "input": cmd,
                "message": f"File write attempt: {parts[1].strip()}",
            })
            return ""
        if ">" in content:
            parts = content.split(">")
            log_event({
                "eventid": "honeypot.file.write",
                "src_ip": src_ip,
                "session": session_id,
                "input": cmd,
                "message": f"File write attempt: {parts[1].strip()}",
            })
            return ""
        # Strip quotes
        content = content.strip("'\"")
        return content

    # find
    if cmd.startswith("find "):
        if "*.conf" in cmd:
            return (
                "/etc/mysql/my.cnf\n"
                "/etc/nginx/nginx.conf\n"
                "/etc/ssh/sshd_config\n"
                "/etc/redis/redis.conf\n"
            )
        if "*.log" in cmd:
            return (
                "/var/log/auth.log\n"
                "/var/log/syslog\n"
                "/var/log/mysql/error.log\n"
                "/var/log/nginx/access.log\n"
            )
        return ""

    # mysql attempt
    if cmd.startswith("mysql"):
        return "ERROR 1045 (28000): Access denied for user 'root'@'localhost' (using password: YES)"

    # sudo
    if cmd.startswith("sudo "):
        subcmd = cmd[5:].strip()
        if subcmd == "-l":
            return (
                "Matching Defaults entries for root on prod-db-server:\n"
                "    env_reset, mail_badpass\n\n"
                "User root may run the following commands on prod-db-server:\n"
                "    (ALL : ALL) ALL"
            )
        return process_command(subcmd, cwd, session_id, src_ip)

    # nohup
    if cmd.startswith("nohup "):
        return "nohup: appending output to 'nohup.out'"

    # which / type
    if cmd.startswith("which ") or cmd.startswith("type "):
        prog = cmd.split()[-1]
        known = ["python3", "python", "perl", "gcc", "wget", "curl", "ssh", "mysql", "nginx", "docker", "git"]
        if prog in known:
            return f"/usr/bin/{prog}"
        return f"{prog} not found"

    # env / printenv
    if cmd in ("env", "printenv"):
        return (
            f"HOSTNAME={HOSTNAME}\n"
            "USER=root\n"
            "HOME=/root\n"
            "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\n"
            "SHELL=/bin/bash\n"
            "LANG=en_US.UTF-8\n"
            "TERM=xterm-256color\n"
        )

    # head / tail
    if cmd.startswith("head ") or cmd.startswith("tail "):
        parts = cmd.split()
        filepath = parts[-1]
        if not filepath.startswith("/"):
            filepath = cwd.rstrip("/") + "/" + filepath
        if filepath in FAKE_FS:
            lines = FAKE_FS[filepath].strip().split("\n")
            if cmd.startswith("head"):
                return "\n".join(lines[:10])
            else:
                return "\n".join(lines[-10:])
        return f"{parts[0]}: cannot open '{filepath}' for reading: No such file or directory"

    # grep
    if cmd.startswith("grep "):
        return ""

    # apt / yum / pip
    if cmd.startswith("apt ") or cmd.startswith("apt-get ") or cmd.startswith("yum ") or cmd.startswith("pip "):
        return "E: Could not open lock file - open (13: Permission denied)"

    # screen / tmux
    if cmd.startswith("screen ") or cmd.startswith("tmux"):
        return ""

    # Pipe handling - execute first command
    if "|" in cmd:
        first_cmd = cmd.split("|")[0].strip()
        return process_command(first_cmd, cwd, session_id, src_ip)

    # Running a downloaded file
    if cmd.startswith("./") or cmd.startswith("/tmp/"):
        log_event({
            "eventid": "honeypot.command.execute",
            "src_ip": src_ip,
            "session": session_id,
            "input": cmd,
            "message": f"Binary execution attempt: {cmd}",
        })
        return f"bash: {cmd}: Permission denied"

    # Try Gemini for unknown commands
    gemini_response = gemini_generate_response(cmd, cwd, "root")
    if gemini_response is not None:
        return gemini_response

    # Final fallback
    return f"bash: {cmd.split()[0]}: command not found"


# ─── SSH Server ──────────────────────────────────────────────────────
class HoneypotServer(paramiko.ServerInterface):
    """Custom SSH server that accepts specific credentials."""

    def __init__(self, src_ip, session_id):
        self.event = threading.Event()
        self.src_ip = src_ip
        self.session_id = session_id
        self.username = None

    def check_channel_request(self, kind, chanid):
        if kind == "session":
            return paramiko.OPEN_SUCCEEDED
        return paramiko.OPEN_FAILED_ADMINISTRATIVELY_PROHIBITED

    def check_auth_password(self, username, password):
        # Log every attempt
        valid = username in VALID_CREDENTIALS and password in VALID_CREDENTIALS[username]

        log_event({
            "eventid": "honeypot.login.success" if valid else "honeypot.login.failed",
            "src_ip": self.src_ip,
            "session": self.session_id,
            "username": username,
            "password": password,
            "message": f"Login attempt [{username}/{password}] {'succeeded' if valid else 'failed'}",
        })

        if valid:
            self.username = username
            return paramiko.AUTH_SUCCESSFUL
        return paramiko.AUTH_FAILED

    def check_channel_shell_request(self, channel):
        self.event.set()
        return True

    def check_channel_pty_request(self, channel, term, width, height, pixelwidth, pixelheight, modes):
        return True

    def get_allowed_auths(self, username):
        return "password"


def handle_connection(client_socket, client_address):
    """Handle a single SSH connection."""
    src_ip = client_address[0]
    session_id = uuid.uuid4().hex[:12]

    log_event({
        "eventid": "honeypot.session.connect",
        "src_ip": src_ip,
        "src_port": client_address[1],
        "session": session_id,
        "message": f"New connection from {src_ip}:{client_address[1]}",
    })

    try:
        transport = paramiko.Transport(client_socket)
        rsa_key = paramiko.RSAKey(filename="honeypot_rsa_key")
        transport.add_server_key(rsa_key)
        transport.local_version = BANNER

        server = HoneypotServer(src_ip, session_id)

        try:
            transport.start_server(server=server)
        except paramiko.SSHException:
            print(f"[!] SSH negotiation failed for {src_ip}")
            return

        channel = transport.accept(30)
        if channel is None:
            print(f"[!] No channel opened by {src_ip}")
            transport.close()
            return

        # Wait for shell request
        server.event.wait(10)
        if not server.event.is_set():
            transport.close()
            return

        # Launch fake shell
        handle_shell(channel, session_id, src_ip, server.username or "root")

    except Exception as e:
        print(f"[!] Connection error from {src_ip}: {e}")
    finally:
        try:
            transport.close()
        except:
            pass


# ─── Main ────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("  CUSTOM SSH HONEYPOT")
    print("  Cybersecurity Course Project")
    print("=" * 60)
    print(f"  [*] Listening on {HOST}:{PORT}")
    print(f"  [*] Hostname: {HOSTNAME}")
    print(f"  [*] Banner: {BANNER}")
    print(f"  [*] Log file: {LOG_FILE}")
    print(f"  [*] Valid credentials: {sum(len(v) for v in VALID_CREDENTIALS.values())} combos")
    print("=" * 60)

    os.makedirs(LOG_DIR, exist_ok=True)

    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

    try:
        server_socket.bind((HOST, PORT))
        server_socket.listen(10)
        print(f"\n[*] Honeypot is live. Waiting for connections...\n")
    except Exception as e:
        print(f"[!] Failed to bind to {HOST}:{PORT}: {e}")
        sys.exit(1)

    try:
        while True:
            client_socket, client_address = server_socket.accept()
            thread = threading.Thread(
                target=handle_connection,
                args=(client_socket, client_address),
                daemon=True
            )
            thread.start()
    except KeyboardInterrupt:
        print("\n[*] Shutting down honeypot...")
    finally:
        server_socket.close()


if __name__ == "__main__":
    main()
