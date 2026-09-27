const REFRESH_INTERVAL_MS = 5000;

const inventoryBody = document.getElementById('inventory-body');
const logFeed = document.getElementById('log-feed');
const form = document.getElementById('batch-form');
const formMessage = document.getElementById('form-message');

function formatCurrency(value) {
  return `$${Number(value).toFixed(2)}`;
}

function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleString();
}

async function loadInventory() {
  try {
    const res = await fetch('/api/inventory');
    const items = await res.json();

    if (!items.length) {
      inventoryBody.innerHTML = '<tr><td colspan="6" class="empty">No inventory items yet.</td></tr>';
      return;
    }

    inventoryBody.innerHTML = items
      .map((item) => {
        const outOfStock = item.quantity_in_stock === 0;
        return `
          <tr class="${outOfStock ? 'out-of-stock' : ''}">
            <td>${item.item_name}</td>
            <td>${item.batch_number}</td>
            <td>${item.quantity_in_stock}</td>
            <td>${formatCurrency(item.unit_cost)}</td>
            <td>${formatTime(item.updated_at)}</td>
            <td>
              ${
                outOfStock
                  ? '<span class="status-badge out">⚠ Out of Stock</span>'
                  : '<span class="status-badge ok">In Stock</span>'
              }
            </td>
          </tr>
        `;
      })
      .join('');
  } catch (err) {
    inventoryBody.innerHTML = '<tr><td colspan="6" class="empty">Failed to load inventory.</td></tr>';
  }
}

async function loadLogs() {
  try {
    const res = await fetch('/api/logs');
    const logs = await res.json();

    if (!logs.length) {
      logFeed.innerHTML = '<li class="empty">No batch changes yet.</li>';
      return;
    }

    logFeed.innerHTML = logs
      .map(
        (log) => `
          <li>
            <strong>${log.item_name}</strong> (Batch ${log.batch_number}) &mdash;
            qty: ${log.quantity_in_stock}, cost: ${formatCurrency(log.unit_cost)}
            <span class="log-time">${formatTime(log.created_at)}</span>
          </li>
        `
      )
      .join('');
  } catch (err) {
    logFeed.innerHTML = '<li class="empty">Failed to load history.</li>';
  }
}

async function refreshAll() {
  await Promise.all([loadInventory(), loadLogs()]);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formMessage.textContent = '';
  formMessage.className = '';

  const payload = {
    item_name: document.getElementById('item_name').value.trim(),
    batch_number: document.getElementById('batch_number').value.trim(),
    quantity_in_stock: document.getElementById('quantity_in_stock').value,
    unit_cost: document.getElementById('unit_cost').value,
  };

  try {
    const res = await fetch('/api/inventory/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      formMessage.textContent = data.error || 'Something went wrong.';
      formMessage.className = 'error';
      return;
    }

    formMessage.textContent = 'Inventory updated successfully.';
    formMessage.className = 'success';
    form.reset();
    await refreshAll();
  } catch (err) {
    formMessage.textContent = 'Failed to submit update.';
    formMessage.className = 'error';
  }
});

// Initial load + auto-refresh
refreshAll();
setInterval(refreshAll, REFRESH_INTERVAL_MS);
