#!/bin/bash
# EC2 Setup Script — Run this on a fresh Amazon Linux 2023 or Ubuntu 22.04 instance
# Usage: ssh into EC2, then:  bash setup-ec2.sh

set -e

echo "=== Installing Docker ==="
if command -v apt-get &> /dev/null; then
  # Ubuntu / Debian
  sudo apt-get update
  sudo apt-get install -y docker.io docker-compose-plugin
  sudo systemctl enable docker
  sudo systemctl start docker
  sudo usermod -aG docker $USER
else
  # Amazon Linux 2023
  sudo yum update -y
  sudo yum install -y docker
  sudo systemctl enable docker
  sudo systemctl start docker
  sudo usermod -aG docker $USER
  # Install docker compose plugin
  sudo mkdir -p /usr/local/lib/docker/cli-plugins
  sudo curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi

echo "=== Getting EC2 Public IP ==="
# Use AWS Instance Metadata Service (IMDSv2 with token, fall back to IMDSv1)
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || echo "")
if [ -n "$TOKEN" ]; then
  EC2_PUBLIC_IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
    http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "localhost")
else
  EC2_PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "localhost")
fi
echo "Public IP: $EC2_PUBLIC_IP"
export EC2_PUBLIC_IP

echo "=== Building and starting container ==="
# Use newgrp to pick up the docker group without re-login
sudo docker compose up -d --build

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  URL Monitor deployed successfully!              ║"
echo "║  Dashboard: http://$EC2_PUBLIC_IP                ║"
echo "║  API:       http://$EC2_PUBLIC_IP/api/results    ║"
echo "║  Health:    http://$EC2_PUBLIC_IP/api/health     ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "Set up cron-job.org to hit: http://$EC2_PUBLIC_IP/api/run"
