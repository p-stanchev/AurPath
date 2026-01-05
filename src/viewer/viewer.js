const sigInput = document.getElementById('sigInput');
const rpcInput = document.getElementById('rpcInput');
const traceButton = document.getElementById('traceButton');
const statusText = document.getElementById('statusText');
const classification = document.getElementById('classification');
const confidence = document.getElementById('confidence');
const schemaVersion = document.getElementById('schemaVersion');
const negativeProofs = document.getElementById('negativeProofs');
const phaseGraph = document.getElementById('phaseGraph');
const perRpcTable = document.getElementById('perRpcTable');
const jsonOutput = document.getElementById('jsonOutput');
const copyJson = document.getElementById('copyJson');

let lastJson = '';

traceButton.addEventListener('click', async () => {
  const sig = sigInput.value.trim();
  if (!sig) {
    statusText.textContent = 'Enter a signature to trace.';
    return;
  }

  statusText.textContent = 'Tracing...';
  try {
    const url = buildTraceUrl(sig, rpcInput.value.trim());
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Trace failed: ${response.status}`);
    }
    const data = await response.json();
    renderTrace(data);
    statusText.textContent = 'Trace complete.';
  } catch (error) {
    statusText.textContent = error instanceof Error ? error.message : 'Trace failed.';
  }
});

copyJson.addEventListener('click', async () => {
  if (!lastJson) {
    return;
  }
  try {
    await navigator.clipboard.writeText(lastJson);
    copyJson.textContent = 'Copied';
    setTimeout(() => {
      copyJson.textContent = 'Copy JSON';
    }, 1000);
  } catch {
    copyJson.textContent = 'Copy failed';
  }
});

function buildTraceUrl(sig, rpcText) {
  const url = new URL('/trace', window.location.origin);
  url.searchParams.set('sig', sig);
  if (rpcText) {
    url.searchParams.set('rpc', rpcText);
  }
  return url.toString();
}

function renderTrace(data) {
  classification.textContent = data.classification ?? '-';
  confidence.textContent = data.confidence != null ? data.confidence : '-';
  schemaVersion.textContent = data.schema_version ?? '-';

  negativeProofs.innerHTML = '';
  (data.negative_proofs ?? []).forEach((proof) => {
    const li = document.createElement('li');
    li.textContent = proof;
    negativeProofs.appendChild(li);
  });

  renderPhaseGraph(data.phase_graph ?? []);
  renderPerRpc(data.evidence?.perRpc ?? []);

  lastJson = JSON.stringify(data, null, 2);
  jsonOutput.textContent = lastJson;
}

function renderPhaseGraph(edges) {
  phaseGraph.innerHTML = '';
  if (!edges.length) {
    return;
  }

  const phases = [];
  edges.forEach((edge) => {
    if (!phases.includes(edge.from)) {
      phases.push(edge.from);
    }
    if (!phases.includes(edge.to)) {
      phases.push(edge.to);
    }
  });

  const width = 800;
  const height = 140;
  const padding = 40;
  const step = (width - padding * 2) / Math.max(phases.length - 1, 1);

  phases.forEach((phase, index) => {
    const x = padding + index * step;
    const y = 40;
    phaseGraph.appendChild(svgCircle(x, y, 14, '#0f172a'));
    phaseGraph.appendChild(svgText(x, y - 20, phase, '#334155'));
  });

  edges.forEach((edge) => {
    const fromIndex = phases.indexOf(edge.from);
    const toIndex = phases.indexOf(edge.to);
    if (fromIndex === -1 || toIndex === -1) {
      return;
    }
    const x1 = padding + fromIndex * step;
    const x2 = padding + toIndex * step;
    const y = 40;
    phaseGraph.appendChild(svgLine(x1 + 14, y, x2 - 14, y));
    const mid = (x1 + x2) / 2;
    const label = `t=${edge.timestampMs}ms · c=${edge.confidence} · ${edge.source}`;
    phaseGraph.appendChild(svgText(mid, 80, label, '#475569', '10px'));
  });
}

function renderPerRpc(rows) {
  perRpcTable.innerHTML = '';
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    if (row.rpcError) {
      tr.className = 'bg-red-50 text-red-700';
    }

    tr.appendChild(cell(row.rpcUrl ?? '-'));
    tr.appendChild(cell(row.rpcError ?? row.confirmationStatus ?? '-'));
    tr.appendChild(cell(row.slot ?? '-'));
    perRpcTable.appendChild(tr);
  });
}

function cell(value) {
  const td = document.createElement('td');
  td.className = 'px-2 py-2';
  td.textContent = String(value);
  return td;
}

function svgCircle(cx, cy, r, fill) {
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', cx);
  circle.setAttribute('cy', cy);
  circle.setAttribute('r', r);
  circle.setAttribute('fill', fill);
  return circle;
}

function svgText(x, y, text, fill, size = '12px') {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  node.setAttribute('x', x);
  node.setAttribute('y', y);
  node.setAttribute('fill', fill);
  node.setAttribute('text-anchor', 'middle');
  node.setAttribute('font-size', size);
  node.textContent = text;
  return node;
}

function svgLine(x1, y1, x2, y2) {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  line.setAttribute('stroke', '#0f172a');
  line.setAttribute('stroke-width', '2');
  return line;
}
