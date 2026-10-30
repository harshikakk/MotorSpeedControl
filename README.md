# IoT-Based DC Motor Speed Control and Monitoring System Dashboard

This directory contains the complete front-end dashboard for controlling and monitoring the DC motor via Google Firebase (`harshini-feb82`), ESP32, and PIStudio HMI.

## Files Structure

- `index.html` — Main dashboard layout (Overview, Motor Control, Live Monitoring, Performance Curves, History, Device Status).
- `styles.css` — Enterprise industrial light theme styling.
- `app.js` — Real-time bidirectional Firebase synchronization, motor command handlers, Chart.js graphs, and Excel/CSV export.
- `firebase-config.js` — Firebase SDK initialization configured with `harshini-feb82`.

## How to Publish on GitHub & Get Your Live URL (GitHub Pages)

### Step 1: Create a New Repository on GitHub
1. Go to [github.com/new](https://github.com/new).
2. Set **Repository name** to something like `dc-motor-iot-dashboard`.
3. Choose **Public**.
4. Click **Create repository**.

### Step 2: Upload Files
1. On the empty repository page, click **uploading an existing file**.
2. Drag and drop all the files from this `motor_control_website` folder:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `firebase-config.js`
3. Click **Commit changes**.

### Step 3: Turn On GitHub Pages
1. In your GitHub repository, click on **Settings** (top tab).
2. In the left sidebar, click on **Pages** (under "Code and automation").
3. Under **Branch**, select `main` (or `master`) and folder `/ (root)`.
4. Click **Save**.

### Step 4: Get Your Live Website URL!
- Wait 30–60 seconds and refresh the page.
- At the top of the Pages section, GitHub will give you your live URL:
  `https://<your-username>.github.io/<repository-name>/`
- You can now open this URL from your laptop, tablet, or phone to control your motor in real time!
