# AWS EC2 Deployment Guide

## 1. Launch EC2 Instance

1. Go to **AWS Console → EC2 → Launch Instance**
2. Settings:
   - **AMI**: Ubuntu 22.04 LTS (or Amazon Linux 2023)
   - **Instance type**: `t3.small` (2 GB RAM) — minimum for Puppeteer/Chromium
   - **Key pair**: Create or select one (for SSH access)
   - **Storage**: 20 GB gp3
3. **Security Group** — allow these inbound rules:
   | Type  | Port | Source    |
   |-------|------|-----------|
   | SSH   | 22   | Your IP   |
   | HTTP  | 80   | 0.0.0.0/0 |

4. Click **Launch Instance**

## 2. Deploy the App

### Option A: Clone from Git
```bash
ssh -i your-key.pem ubuntu@<EC2_PUBLIC_IP>

# Clone your repo
git clone <your-repo-url> url-monitor-project
cd url-monitor-project

# Run setup
bash setup-ec2.sh
```

### Option B: SCP files from local machine
```powershell
# From your Windows machine
scp -i your-key.pem -r .\* ubuntu@<EC2_PUBLIC_IP>:~/url-monitor-project/
ssh -i your-key.pem ubuntu@<EC2_PUBLIC_IP>
cd url-monitor-project
bash setup-ec2.sh
```

## 3. Update Cron Job

Update your **cron-job.org** schedule to hit the new URL:
```
http://<EC2_PUBLIC_IP>/api/run
```

## 4. Useful Commands

```bash
# View logs
sudo docker compose logs -f

# Restart
sudo docker compose restart

# Rebuild after code changes
sudo docker compose up -d --build

# Stop
sudo docker compose down
```

## 5. Update BASE_URL for Teams Screenshots

The `BASE_URL` environment variable is auto-set from the EC2 public IP in `docker-compose.yml`. If your IP changes (e.g., after stop/start), update it:

```bash
export EC2_PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)
sudo docker compose up -d
```

> **Tip**: To get a permanent IP, allocate an **Elastic IP** in EC2 console and associate it with your instance. Then set `EC2_PUBLIC_IP` to that Elastic IP.
