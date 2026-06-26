// Detecta el base path automaticamente segun donde este alojada la app.
// En localhost: API_BASE = ''  → fetch('/api/...')
// Bajo nginx:   API_BASE = '/blocklearn' → fetch('/blocklearn/api/...')
const API_BASE = (() => {
    const s = document.querySelector('script[src*="app.js"]');
    if (!s) return '';
    const parts = new URL(s.src).pathname.split('/').filter(Boolean);
    parts.pop(); // quita 'app.js'
    return parts.length ? '/' + parts.join('/') : '';
})();

// ═══════════════════════════════════════
//          GLOBAL STATE
// ═══════════════════════════════════════
let appState = {
    scopes: {
        chain: { nodes: {}, difficulty: 2 },
        attack: { nodes: {}, difficulty: 2 },
        ledger: { nodes: {}, difficulty: 2 }
    },
    difficulty: 2,
    activeTab: 'hash-tab',
    isMining: false
};

// Tracks in-flight apiTamperBlock calls so mine handlers can wait for them
const pendingTampers = {};

function scopeForTab(tab) {
    return { 'chain-tab': 'chain', 'network-tab': 'attack', 'ledger-tab': 'ledger' }[tab] || null;
}

// ═══════════════════════════════════════
//       EDUCATIONAL EXPLANATIONS
// ═══════════════════════════════════════
const eduTexts = {
    'hash-tab': `
        <p><strong>Hash SHA-256</strong>: convierte cualquier texto en una huella digital única de 64 chars hex (256 bits).</p>
        <p><strong>3 propiedades clave:</strong></p>
        <ul>
            <li><strong>Determinista:</strong> misma entrada = mismo hash, siempre.</li>
            <li><strong>Efecto avalancha:</strong> cambias 1 letra → hash completamente distinto. <strong>Pruébalo escribiendo a la izquierda.</strong></li>
            <li><strong>Unidireccional:</strong> del hash no se puede recuperar el texto original.</li>
        </ul>
        <p><i data-lucide="mouse-pointer-click"></i> Escribe en el área de texto y mira cómo cambia el hash en tiempo real.</p>
    `,
    'block-tab': `
        <p><strong>Anatomía de un bloque</strong></p>
        <ul>
            <li><strong>Índice:</strong> nº de orden (1, 2, 3...)</li>
            <li><strong>Timestamp:</strong> cuándo se creó</li>
            <li><strong>Datos:</strong> info del diploma (estudiante, carrera, ID...)</li>
            <li><strong>Previous Hash:</strong> hash del bloque anterior → <em>encadena los bloques</em></li>
            <li><strong>Nonce:</strong> contador que se prueba (0, 1, 2...) hasta que el hash empiece con ceros</li>
            <li><strong>Hash:</strong> SHA256(índice + timestamp + datos + previous_hash + nonce)</li>
        </ul>
        <p><strong>Proof of Work</strong>: un bloque es <strong>VÁLIDO</strong> solo si su hash empieza con <code>00</code> (dificultad 2), <code>000</code> (dificultad 3)...</p>
        <p>Como el hash es impredecible, hay que <strong>probar nonces a fuerza bruta</strong> (millones) hasta acertar. Eso cuesta CPU = prueba de trabajo.</p>
        <p><i data-lucide="mouse-pointer-click"></i> Haz clic en <strong>Minar Bloque</strong> para ver la búsqueda en directo.</p>
    `,
    'chain-tab': `
        <p><strong>Los nodos de la red</strong>: cada universidad (Nodo A = Univ. Complutense, Nodo B = Univ. Barcelona, Nodo C = Univ. Valencia) opera su propio servidor con una <strong>copia idéntica</strong> de la cadena. Puedes cambiar entre ellas con el selector de arriba para comprobar que todas coinciden.</p>
        <p><strong>Inmutabilidad por encadenamiento</strong></p>
        <p>Cada bloque guarda el <strong>hash del anterior</strong>. Si alteras datos en el Bloque 1:</p>
        <ol>
            <li>Su hash cambia → se vuelve <strong style="color:var(--accent-invalid)">ROJO (inválido)</strong></li>
            <li>El Bloque 2 apunta al hash viejo → su <em>Previous Hash</em> ya no coincide → también <strong style="color:var(--accent-invalid)">ROJO</strong></li>
            <li>Efecto dominó: <strong>todos los bloques siguientes se rompen</strong></li>
        </ol>
        <p><i data-lucide="mouse-pointer-click"></i> <strong>Clic</strong> en cualquier bloque para ver detalles. <strong>Edita</strong> sus datos y mira la cadena romperse en tiempo real.</p>
    `,
    'network-tab': `
        <p><strong>Red distribuida (P2P)</strong>: cada universidad (Nodo A, B, C) tiene su propia copia de la cadena. No hay un servidor central — todas deben coincidir.</p>
        <p><strong>Consenso</strong>: regla de la mayoría. La cadena que tenga &gt;50% de los nodos online gana. Si un nodo se desvía, se sobrescribe con la copia mayoritaria.</p>
        
        <p><strong>Laboratorio de ataques (prueba en orden):</strong></p>
        <ol>
            <li><strong>Alterar datos</strong> (Nodo B): rompes su cadena local. Consenso la corrige copiando la de la mayoría (A y C).</li>
            <li><strong>Reminar local</strong> (Nodo B): alteras + re-minas → su cadena se ve <strong style="color:var(--accent-valid)">VERDE</strong> localmente, pero sus hashes no coinciden con los de la red. Consenso detecta el fraude.</li>
            <li><strong>Ataque 51%</strong>: tomas control de B y C (mayoría) con datos falsos. Consenso <strong>acepta la mentira</strong> y sobrescribe al nodo honesto (A).</li>
        </ol>
        <p><i data-lucide="mouse-pointer-click"></i> Usa los botones rojos a la izquierda y luego <strong>Ejecutar Consenso</strong> para ver cada caso.</p>
    `,
    'ledger-tab': `
        <p><strong>Ciclo de vida del diploma en blockchain</strong></p>
        <ol>
            <li><strong>Emitir</strong>: rellena datos → <strong>Firmar</strong> → entra al <strong>Mempool</strong> (bandeja de espera)</li>
            <li><strong>Minar</strong>: elige nodo → <strong>Minar Bloque</strong> → los títulos del mempool se meten en un nuevo bloque</li>
            <li><strong>Verificar</strong>: panel derecho → busca nombre o ID → <strong>VERIFICADO ✅</strong> si la cadena está íntegra</li>
        </ol>
        <p><strong>Integridad = confianza</strong>: si la cadena está verde → título verificado. Si está rota (rojo) → <strong>🚨 FRAUDE DETECTADO</strong>.</p>
    `
};

// ═══════════════════════════════════════
//         HELPER FUNCTIONS
// ═══════════════════════════════════════
async function calculateSHA256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function formatHashDisplay(hash, difficulty) {
    if (!hash) return '';
    let matchLen = 0;
    for (let i = 0; i < difficulty; i++) {
        if (hash[i] === '0') matchLen++;
        else break;
    }
    if (matchLen >= difficulty) {
        // Full match — green
        return `<span style="color:var(--accent-valid);font-weight:700;">${hash.substring(0, difficulty)}</span>${hash.substring(difficulty)}`;
    }
    if (matchLen > 0) {
        // Partial match — amber, so it looks clearly different from "done"
        return `<span style="color:#f59e0b;font-weight:700;">${hash.substring(0, matchLen)}</span>${hash.substring(matchLen)}`;
    }
    return hash;
}

function generateTitleId() {
    return 'TIT-' + Math.floor(10000 + Math.random() * 90000);
}

function formatBlockData(data) {
    if (typeof data === 'object' && Array.isArray(data)) {
        return data.map(t => {
            const idStr = t.title_id ? ` [${t.title_id}]` : '';
            return `${t.student} — ${t.degree} (${t.university})${idStr}`;
        }).join('\n');
    }
    return String(data);
}

function displayNodeName(nodeId) {
    return nodeId.replace('Peer_', 'Nodo ').replace(/_/g, ' ');
}

function serializeBlockData(data) {
    if (Array.isArray(data)) {
        return JSON.stringify(data.map(item => {
            if (typeof item === 'object' && item !== null) {
                const sorted = {};
                Object.keys(item).sort().forEach(k => sorted[k] = item[k]);
                return sorted;
            }
            return item;
        }));
    }
    return String(data);
}

function truncate(str, len) {
    if (!str) return '';
    str = String(str);
    return str.length > len ? str.substring(0, len - 1) + '\u2026' : str;
}

// ═══════════════════════════════════════
//           TOAST SYSTEM
// ═══════════════════════════════════════
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'info';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error' || type === 'danger') icon = 'alert-triangle';
    if (type === 'warning') icon = 'alert-circle';

    toast.innerHTML = `
        <i data-lucide="${icon}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ═══════════════════════════════════════
//         API COMMUNICATION
// ═══════════════════════════════════════
function updateNodeSelectors() {
    // Chain tab selectors
    const chainNodes = appState.scopes.chain.nodes;
    ['chain-node-select', 'tamper-node-select', 'manual-block-node-select'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const currentVal = el.value;
        el.innerHTML = '';
        Object.keys(chainNodes).forEach(nodeId => {
            const opt = document.createElement('option');
            opt.value = nodeId;
            opt.textContent = displayNodeName(nodeId) + (nodeId === 'Peer_A' ? ' (Líder)' : '');
            el.appendChild(opt);
        });
        if (Object.keys(chainNodes).includes(currentVal)) el.value = currentVal;
        else if (Object.keys(chainNodes).length > 0) el.value = Object.keys(chainNodes)[0];
    });

    // Ledger tab selectors
    const ledgerNodes = appState.scopes.ledger.nodes;
    ['mine-node-select', 'ledger-node-select'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const currentVal = el.value;
        el.innerHTML = '';
        Object.keys(ledgerNodes).forEach(nodeId => {
            const opt = document.createElement('option');
            opt.value = nodeId;
            opt.textContent = displayNodeName(nodeId) + (nodeId === 'Peer_A' ? ' (Líder)' : '');
            el.appendChild(opt);
        });
        if (Object.keys(ledgerNodes).includes(currentVal)) el.value = currentVal;
        else if (Object.keys(ledgerNodes).length > 0) el.value = Object.keys(ledgerNodes)[0];
    });
    
    // Attack tab parent selector for new nodes
    const parentSelect = document.getElementById('new-node-parent');
    if (parentSelect) {
        const attackNodes = appState.scopes.attack.nodes;
        const currentVal = parentSelect.value;
        parentSelect.innerHTML = '';
        Object.keys(attackNodes).forEach(nodeId => {
            const opt = document.createElement('option');
            opt.value = nodeId;
            opt.textContent = displayNodeName(nodeId) + (nodeId === 'Peer_A' ? ' (Raíz)' : '');
            parentSelect.appendChild(opt);
        });
        if (Object.keys(attackNodes).includes(currentVal)) parentSelect.value = currentVal;
        else if (Object.keys(attackNodes).length > 0) parentSelect.value = 'Peer_A';
    }
}

async function fetchStatus(scope = 'chain') {
    try {
        const response = await fetch(`${API_BASE}/api/${scope}/status`);
        if (!response.ok) throw new Error('Error al obtener el estado');
        const data = await response.json();
        appState.scopes[scope].difficulty = data.difficulty;
        appState.scopes[scope].nodes = data.nodes;
        appState.difficulty = data.difficulty;
        document.getElementById('difficulty-select').value = appState.difficulty;
        updateNodeSelectors();
        if (!appState.isMining) renderActiveTab();
    } catch (error) {
        console.error(error);
        showToast('Error al conectar con el servidor de Python', 'error');
    }
}

async function apiMineBlock(nodeId, data = null, scope = 'chain') {
    try {
        const response = await fetch(`${API_BASE}/api/${scope}/nodes/${nodeId}/mine`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: data })
        });
        if (!response.ok) throw new Error('Error al minar bloque');
        const result = await response.json();
        appState.scopes[scope].nodes = result.nodes;
        const blockIndex = result.block?.index;
        showToast(`\u00a1Bloque #${blockIndex} minado en ${displayNodeName(nodeId)}!`, 'success');
        renderActiveTab();
    } catch (error) {
        console.error(error);
        showToast('Error al minar el bloque', 'error');
    }
}

async function apiTamperBlock(nodeId, blockIndex, newStatusData, scope = 'chain') {
    const tamperKey = `${scope}-${nodeId}-${blockIndex}`;
    let tamperResolve;
    pendingTampers[tamperKey] = new Promise(r => { tamperResolve = r; });
    try {
        const response = await fetch(`${API_BASE}/api/${scope}/nodes/${nodeId}/tamper`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ block_index: blockIndex, new_data: newStatusData })
        });
        if (!response.ok) throw new Error('Error al alterar bloque');
        const result = await response.json();
        appState.scopes[scope].nodes = result.nodes;
        showToast(`\u00a1Bloque #${blockIndex} hackeado en ${displayNodeName(nodeId)}!`, 'warning');
        if (!appState.isMining) renderActiveTab();
    } catch (error) {
        console.error(error);
        showToast('Error al hackear el bloque', 'error');
    } finally {
        tamperResolve();
        delete pendingTampers[tamperKey];
    }
}

async function apiMineBlockIndex(nodeId, blockIndex, scope = 'chain') {
    try {
        const response = await fetch(`${API_BASE}/api/${scope}/nodes/${nodeId}/mine_block_index`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ block_index: blockIndex })
        });
        if (!response.ok) throw new Error('Error al minar bloque index');
        const result = await response.json();
        appState.scopes[scope].nodes = result.nodes;
        showToast(`Bloque #${blockIndex} reminado exitosamente en ${displayNodeName(nodeId)}`, 'success');
        renderActiveTab();
    } catch (error) {
        console.error(error);
        showToast('Error al reminar el bloque', 'error');
    }
}

async function apiAddNode(nodeId, parentId = null, scope = 'chain') {
    try {
        const body = { node_id: nodeId };
        if (parentId) body.parent_id = parentId;
        const response = await fetch(`${API_BASE}/api/${scope}/nodes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Error al agregar nodo');
        }
        const result = await response.json();
        appState.scopes[scope].nodes = result.nodes;
        showToast(`\u00a1Nodo ${displayNodeName(nodeId)} a\u00f1adido a la red!`, 'success');
        updateNodeSelectors();
        renderActiveTab();
    } catch (error) {
        console.error(error);
        showToast(error.message, 'error');
    }
}

async function apiDeleteNode(nodeId, scope = 'chain') {
    try {
        const response = await fetch(`${API_BASE}/api/${scope}/nodes/${nodeId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Error al eliminar nodo');
        }
        const result = await response.json();
        appState.scopes[scope].nodes = result.nodes;
        showToast(`Nodo ${displayNodeName(nodeId)} eliminado de la red`, 'info');
        updateNodeSelectors();
        renderActiveTab();
    } catch (error) {
        console.error(error);
        showToast(error.message, 'error');
    }
}

async function apiToggleNodeConnection(nodeId, scope = 'chain') {
    try {
        const response = await fetch(`${API_BASE}/api/${scope}/nodes/${nodeId}/toggle_connection`, {
            method: 'POST'
        });
        if (!response.ok) throw new Error('Error al conectar/desconectar nodo');
        const result = await response.json();
        appState.scopes[scope].nodes = result.nodes;
        const isOnline = appState.scopes[scope].nodes[nodeId]?.is_online;
        showToast(`Nodo ${displayNodeName(nodeId)} ahora est\u00e1 ${isOnline ? 'Online' : 'Offline'}`, 'info');
        renderActiveTab();
    } catch (error) {
        console.error(error);
        showToast('Error al alternar la conexi\u00f3n del nodo', 'error');
    }
}

async function apiCreateBlockManual(nodeId, data, mine, scope = 'chain') {
    try {
        const response = await fetch(`${API_BASE}/api/${scope}/nodes/${nodeId}/blocks/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: data, mine: mine })
        });
        if (!response.ok) throw new Error('Error al crear bloque manualmente');
        const result = await response.json();
        appState.scopes[scope].nodes = result.nodes;
        showToast(`Bloque manual creado en ${displayNodeName(nodeId)}`, 'success');
        renderActiveTab();
    } catch (error) {
        console.error(error);
        showToast('Error al crear el bloque manualmente', 'error');
    }
}

async function apiDeleteBlock(nodeId, index, scope = 'chain') {
    try {
        const response = await fetch(`${API_BASE}/api/${scope}/nodes/${nodeId}/blocks/${index}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Error al eliminar el bloque');
        }
        const result = await response.json();
        appState.scopes[scope].nodes = result.nodes;
        showToast(`Bloque #${index} eliminado en ${displayNodeName(nodeId)}`, 'warning');
        renderActiveTab();
    } catch (error) {
        console.error(error);
        showToast(error.message, 'error');
    }
}

// ═══════════════════════════════════════
//        TAB 1: HASH SANDBOX
// ═══════════════════════════════════════
async function initHashSandbox() {
    const hashInput = document.getElementById('hash-input');
    const hashOutput = document.getElementById('hash-output');

    const updateHash = async () => {
        const text = hashInput.value;
        const hash = await calculateSHA256(text);
        hashOutput.innerHTML = formatHashDisplay(hash, appState.difficulty);
    };

    hashInput.addEventListener('input', updateHash);
    updateHash();
}

// ═══════════════════════════════════════
//        TAB 2: BLOCK SANDBOX
// ═══════════════════════════════════════
async function initBlockSandbox() {
    const blockCard = document.getElementById('single-block');
    const blockIndex = document.getElementById('single-block-index');
    const blockTimestamp = document.getElementById('single-block-timestamp');
    const blockData = document.getElementById('single-block-data');
    const blockNonce = document.getElementById('single-block-nonce');
    const blockHash = document.getElementById('single-block-hash');
    const blockStatusText = document.getElementById('single-block-status');
    const blockStringDisplay = document.getElementById('single-block-string');
    const mineBtn = document.getElementById('single-block-mine-btn');
    const stepCheckbox = document.getElementById('step-mode-checkbox');

    const updateBlockHashLocal = async () => {
        const index = blockIndex.value;
        const timestamp = blockTimestamp.value;
        const data = blockData.value;
        const nonce = blockNonce.value;
        const prevHash = "0000000000000000000000000000000000000000000000000000000000000000";

        const blockString = `${index}${timestamp}${data}${prevHash}${nonce}`;
        const hash = await calculateSHA256(blockString);

        blockStringDisplay.value = blockString;
        blockHash.innerHTML = formatHashDisplay(hash, appState.difficulty);

        const target = '0'.repeat(appState.difficulty);
        if (hash.startsWith(target)) {
            blockCard.className = 'block-card valid';
            blockStatusText.innerText = 'V\u00c1LIDO';
        } else {
            blockCard.className = 'block-card invalid';
            blockStatusText.innerText = 'INV\u00c1LIDO';
        }
    };

    blockData.addEventListener('input', updateBlockHashLocal);
    blockNonce.addEventListener('input', updateBlockHashLocal);

    mineBtn.addEventListener('click', async () => {
        const stepMode = stepCheckbox.checked;
        const target = '0'.repeat(appState.difficulty);
        const index = blockIndex.value;
        const timestamp = blockTimestamp.value;
        const data = blockData.value;
        const prevHash = "0000000000000000000000000000000000000000000000000000000000000000";

        if (stepMode) {
            const currentNonce = parseInt(blockNonce.value) || 0;
            const blockString = `${index}${timestamp}${data}${prevHash}${currentNonce}`;
            const hash = await calculateSHA256(blockString);

            blockStringDisplay.value = blockString;
            blockHash.innerHTML = formatHashDisplay(hash, appState.difficulty);

            if (hash.startsWith(target)) {
                blockCard.className = 'block-card valid';
                blockStatusText.innerText = 'V\u00c1LIDO';
                showToast(`\u00a1Nonce ${currentNonce} es v\u00e1lido!`, 'success');
            } else {
                blockCard.className = 'block-card invalid';
                blockStatusText.innerText = `Nonce ${currentNonce} \u2192 FALL\u00d3`;
                blockNonce.value = currentNonce + 1;
                setTimeout(() => updateBlockHashLocal(), 50);
                showToast(`Nonce ${currentNonce} no cumple. Probando ${currentNonce + 1}...`, 'warning');
            }
        } else {
            blockData.disabled = true;
            mineBtn.disabled = true;
            blockCard.classList.add('mining');
            appState.isMining = true;

            const icon = mineBtn.querySelector('.icon-spin-target') || mineBtn.querySelector('svg') || mineBtn.querySelector('i');
            if (icon) icon.classList.add('icon-spin');

            let localNonce = 0;
            const startTime = performance.now();

            let hash = "";
            while (true) {
                const blockString = `${index}${timestamp}${data}${prevHash}${localNonce}`;
                hash = await calculateSHA256(blockString);

                blockNonce.value = localNonce;
                blockStringDisplay.value = blockString;
                blockHash.innerHTML = formatHashDisplay(hash, appState.difficulty);

                if (hash.startsWith(target)) break;
                localNonce++;

                if (localNonce % 10 === 0) {
                    blockStatusText.innerText = `MINANDO... (${localNonce.toLocaleString()})`;
                    await new Promise(r => setTimeout(r, 0));
                }
            }

            const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
            blockCard.className = 'block-card valid';
            blockStatusText.innerText = 'V\u00c1LIDO';
            blockData.disabled = false;
            mineBtn.disabled = false;
            blockCard.classList.remove('mining');
            appState.isMining = false;
            if (icon) icon.classList.remove('icon-spin');
            showToast(`\u00a1Minado! Nonce: ${localNonce} (${localNonce + 1} intentos en ${elapsed}s)`, 'success');
        }
    });

    updateBlockHashLocal();
}

// ═══════════════════════════════════════
//   GENERIC CHAIN RENDERER
// ═══════════════════════════════════════
function renderChainBlocks(containerId, nodeSelectId, scope, blockIdPrefix) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    const nodes = appState.scopes[scope].nodes;
    const difficulty = appState.scopes[scope].difficulty || appState.difficulty;

    const selectedNode = document.getElementById(nodeSelectId).value || 'Peer_A';
    const blockchainNode = nodes[selectedNode];
    if (!blockchainNode) return;

    blockchainNode.chain.forEach((block, idx) => {
        const target = '0'.repeat(difficulty);
        const isHashValid = block.hash.startsWith(target);
        let isLinkValid = true;
        if (idx > 0) {
            isLinkValid = (block.previous_hash === blockchainNode.chain[idx - 1].hash);
        }
        const isBlockValid = isHashValid && isLinkValid;

        let displayData = formatBlockData(block.data);

        const blockEl = document.createElement('div');
        blockEl.className = `block-card ${isBlockValid ? 'valid' : 'invalid'} clickable`;
        blockEl.id = `${blockIdPrefix}-${idx}`;
        const hashStr = formatHashDisplay(block.hash, difficulty);
        blockEl.innerHTML = `
            <div class="block-header">
                <span class="block-num">BLOQUE #${block.index}</span>
                <span class="block-status-text">${isBlockValid ? 'V\u00c1LIDO' : 'INV\u00c1LIDO'}</span>
            </div>
            <div class="block-body">
                <div class="input-row">
                    <label>\u00cdndice:</label>
                    <input type="number" value="${block.index}" disabled>
                </div>
                <div class="input-row">
                    <label>Datos:</label>
                    <textarea class="block-data-input" data-index="${block.index}">${displayData}</textarea>
                </div>
                <div class="input-row highlight">
                    <label>Nonce:</label>
                    <div class="nonce-wrapper">
                        <input type="number" class="chain-nonce-input" value="${isBlockValid ? block.nonce : 0}">
                        <button class="btn btn-primary mine-block-btn" data-index="${block.index}">
                            <i data-lucide="hammer"></i> Minar Bloque
                        </button>
                    </div>
                </div>
                <div class="step-mode-toggle" style="margin-top: 6px; display: flex; align-items: center; gap: 6px;">
                    <input type="checkbox" class="chain-step-cb" data-index="${block.index}" style="width: auto; margin: 0; cursor: pointer;">
                    <label style="font-size: 0.7rem; color: var(--color-muted); cursor: pointer;">Paso a paso (1 nonce por clic)</label>
                </div>

                <div class="input-row" style="margin-top: 6px;">
                    <label style="font-size: 0.65rem; color: var(--color-muted);">Entrada SHA-256:</label>
                    <textarea class="block-string-display" readonly style="font-family: var(--font-mono); font-size: 0.6rem; padding: 4px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 3px; width: 100%; min-height: 52px; resize: none; color: var(--color-text);">${block.index}${block.timestamp}${serializeBlockData(block.data)}${block.previous_hash}${block.nonce}</textarea>
                </div>

                <div class="divider"></div>

                <div class="hash-field">
                    <label>Anterior Hash:</label>
                    <div class="hash-val code" style="font-size: 0.7rem;">${block.previous_hash.substring(0, 20)}\u2026</div>
                </div>
                <div class="hash-field font-bold">
                    <label>Hash:</label>
                    <div class="hash-val code text-glow chain-hash-display" style="font-size: 0.7rem;">${hashStr}</div>
                </div>
            </div>
        `;

        container.appendChild(blockEl);

        if (idx < blockchainNode.chain.length - 1) {
            const nextBlock = blockchainNode.chain[idx + 1];
            const linkBroken = (nextBlock.previous_hash !== block.hash);

            const linkEl = document.createElement('div');
            linkEl.className = `chain-link ${linkBroken ? 'broken' : ''}`;
            linkEl.innerHTML = `
                <div class="chain-link-line"></div>
                <span class="chain-link-arrow">${linkBroken ? '\u2715 ROTO' : ''}</span>
            `;
            container.appendChild(linkEl);
        }
    });

    lucide.createIcons();

    // --- Event Listeners ---

    container.querySelectorAll('.block-card.clickable').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('textarea') || e.target.closest('input') || e.target.closest('button')) return;
            const idx = parseInt(card.id.replace(`${blockIdPrefix}-`, ''));
            const liveNodeForModal = appState.scopes[scope].nodes[selectedNode] || blockchainNode;
            openBlockDetailModal(liveNodeForModal.chain[idx], idx, selectedNode, scope);
        });
    });

    container.querySelectorAll('.block-data-input').forEach(textarea => {
        textarea.addEventListener('change', async (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'));
            const newData = e.target.value;
            await apiTamperBlock(selectedNode, idx, newData, scope);
        });
    });

    container.querySelectorAll('.mine-block-btn').forEach(button => {
        button.addEventListener('click', async (e) => {
            e.stopPropagation();
            const btn = e.currentTarget;
            const idx = parseInt(btn.getAttribute('data-index'));
            const card = document.getElementById(`${blockIdPrefix}-${idx}`);

            // If user edited textarea and immediately clicked Mine (blur fires change simultaneously),
            // wait for the in-flight tamper request to complete so appState has updated block data.
            const tamperKey = `${scope}-${selectedNode}-${idx}`;
            if (pendingTampers[tamperKey]) await pendingTampers[tamperKey];

            const liveNode = appState.scopes[scope].nodes[selectedNode] || blockchainNode;
            const block = liveNode.chain[idx];
            const nonceInput = card.querySelector('.chain-nonce-input');
            const hashDisplay = card.querySelector('.chain-hash-display');
            const statusText = card.querySelector('.block-status-text');
            const stepCb = card.querySelector('.chain-step-cb');
            const blockStringDisplay = card.querySelector('.block-string-display');
            const icon = btn.querySelector('.lucide') || btn.querySelector('svg') || btn.querySelector('i');

            const stepMode = stepCb.checked;
            const difficulty = appState.scopes[scope].difficulty || appState.difficulty;
            const target = '0'.repeat(difficulty);
            const prevHash = block.previous_hash;
            const serializedData = serializeBlockData(block.data);

            if (stepMode) {
                const currentNonce = parseInt(nonceInput.value) || 0;
                const blockStr = `${block.index}${block.timestamp}${serializedData}${prevHash}${currentNonce}`;
                const hash = await calculateSHA256(blockStr);

                if (blockStringDisplay) blockStringDisplay.value = blockStr;
                hashDisplay.innerHTML = formatHashDisplay(hash, difficulty);

                if (hash.startsWith(target)) {
                    card.className = 'block-card valid clickable';
                    statusText.innerText = 'V\u00c1LIDO';
                    showToast(`\u00a1Nonce ${currentNonce} es v\u00e1lido!`, 'success');
                    await apiMineBlockIndex(selectedNode, block.index, scope);
                } else {
                    card.className = 'block-card invalid clickable';
                    statusText.innerText = `Nonce ${currentNonce} \u2192 FALL\u00d3`;
                    nonceInput.value = currentNonce + 1;
                    setTimeout(() => {
                        const s = serializeBlockData(block.data);
                        const str = `${block.index}${block.timestamp}${s}${prevHash}${nonceInput.value}`;
                        if (blockStringDisplay) blockStringDisplay.value = str;
                        calculateSHA256(str).then(h => { hashDisplay.innerHTML = formatHashDisplay(h, difficulty); });
                    }, 50);
                    showToast(`Nonce ${currentNonce} no cumple. Probando ${currentNonce + 1}...`, 'warning');
                }
            } else {
                btn.disabled = true;
                appState.isMining = true;
                card.classList.add('mining');
                if (icon) icon.classList.add('icon-spin');

                let localNonce = 0;
                const startTime = performance.now();

                let hash = "";
                while (true) {
                    const blockStr = `${block.index}${block.timestamp}${serializedData}${prevHash}${localNonce}`;
                    hash = await calculateSHA256(blockStr);
                    nonceInput.value = localNonce;
                    if (blockStringDisplay) blockStringDisplay.value = blockStr;
                    hashDisplay.innerHTML = formatHashDisplay(hash, difficulty);

                    if (hash.startsWith(target)) break;
                    localNonce++;

                    if (localNonce % 10 === 0) {
                        statusText.innerText = `MINANDO... (${localNonce.toLocaleString()})`;
                        await new Promise(r => setTimeout(r, 0));
                    }
                }

                const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
                card.className = 'block-card valid clickable';
                card.classList.remove('mining');
                statusText.innerText = 'V\u00c1LIDO';
                if (icon) icon.classList.remove('icon-spin');
                showToast(`\u00a1Minado! Nonce: ${localNonce} (${localNonce + 1} intentos en ${elapsed}s)`, 'success');

                btn.disabled = false;
                appState.isMining = false;
                await apiMineBlockIndex(selectedNode, block.index, scope);
            }
        });
    });
}

// ═══════════════════════════════════════
//   TAB 3: BLOCKCHAIN VISUALIZER
// ═══════════════════════════════════════
function renderBlockchainTab() {
    const scope = 'chain';
    const nodes = appState.scopes[scope].nodes;
    const difficulty = appState.scopes[scope].difficulty || appState.difficulty;
    const selectedNode = document.getElementById('chain-node-select').value || 'Peer_A';
    const blockchainNode = nodes[selectedNode];
    if (!blockchainNode) return;

    // --- Update Health Dashboard ---
    const dashboard = document.getElementById('chain-health');
    const healthText = document.getElementById('chain-health-text');
    const blockCount = document.getElementById('chain-block-count');
    const titleCount = document.getElementById('chain-title-count');
    const diffDisplay = document.getElementById('chain-difficulty-display');

    blockCount.textContent = blockchainNode.chain.length;
    titleCount.textContent = Object.keys(blockchainNode.titles || {}).length;
    diffDisplay.textContent = difficulty;

    if (blockchainNode.is_valid) {
        dashboard.classList.remove('broken');
        healthText.textContent = `\uD83D\uDFE2 Cadena de ${displayNodeName(selectedNode)} \u00cdntegra — Todos los hashes verificados`;
    } else {
        dashboard.classList.add('broken');
        healthText.textContent = `\uD83D\uDD34 \u00a1CADENA DE ${displayNodeName(selectedNode).toUpperCase()} ROTA! — Se detect\u00f3 alteraci\u00f3n o enlace roto`;
    }

    renderChainBlocks('blockchain-list', 'chain-node-select', 'chain', 'chain-block');

    // Render chain node list with delete buttons
    const nodeList = document.getElementById('chain-node-list');
    if (nodeList) {
        nodeList.innerHTML = '';
        Object.keys(nodes).forEach(nid => {
            const chip = document.createElement('div');
            chip.style.cssText = 'display:flex;align-items:center;gap:8px;background:var(--bg-tertiary);border:1px solid var(--color-border);border-radius:8px;padding:8px 14px;font-size:0.85rem;';
            chip.innerHTML = `
                <span>${displayNodeName(nid)}${nid === 'Peer_A' ? ' <span style="color:var(--accent-primary);font-weight:600;">(Ra\u00edz)</span>' : ''}</span>
                ${nid !== 'Peer_A' ? `<button class="btn btn-tiny chain-delete-node-btn" data-node="${nid}" style="background:var(--accent-invalid-bg);color:var(--accent-invalid);border:1px solid var(--accent-invalid-border);border-radius:4px;padding:3px 8px;font-size:0.7rem;cursor:pointer;">
                    <i data-lucide="trash-2" style="width:12px;height:12px;"></i>
                </button>` : ''}
            `;
            nodeList.appendChild(chip);
        });
        lucide.createIcons();

        nodeList.querySelectorAll('.chain-delete-node-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const nodeId = e.currentTarget.getAttribute('data-node');
                if (confirm(`\u00bfEliminar ${displayNodeName(nodeId)} de la red?`)) {
                    await apiDeleteNode(nodeId, 'chain');
                }
            });
        });
    }
}

// ═══════════════════════════════════════
//   BLOCK DETAIL MODAL (INTERACTIVE)
// ═══════════════════════════════════════
let currentModalBlock = null;
let currentModalNodeId = null;
let currentModalIndex = null;
let currentModalScope = 'chain';

function openBlockDetailModal(block, idx, nodeId, scope) {
    // Always prefer live block data from appState over the render-time snapshot
    const liveNode = appState.scopes[scope].nodes[nodeId];
    block = (liveNode && liveNode.chain[idx]) || block;

    currentModalBlock = block;
    currentModalNodeId = nodeId;
    currentModalIndex = idx;
    currentModalScope = scope;

    const overlay = document.getElementById('block-modal-overlay');
    const scopeDiff = appState.scopes[scope].difficulty || appState.difficulty;
    const target = '0'.repeat(scopeDiff);
    const isHashValid = block.hash.startsWith(target);

    const nodes = appState.scopes[scope].nodes;
    const nodeData = nodes[nodeId];
    let isLinkValid = true;
    if (idx > 0 && nodeData) {
        isLinkValid = (block.previous_hash === nodeData.chain[idx - 1].hash);
    }
    const isBlockValid = isHashValid && isLinkValid;

    document.getElementById('modal-block-title').textContent = `Bloque #${block.index}`;
    const badge = document.getElementById('modal-block-badge');
    badge.textContent = isBlockValid ? 'V\u00c1LIDO' : 'INV\u00c1LIDO';
    badge.className = `badge ${isBlockValid ? 'success' : 'danger'}`;

    document.getElementById('modal-index').textContent = block.index;
    document.getElementById('modal-timestamp').textContent = new Date(block.timestamp * 1000).toLocaleString('es');
    document.getElementById('modal-nonce').textContent = block.nonce.toLocaleString();
    document.getElementById('modal-size').textContent = JSON.stringify(block.data).length + ' bytes';

    const dataContainer = document.getElementById('modal-data-content');
    if (typeof block.data === 'object' && Array.isArray(block.data)) {
        dataContainer.innerHTML = block.data.map(t => `
            <div class="modal-data-card">
                <div class="modal-data-field"><label>\uD83C\uDF93 Estudiante</label><span>${t.student || '\u2014'}</span></div>
                <div class="modal-data-field"><label>\uD83D\uDCDC Carrera</label><span>${t.degree || '\u2014'}</span></div>
                <div class="modal-data-field"><label>\uD83C\uDFDB\uFE0F Universidad</label><span>${t.university || '\u2014'}</span></div>
                <div class="modal-data-field"><label>\uD83D\uDCC5 Fecha</label><span>${t.date || '\u2014'}</span></div>
                <div class="modal-data-field"><label>\uD83D\uDD11 ID T\u00edtulo</label><span style="color: var(--accent-info); font-family: var(--font-mono);">${t.title_id || '\u2014'}</span></div>
            </div>
        `).join('');
    } else {
        dataContainer.innerHTML = `<div class="modal-data-raw">${String(block.data)}</div>`;
    }

    document.getElementById('modal-prev-hash').innerHTML = formatHashDisplay(block.previous_hash, scopeDiff);
    document.getElementById('modal-current-hash').innerHTML = formatHashDisplay(block.hash, scopeDiff);

    const modalBlockStr = `${block.index}${block.timestamp}${serializeBlockData(block.data)}${block.previous_hash}${block.nonce}`;
    const modalStrDisplay = document.getElementById('modal-block-string');
    if (modalStrDisplay) modalStrDisplay.value = modalBlockStr;

    const valGrid = document.getElementById('modal-validation-grid');
    valGrid.innerHTML = `
        <div class="validation-check ${isHashValid ? 'pass' : 'fail'}">
            <i data-lucide="${isHashValid ? 'check-circle' : 'x-circle'}"></i>
            <span>Proof of Work: Hash comienza con ${'0'.repeat(scopeDiff)} (dificultad ${scopeDiff})</span>
        </div>
        <div class="validation-check ${isLinkValid ? 'pass' : 'fail'}">
            <i data-lucide="${isLinkValid ? 'check-circle' : 'x-circle'}"></i>
            <span>Enlace: El campo "Previous Hash" coincide con el hash del bloque padre</span>
        </div>
        <div class="validation-check ${isBlockValid ? 'pass' : 'fail'}">
            <i data-lucide="${isBlockValid ? 'shield-check' : 'shield-alert'}"></i>
            <span>Integridad general: ${isBlockValid ? 'Bloque \u00edntegro y verificado' : '\u00a1Bloque comprometido o corrupto!'}</span>
        </div>
    `;

    overlay.classList.add('active');
    lucide.createIcons();
}

function closeBlockDetailModal() {
    document.getElementById('block-modal-overlay').classList.remove('active');
    currentModalBlock = null;
}

function openTamperModal(blockIndex, nodeId) {
    const overlay = document.getElementById('tamper-modal-overlay');
    document.getElementById('tamper-modal-title').textContent = `Alterar Bloque #${blockIndex}`;
    document.getElementById('tamper-node-select').value = nodeId || 'Peer_A';
    document.getElementById('tamper-data-input').value = '';
    document.getElementById('tamper-data-input').placeholder = `Escribe datos falsos para inyectar en el Bloque #${blockIndex}...`;
    overlay.classList.add('active');
}

function closeTamperModal() {
    document.getElementById('tamper-modal-overlay').classList.remove('active');
}

function updateTopologyDiagram() {
    const container = document.querySelector('.topology-diagram');
    if (!container) return;

    container.innerHTML = '';
    container.style.position = 'relative';
    container.style.overflow = 'hidden';

    const scope = 'attack';
    const nodes = appState.scopes[scope].nodes;
    const nodeIds = Object.keys(nodes);
    if (nodeIds.length === 0) return;

    // Build children map from parent field
    const children = {};
    const parentMap = {};
    nodeIds.forEach(nid => {
        const val = nodes[nid].parent;
        const parent = (val != null) ? val : null;
        parentMap[nid] = parent;
        if (parent != null) {
            if (!children[parent]) children[parent] = [];
            children[parent].push(nid);
        }
    });

    // Calculate tree depth
    function calcDepth(nid, visited = new Set()) {
        if (visited.has(nid)) return 0;
        visited.add(nid);
        const parent = parentMap[nid];
        if (!parent || parent === nid) return 0;
        return 1 + calcDepth(parent, visited);
    }
    const maxDepth = Math.max(...nodeIds.map(nid => calcDepth(nid)));

    // Set container height based on tree depth
    const nodeH = 150;
    const containerH = (maxDepth + 1) * nodeH + 80;
    container.style.height = containerH + 'px';

    // Create SVG layer
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'topology-lines');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = containerH + 'px';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '1';
    container.appendChild(svg);

    // Calculate tree positions
    const positions = {};
    function layoutTree(nid, level, left, right) {
        const x = (left + right) / 2;
        const y = level * nodeH + 40;
        positions[nid] = { x, y };
        const kids = children[nid] || [];
        if (kids.length > 0) {
            const segment = (right - left) / kids.length;
            kids.forEach((child, i) => {
                layoutTree(child, level + 1, left + i * segment, left + (i + 1) * segment);
            });
        }
    }
    layoutTree('Peer_A', 0, 60, container.clientWidth > 60 ? container.clientWidth - 60 : 600);

    // Draw SVG connection lines
    nodeIds.forEach(nid => {
        const parent = parentMap[nid];
        if (!parent || parent === nid) return;
        const p = positions[parent];
        const c = positions[nid];
        if (!p || !c) return;

        const n1 = nodes[nid];
        const n2 = nodes[parent];

        let color = 'var(--accent-valid)';
        let dash = '';
        if (!n1.is_online || !n2.is_online) {
            color = 'var(--color-muted)'; dash = '6,4';
        } else if (!n1.is_valid || !n2.is_valid) {
            color = 'var(--accent-invalid)';
        }

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', p.x);
        line.setAttribute('y1', p.y + 30);
        line.setAttribute('x2', c.x);
        line.setAttribute('y2', c.y - 30);
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', '2.5');
        line.setAttribute('opacity', '0.6');
        if (dash) line.setAttribute('stroke-dasharray', dash);
        svg.appendChild(line);

        const angle = Math.atan2(c.y - 30 - (p.y + 30), c.x - p.x);
        const ax = c.x - 30 * Math.cos(angle);
        const ay = c.y - 30 * Math.sin(angle);
        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        const arrowSize = 8;
        const pts = [
            `${ax},${ay}`,
            `${ax - arrowSize * Math.cos(angle - 0.4)},${ay - arrowSize * Math.sin(angle - 0.4)}`,
            `${ax - arrowSize * Math.cos(angle + 0.4)},${ay - arrowSize * Math.sin(angle + 0.4)}`
        ];
        arrow.setAttribute('points', pts.join(' '));
        arrow.setAttribute('fill', color);
        arrow.setAttribute('opacity', '0.8');
        svg.appendChild(arrow);
    });

    // Render node cards at calculated positions
    nodeIds.forEach(nid => {
        const pos = positions[nid];
        if (!pos) return;
        const nodeData = nodes[nid];
        const isOnline = nodeData.is_online;
        const isValid = nodeData.is_valid;

        let statusText = '\u2713 Sincronizado';
        if (!isOnline) {
            statusText = '\uD83D\uDD0C Desconectado';
        } else if (!isValid) {
            statusText = '\u2715 Cadena Rota';
        } else {
            const nodeSig = nodeData.chain.map(b => b.hash).join('');
            const leader = nodes['Peer_A'];
            const leaderSig = leader ? leader.chain.map(b => b.hash).join('') : '';
            if (nodeSig !== leaderSig) {
                statusText = '\u26A0\uFE0F Bifurcado';
            }
        }

        const isRoot = nid === 'Peer_A';
        const nodeEl = document.createElement('div');
        let statusClass = 'valid';
        if (!isOnline) statusClass = 'offline';
        else if (!isValid) statusClass = 'broken';
        else {
            const nodeSig = nodeData.chain.map(b => b.hash).join('');
            const leader = nodes['Peer_A'];
            const leaderSig = leader ? leader.chain.map(b => b.hash).join('') : '';
            if (nodeSig !== leaderSig) statusClass = 'bifurcated';
        }

        nodeEl.className = `topology-node ${statusClass} ${isOnline ? 'online' : 'offline'}`;
        nodeEl.style.position = 'absolute';
        nodeEl.style.left = (pos.x - 80) + 'px';
        nodeEl.style.top = pos.y + 'px';
        nodeEl.style.width = '160px';
        nodeEl.id = `topo-${nid.toLowerCase().replace('_', '-')}`;

        nodeEl.innerHTML = `
            <div class="topo-node-icon" style="position: relative;">
                <i data-lucide="server"></i>
                <span class="online-indicator-dot ${isOnline ? 'green' : 'gray'}"></span>
            </div>
            <span class="topo-node-label">${displayNodeName(nid)}${isRoot ? ' <small style="color:var(--accent-primary);font-weight:600;">(Ra\u00edz)</small>' : ''}</span>
            <span class="topo-node-status">${statusText}</span>
            <button class="btn btn-tiny toggle-conn-btn" data-node="${nid}" style="margin-top: 6px; font-size: 0.7rem; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--color-border); background: var(--bg-tertiary); color: var(--color-text); cursor: pointer;">
                ${isOnline ? 'Desconectar' : 'Conectar'}
            </button>
        `;

        container.appendChild(nodeEl);
    });

    container.querySelectorAll('.toggle-conn-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const nodeId = btn.getAttribute('data-node');
            await apiToggleNodeConnection(nodeId, scope);
        });
    });

    lucide.createIcons();
}

function renderNetworkTab() {
    updateTopologyDiagram();
    renderAttackChainSections();
}

function renderAttackChainSections() {
    const container = document.getElementById('attack-chain-sections');
    if (!container) return;
    container.innerHTML = '';

    const scope = 'attack';
    const nodes = appState.scopes[scope].nodes;
    const difficulty = appState.scopes[scope].difficulty || appState.difficulty;

    Object.keys(nodes).forEach(nodeId => {
        const blockchain = nodes[nodeId];
        const isOnline = blockchain.is_online;
        const isValid = blockchain.is_valid;
        const nodeName = displayNodeName(nodeId);

        const section = document.createElement('div');
        section.className = 'topo-node-section';
        section.style.marginBottom = '20px';
        if (!isOnline) section.style.opacity = '0.55';
        if (!isValid) section.style.borderColor = 'var(--accent-invalid-border)';

        // Header
        const header = document.createElement('div');
        header.className = 'topo-node-section-header';
        header.innerHTML = `
            <div class="topo-section-icon">
                <i data-lucide="server"></i>
            </div>
            <span class="topo-section-name">${nodeName}</span>
            <span class="badge ${isValid ? 'success' : 'danger'}">${isValid ? 'V\u00e1lido' : 'Inv\u00e1lido'}</span>
            <span style="font-size: 0.8rem; color: var(--color-muted);">${blockchain.chain.length} bloques</span>
        `;
        section.appendChild(header);

        // Chain blocks
        const chainDiv = document.createElement('div');
        chainDiv.className = 'blockchain-wrapper';
        chainDiv.style.cssText = 'overflow-x: auto;';

        blockchain.chain.forEach((block, idx) => {
            const target = '0'.repeat(difficulty);
            const isHashValid = block.hash.startsWith(target);
            let isLinkValid = true;
            if (idx > 0) isLinkValid = (block.previous_hash === blockchain.chain[idx - 1].hash);
            const isBlockValid = isHashValid && isLinkValid;
            const displayData = formatBlockData(block.data);
            const hashStr = formatHashDisplay(block.hash, difficulty);

            const blockEl = document.createElement('div');
            blockEl.className = `block-card ${isBlockValid ? 'valid' : 'invalid'} clickable`;
            blockEl.id = `attack-chain-block-${nodeId}-${idx}`;
            blockEl.innerHTML = `
                <div class="block-header">
                    <span class="block-num">BLOQUE #${block.index}</span>
                    <span class="block-status-text">${isBlockValid ? 'V\u00c1LIDO' : 'INV\u00c1LIDO'}</span>
                </div>
                <div class="block-body">
                    <div class="input-row">
                        <label>\u00cdndice:</label>
                        <input type="number" value="${block.index}" disabled>
                    </div>
                    <div class="input-row">
                        <label>Datos:</label>
                        <textarea class="attack-chain-data-input" data-node="${nodeId}" data-index="${block.index}">${displayData}</textarea>
                    </div>
                    <div class="input-row highlight">
                        <label>Nonce:</label>
                        <div class="nonce-wrapper">
                            <input type="number" class="attack-chain-nonce" value="${isBlockValid ? block.nonce : 0}">
                            <button class="btn btn-primary attack-chain-mine-btn" data-node="${nodeId}" data-index="${block.index}">
                                <i data-lucide="hammer"></i> Minar Bloque
                            </button>
                        </div>
                    </div>
                    <div class="step-mode-toggle" style="margin-top: 6px; display: flex; align-items: center; gap: 6px;">
                        <input type="checkbox" class="attack-chain-step-cb" data-node="${nodeId}" data-index="${block.index}" style="width: auto; margin: 0; cursor: pointer;">
                        <label style="font-size: 0.7rem; color: var(--color-muted); cursor: pointer;">Paso a paso</label>
                    </div>
                    <div class="input-row" style="margin-top: 6px;">
                        <label style="font-size: 0.65rem; color: var(--color-muted);">Entrada SHA-256:</label>
                        <textarea class="attack-chain-block-str" readonly style="font-family: var(--font-mono); font-size: 0.6rem; padding: 4px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 3px; width: 100%; min-height: 52px; resize: none; color: var(--color-text);">${block.index}${block.timestamp}${serializeBlockData(block.data)}${block.previous_hash}${block.nonce}</textarea>
                    </div>
                    <div class="divider"></div>
                    <div class="hash-field">
                        <label>Anterior Hash:</label>
                        <div class="hash-val code" style="font-size: 0.7rem;">${block.previous_hash.substring(0, 20)}\u2026</div>
                    </div>
                    <div class="hash-field font-bold">
                        <label>Hash:</label>
                        <div class="hash-val code text-glow attack-chain-hash" style="font-size: 0.7rem;">${hashStr}</div>
                    </div>
                </div>
            `;
            chainDiv.appendChild(blockEl);

            // Chain link between blocks (horizontal arrow)
            if (idx < blockchain.chain.length - 1) {
                const nextBlock = blockchain.chain[idx + 1];
                const linkBroken = (nextBlock.previous_hash !== block.hash);
                const linkEl = document.createElement('div');
                linkEl.className = `chain-link ${linkBroken ? 'broken' : ''}`;
                linkEl.innerHTML = `<div class="chain-link-line"></div><span class="chain-link-arrow">${linkBroken ? '\u2715 ROTO' : ''}</span>`;
                chainDiv.appendChild(linkEl);
            }
        });

        section.appendChild(chainDiv);
        container.appendChild(section);
    });

    lucide.createIcons();

    container.querySelectorAll('.block-card.clickable').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('textarea') || e.target.closest('input') || e.target.closest('button')) return;
            const idParts = card.id.replace('attack-chain-block-', '').split('-');
            const nodeId = idParts.slice(0, -1).join('-');
            const idx = parseInt(idParts[idParts.length - 1]);
            const liveNodeForModal = appState.scopes[scope].nodes[nodeId] || nodes[nodeId];
            openBlockDetailModal(liveNodeForModal.chain[idx], idx, nodeId, scope);
        });
    });

    container.querySelectorAll('.attack-chain-data-input').forEach(textarea => {
        textarea.addEventListener('change', async (e) => {
            const nodeId = e.target.getAttribute('data-node');
            const idx = parseInt(e.target.getAttribute('data-index'));
            await apiTamperBlock(nodeId, idx, e.target.value, scope);
        });
    });

    container.querySelectorAll('.attack-chain-mine-btn').forEach(button => {
        button.addEventListener('click', async (e) => {
            e.stopPropagation();
            const btn = e.currentTarget;
            const nodeId = btn.getAttribute('data-node');
            const idx = parseInt(btn.getAttribute('data-index'));
            const card = document.getElementById(`attack-chain-block-${nodeId}-${idx}`);

            const tamperKey = `${scope}-${nodeId}-${idx}`;
            if (pendingTampers[tamperKey]) await pendingTampers[tamperKey];

            const liveNode = (appState.scopes[scope].nodes[nodeId]) || nodes[nodeId];
            const block = liveNode.chain[idx];
            if (!card) return;

            const nonceInput = card.querySelector('.attack-chain-nonce');
            const hashDisplay = card.querySelector('.attack-chain-hash');
            const statusText = card.querySelector('.block-status-text');
            const stepCb = card.querySelector('.attack-chain-step-cb');
            const blockStrDisplay = card.querySelector('.attack-chain-block-str');
            const icon = btn.querySelector('.lucide') || btn.querySelector('svg') || btn.querySelector('i');

            const stepMode = stepCb.checked;
            const difficulty = appState.scopes[scope].difficulty || appState.difficulty;
            const target = '0'.repeat(difficulty);
            const prevHash = block.previous_hash;
            const serializedData = serializeBlockData(block.data);

            if (stepMode) {
                const currentNonce = parseInt(nonceInput.value) || 0;
                const blockStr = `${block.index}${block.timestamp}${serializedData}${prevHash}${currentNonce}`;
                const hash = await calculateSHA256(blockStr);
                if (blockStrDisplay) blockStrDisplay.value = blockStr;
                hashDisplay.innerHTML = formatHashDisplay(hash, difficulty);
                if (hash.startsWith(target)) {
                    card.className = 'block-card valid clickable';
                    statusText.innerText = 'V\u00c1LIDO';
                    showToast(`\u00a1Nonce ${currentNonce} es v\u00e1lido!`, 'success');
                    await apiMineBlockIndex(nodeId, block.index, scope);
                } else {
                    card.className = 'block-card invalid clickable';
                    statusText.innerText = `Nonce ${currentNonce} \u2192 FALL\u00d3`;
                    nonceInput.value = currentNonce + 1;
                    setTimeout(() => {
                        const s = serializeBlockData(block.data);
                        const str = `${block.index}${block.timestamp}${s}${prevHash}${nonceInput.value}`;
                        if (blockStrDisplay) blockStrDisplay.value = str;
                        calculateSHA256(str).then(h => { hashDisplay.innerHTML = formatHashDisplay(h, difficulty); });
                    }, 50);
                    showToast(`Nonce ${currentNonce} no cumple. Probando ${currentNonce + 1}...`, 'warning');
                }
            } else {
                btn.disabled = true;
                appState.isMining = true;
                card.classList.add('mining');
                if (icon) icon.classList.add('icon-spin');
                let localNonce = 0;
                const startTime = performance.now();
                let hash = '';
                while (true) {
                    const blockStr = `${block.index}${block.timestamp}${serializedData}${prevHash}${localNonce}`;
                    hash = await calculateSHA256(blockStr);
                    nonceInput.value = localNonce;
                    if (blockStrDisplay) blockStrDisplay.value = blockStr;
                    hashDisplay.innerHTML = formatHashDisplay(hash, difficulty);
                    if (hash.startsWith(target)) break;
                    localNonce++;
                    if (localNonce % 10 === 0) {
                        statusText.innerText = `MINANDO... (${localNonce.toLocaleString()})`;
                        await new Promise(r => setTimeout(r, 0));
                    }
                }
                const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
                card.className = 'block-card valid clickable';
                card.classList.remove('mining');
                statusText.innerText = 'V\u00c1LIDO';
                if (icon) icon.classList.remove('icon-spin');
                showToast(`\u00a1Minado! Nonce: ${localNonce} (${localNonce + 1} intentos en ${elapsed}s)`, 'success');
                btn.disabled = false;
                appState.isMining = false;
                await apiMineBlockIndex(nodeId, block.index, scope);
            }
        });
    });
}

// ═══════════════════════════════════════
//   TAB 5: TITLE REGISTRY & VERIFICATION
// ═══════════════════════════════════════
function renderTitleRegistryTab() {
    const mempoolList = document.getElementById('mempool-list');
    const mempoolCount = document.getElementById('mempool-count');

    const scope = 'ledger';
    const nodes = appState.scopes[scope].nodes;
    if (!nodes['Peer_A']) return;

    const selectedMineNode = document.getElementById('mine-node-select')?.value || 'Peer_A';
    const miningNode = nodes[selectedMineNode] || nodes['Peer_A'];
    const mempool = miningNode.mempool;

    mempoolCount.innerText = `${mempool.length} en espera`;

    if (mempool.length === 0) {
        mempoolList.innerHTML = `
            <tr>
                <td colspan="3" style="text-align: center; color: var(--color-muted); padding: 20px;">
                    Ning\u00fan t\u00edtulo en la bandeja de espera. Registra uno arriba.
                </td>
            </tr>
        `;
    } else {
        mempoolList.innerHTML = mempool.map(title => `
            <tr>
                <td><code class="code" style="font-size: 0.8rem; color: var(--accent-info); font-weight:bold;">${title.title_id}</code></td>
                <td><strong>${title.student}</strong></td>
                <td>${title.degree}</td>
            </tr>
        `).join('');
    }

    triggerVerificationSearch();
    
    // Render blockchain visualization
    renderChainBlocks('ledger-blockchain-list', 'ledger-node-select', 'ledger', 'ledger-block');
    fetchLedgerSaves();
}

function triggerVerificationSearch() {
    const query = document.getElementById('search-input').value.trim().toLowerCase();
    const panel = document.getElementById('verification-status-panel');

    const scope = 'ledger';
    const nodes = appState.scopes[scope].nodes;
    if (!nodes['Peer_A']) return;

    const selectedLedgerNode = document.getElementById('ledger-node-select')?.value || 'Peer_A';
    const verifyNode = nodes[selectedLedgerNode] || nodes['Peer_A'];

    if (!query) {
        panel.className = "verification-box info-box";
        panel.innerHTML = `
            <i data-lucide="help-circle" class="status-box-icon"></i>
            <div class="status-box-content">
                <h4>Esperando B\u00fasqueda</h4>
                <p>Ingresa el nombre del graduado o el ID de t\u00edtulo para validar su autenticidad criptogr\u00e1fica.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    if (!verifyNode.is_valid) {
        panel.className = "verification-box error-box";
        panel.innerHTML = `
            <i data-lucide="shield-alert" class="status-box-icon"></i>
            <div class="status-box-content">
                <h4 style="color: var(--accent-invalid);">\u00a1ALERTA DE SEGURIDAD! CADENA COMPROMETIDA</h4>
                <p>El registro de Blockchain se encuentra en un estado <strong>INV\u00c1LIDO (firma rota)</strong> en <strong>${displayNodeName(selectedLedgerNode)}</strong>.</p>
                <p style="margin-top: 8px; font-size: 0.8rem; color: var(--color-muted);">
                    Se ha detectado una alteraci\u00f3n no autorizada de datos en el historial. El sistema de verificaci\u00f3n est\u00e1 bloqueado para prevenir el uso de credenciales forjadas. Sincroniza la red mediante el algoritmo de consenso para restablecer la confianza.
                </p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    const titles = verifyNode.titles || {};
    let foundTitle = null;

    for (const [tid, title] of Object.entries(titles)) {
        if (tid.toLowerCase().includes(query) || title.student.toLowerCase().includes(query)) {
            foundTitle = title;
            break;
        }
    }

    if (foundTitle) {
        panel.className = "verification-box success-box";
        panel.innerHTML = `
            <i data-lucide="shield-check" class="status-box-icon"></i>
            <div class="status-box-content" style="width: 100%;">
                <h4 style="color: var(--accent-valid);">\u2705 DIPLOMA AUT\u00c9NTICO VERIFICADO</h4>
                <p>Este t\u00edtulo acad\u00e9mico ha sido verificado criptogr\u00e1ficamente en la cadena de bloques y est\u00e1 libre de alteraciones.</p>

                <table class="title-detail-table">
                    <tr><td>Graduado:</td><td>${foundTitle.student}</td></tr>
                    <tr><td>Carrera:</td><td>${foundTitle.degree}</td></tr>
                    <tr><td>Universidad:</td><td>${foundTitle.university}</td></tr>
                    <tr><td>Fecha Emisi\u00f3n:</td><td>${foundTitle.date}</td></tr>
                    <tr><td>ID Registro:</td><td><code class="code" style="color: var(--accent-info);">${foundTitle.title_id}</code></td></tr>
                </table>
            </div>
        `;
    } else {
        panel.className = "verification-box error-box";
        panel.innerHTML = `
            <i data-lucide="x-circle" class="status-box-icon"></i>
            <div class="status-box-content">
                <h4 style="color: var(--accent-invalid);">\u274c REGISTRO NO ENCONTRADO</h4>
                <p>No se encontr\u00f3 ning\u00fan t\u00edtulo universitario registrado bajo el nombre o ID de t\u00edtulo: <strong>"${query}"</strong>.</p>
                <p style="margin-top: 8px; font-size: 0.8rem; color: var(--color-muted);">
                    Verifica si los datos ingresados son correctos, o aseg\u00farate de que el t\u00edtulo haya sido debidamente "Sellado" en un bloque de la blockchain.
                </p>
            </div>
        `;
    }

    lucide.createIcons();
}

// ═══════════════════════════════════════
//      LEDGER PERSISTENCE
// ═══════════════════════════════════════
async function fetchLedgerSaves() {
    try {
        const r = await fetch(`${API_BASE}/api/ledger/saves`);
        if (!r.ok) return;
        const data = await r.json();
        const sel = document.getElementById('ledger-saves-list');
        if (!sel) return;
        sel.innerHTML = '<option value="">— Seleccionar —</option>';
        data.saves.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name + '.blk';
            sel.appendChild(opt);
        });
    } catch (e) { /* ignore */ }
}

async function apiSaveLedger(filename, password) {
    try {
        const r = await fetch(`${API_BASE}/api/ledger/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, password })
        });
        if (!r.ok) { const e = await r.json(); throw new Error(e.detail || 'Error al guardar'); }
        showToast(`Ledger guardado como ${filename}.blk`, 'success');
        fetchLedgerSaves();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function apiLoadLedger(filename, password) {
    try {
        const r = await fetch(`${API_BASE}/api/ledger/load`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, password })
        });
        if (!r.ok) { const e = await r.json(); throw new Error(e.detail || 'Error al cargar'); }
        const data = await r.json();
        appState.scopes['ledger'].nodes = data.nodes;
        appState.scopes['ledger'].difficulty = data.difficulty || appState.difficulty;
        showToast(`Ledger cargado desde ${filename}.blk`, 'success');
        renderActiveTab();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// ═══════════════════════════════════════
//      TAB SWITCHING & RENDER
// ═══════════════════════════════════════
async function renderActiveTab() {
    const activeSection = document.getElementById(appState.activeTab);
    if (!activeSection) return;

    document.getElementById('edu-text').innerHTML = eduTexts[appState.activeTab] || '';
    lucide.createIcons();

    if (appState.activeTab === 'chain-tab') {
        renderBlockchainTab();
    } else if (appState.activeTab === 'network-tab') {
        renderNetworkTab();
    } else if (appState.activeTab === 'ledger-tab') {
        renderTitleRegistryTab();
    }
}

function initTabs() {
    document.querySelectorAll('.nav-menu .nav-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const targetTab = e.currentTarget.getAttribute('data-tab');

            document.querySelectorAll('.nav-menu .nav-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');

            document.querySelectorAll('.tab-content').forEach(sect => sect.classList.remove('active'));
            document.getElementById(targetTab).classList.add('active');

            const titles = {
                'hash-tab': { title: 'Funci\u00f3n Hash (SHA-256)', desc: 'La piedra angular de la criptograf\u00eda y la integridad de datos.' },
                'block-tab': { title: 'El Bloque de Datos', desc: 'Comprendiendo c\u00f3mo se estructuran y sellan los registros de diplomas.' },
                'chain-tab': { title: 'Cadena de Bloques (Blockchain)', desc: 'C\u00f3mo el encadenamiento de hashes bloquea el historial en el pasado.' },
                'network-tab': { title: 'Ataques y Consenso de Red', desc: 'Prueba casos extremos hackeando los nodos y ejecutando consenso.' },
                'ledger-tab': { title: 'Bandeja de Firma y Verificaci\u00f3n', desc: 'Ciclo de vida del diploma: emisi\u00f3n, sellado y verificaci\u00f3n por empleadores.' }
            };

            document.getElementById('tab-title').innerText = titles[targetTab].title;
            document.getElementById('tab-description').innerText = titles[targetTab].desc;

            appState.activeTab = targetTab;

            // Fetch data for the scope this tab needs (if any)
            // fetchStatus already calls renderActiveTab on success, so only render here
            // for tabs with no scope (hash-tab, block-tab) or as fallback.
            const scope = scopeForTab(targetTab);
            if (scope) {
                await fetchStatus(scope);
            }

            if (targetTab === 'ledger-tab') {
                document.getElementById('title-id').value = generateTitleId();
            }

            if (!scope) renderActiveTab();
        });
    });
}

// ═══════════════════════════════════════
//            INITIALIZER
// ═══════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initHashSandbox();
    initBlockSandbox();
    fetchStatus('chain'); // initial load for first tab

    // --- Modal Event Listeners ---

    document.getElementById('modal-close-btn').addEventListener('click', closeBlockDetailModal);
    document.getElementById('block-modal-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeBlockDetailModal();
    });

    document.getElementById('tamper-close-btn').addEventListener('click', closeTamperModal);
    document.getElementById('tamper-modal-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeTamperModal();
    });

    document.getElementById('modal-tamper-btn').addEventListener('click', () => {
        if (currentModalBlock) {
            closeBlockDetailModal();
            openTamperModal(currentModalIndex, currentModalNodeId);
        }
    });

    document.getElementById('modal-mine-btn').addEventListener('click', async () => {
        if (currentModalBlock && currentModalNodeId) {
            const nodeId = currentModalNodeId;
            const idx = currentModalIndex;
            const scope = currentModalScope;
            const difficulty = appState.scopes[scope].difficulty || appState.difficulty;
            const nodes = appState.scopes[scope].nodes;
            const liveBlock = (nodes[nodeId] && nodes[nodeId].chain[idx]) || currentModalBlock;
            const block = liveBlock;
            const stepCb = document.getElementById('modal-step-cb');
            const stepMode = stepCb.checked;
            const target = '0'.repeat(difficulty);
            const prevHash = block.previous_hash;
            const serializedData = serializeBlockData(block.data);
            const nonceSpan = document.getElementById('modal-nonce');
            const hashSpan = document.getElementById('modal-current-hash');
            const badge = document.getElementById('modal-block-badge');
            const modalStrDisplay = document.getElementById('modal-block-string');

            if (stepMode) {
                const currentNonce = parseInt(nonceSpan.textContent.replace(/,/g, '')) || 0;
                const blockStr = `${block.index}${block.timestamp}${serializedData}${prevHash}${currentNonce}`;
                const hash = await calculateSHA256(blockStr);

                if (modalStrDisplay) modalStrDisplay.value = blockStr;
                hashSpan.innerHTML = formatHashDisplay(hash, difficulty);

                if (hash.startsWith(target)) {
                    badge.textContent = 'V\u00c1LIDO';
                    badge.className = 'badge success';
                    showToast(`\u00a1Nonce ${currentNonce} es v\u00e1lido!`, 'success');
                    closeBlockDetailModal();
                    await apiMineBlockIndex(nodeId, block.index, scope);
                } else {
                    badge.textContent = `Nonce ${currentNonce} \u2192 FALL\u00d3`;
                    badge.className = 'badge danger';
                    nonceSpan.textContent = (currentNonce + 1).toLocaleString();
                    showToast(`Nonce ${currentNonce} no cumple. Probando ${currentNonce + 1}...`, 'warning');
                }
            } else {
                closeBlockDetailModal();
                showToast(`Reminando Bloque #${idx}...`, 'info');
                appState.isMining = true;

                let localNonce = 0;
                let hash = "";
                while (true) {
                    const blockStr = `${block.index}${block.timestamp}${serializedData}${prevHash}${localNonce}`;
                    hash = await calculateSHA256(blockStr);
                    if (hash.startsWith(target)) break;
                    localNonce++;
                    if (localNonce % 10 === 0) {
                        await new Promise(r => setTimeout(r, 0));
                    }
                }

                showToast(`\u00a1Minado! Nonce: ${localNonce} (${localNonce + 1} intentos)`, 'success');
                appState.isMining = false;
                await apiMineBlockIndex(nodeId, block.index, scope);
            }
        }
    });

    document.getElementById('tamper-confirm-btn').addEventListener('click', async () => {
        const data = document.getElementById('tamper-data-input').value.trim();
        const nodeId = document.getElementById('tamper-node-select').value;
        const title = document.getElementById('tamper-modal-title').textContent;
        const blockIndex = parseInt(title.replace('Alterar Bloque #', ''));

        if (!data) {
            showToast('Escribe los datos falsificados antes de inyectar.', 'warning');
            return;
        }

        closeTamperModal();
        const scope = currentModalScope || 'chain';
        await apiTamperBlock(nodeId, blockIndex, data, scope);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeBlockDetailModal();
            closeTamperModal();
        }
    });

    // --- Settings ---
    document.getElementById('difficulty-select').addEventListener('change', async (e) => {
        const newDiff = parseInt(e.target.value);
        if (appState.isMining) {
            showToast('No puedes cambiar la dificultad mientras hay un bloque minándose.', 'warning');
            e.target.value = appState.difficulty;
            return;
        }
        const prevDiff = appState.difficulty;
        try {
            const response = await fetch(`${API_BASE}/api/difficulty`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ difficulty: newDiff })
            });
            if (!response.ok) throw new Error('Error');
            const data = await response.json();
            appState.difficulty = data.difficulty;
            // data.nodes is chain-scope nodes only — only update chain scope nodes here.
            // attack and ledger just get the new difficulty; their nodes are refreshed on next fetchStatus.
            appState.scopes['chain'].difficulty = data.difficulty;
            appState.scopes['chain'].nodes = data.nodes;
            appState.scopes['attack'].difficulty = data.difficulty;
            appState.scopes['ledger'].difficulty = data.difficulty;
            if (newDiff > prevDiff) {
                showToast(`Dificultad aumentada a ${newDiff}. Los bloques existentes quedar\u00e1n INV\u00c1LIDOS y deber\u00e1n reminarse.`, 'warning');
            } else {
                showToast(`Dificultad cambiada a ${newDiff}.`, 'info');
            }
            renderActiveTab();
        } catch (error) {
            console.error(error);
            showToast('Error al actualizar la dificultad', 'error');
        }
    });

    // --- Reset ---
    document.getElementById('reset-btn').addEventListener('click', async () => {
        const scope = scopeForTab(appState.activeTab);
        if (!scope) {
            if (confirm('\u00bfRestablecer la simulaci\u00f3n?')) {
                showToast('No hay datos de red en esta pesta\u00f1a.', 'info');
            }
            return;
        }
        if (confirm(`\u00bfRestablecer la simulaci\u00f3n "${scope}"? Se borrar\u00e1n todos los t\u00edtulos registrados.`)) {
            try {
                const response = await fetch(`${API_BASE}/api/${scope}/reset`, { method: 'POST' });
                if (!response.ok) throw new Error('Error');
                const data = await response.json();
                appState.scopes[scope].nodes = data.nodes;
                appState.scopes[scope].difficulty = data.difficulty || appState.difficulty;
                showToast(`Simulaci\u00f3n "${scope}" restablecida al estado original.`, 'info');
                renderActiveTab();
            } catch (error) {
                console.error(error);
                showToast('Error al reiniciar', 'error');
            }
        }
    });

    // --- Consensus ---
    document.getElementById('consensus-btn').addEventListener('click', async () => {
        const btn = document.getElementById('consensus-btn');
        btn.disabled = true;

        try {
            const response = await fetch(`${API_BASE}/api/attack/consensus`, { method: 'POST' });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || 'Consenso fallido');
            }
            const result = await response.json();
            appState.scopes['attack'].nodes = result.nodes;

            const synced = result.synced_nodes;
            if (synced.length === 0) {
                showToast('Todos los nodos concuerdan plenamente. Ning\u00fan nodo requer\u00eda correcci\u00f3n.', 'info');
            } else {
                showToast(`\u00a1Consenso logrado! Se sincronizaron: ${synced.map(n => displayNodeName(n)).join(', ')}`, 'success');
            }
            renderActiveTab();
        } catch (error) {
            console.error(error);
            showToast(error.message, 'error');
        } finally {
            btn.disabled = false;
        }
    });

    // --- Title Form ---
    document.getElementById('title-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const student = document.getElementById('title-student').value.trim();
        const degree = document.getElementById('title-degree').value.trim();
        const university = document.getElementById('title-university').value;
        const date = document.getElementById('title-date').value.trim();
        const titleId = document.getElementById('title-id').value;

        try {
            const response = await fetch(`${API_BASE}/api/ledger/titles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    student, degree, university, date,
                    title_id: titleId,
                    node_id: 'Peer_A',
                    broadcast: true
                })
            });
            if (!response.ok) throw new Error('Error');
            const data = await response.json();
            appState.scopes['ledger'].nodes = data.nodes;
            showToast(`T\u00edtulo enviado a bandeja (${titleId} \u2014 ${student})`, 'success');

            document.getElementById('title-student').value = '';
            document.getElementById('title-degree').value = '';
            document.getElementById('title-id').value = generateTitleId();

            renderActiveTab();
        } catch (error) {
            console.error(error);
            showToast('Error al registrar el t\u00edtulo', 'error');
        }
    });

    // --- Mine Mempool ---
    document.getElementById('mine-transactions-btn').addEventListener('click', async () => {
        const selectedNode = document.getElementById('mine-node-select').value;
        const selectedNodeData = appState.scopes['ledger'].nodes[selectedNode];
        if (!selectedNodeData || selectedNodeData.mempool.length === 0) {
            showToast(`La bandeja de ${displayNodeName(selectedNode)} está vacía. Registra títulos antes de minar.`, 'warning');
            return;
        }
        const btn = document.getElementById('mine-transactions-btn');
        btn.disabled = true;

        const icon = btn.querySelector('.lucide') || btn.querySelector('svg') || btn.querySelector('i');
        if (icon) icon.classList.add('icon-spin');

        try {
            await apiMineBlock(selectedNode, null, 'ledger');
        } finally {
            btn.disabled = false;
            if (icon) icon.classList.remove('icon-spin');
        }
    });

    // --- Ledger persistence ---
    document.getElementById('ledger-save-btn').addEventListener('click', async () => {
        const filename = document.getElementById('ledger-filename').value.trim();
        const password = document.getElementById('ledger-password').value;
        if (!filename) { showToast('Ingresa un nombre para el archivo.', 'warning'); return; }
        if (!password) { showToast('Ingresa una contraseña para cifrar.', 'warning'); return; }
        await apiSaveLedger(filename, password);
    });
    document.getElementById('ledger-load-btn').addEventListener('click', async () => {
        const sel = document.getElementById('ledger-saves-list');
        const filename = sel.value;
        const password = document.getElementById('ledger-password').value;
        if (!filename) { showToast('Selecciona un archivo de la lista.', 'warning'); return; }
        if (!password) { showToast('Ingresa la contraseña del archivo.', 'warning'); return; }
        await apiLoadLedger(filename, password);
    });
    document.getElementById('ledger-saves-list').addEventListener('change', () => {
        // Auto-fill filename when selecting from list
        const sel = document.getElementById('ledger-saves-list');
        if (sel.value) {
            document.getElementById('ledger-filename').value = sel.value;
        }
    });

    // --- Verification Search (live) ---
    document.getElementById('search-input').addEventListener('input', triggerVerificationSearch);

    // ═══════════════════════════════════════
    //      ATTACK LAB EVENT HANDLERS
    // ═══════════════════════════════════════

    // Attack 1: Simple Tampering
    document.getElementById('attack-tamper-btn').addEventListener('click', async () => {
        const fakeTitleText = "ID: TIT-FALSO | Hacker Malicioso | T\u00edtulo Falsificado (Univ. Hackeada)";
        await apiTamperBlock('Peer_B', 2, fakeTitleText, 'attack');
    });

    // Attack 2: Local Re-mining
    document.getElementById('attack-remine-btn').addEventListener('click', async () => {
        const btn = document.getElementById('attack-remine-btn');
        btn.disabled = true;
        showToast('Ejecutando reminado local malicioso en Nodo B...', 'info');

        try {
            const fakeTitleText = "ID: TIT-FALSO | Hacker Malicioso | T\u00edtulo Falsificado (Univ. Hackeada)";
            const tamperRes = await fetch(`${API_BASE}/api/attack/nodes/Peer_B/tamper`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ block_index: 2, new_data: fakeTitleText })
            });
            if (!tamperRes.ok) throw new Error('Tamper fallido en Nodo B');
            const tamperData = await tamperRes.json();
            appState.scopes['attack'].nodes = tamperData.nodes;

            // Reminar TODOS los bloques desde index 2 hasta el final de la cadena
            const chainLen = tamperData.nodes?.['Peer_B']?.chain?.length ?? 5;
            for (let blockIdx = 2; blockIdx < chainLen; blockIdx++) {
                const mineRes = await fetch(`${API_BASE}/api/attack/nodes/Peer_B/mine_block_index`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ block_index: blockIdx })
                });
                if (!mineRes.ok) throw new Error(`Reminado fallido en bloque ${blockIdx}`);
            }

            await fetchStatus('attack');
            showToast('Ataque 2 completo. Nodo B es V\u00c1LIDO localmente, pero sus hashes difieren de la red.', 'success');
        } catch (error) {
            console.error(error);
            showToast('Error al simular reminado local', 'error');
        } finally {
            btn.disabled = false;
        }
    });

    // Attack 3: 51% Attack
    document.getElementById('attack-51-btn').addEventListener('click', async () => {
        const btn = document.getElementById('attack-51-btn');
        btn.disabled = true;
        showToast('Ejecutando Ataque del 51% (forzando mentira en Nodo B y Nodo C)...', 'warning');

        try {
            const response = await fetch(`${API_BASE}/api/attack/attacks/51percent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    block_index: 2,
                    forged_student: "Hacker Profesional",
                    forged_degree: "Dr. en Ingenier\u00eda Social",
                    forged_id: "TIT-FALSO"
                })
            });
            if (!response.ok) throw new Error('Ataque fallido');
            const data = await response.json();
            appState.scopes['attack'].nodes = data.nodes;

            showToast('\u00a1Ataque del 51% exitoso! Nodo B y Nodo C ahora sostienen el t\u00edtulo falso.', 'danger');
            renderActiveTab();
        } catch (error) {
            console.error(error);
            showToast('Error al ejecutar el ataque del 51%', 'error');
        } finally {
            btn.disabled = false;
        }
    });

    // --- Dynamic node management selector trigger ---
    document.getElementById('chain-node-select').addEventListener('change', () => {
        renderBlockchainTab();
    });
    const ledgerNodeSelect = document.getElementById('ledger-node-select');
    if (ledgerNodeSelect) {
        ledgerNodeSelect.addEventListener('change', () => {
            renderChainBlocks('ledger-blockchain-list', 'ledger-node-select', 'ledger', 'ledger-block');
            triggerVerificationSearch();
        });
    }

    const mineNodeSelect = document.getElementById('mine-node-select');
    if (mineNodeSelect) {
        mineNodeSelect.addEventListener('change', () => {
            if (appState.activeTab === 'ledger-tab') renderTitleRegistryTab();
        });
    }

    // --- Manual block modal triggers ---
    document.getElementById('add-manual-block-btn').addEventListener('click', () => {
        const selectedNode = document.getElementById('chain-node-select').value || 'Peer_A';
        document.getElementById('manual-block-node-select').value = selectedNode;
        document.getElementById('manual-block-data').value = '';
        document.getElementById('manual-block-modal-overlay').classList.add('active');
    });

    document.getElementById('manual-block-close-btn').addEventListener('click', () => {
        document.getElementById('manual-block-modal-overlay').classList.remove('active');
    });

    document.getElementById('manual-block-confirm-btn').addEventListener('click', async () => {
        const data = document.getElementById('manual-block-data').value.trim();
        const nodeId = document.getElementById('manual-block-node-select').value;
        const mine = document.getElementById('manual-block-mine-checkbox').checked;

        if (!data) {
            showToast('Escribe datos para el bloque.', 'warning');
            return;
        }

        document.getElementById('manual-block-modal-overlay').classList.remove('active');
        await apiCreateBlockManual(nodeId, data, mine, 'chain');
    });

    // --- Block deletion trigger ---
    document.getElementById('modal-delete-btn').addEventListener('click', async () => {
        if (currentModalBlock && currentModalNodeId) {
            const idx = currentModalIndex;
            const nodeId = currentModalNodeId;
            const scope = currentModalScope;
            if (idx === 0) {
                showToast('No se puede eliminar el bloque g\u00e9nesis.', 'warning');
                return;
            }
            if (confirm(`\u00bfSeguro que deseas eliminar el Bloque #${idx} de la cadena de ${displayNodeName(nodeId)}? Esto romper\u00e1 toda la cadena subsiguiente.`)) {
                closeBlockDetailModal();
                await apiDeleteBlock(nodeId, idx, scope);
            }
        }
    });

    // --- Add dynamic node trigger (attack tab) ---
    document.getElementById('add-node-btn').addEventListener('click', async () => {
        const nameInput = document.getElementById('new-node-name');
        const nodeName = nameInput.value.trim();
        if (!nodeName) {
            showToast('Ingresa un nombre para el nodo.', 'warning');
            return;
        }
        const cleanName = nodeName.replace(/\s+/g, '_');
        const parentId = document.getElementById('new-node-parent').value;
        nameInput.value = '';
        await apiAddNode(cleanName, parentId, 'attack');
    });

    // --- Add dynamic node trigger (chain tab) ---
    const chainAddBtn = document.getElementById('chain-add-node-btn');
    if (chainAddBtn) {
        chainAddBtn.addEventListener('click', async () => {
            const nameInput = document.getElementById('chain-new-node-name');
            const nodeName = nameInput.value.trim();
            if (!nodeName) {
                showToast('Ingresa un nombre para el nodo.', 'warning');
                return;
            }
            const cleanName = nodeName.replace(/\s+/g, '_');
            nameInput.value = '';
            await apiAddNode(cleanName, null, 'chain');
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.getElementById('manual-block-modal-overlay').classList.remove('active');
        }
    });

    // Refresh periodically (only active scope)
    setInterval(() => {
        const scope = scopeForTab(appState.activeTab);
        if (scope) {
            fetchStatus(scope);
        }
    }, 6000);
});
