const API_BASE_URL = '/api';

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

const form = document.getElementById('transaction-form');
const keyInput = document.getElementById('idempotency-key');
const txnResult = document.getElementById('transaction-result');
const summaryResult = document.getElementById('summary-result');
const rankingTableBody = document.querySelector('#ranking-table tbody');

keyInput.value = generateUUID();

document.getElementById('generate-key-btn').addEventListener('click', () => {
    keyInput.value = generateUUID();
});


function showResult(element, data, isError = false) {
    element.classList.remove('hidden', 'success', 'error');
    element.classList.add(isError ? 'error' : 'success');
    
    // Format Errors
    if (isError) {
        let errorMsg = data.detail;
        if (Array.isArray(data.detail)) {
            errorMsg = data.detail.map(err => err.msg).join(', ');
        }
        element.innerHTML = `<strong>⚠️ Error:</strong> ${errorMsg || data.error || "Operation failed."}`;
        return;
    }

    // Format Transaction Response
    if (data.transaction_id) {
        let statusText = data.status === 'success' ? 'Transfer Successful ✅' : `Duplicate Prevented 🛡️`;
        element.innerHTML = `
            <div style="margin-bottom: 8px; font-size: 1.1em; color: var(--accent-1);"><strong>${statusText}</strong></div>
            <div style="margin-bottom: 4px;"><strong>Entity ID:</strong> ${data.user_id}</div>
            <div style="margin-bottom: 4px;"><strong>Amount Transferred:</strong> $${data.amount.toFixed(2)}</div>
            <div style="font-size: 0.75em; color: var(--text-muted); margin-top: 8px; border-top: 1px solid var(--glass-border); padding-top: 4px;">
                Receipt ID: ${data.transaction_id}
            </div>
        `;
    } 
    // Format Summary Response
    else if (data.rank !== undefined) {
        element.innerHTML = `
            <div style="margin-bottom: 8px; font-size: 1.1em; color: var(--accent-1);"><strong>Scan Complete ✅</strong></div>
            <div style="margin-bottom: 4px;"><strong>Entity ID:</strong> ${data.user_id}</div>
            <div style="margin-bottom: 4px;"><strong>Current Rank:</strong> #${data.rank}</div>
            <div style="margin-bottom: 4px;"><strong>Total Credits:</strong> $${data.total_amount.toFixed(2)}</div>
            <div style="margin-bottom: 4px;"><strong>Total Transactions:</strong> ${data.transaction_count}</div>
            <div style="margin-bottom: 4px;"><strong>Power Score:</strong> ${data.score.toFixed(2)}</div>
        `;
    } 
    // Fallback just in case
    else {
        element.textContent = JSON.stringify(data, null, 2);
    }
}

// 1. Transaction API
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-txn-btn');
    btn.disabled = true;
    btn.textContent = 'Processing...';

    const payload = {
        user_id: document.getElementById('user-id').value,
        amount: parseFloat(document.getElementById('amount').value),
        idempotency_key: keyInput.value
    };

    try {
        const response = await fetch(`${API_BASE_URL}/transaction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        
        if (response.ok) {
            showResult(txnResult, data);
            loadRankings(); 
        } else {
            showResult(txnResult, data, true);
        }
    } catch (error) {
        showResult(txnResult, { error: error.message }, true);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Execute Transaction';
    }
});

// 2. Summary API
document.getElementById('get-summary-btn').addEventListener('click', async () => {
    const userId = document.getElementById('summary-user-id').value;
    if (!userId) return alert('Please enter an Entity ID');

    try {
        const response = await fetch(`${API_BASE_URL}/summary/${userId}`);
        const data = await response.json();
        
        if (response.ok) {
            showResult(summaryResult, data);
        } else {
            showResult(summaryResult, data, true);
        }
    } catch (error) {
        showResult(summaryResult, { error: error.message }, true);
    }
});

// 3. Ranking API
async function loadRankings() {
    try {
        const response = await fetch(`${API_BASE_URL}/ranking`);
        const data = await response.json();
        
        if (response.ok && data.rankings) {
            rankingTableBody.innerHTML = '';
            data.rankings.forEach(user => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>#${user.rank}</td>
                    <td><strong>${user.user_id}</strong></td>
                    <td>$${user.total_amount.toFixed(2)}</td>
                    <td>${user.transaction_count}</td>
                    <td>${user.score.toFixed(2)}</td>
                `;
                rankingTableBody.appendChild(tr);
            });
        }
    } catch (error) {
        console.error("Error fetching rankings", error);
    }
}

document.getElementById('refresh-ranking-btn').addEventListener('click', loadRankings);

// Initial Load
loadRankings();