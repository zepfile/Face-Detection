# Raspberry Pi Setup Guide (Face Detection AI Service)

This guide sets up a Raspberry Pi to run the `ai-service` part of this project.

## 1. Install Raspberry Pi OS (Raspbian)

1. Download and open **Raspberry Pi Imager** on your laptop/PC.
2. Choose:
   - Device: your Raspberry Pi model
   - OS: **Raspberry Pi OS (64-bit)** (recommended)
   - Storage: SD card
3. In advanced options, enable:
   - SSH
   - Wi-Fi (if needed)
   - hostname, username, password
4. Flash the SD card and boot the Pi.

After first boot, update packages:

```bash
sudo apt update
sudo apt full-upgrade -y
sudo reboot
```

## 2. Connect and Verify Camera

Before connecting CSI camera, power off the Pi.

1. Attach ribbon cable to the Pi CSI port.
2. Attach other end to camera module.
3. Boot Pi and test camera:

```bash
libcamera-hello -t 5000
libcamera-jpeg -o test.jpg
```

For USB camera, check device:

```bash
ls /dev/video*
```

Use `CAMERA_ID=0` for a single default USB camera, or set an IP stream URL.
For multi-camera mode use `CAMERA_IDS=0,1,rtsp://<camera-ip>/stream`.

## 3. Install Python and Build Dependencies

Install required system packages for OpenCV and `face_recognition`:

```bash
sudo apt update
sudo apt install -y \
  python3 python3-venv python3-pip git \
  build-essential cmake pkg-config \
  libjpeg-dev libtiff5-dev libopenjp2-7-dev libpng-dev \
  libavcodec-dev libavformat-dev libswscale-dev libv4l-dev \
  libxvidcore-dev libx264-dev \
  libatlas-base-dev gfortran \
  libopenblas-dev liblapack-dev \
  libhdf5-dev libhdf5-serial-dev \
  libgtk-3-dev \
  libgl1 libglib2.0-0
```

Notes:
- `face_recognition` may take time to compile on Pi during pip install.
- Prefer Raspberry Pi OS 64-bit for better compatibility.

## 4. Clone Project and Set Up AI Service

```bash
cd /home/pi
git clone <YOUR_REPO_URL> face-detection
cd face-detection/ai-service

python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
```

## 5. Configure Environment Variables

Create `.env` in `ai-service`:

```bash
cd /home/pi/face-detection/ai-service
cat > .env << 'EOF'
BACKEND_URL=http://<BACKEND_IP>:8080
CAMERA_ID=0
CAMERA_IDS=0,1
ENCODINGS_PATH=/home/pi/face-detection/ai-service/models/encodings.pkl
ATTENDANCE_INTERVAL=300
CONFIDENCE_THRESHOLD=0.6
# If backend requires JWT for /api/attendance/ai:
# BACKEND_TOKEN=<JWT_TOKEN>
EOF
```

## 6. Test Run Manually

```bash
cd /home/pi/face-detection/ai-service
source .venv/bin/activate
python main.py
```

If it starts and captures frames correctly, continue to service setup.

## 7. Run AI Service as systemd Service

Create service file:

```bash
sudo nano /etc/systemd/system/face-detection-ai.service
```

Paste:

```ini
[Unit]
Description=Face Detection AI Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/face-detection/ai-service
Environment=PYTHONUNBUFFERED=1
ExecStart=/home/pi/face-detection/ai-service/.venv/bin/python /home/pi/face-detection/ai-service/main.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now face-detection-ai.service
sudo systemctl status face-detection-ai.service
```

View logs:

```bash
journalctl -u face-detection-ai.service -f
```

## 8. Quick Troubleshooting

- Camera not detected:
  - Re-seat ribbon cable
  - Test with `libcamera-hello`
  - Reboot after reconnecting camera
- `face_recognition` install fails:
  - Ensure build packages are installed
  - Re-run pip install in virtual env
- Service starts but no backend updates:
  - Check `BACKEND_URL`
  - Verify backend port/firewall
  - Check JWT token requirement and `BACKEND_TOKEN`
