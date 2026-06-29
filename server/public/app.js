/**
 * app.js — Game Cafe Admin Dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 * Polls the REST API every 2 s, renders client cards, ticks countdowns
 * locally every second, and dispatches lock/unlock/session commands.
 */
'use strict';

class DashboardApp {
  constructor() {
    /** @type {Array<{ip:string,label:string|null,connectedAt:string,locked:boolean,remainingMs:number|null,durationMs:number|null}>} */
    this.clients = [];
    this.pollId   = null;
    this.tickId   = null;
    /** Local countdown store: ip → remainingMs (decremented each second) */
    this.timers   = {};
    /** IP pending for session start modal */
    this.pendingIp = null;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  init() {
    this.fetchClients();
    this.pollId = setInterval(() => this.fetchClients(), 2000);
    this.tickId = setInterval(() => this.tickCountdowns(), 1000);

    // Close modal on overlay backdrop click
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closeModal();
    });

    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeModal();
    });
  }

  // ── Polling & Data ──────────────────────────────────────────────────────────

  async fetchClients() {
    try {
      const res = await fetch('/api/clients');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Sync local timers from API (corrects drift)
      const freshIps = new Set(data.clients.map(c => c.ip));

      // Remove stale IPs from local timer store
      for (const ip of Object.keys(this.timers)) {
        if (!freshIps.has(ip)) delete this.timers[ip];
      }

      for (const client of data.clients) {
        if (client.remainingMs !== null && client.remainingMs > 0) {
          this.timers[client.ip] = client.remainingMs;
        } else {
          delete this.timers[client.ip];
        }
      }

      this.clients = data.clients;
      this.setServerStatus(true);
      this.renderClients();
      this.updateStats();
      document.getElementById('lastUpdated').textContent = new Date().toLocaleTimeString();
    } catch {
      this.setServerStatus(false);
    }
  }

  tickCountdowns() {
    for (const [ip, ms] of Object.entries(this.timers)) {
      const newMs = Math.max(0, ms - 1000);
      this.timers[ip] = newMs;

      // Update timer DOM element in-place (avoids full re-render)
      const el = document.querySelector(`[data-timer="${ip}"]`);
      if (el) {
        el.textContent = this.fmtMs(newMs);
        el.classList.toggle('urgent', newMs > 0 && newMs < 5 * 60 * 1000);
      }

      // Update progress bar
      const bar = document.querySelector(`[data-timerbar="${ip}"]`);
      const client = this.clients.find(c => c.ip === ip);
      if (bar && client && client.durationMs) {
        const pct = Math.max(0, Math.min(100, (newMs / client.durationMs) * 100));
        bar.style.width = pct + '%';
        // Shift colour as time depletes
        const r = Math.round(16 + (239 - 16) * (1 - pct / 100));
        const g = Math.round(185 * (pct / 100));
        bar.style.background = `rgb(${r},${g},74)`;
      }
    }
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  renderClients() {
    const grid = document.getElementById('clientsGrid');

    if (this.clients.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🖥️</div>
          <div class="empty-title">No Clients Connected</div>
          <div class="empty-sub">Gaming PCs will appear here once they connect to this server</div>
        </div>`;
      return;
    }

    // Build a set of IPs currently rendered
    const rendered = new Map();
    grid.querySelectorAll('.client-card').forEach(card => {
      rendered.set(card.dataset.ip, card);
    });

    const incoming = new Set(this.clients.map(c => c.ip));

    // Remove cards for gone clients
    rendered.forEach((card, ip) => {
      if (!incoming.has(ip)) card.remove();
    });

    // Update or insert each client card
    for (const client of this.clients) {
      const html = this.buildCard(client);
      const existing = rendered.get(client.ip);
      if (existing) {
        // Only replace if lock state or timer presence changed
        const wasLocked = existing.classList.contains('locked');
        const hasTimerEl = !!existing.querySelector('[data-timer]');
        const nowHasTimer = this.timers[client.ip] !== undefined;
        if (wasLocked !== client.locked || hasTimerEl !== nowHasTimer) {
          existing.outerHTML = html;
        }
        // Otherwise the tick interval updates the timer in-place
      } else {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        grid.appendChild(tmp.firstElementChild);
      }
    }
  }

  buildCard(client) {
    const ip         = client.ip;
    const label      = client.label || 'Unknown Machine';
    const connected  = this.timeAgo(new Date(client.connectedAt));
    const locked     = client.locked;
    const remaining  = this.timers[ip];
    const hasTimer   = remaining !== undefined;
    const statusCls  = locked ? 'locked' : 'online';
    const statusTxt  = locked ? '🔒 LOCKED' : '🟢 ONLINE';

    const timerSection = hasTimer
      ? `<div class="timer-display">
           <div class="timer-value${remaining < 5*60*1000 ? ' urgent' : ''}" data-timer="${ip}">${this.fmtMs(remaining)}</div>
           <div class="timer-label">remaining</div>
         </div>
         <div class="timer-bar">
           <div class="timer-bar-fill"
                data-timerbar="${ip}"
                style="width:${client.durationMs ? Math.max(0,(remaining/client.durationMs)*100) : 100}%">
           </div>
         </div>`
      : `<div class="timer-display no-timer">
           <div class="timer-value">—</div>
           <div class="timer-label">no active session</div>
         </div>`;

    return `
      <div class="client-card ${statusCls}" data-ip="${ip}">
        <div class="card-header">
          <div class="client-ip">${this.escHtml(ip)}</div>
          <span class="status-badge ${statusCls}">${statusTxt}</span>
        </div>
        <div class="client-label">${this.escHtml(label)}</div>
        <div class="client-meta">Connected ${connected}</div>
        <div class="client-meta">Assigned Game: ${this.escHtml(client.targetApp)}</div>
        ${timerSection}
        <div class="card-actions">
          <button class="btn btn-primary btn-sm" onclick="app.openModal('${ip}')">▶ Start</button>
          <button class="btn btn-danger btn-sm"  onclick="app.lockClient('${ip}')">🔒 Lock</button>
          <button class="btn btn-success btn-sm" onclick="app.unlockClient('${ip}')">🔓 Unlock</button>
          <button class="btn btn-ghost btn-sm"   onclick="app.cancelTimer('${ip}')">✕ Cancel</button>
        </div>
      </div>`;
  }

  updateStats() {
    const total  = this.clients.length;
    const locked = this.clients.filter(c => c.locked).length;
    const timers = Object.keys(this.timers).length;
    const online = total - locked;

    document.getElementById('statTotal').textContent  = total;
    document.getElementById('statOnline').textContent  = online;
    document.getElementById('statLocked').textContent  = locked;
    document.getElementById('statTimers').textContent  = timers;
  }

  setServerStatus(online) {
    const el = document.getElementById('serverStatus');
    if (online) {
      el.className = 'server-status online';
      el.querySelector('.status-text').textContent = 'Server Online';
    } else {
      el.className = 'server-status offline';
      el.querySelector('.status-text').textContent = 'Server Offline';
    }
  }

  // ── Modal ───────────────────────────────────────────────────────────────────

  openModal(ip) {
    this.pendingIp = ip;
    document.getElementById('modalIp').textContent = `Machine: ${ip}`;
    document.getElementById('sessionMinutes').value = '';
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('modalOverlay').classList.add('active');
    setTimeout(() => document.getElementById('sessionMinutes').focus(), 80);
  }

  closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
    this.pendingIp = null;
  }

  setPreset(minutes, btn) {
    document.getElementById('sessionMinutes').value = minutes;
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
  }

  async confirmStart() {
    const ip      = this.pendingIp;
    const minutes = parseFloat(document.getElementById('sessionMinutes').value);

    if (!ip) { this.toast('No client selected', 'error'); return; }
    if (isNaN(minutes) || minutes <= 0) {
      this.toast('Please enter a valid number of minutes', 'error');
      return;
    }

    this.closeModal();
    await this.call(`/api/clients/${encodeURIComponent(ip)}/start`, 'POST',
      { minutes },
      `▶ Session started: ${minutes} min for ${ip}`);
    await this.fetchClients();
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  async lockClient(ip) {
    await this.call(`/api/clients/${encodeURIComponent(ip)}/lock`, 'POST',
      { reason: 'Locked from admin dashboard' },
      `🔒 ${ip} locked`);
    await this.fetchClients();
  }

  async unlockClient(ip) {
    await this.call(`/api/clients/${encodeURIComponent(ip)}/unlock`, 'POST',
      {},
      `🔓 ${ip} unlocked`);
    await this.fetchClients();
  }

  async cancelTimer(ip) {
    await this.call(`/api/clients/${encodeURIComponent(ip)}/timer`, 'DELETE',
      null,
      `Timer cancelled for ${ip}`);
    delete this.timers[ip];
    await this.fetchClients();
  }

  async lockAll() {
    const count = this.clients.length;
    if (count === 0) { this.toast('No clients connected', 'warn'); return; }
    if (!confirm(`Lock ALL ${count} connected client(s)?`)) return;
    await this.call('/api/lockall', 'POST', {},
      `🔒 All ${count} client(s) locked`);
    await this.fetchClients();
  }

  async launchClient() {
    await this.call('/api/admin/launch-client', 'POST', {},
      '✅ Client app launched on this PC');
  }

  // ── HTTP Helper ─────────────────────────────────────────────────────────────

  async call(url, method, body, successMsg) {
    try {
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      if (body !== null && method !== 'DELETE') opts.body = JSON.stringify(body);
      const res  = await fetch(url, opts);
      const data = await res.json();
      if (data.ok === false) {
        this.toast(data.error || 'Action failed', 'error');
      } else if (successMsg) {
        this.toast(successMsg, 'success');
      }
    } catch (err) {
      this.toast('Network error: ' + err.message, 'error');
    }
  }

  // ── Toast ───────────────────────────────────────────────────────────────────

  toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 400);
    }, 3500);
  }

  // ── Utilities ────────────────────────────────────────────────────────────────

  fmtMs(ms) {
    if (ms <= 0) return '00:00';
    const totalSec = Math.ceil(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  timeAgo(date) {
    const diff = Math.max(0, Date.now() - date.getTime());
    const min  = Math.floor(diff / 60000);
    if (min < 1)  return 'just now';
    if (min < 60) return `${min}m ago`;
    const h = Math.floor(min / 60);
    const r = min % 60;
    return r > 0 ? `${h}h ${r}m ago` : `${h}h ago`;
  }

  escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

const app = new DashboardApp();
document.addEventListener('DOMContentLoaded', () => app.init());
