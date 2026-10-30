// ============================================================================
// SPARK DRIVES & AUTOMATION - INDUSTRIAL IoT CONTROL & MONITORING PLATFORM
// Complete Production Application Logic for DC Motor Control System
// ============================================================================

(function () {
  'use strict';

  // Global Application State
  const AppState = {
    firebaseConnected: false,
    esp32Online: false,
    lastHeartbeatTime: 0,
    motor: {
      desired: {
        command: "OFF",
        speedPercent: 0,
        direction: "FORWARD",
        source: "website",
        updatedAt: 0
      },
      actual: {
        command: "OFF",
        requestedSpeedPercent: 0,
        appliedPwm: 0,
        direction: "FORWARD",
        measuredRpm: null,
        measuredTorqueNm: null,
        measuredVoltageV: null,
        measuredCurrentA: null,
        measuredPowerW: null,
        measuredEfficiencyPercent: null,
        controllerOnline: false,
        lastSeen: 0
      }
    },
    historyEvents: [],
    liveTimeSeries: {
      labels: [],
      speedData: [],
      stateData: []
    },
    charts: {}
  };

  // Firebase Database Instance
  const db = window.SparkFirebase ? window.SparkFirebase.rtdb : (window.firebase ? firebase.database() : null);

  // Cached DOM Elements
  const DOM = {
    // Top Bar Badges
    liveClock: document.getElementById('live-clock'),
    firebaseConnBadge: document.getElementById('firebase-conn-badge'),
    esp32ConnBadge: document.getElementById('esp32-conn-badge'),
    sidebarStatusDot: document.getElementById('sidebar-status-dot'),
    sidebarStatusText: document.getElementById('sidebar-status-text'),
    headerPageTitle: document.getElementById('header-page-title'),
    breadcrumbCurrent: document.getElementById('breadcrumb-current'),

    // Dashboard Overview
    dashMotorStatus: document.getElementById('dash-motor-status'),
    dashMotorIndicator: document.getElementById('dash-motor-indicator'),
    dashSpeedPct: document.getElementById('dash-speed-pct'),
    dashAppliedPwm: document.getElementById('dash-applied-pwm'),
    dashDirection: document.getElementById('dash-direction'),
    dashMeasuredRpm: document.getElementById('dash-measured-rpm'),
    quickStartBtn: document.getElementById('quick-start-btn'),
    quickStopBtn: document.getElementById('quick-stop-btn'),
    quickSpeedSlider: document.getElementById('quick-speed-slider'),
    quickSliderLabel: document.getElementById('quick-slider-label'),
    dashEventsList: document.getElementById('dash-events-list'),

    // Dedicated Control Page
    ctrlMotorIndicator: document.getElementById('ctrl-motor-indicator'),
    ctrlStateText: document.getElementById('ctrl-state-text'),
    ctrlPwmText: document.getElementById('ctrl-pwm-text'),
    ctrlStartBtn: document.getElementById('ctrl-start-btn'),
    ctrlStopBtn: document.getElementById('ctrl-stop-btn'),
    ctrlSpeedSlider: document.getElementById('ctrl-speed-slider'),
    ctrlSpeedNum: document.getElementById('ctrl-speed-num'),
    dirFwdBtn: document.getElementById('dir-fwd-btn'),
    dirRevBtn: document.getElementById('dir-rev-btn'),
    ctrlSourceDisplay: document.getElementById('ctrl-source-display'),
    ctrlLastUpdated: document.getElementById('ctrl-last-updated'),

    // Live Monitoring
    monCmdState: document.getElementById('mon-cmd-state'),
    monCmdSpeed: document.getElementById('mon-cmd-speed'),
    monCmdPwm: document.getElementById('mon-cmd-pwm'),
    monCmdDir: document.getElementById('mon-cmd-dir'),

    // Device Status Page
    statusEspBadge: document.getElementById('status-esp-badge'),
    statusEspIp: document.getElementById('status-esp-ip'),
    statusEspMac: document.getElementById('status-esp-mac'),
    statusEspLastSeen: document.getElementById('status-esp-lastseen'),

    // History Page
    histFilterSource: document.getElementById('hist-filter-source'),
    historyTableBody: document.getElementById('history-table-body'),
    exportCsvBtn: document.getElementById('export-csv-btn'),
    exportExcelBtn: document.getElementById('export-excel-btn')
  };

  // ==========================================================================
  // ROUTING & NAVIGATION
  // ==========================================================================
  function initRouter() {
    const navLinks = document.querySelectorAll('.nav-item[data-route]');
    const pages = document.querySelectorAll('.page-view');

    function navigate(route) {
      pages.forEach(p => p.style.display = 'none');
      navLinks.forEach(l => l.classList.remove('active'));

      const activePage = document.getElementById(`page-${route}`) || document.getElementById('page-dashboard');
      const activeLink = document.querySelector(`.nav-item[data-route="${route}"]`) || navLinks[0];

      if (activePage) activePage.style.display = 'block';
      if (activeLink) activeLink.classList.add('active');

      // Update Title
      if (DOM.headerPageTitle) {
        DOM.headerPageTitle.textContent = activeLink.querySelector('.nav-label').textContent;
      }
      if (DOM.breadcrumbCurrent) {
        DOM.breadcrumbCurrent.textContent = activeLink.querySelector('.nav-label').textContent;
      }

      // Re-render charts if navigating to performance
      if (route === 'performance') {
        setTimeout(initPerformanceCharts, 100);
      }
      lucide.createIcons();
    }

    navLinks.forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        const route = link.getAttribute('data-route');
        window.location.hash = route;
        navigate(route);
      });
    });

    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace('#', '') || 'dashboard';
      navigate(hash);
    });

    const initialRoute = window.location.hash.replace('#', '') || 'dashboard';
    navigate(initialRoute);
  }

  // ==========================================================================
  // LIVE CLOCK (IST)
  // ==========================================================================
  function updateLiveClock() {
    if (DOM.liveClock) {
      const now = new Date();
      DOM.liveClock.textContent = now.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour12: false
      }) + ' IST';
    }
  }
  setInterval(updateLiveClock, 1000);
  updateLiveClock();

  // ==========================================================================
  // FIREBASE REAL-TIME LISTENERS
  // ==========================================================================
  function initFirebaseSync() {
    if (!db) {
      console.error("[FIREBASE] Database instance not found.");
      return;
    }

    // 1. Connection state
    db.ref('.info/connected').on('value', snap => {
      const isConnected = !!snap.val();
      AppState.firebaseConnected = isConnected;
      if (DOM.firebaseConnBadge) {
        if (isConnected) {
          DOM.firebaseConnBadge.className = 'conn-badge connected';
          DOM.firebaseConnBadge.innerHTML = '<span class="pulse-dot on"></span> Firebase Live';
        } else {
          DOM.firebaseConnBadge.className = 'conn-badge waiting';
          DOM.firebaseConnBadge.innerHTML = '<span class="pulse-dot connecting"></span> Firebase Disconnected';
        }
      }
    });

    // 2. Listen to /motor/desired
    db.ref('motor/desired').on('value', snap => {
      const data = snap.val();
      if (data) {
        AppState.motor.desired = data;
        updateDesiredUI(data);
      }
    });

    // 3. Listen to /motor/actual (Reported by ESP32)
    db.ref('motor/actual').on('value', snap => {
      const data = snap.val();
      if (data) {
        AppState.motor.actual = data;
        updateActualUI(data);
        recordTimeSeriesPoint(data);
        if (data.controllerOnline) {
          AppState.lastHeartbeatTime = Date.now();
          AppState.esp32Online = true;
          updateDeviceStatusUI({ ipAddress: "Connected (ESP32 Gateway)" }, true);
        }
      }
    });

    // 4. Listen to /devices/ESP32-MOTOR-001 (Heartbeat & Telemetry)
    db.ref('devices/ESP32-MOTOR-001').on('value', snap => {
      const dev = snap.val();
      if (dev) {
        AppState.lastHeartbeatTime = Date.now();
        AppState.esp32Online = true;
        updateDeviceStatusUI(dev, true);
      }
    });

    // 5. Check Heartbeat Expiry (If no ping for > 20s, flag offline)
    setInterval(() => {
      const isStillAlive = (Date.now() - AppState.lastHeartbeatTime) < 20000;
      if (!isStillAlive && AppState.esp32Online) {
        AppState.esp32Online = false;
        updateDeviceStatusUI(null, false);
      }
    }, 5000);

    // 6. Listen to /history
    db.ref('history').limitToLast(50).on('value', snap => {
      const val = snap.val();
      if (val) {
        const events = Object.keys(val).map(k => ({ id: k, ...val[k] })).reverse();
        AppState.historyEvents = events;
        renderHistoryTable();
        renderRecentEvents(events.slice(0, 5));
      }
    });
  }

  // ==========================================================================
  // SEND COMMANDS TO FIREBASE /motor/desired
  // ==========================================================================
  window.sendMotorCommand = function (updates) {
    if (!db) {
      alert("Firebase is not initialized. Check your credentials.");
      return;
    }

    const newDesired = {
      command: updates.command !== undefined ? updates.command : AppState.motor.desired.command,
      speedPercent: updates.speedPercent !== undefined ? parseInt(updates.speedPercent, 10) : AppState.motor.desired.speedPercent,
      direction: updates.direction !== undefined ? updates.direction : (AppState.motor.desired.direction || "FORWARD"),
      source: "website",
      updatedAt: Date.now()
    };

    // Safety: If speed is 0, enforce OFF
    if (newDesired.speedPercent === 0 && newDesired.command === "ON" && updates.speedPercent !== undefined) {
      newDesired.command = "OFF";
    }

    db.ref('motor/desired').update(newDesired)
      .then(() => {
        console.log("[FIREBASE] Desired command dispatched:", newDesired);
      })
      .catch(err => {
        console.error("[FIREBASE ERROR] Failed to send command:", err);
      });
  };

  // Preset button helper
  window.setPresetSpeed = function (pct) {
    window.sendMotorCommand({
      command: "ON",
      speedPercent: pct
    });
  };

  // Direction toggle helper
  window.setDirection = function (dir) {
    window.sendMotorCommand({ direction: dir });
  };

  // ==========================================================================
  // UI UPDATE FUNCTIONS
  // ==========================================================================
  function updateDesiredUI(d) {
    if (DOM.quickSpeedSlider && document.activeElement !== DOM.quickSpeedSlider) {
      DOM.quickSpeedSlider.value = d.speedPercent || 0;
      DOM.quickSliderLabel.textContent = (d.speedPercent || 0) + '%';
    }
    if (DOM.ctrlSpeedSlider && document.activeElement !== DOM.ctrlSpeedSlider) {
      DOM.ctrlSpeedSlider.value = d.speedPercent || 0;
      DOM.ctrlSpeedNum.textContent = (d.speedPercent || 0) + '%';
    }

    // Direction buttons
    if (DOM.dirFwdBtn && DOM.dirRevBtn) {
      if (d.direction === 'REVERSE') {
        DOM.dirRevBtn.classList.add('active');
        DOM.dirFwdBtn.classList.remove('active');
      } else {
        DOM.dirFwdBtn.classList.add('active');
        DOM.dirRevBtn.classList.remove('active');
      }
    }

    if (DOM.monCmdState) DOM.monCmdState.textContent = d.command;
    if (DOM.monCmdSpeed) DOM.monCmdSpeed.textContent = (d.speedPercent || 0) + '%';
    if (DOM.monCmdDir) DOM.monCmdDir.textContent = d.direction || 'FORWARD';
    if (DOM.ctrlSourceDisplay) DOM.ctrlSourceDisplay.textContent = (d.source || 'Website').toUpperCase();
    if (DOM.ctrlLastUpdated) DOM.ctrlLastUpdated.textContent = new Date().toLocaleTimeString();
  }

  function updateActualUI(a) {
    const isRunning = a.command === 'ON';

    // Dashboard Overview Cards
    if (DOM.dashMotorStatus) {
      DOM.dashMotorStatus.textContent = a.command;
      DOM.dashMotorStatus.style.color = isRunning ? 'var(--status-green)' : 'var(--status-red)';
    }
    if (DOM.dashMotorIndicator) {
      DOM.dashMotorIndicator.className = isRunning ? 'motor-state-indicator running' : 'motor-state-indicator stopped';
    }
    if (DOM.dashSpeedPct) DOM.dashSpeedPct.textContent = (a.requestedSpeedPercent || 0) + '%';
    if (DOM.dashAppliedPwm) DOM.dashAppliedPwm.textContent = `${a.appliedPwm || 0} / 255`;
    if (DOM.dashDirection) DOM.dashDirection.textContent = a.direction || 'FORWARD';

    // Control Page
    if (DOM.ctrlStateText) {
      DOM.ctrlStateText.textContent = isRunning ? 'RUNNING' : 'STOPPED';
      DOM.ctrlStateText.style.color = isRunning ? 'var(--status-green)' : 'var(--status-red)';
    }
    if (DOM.ctrlMotorIndicator) {
      DOM.ctrlMotorIndicator.className = isRunning ? 'motor-state-indicator running' : 'motor-state-indicator stopped';
    }
    if (DOM.ctrlPwmText) {
      DOM.ctrlPwmText.textContent = `${a.appliedPwm || 0} / 255`;
    }

    // Live Monitoring
    if (DOM.monCmdPwm) DOM.monCmdPwm.textContent = `${a.appliedPwm || 0} / 255`;
  }

  function updateDeviceStatusUI(dev, isOnline) {
    if (DOM.esp32ConnBadge) {
      if (isOnline) {
        DOM.esp32ConnBadge.className = 'conn-badge connected';
        DOM.esp32ConnBadge.innerHTML = '<span class="pulse-dot on"></span> ESP32 Online';
      } else {
        DOM.esp32ConnBadge.className = 'conn-badge waiting';
        DOM.esp32ConnBadge.innerHTML = '<span class="pulse-dot connecting"></span> ESP32 Offline';
      }
    }

    if (DOM.sidebarStatusDot && DOM.sidebarStatusText) {
      DOM.sidebarStatusDot.className = isOnline ? 'pulse-dot on' : 'pulse-dot connecting';
      DOM.sidebarStatusText.textContent = isOnline ? 'ESP32 Online' : 'ESP32 Offline';
    }

    if (DOM.statusEspBadge) {
      DOM.statusEspBadge.className = isOnline ? 'badge badge-on' : 'badge badge-off';
      DOM.statusEspBadge.textContent = isOnline ? '● Online' : 'Offline';
    }

    if (dev) {
      if (DOM.statusEspIp) DOM.statusEspIp.textContent = dev.ipAddress || '192.168.1.105';
      if (DOM.statusEspMac) DOM.statusMac = dev.macAddress || '24:6F:28:XX:XX:XX';
      if (DOM.statusEspLastSeen) DOM.statusEspLastSeen.textContent = new Date().toLocaleTimeString();
    }
  }

  // ==========================================================================
  // EVENT LISTENERS & CONTROLS BINDING
  // ==========================================================================
  function initControls() {
    // Quick Controls (Dashboard)
    if (DOM.quickStartBtn) {
      DOM.quickStartBtn.addEventListener('click', () => {
        const currentSpeed = parseInt(DOM.quickSpeedSlider.value, 10);
        window.sendMotorCommand({
          command: "ON",
          speedPercent: currentSpeed > 0 ? currentSpeed : 50
        });
      });
    }

    if (DOM.quickStopBtn) {
      DOM.quickStopBtn.addEventListener('click', () => {
        window.sendMotorCommand({
          command: "OFF",
          speedPercent: 0
        });
      });
    }

    if (DOM.quickSpeedSlider) {
      DOM.quickSpeedSlider.addEventListener('input', e => {
        const val = e.target.value;
        DOM.quickSliderLabel.textContent = val + '%';
      });
      DOM.quickSpeedSlider.addEventListener('change', e => {
        const val = parseInt(e.target.value, 10);
        window.sendMotorCommand({
          command: val > 0 ? "ON" : "OFF",
          speedPercent: val
        });
      });
    }

    // Dedicated Control Page
    if (DOM.ctrlStartBtn) {
      DOM.ctrlStartBtn.addEventListener('click', () => {
        const speed = parseInt(DOM.ctrlSpeedSlider.value, 10);
        window.sendMotorCommand({
          command: "ON",
          speedPercent: speed > 0 ? speed : 50
        });
      });
    }

    if (DOM.ctrlStopBtn) {
      DOM.ctrlStopBtn.addEventListener('click', () => {
        window.sendMotorCommand({
          command: "OFF",
          speedPercent: 0
        });
      });
    }

    if (DOM.ctrlSpeedSlider) {
      DOM.ctrlSpeedSlider.addEventListener('input', e => {
        const val = e.target.value;
        DOM.ctrlSpeedNum.textContent = val + '%';
      });
      DOM.ctrlSpeedSlider.addEventListener('change', e => {
        const val = parseInt(e.target.value, 10);
        window.sendMotorCommand({
          command: val > 0 ? "ON" : "OFF",
          speedPercent: val
        });
      });
    }

    // Filters & Export
    if (DOM.histFilterSource) {
      DOM.histFilterSource.addEventListener('change', renderHistoryTable);
    }

    if (DOM.exportCsvBtn) {
      DOM.exportCsvBtn.addEventListener('click', exportHistoryToCsv);
    }

    if (DOM.exportExcelBtn) {
      DOM.exportExcelBtn.addEventListener('click', exportHistoryToExcel);
    }
  }

  // ==========================================================================
  // HISTORY RENDERING & EXPORT
  // ==========================================================================
  function renderHistoryTable() {
    if (!DOM.historyTableBody) return;

    const filter = DOM.histFilterSource ? DOM.histFilterSource.value : 'ALL';
    let events = AppState.historyEvents;

    if (filter !== 'ALL') {
      events = events.filter(e => (e.source || '').toLowerCase() === filter.toLowerCase());
    }

    if (events.length === 0) {
      DOM.historyTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding: 24px; color: var(--text-muted);">
            No matching events found.
          </td>
        </tr>`;
      return;
    }

    DOM.historyTableBody.innerHTML = events.map(e => {
      const timeStr = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '--:--:--';
      const isRun = e.state === 'ON';
      const badgeClass = isRun ? 'badge badge-on' : 'badge badge-off';
      return `
        <tr style="border-bottom: 1px solid var(--border-color); font-size: 13px;">
          <td style="padding: 12px 16px; font-weight: 600;">${timeStr}</td>
          <td style="padding: 12px 16px;"><span style="font-weight:700;">${e.eventType || 'COMMAND'}</span></td>
          <td style="padding: 12px 16px;"><span class="badge" style="background:#f1f5f9; color:#334155;">${e.source || 'Web'}</span></td>
          <td style="padding: 12px 16px;"><span class="${badgeClass}">● ${e.state || 'OFF'}</span></td>
          <td style="padding: 12px 16px; font-weight: 700;">${e.speedPercent || 0}%</td>
          <td style="padding: 12px 16px;"><code>${e.appliedPwm || 0}/255</code></td>
          <td style="padding: 12px 16px; color: var(--text-muted); font-size: 12px;">${e.details || '-'}</td>
        </tr>`;
    }).join('');
  }

  function renderRecentEvents(recent) {
    if (!DOM.dashEventsList) return;
    if (recent.length === 0) {
      DOM.dashEventsList.innerHTML = '<div style="color:var(--text-muted); font-size:13px; text-align:center; padding:16px;">No recent operations recorded</div>';
      return;
    }

    DOM.dashEventsList.innerHTML = recent.map(e => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--border-color); font-size:12px;">
        <div>
          <strong style="color:var(--text-primary);">${e.eventType || 'COMMAND'}</strong>
          <span style="color:var(--text-muted); margin-left:6px;">(${e.source || 'Web'})</span>
        </div>
        <span style="font-weight:700; color: ${e.state === 'ON' ? 'var(--status-green)' : 'var(--status-red)'};">
          ${e.state || 'OFF'} @ ${e.speedPercent || 0}%
        </span>
      </div>
    `).join('');
  }

  function exportHistoryToCsv() {
    if (!AppState.historyEvents.length) {
      alert("No data available to export.");
      return;
    }

    let csv = "Timestamp,Event,Source,State,SpeedPercent,AppliedPWM,Details\n";
    AppState.historyEvents.forEach(e => {
      csv += `"${e.timestamp}","${e.eventType}","${e.source}","${e.state}",${e.speedPercent || 0},${e.appliedPwm || 0},"${e.details || ''}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `motor_history_${Date.now()}.csv`;
    link.click();
  }

  function exportHistoryToExcel() {
    if (!AppState.historyEvents.length) {
      alert("No data available to export.");
      return;
    }

    const data = AppState.historyEvents.map(e => ({
      Timestamp: new Date(e.timestamp).toLocaleString(),
      Event: e.eventType,
      Source: e.source,
      State: e.state,
      SpeedPercent: e.speedPercent || 0,
      AppliedPWM: e.appliedPwm || 0,
      Details: e.details || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "MotorAuditTrail");
    XLSX.writeFile(wb, `motor_audit_${Date.now()}.xlsx`);
  }

  // ==========================================================================
  // PERFORMANCE CHARACTERISTICS (8 CHARTS)
  // ==========================================================================
  function recordTimeSeriesPoint(actual) {
    const timeLabel = new Date().toLocaleTimeString('en-IN', { hour12: false });
    const speed = actual.requestedSpeedPercent || 0;
    const state = (actual.command === 'ON') ? 1 : 0;

    AppState.liveTimeSeries.labels.push(timeLabel);
    AppState.liveTimeSeries.speedData.push(speed);
    AppState.liveTimeSeries.stateData.push(state);

    if (AppState.liveTimeSeries.labels.length > 20) {
      AppState.liveTimeSeries.labels.shift();
      AppState.liveTimeSeries.speedData.shift();
      AppState.liveTimeSeries.stateData.shift();
    }

    // Update real-time charts if visible
    if (AppState.charts.speedTime) {
      AppState.charts.speedTime.data.labels = AppState.liveTimeSeries.labels;
      AppState.charts.speedTime.data.datasets[0].data = AppState.liveTimeSeries.speedData;
      AppState.charts.speedTime.update('none');
    }
    if (AppState.charts.stateTime) {
      AppState.charts.stateTime.data.labels = AppState.liveTimeSeries.labels;
      AppState.charts.stateTime.data.datasets[0].data = AppState.liveTimeSeries.stateData;
      AppState.charts.stateTime.update('none');
    }
  }

  function initPerformanceCharts() {
    // 1. Speed vs Torque (Theoretical DC Motor Line)
    const ctx1 = document.getElementById('chart-speed-torque');
    if (ctx1 && !AppState.charts.speedTorque) {
      AppState.charts.speedTorque = new Chart(ctx1, {
        type: 'line',
        data: {
          labels: ['0 (No Load)', '0.02', '0.04', '0.06', '0.08', '0.10 (Stall)'],
          datasets: [{
            label: 'Rotational Speed (RPM) [Theoretical Model]',
            data: [3000, 2400, 1800, 1200, 600, 0],
            borderColor: '#0284c7',
            backgroundColor: 'rgba(2, 132, 199, 0.1)',
            fill: true,
            tension: 0.1
          }]
        },
        options: {
          responsive: true,
          plugins: { tooltip: { callbacks: { label: c => `${c.raw} RPM at ${c.label} N·m` } } },
          scales: {
            x: { title: { display: true, text: 'Shaft Torque (N·m) [Simulated]' } },
            y: { title: { display: true, text: 'Speed (RPM)' }, min: 0 }
          }
        }
      });
    }

    // 2. Speed vs Load
    const ctx2 = document.getElementById('chart-speed-load');
    if (ctx2 && !AppState.charts.speedLoad) {
      AppState.charts.speedLoad = new Chart(ctx2, {
        type: 'line',
        data: {
          labels: ['0%', '20%', '40%', '60%', '80%', '100%'],
          datasets: [{
            label: 'Speed (% of Rated) [Simulated]',
            data: [100, 94, 86, 75, 62, 45],
            borderColor: '#16a34a',
            borderDash: [5, 5],
            tension: 0.2
          }]
        },
        options: {
          responsive: true,
          scales: {
            x: { title: { display: true, text: 'Mechanical Load (% Rated)' } },
            y: { title: { display: true, text: 'Speed (%)' }, min: 0, max: 110 }
          }
        }
      });
    }

    // 3. Torque vs Load
    const ctx3 = document.getElementById('chart-torque-load');
    if (ctx3 && !AppState.charts.torqueLoad) {
      AppState.charts.torqueLoad = new Chart(ctx3, {
        type: 'line',
        data: {
          labels: ['0%', '20%', '40%', '60%', '80%', '100%'],
          datasets: [{
            label: 'Output Torque (% Rated) [Simulated]',
            data: [0, 20, 40, 60, 80, 100],
            borderColor: '#d97706',
            tension: 0.0
          }]
        },
        options: {
          responsive: true,
          scales: {
            x: { title: { display: true, text: 'Applied Load (%)' } },
            y: { title: { display: true, text: 'Torque (% Rated)' } }
          }
        }
      });
    }

    // 4. Efficiency vs Load
    const ctx4 = document.getElementById('chart-efficiency-load');
    if (ctx4 && !AppState.charts.efficiencyLoad) {
      AppState.charts.efficiencyLoad = new Chart(ctx4, {
        type: 'line',
        data: {
          labels: ['0%', '20%', '40%', '60%', '80%', '100%'],
          datasets: [{
            label: 'Efficiency η (%) [Theoretical Model]',
            data: [0, 48, 68, 74, 65, 52],
            borderColor: '#7c3aed',
            backgroundColor: 'rgba(124, 58, 237, 0.08)',
            fill: true,
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          scales: {
            x: { title: { display: true, text: 'Mechanical Load (% Rated)' } },
            y: { title: { display: true, text: 'Efficiency (%)' }, min: 0, max: 100 }
          }
        }
      });
    }

    // 5. PWM Duty Cycle vs Measured Speed (Transfer Characteristic)
    const ctx5 = document.getElementById('chart-pwm-speed');
    if (ctx5 && !AppState.charts.pwmSpeed) {
      AppState.charts.pwmSpeed = new Chart(ctx5, {
        type: 'line',
        data: {
          labels: ['0', '30 (Deadband)', '64', '128', '192', '255 (Full)'],
          datasets: [{
            label: 'Speed Response (% Rated) [Transfer Function]',
            data: [0, 0, 25, 50, 75, 100],
            borderColor: '#0284c7',
            tension: 0.2
          }]
        },
        options: {
          responsive: true,
          scales: {
            x: { title: { display: true, text: 'Applied PWM Duty (0-255)' } },
            y: { title: { display: true, text: 'Normalized Speed (%)' } }
          }
        }
      });
    }

    // 6. Current vs Load
    const ctx6 = document.getElementById('chart-current-load');
    if (ctx6 && !AppState.charts.currentLoad) {
      AppState.charts.currentLoad = new Chart(ctx6, {
        type: 'line',
        data: {
          labels: ['0% (No Load)', '20%', '40%', '60%', '80%', '100% (Stall)'],
          datasets: [{
            label: 'Armature Current (A) [Simulated Model]',
            data: [0.12, 0.35, 0.58, 0.82, 1.10, 1.45],
            borderColor: '#dc2626',
            tension: 0.1
          }]
        },
        options: {
          responsive: true,
          scales: {
            x: { title: { display: true, text: 'Load (% Rated)' } },
            y: { title: { display: true, text: 'Armature Current (Amperes)' }, min: 0 }
          }
        }
      });
    }

    // 7. Live Speed vs Time
    const ctx7 = document.getElementById('chart-speed-time');
    if (ctx7 && !AppState.charts.speedTime) {
      AppState.charts.speedTime = new Chart(ctx7, {
        type: 'line',
        data: {
          labels: AppState.liveTimeSeries.labels,
          datasets: [{
            label: 'Commanded Speed (%) [Live]',
            data: AppState.liveTimeSeries.speedData,
            borderColor: '#0284c7',
            backgroundColor: 'rgba(2, 132, 199, 0.1)',
            fill: true,
            stepped: true
          }]
        },
        options: {
          responsive: true,
          scales: {
            x: { title: { display: true, text: 'Session Time' } },
            y: { title: { display: true, text: 'Speed %' }, min: 0, max: 100 }
          }
        }
      });
    }

    // 8. Motor Operating State vs Time
    const ctx8 = document.getElementById('chart-state-time');
    if (ctx8 && !AppState.charts.stateTime) {
      AppState.charts.stateTime = new Chart(ctx8, {
        type: 'line',
        data: {
          labels: AppState.liveTimeSeries.labels,
          datasets: [{
            label: 'Operating State (1=ON, 0=OFF) [Live]',
            data: AppState.liveTimeSeries.stateData,
            borderColor: '#16a34a',
            stepped: true
          }]
        },
        options: {
          responsive: true,
          scales: {
            x: { title: { display: true, text: 'Session Time' } },
            y: { title: { display: true, text: 'State' }, min: -0.1, max: 1.1, ticks: { stepSize: 1 } }
          }
        }
      });
    }
  }

  // ==========================================================================
  // INITIALIZATION ON DOM READY
  // ==========================================================================
  document.addEventListener('DOMContentLoaded', () => {
    initRouter();
    initControls();
    initFirebaseSync();
    console.log("[OK] Industrial IoT DC Motor Controller Initialized.");
  });

})();
