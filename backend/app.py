import json
import os
from collections import Counter
from flask import Flask, jsonify, request
from flask_cors import CORS
import requests as http_requests

app = Flask(__name__)
CORS(app)

COWRIE_LOG = "/home/honeypot/custom-honeypot/logs/honeypot.json"


def read_logs():
    """Read and parse all Cowrie JSON log entries."""
    entries = []
    if not os.path.exists(COWRIE_LOG):
        return entries
    with open(COWRIE_LOG, "r") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    return entries


def get_login_attempts(entries):
    """Extract all login attempts (success and failure)."""
    attempts = []
    for e in entries:
        if e.get("eventid") in ("honeypot.login.success", "honeypot.login.failed"):
            attempts.append({
                "timestamp": e.get("timestamp"),
                "src_ip": e.get("src_ip"),
                "username": e.get("username"),
                "password": e.get("password"),
                "success": e.get("eventid") == "honeypot.login.success",
                "session": e.get("session"),
            })
    return attempts


def get_sessions(entries):
    """Group entries by session and extract commands."""
    sessions = {}
    for e in entries:
        sid = e.get("session")
        if not sid:
            continue
        if sid not in sessions:
            sessions[sid] = {
                "id": sid,
                "src_ip": e.get("src_ip", ""),
                "start": e.get("timestamp", ""),
                "commands": [],
                "credentials": [],
                "downloads": [],
            }
        eid = e.get("eventid", "")
        if eid == "honeypot.command.input":
            sessions[sid]["commands"].append({
                "timestamp": e.get("timestamp"),
                "input": e.get("input"),
            })
        elif eid in ("honeypot.login.success", "honeypot.login.failed"):
            sessions[sid]["credentials"].append({
                "username": e.get("username"),
                "password": e.get("password"),
                "success": eid == "honeypot.login.success",
            })
        elif eid == "honeypot.session.file_download":
            sessions[sid]["downloads"].append({
                "timestamp": e.get("timestamp"),
                "url": e.get("url", ""),
                "shasum": e.get("shasum", ""),
            })

    # Calculate duration and filter empty sessions
    result = []
    for sid, s in sessions.items():
        timestamps = [e.get("timestamp") for e in entries if e.get("session") == sid and e.get("timestamp")]
        if timestamps:
            s["start"] = min(timestamps)
            s["end"] = max(timestamps)
        if s["commands"] or s["credentials"]:
            result.append(s)
    return result


def get_downloads(entries):
    """Extract all file download events."""
    downloads = []
    for e in entries:
        if e.get("eventid") == "honeypot.session.file_download":
            downloads.append({
                "timestamp": e.get("timestamp"),
                "url": e.get("url", ""),
                "shasum": e.get("shasum", ""),
                "session": e.get("session"),
            })
    return downloads


@app.route("/api/overview")
def overview():
    entries = read_logs()
    attempts = get_login_attempts(entries)
    sessions = get_sessions(entries)
    downloads = get_downloads(entries)

    unique_ips = list(set(a["src_ip"] for a in attempts))
    success_count = sum(1 for a in attempts if a["success"])

    return jsonify({
        "total_attempts": len(attempts),
        "unique_ips": len(unique_ips),
        "success_count": success_count,
        "success_rate": round((success_count / len(attempts)) * 100, 1) if attempts else 0,
        "total_sessions": len(sessions),
        "total_downloads": len(downloads),
    })


@app.route("/api/login_attempts")
def login_attempts():
    entries = read_logs()
    return jsonify(get_login_attempts(entries))


@app.route("/api/credentials")
def credentials():
    entries = read_logs()
    attempts = get_login_attempts(entries)

    usernames = Counter(a["username"] for a in attempts)
    passwords = Counter(a["password"] for a in attempts)

    return jsonify({
        "top_usernames": usernames.most_common(20),
        "top_passwords": passwords.most_common(20),
    })


@app.route("/api/sessions")
def sessions():
    entries = read_logs()
    return jsonify(get_sessions(entries))


@app.route("/api/session/<session_id>")
def session_detail(session_id):
    entries = read_logs()
    sessions = get_sessions(entries)
    for s in sessions:
        if s["id"] == session_id:
            return jsonify(s)
    return jsonify({"error": "Session not found"}), 404


@app.route("/api/downloads")
def downloads():
    entries = read_logs()
    return jsonify(get_downloads(entries))


@app.route("/api/timeline")
def timeline():
    entries = read_logs()
    attempts = get_login_attempts(entries)
    hourly = Counter()
    for a in attempts:
        if a["timestamp"]:
            from datetime import datetime, timezone, timedelta
            utc_time = datetime.fromisoformat(a["timestamp"].replace("Z", "+00:00"))
            ist_time = utc_time + timedelta(hours=5, minutes=30)
            hour = str(ist_time.hour).zfill(2)
            hourly[hour] += 1
    return jsonify(dict(sorted(hourly.items())))


@app.route("/api/classify", methods=["POST"])
def classify_sessions():
    """Auto-classify new sessions using Gemini. Caches previous results."""
    body = request.get_json()
    api_key = body.get("api_key", "")
    if not api_key:
        return jsonify({"error": "No API key provided"}), 400

    already_classified = body.get("classified_ids", [])

    entries = read_logs()
    sessions = get_sessions(entries)
    results = []

    for s in sessions:
        if s["id"] in already_classified:
            continue
        cmd_list = ", ".join([c["input"] for c in s["commands"][:10]])
        cred_list = ", ".join([f"{c['username']}/{c['password']}" for c in s["credentials"]])
        dl_list = ", ".join([d["url"] for d in s["downloads"]]) or "None"

        prompt = f"""Analyze this SSH honeypot session and respond ONLY with a JSON object (no markdown, no backticks, no explanation):
{{"attack_type": "one of: brute_force, recon, cryptominer, botnet, persistence, scanner, manual_exploit",
"skill_level": "one of: script_kiddie, intermediate, advanced",
"severity": "one of: low, medium, high, critical",
"summary": "one sentence description of what the attacker did"}}

Session: IP={s['src_ip']}, Commands=[{cmd_list}], Credentials=[{cred_list}], Downloads=[{dl_list}]"""

        try:
            res = http_requests.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}",
                json={"contents": [{"parts": [{"text": prompt}]}]},
                timeout=30
            )
            if res.ok:
                text = res.json().get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "{}")
                text = text.strip().strip("`").replace("json\n", "").replace("json", "").strip()
                import json as j
                try:
                    classification = j.loads(text)
                except:
                    classification = {"attack_type": "unknown", "skill_level": "unknown", "severity": "unknown", "summary": text[:100]}
            else:
                classification = {"attack_type": "error", "skill_level": "unknown", "severity": "unknown", "summary": f"API error: {res.status_code}"}
        except Exception as e:
            classification = {"attack_type": "error", "skill_level": "unknown", "severity": "unknown", "summary": str(e)[:100]}

        classification["session_id"] = s["id"]
        classification["src_ip"] = s["src_ip"]
        classification["cmd_count"] = len(s["commands"])
        results.append(classification)

    return jsonify(results)


@app.route("/api/heatmap")
def heatmap():
    """Return attack counts by day-of-week and hour for heatmap."""
    from datetime import datetime, timezone, timedelta
    entries = read_logs()
    attempts = get_login_attempts(entries)
    grid = {}
    for a in attempts:
        if a["timestamp"]:
            utc_time = datetime.fromisoformat(a["timestamp"].replace("Z", "+00:00"))
            ist_time = utc_time + timedelta(hours=5, minutes=30)
            day = ist_time.strftime("%a")
            hour = ist_time.hour
            key = f"{day}-{hour}"
            grid[key] = grid.get(key, 0) + 1
    return jsonify(grid)


@app.route("/api/command_freq")
def command_freq():
    """Return command frequency counts."""
    entries = read_logs()
    cmds = Counter()
    for e in entries:
        if e.get("eventid") == "honeypot.command.input":
            cmd = e.get("input", "").split()[0] if e.get("input", "").split() else ""
            if cmd and cmd not in ("exit", "logout", "quit"):
                cmds[cmd] += 1
    return jsonify(cmds.most_common(30))


@app.route("/api/attack_timeline")
def attack_timeline():
    """Return all events with timestamps for scatter plot."""
    from datetime import datetime, timezone, timedelta
    entries = read_logs()
    events = []
    for e in entries:
        eid = e.get("eventid", "")
        if eid in ("honeypot.login.success", "honeypot.login.failed", "honeypot.command.input", "honeypot.session.file_download"):
            utc_time = datetime.fromisoformat(e.get("timestamp", "").replace("Z", "+00:00"))
            ist_time = utc_time + timedelta(hours=5, minutes=30)
            events.append({
                "time": ist_time.isoformat(),
                "type": eid.split(".")[-1],
                "src_ip": e.get("src_ip", ""),
                "detail": e.get("input", e.get("username", "")),
                "session": e.get("session", ""),
            })
    return jsonify(events)


@app.route("/api/password_strength")
def password_strength():
    """Categorize passwords by strength."""
    import re
    entries = read_logs()
    attempts = get_login_attempts(entries)
    categories = {"weak": 0, "medium": 0, "strong": 0}
    for a in attempts:
        pwd = a.get("password", "")
        length = len(pwd)
        has_upper = bool(re.search(r"[A-Z]", pwd))
        has_lower = bool(re.search(r"[a-z]", pwd))
        has_digit = bool(re.search(r"[0-9]", pwd))
        has_special = bool(re.search(r"[^A-Za-z0-9]", pwd))
        score = sum([has_upper, has_lower, has_digit, has_special])
        if length < 6 or score <= 1:
            categories["weak"] += 1
        elif length < 10 or score <= 2:
            categories["medium"] += 1
        else:
            categories["strong"] += 1
    return jsonify(categories)


@app.route("/api/kill_chain")
def kill_chain():
    """Show how far attackers get through the kill chain."""
    entries = read_logs()
    sessions = get_sessions(entries)
    stages = {"login_attempt": 0, "login_success": 0, "recon": 0, "download": 0, "execute": 0, "persist": 0}
    recon_cmds = {"whoami", "id", "uname", "ifconfig", "netstat", "ps", "cat", "ls", "find", "hostname", "w", "last", "df", "free", "ip"}
    persist_cmds = {"crontab", "echo", "chmod"}

    for s in sessions:
        stages["login_attempt"] += 1
        has_success = any(c.get("success") for c in s.get("credentials", []))
        if has_success:
            stages["login_success"] += 1
        cmds = [c.get("input", "").split()[0] for c in s.get("commands", []) if c.get("input")]
        if any(c in recon_cmds for c in cmds):
            stages["recon"] += 1
        if s.get("downloads"):
            stages["download"] += 1
        if any(c.startswith("./") or c.startswith("/tmp/") for c in [cc.get("input", "") for cc in s.get("commands", [])]):
            stages["execute"] += 1
        if any(c in persist_cmds for c in cmds):
            stages["persist"] += 1
    return jsonify(stages)


@app.route("/api/session_durations")
def session_durations():
    """Return session durations in seconds."""
    from datetime import datetime
    entries = read_logs()
    sessions = get_sessions(entries)
    durations = []
    for s in sessions:
        if s.get("start") and s.get("end"):
            try:
                start = datetime.fromisoformat(s["start"].replace("Z", "+00:00"))
                end = datetime.fromisoformat(s["end"].replace("Z", "+00:00"))
                dur = (end - start).total_seconds()
                durations.append({"session": s["id"], "duration": dur, "src_ip": s["src_ip"], "cmds": len(s["commands"])})
            except:
                pass
    return jsonify(durations)


@app.route("/api/geo_attacks")
def geo_attacks():
    """Return attack locations for world map. Uses simulated geo for private IPs."""
    entries = read_logs()
    attempts = get_login_attempts(entries)
    ip_counts = Counter(a["src_ip"] for a in attempts)

    # Simulated geo data for private IPs (for demo purposes)
    # In production, you would use a GeoIP database like MaxMind
    SIMULATED_GEO = {
        "192.168.122.1": {"lat": 13.08, "lon": 80.27, "country": "India", "city": "Chennai"},
        "default_pool": [
            {"lat": 55.75, "lon": 37.62, "country": "Russia", "city": "Moscow"},
            {"lat": 39.90, "lon": 116.40, "country": "China", "city": "Beijing"},
            {"lat": 52.52, "lon": 13.40, "country": "Germany", "city": "Berlin"},
            {"lat": 37.77, "lon": -122.42, "country": "USA", "city": "San Francisco"},
            {"lat": -23.55, "lon": -46.63, "country": "Brazil", "city": "Sao Paulo"},
            {"lat": 51.51, "lon": -0.13, "country": "UK", "city": "London"},
            {"lat": 35.69, "lon": 139.69, "country": "Japan", "city": "Tokyo"},
            {"lat": 1.35, "lon": 103.82, "country": "Singapore", "city": "Singapore"},
            {"lat": 48.86, "lon": 2.35, "country": "France", "city": "Paris"},
            {"lat": 37.57, "lon": 126.98, "country": "South Korea", "city": "Seoul"},
            {"lat": 52.37, "lon": 4.90, "country": "Netherlands", "city": "Amsterdam"},
            {"lat": -33.87, "lon": 151.21, "country": "Australia", "city": "Sydney"},
        ]
    }

    locations = []
    pool_idx = 0
    for ip, count in ip_counts.items():
        if ip in SIMULATED_GEO:
            geo = SIMULATED_GEO[ip]
            locations.append({**geo, "ip": ip, "count": count})
        elif ip.startswith("192.168.") or ip.startswith("10.") or ip.startswith("172."):
            # Distribute private IPs across simulated locations for demo
            pool = SIMULATED_GEO["default_pool"]
            geo = pool[pool_idx % len(pool)]
            locations.append({**geo, "ip": ip, "count": count})
            pool_idx += 1
        else:
            # For real public IPs, you would query a GeoIP service
            locations.append({"lat": 0, "lon": 0, "country": "Unknown", "city": "Unknown", "ip": ip, "count": count})

    return jsonify(locations)


@app.route("/api/live_feed")
def live_feed():
    """Return the last 50 events for live feed."""
    from datetime import datetime, timezone, timedelta
    entries = read_logs()
    events = []
    for e in entries[-50:]:
        eid = e.get("eventid", "")
        utc_time = datetime.fromisoformat(e.get("timestamp", "").replace("Z", "+00:00"))
        ist_time = utc_time + timedelta(hours=5, minutes=30)
        event = {
            "time": ist_time.strftime("%H:%M:%S"),
            "type": eid,
            "src_ip": e.get("src_ip", ""),
            "detail": "",
        }
        if "login" in eid:
            event["detail"] = e.get("username", "") + "/" + e.get("password", "")
        elif "command" in eid:
            event["detail"] = e.get("input", "")
        elif "download" in eid:
            event["detail"] = e.get("url", "")
        elif "connect" in eid:
            event["detail"] = "New connection"
        elif "closed" in eid:
            event["detail"] = "Session ended"
        elif "gemini" in eid:
            event["detail"] = "AI response: " + e.get("input", "")
        else:
            event["detail"] = e.get("message", "")[:60]
        events.append(event)
    events.reverse()
    return jsonify(events)


@app.route("/api/top_ips")
def top_ips():
    """Return top IPs with attack counts."""
    entries = read_logs()
    attempts = get_login_attempts(entries)
    ip_counts = Counter(a["src_ip"] for a in attempts)
    sessions_by_ip = {}
    for s in get_sessions(entries):
        ip = s["src_ip"]
        if ip not in sessions_by_ip:
            sessions_by_ip[ip] = {"sessions": 0, "commands": 0, "downloads": 0}
        sessions_by_ip[ip]["sessions"] += 1
        sessions_by_ip[ip]["commands"] += len(s["commands"])
        sessions_by_ip[ip]["downloads"] += len(s["downloads"])
    
    result = []
    for ip, count in ip_counts.most_common(10):
        info = sessions_by_ip.get(ip, {"sessions": 0, "commands": 0, "downloads": 0})
        result.append({
            "ip": ip,
            "attempts": count,
            "sessions": info["sessions"],
            "commands": info["commands"],
            "downloads": info["downloads"],
        })
    return jsonify(result)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
