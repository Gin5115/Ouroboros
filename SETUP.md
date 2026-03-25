# Ouroboros - Detailed Setup Guide

Complete step-by-step guide from VM creation to running the full system.

## VM Setup (skip if you have an Ubuntu server)

### Install KVM (Fedora)

```bash
sudo dnf install -y @virtualization virt-manager
sudo systemctl enable --now libvirtd
```

### Create VM in virt-manager

- OS: Ubuntu Server 24.04 LTS
- RAM: 2048 MiB, CPUs: 2, Disk: 20 GB, Network: NAT

### Ubuntu Installation

- Choose Ubuntu Server (not minimized)
- Note the DHCP IP address
- Create a user account and enable OpenSSH server
- Complete and reboot

### Initial Setup

```bash
ssh youruser@VM_IP
sudo apt update && sudo apt upgrade -y
sudo apt install -y git python3 python3-venv python3-pip libssl-dev libffi-dev build-essential python3-dev
```

## Honeypot Setup

```bash
mkdir ~/custom-honeypot && cd ~/custom-honeypot
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Generate persistent RSA key:

```bash
python3 -c "import paramiko; k=paramiko.RSAKey.generate(2048); k.write_private_key_file('honeypot_rsa_key')"
```

Place honeypot.py in this directory. Edit VALID_CREDENTIALS and other configuration as needed.

Start:

```bash
export GEMINI_API_KEY="your_key"
python3 honeypot.py
```

## Backend Setup

In a separate SSH session:

```bash
mkdir ~/honeypot-dashboard && cd ~/honeypot-dashboard
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Place app.py here. Update the log file path to match your honeypot log location.

Set permissions:

```bash
sudo chmod -R o+rx ~/custom-honeypot/logs/
```

Start:

```bash
python3 app.py
```

## Dashboard Setup (Host Machine)

```bash
sudo dnf install -y nodejs npm
cd Ouroboros/dashboard
npm install
```

Update API_BASE in src/HoneypotDashboard.jsx to your VM IP. Start:

```bash
npm start
```

## Running Everything

You need 3 terminals:

- Terminal 1 (VM): cd ~/custom-honeypot && source venv/bin/activate && GEMINI_API_KEY="..." python3 honeypot.py
- Terminal 2 (VM): cd ~/honeypot-dashboard && source venv/bin/activate && python3 app.py
- Terminal 3 (Host): cd Ouroboros/dashboard && npm start

## Troubleshooting

- SSH key warning: ssh-keygen -R "[VM_IP]:2223"
- Flask cannot read logs: sudo chmod -R o+rx ~/custom-honeypot/logs/
- Dashboard connection error: Check Flask is running and API_BASE matches VM IP
- Gemini quota exceeded: Wait 30 seconds or switch to gemini-2.5-flash-lite
- VM IP changed: Run ip a on VM, update configs
- React import error: Ensure imports are above const HOSTNAME in the JSX file
