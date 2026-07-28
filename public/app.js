const content = document.querySelector('#content');
const statusEl = document.querySelector('#status');
const search = document.querySelector('#search');
const logsDialog = document.querySelector('#logs');
let rows = [];

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

async function request(url, options = {}) {
  const config = { ...options };
  if (config.body && !config.headers) config.headers = { 'content-type': 'application/json' };
  const response = await fetch(url, config);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function render() {
  const query = search.value.toLowerCase();
  const shown = rows.filter(item => (item.Names + ' ' + item.Image).toLowerCase().includes(query));
  if (!shown.length) {
    content.innerHTML = '<div class="empty">No containers found.</div>';
    return;
  }
  content.innerHTML = `<table><thead><tr><th>Name</th><th>Image</th><th>Status</th><th>Ports</th><th>Actions</th></tr></thead><tbody>${shown.map(item => `<tr>
    <td><strong>${esc(item.Names)}</strong><br><small>${esc(item.ID)}</small></td>
    <td>${esc(item.Image)}</td>
    <td><span class="pill ${item.State === 'running' ? 'running' : ''}">${esc(item.State)}</span></td>
    <td>${esc(item.Ports || '—')}</td>
    <td><div class="actions">
      <button data-container="${esc(item.ID)}" data-action="${item.State === 'running' ? 'stop' : 'start'}">${item.State === 'running' ? 'Stop' : 'Start'}</button>
      <button data-container="${esc(item.ID)}" data-name="${esc(item.Names)}" data-action="logs">Logs</button>
      <button data-container="${esc(item.ID)}" data-action="remove">Remove</button>
    </div></td>
  </tr>`).join('')}</tbody></table>`;
}

async function loadContainers() {
  content.innerHTML = '<div class="empty">Loading containers…</div>';
  const state = await request('/api/status');
  statusEl.className = 'status ' + (state.online ? 'online' : 'offline');
  statusEl.innerHTML = `<i></i>${state.online ? `${esc(state.engine)} ${esc(state.version)}` : 'Engine offline'}`;
  if (!state.online) {
    content.innerHTML = `<div class="empty"><strong>Container engine is not available</strong><br><br>Start your ForgeBox engine, then refresh.<br><small>${esc(state.error)}</small></div>`;
    return;
  }
  const data = await request('/api/containers');
  rows = data.containers;
  document.querySelector('#total').textContent = rows.length;
  document.querySelector('#running').textContent = rows.filter(item => item.State === 'running').length;
  render();
}

async function containerAction(id, action) {
  if (action === 'remove' && !confirm('Remove this container?')) return;
  await request(`/api/containers/${id}/${action}`, { method: 'POST' });
  await loadContainers();
}

async function showLogs(id, name) {
  document.querySelector('#log-title').textContent = `${name} — logs`;
  document.querySelector('#log-output').textContent = 'Loading…';
  logsDialog.showModal();
  try {
    document.querySelector('#log-output').textContent =
      (await request(`/api/containers/${id}/logs`)).logs || '(No logs)';
  } catch (error) {
    document.querySelector('#log-output').textContent = error.message;
  }
}

async function loadTailnet() {
  const indicator = document.querySelector('#tail-status');
  const state = await request('/api/tailscale/status');
  indicator.className = 'status ' + (state.online ? 'online' : 'offline');
  indicator.innerHTML = `<i></i>${state.online ? 'Tailnet connected' : esc(state.state || 'Unavailable')}`;
  document.querySelector('#tail-device').textContent = state.dnsName || state.hostName || '—';
  document.querySelector('#tail-name').textContent = state.tailnet || '—';
  document.querySelector('#tail-address').textContent = state.ips?.join(', ') || '—';

  const config = document.querySelector('#serve-config');
  if (!state.online) {
    config.textContent = state.error || 'Install Tailscale, sign in, and refresh.';
    return;
  }
  try {
    const serving = await request('/api/tailscale/serve');
    config.textContent = Object.keys(serving.config || {}).length
      ? JSON.stringify(serving.config, null, 2)
      : 'No apps are shared yet.';
  } catch (error) {
    config.textContent = error.message;
  }
}

async function shareApp(event) {
  event.preventDefault();
  const button = document.querySelector('#share-button');
  const message = document.querySelector('#share-message');
  button.disabled = true;
  message.textContent = 'Configuring private HTTPS…';
  try {
    await request('/api/tailscale/serve', {
      method: 'POST',
      body: JSON.stringify({
        localPort: Number(document.querySelector('#local-port').value),
        httpsPort: Number(document.querySelector('#https-port').value),
        path: document.querySelector('#serve-path').value
      })
    });
    message.className = 'form-message success';
    message.textContent = 'App is now available privately on your tailnet.';
    await loadTailnet();
  } catch (error) {
    message.className = 'form-message error';
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

document.querySelector('#refresh').addEventListener('click', loadContainers);
document.querySelector('#tail-refresh').addEventListener('click', loadTailnet);
document.querySelector('#share-form').addEventListener('submit', shareApp);
document.querySelector('#close-logs').addEventListener('click', () => logsDialog.close());
search.addEventListener('input', render);
content.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  if (button.dataset.action === 'logs') showLogs(button.dataset.container, button.dataset.name);
  else containerAction(button.dataset.container, button.dataset.action);
});

Promise.allSettled([loadContainers(), loadTailnet()]);
