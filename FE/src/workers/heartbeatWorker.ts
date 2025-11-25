// Web Worker: heartbeatWorker.ts
// Receives messages: { type: 'start', intervalMs, apiBase, token, equipmentId }
// Fallback messages: { type: 'pulse' } force one heartbeat; { type: 'stop' } terminate interval.

let intervalId: number | null = null;
let consecutiveFailures = 0;
let currentConfig: {
  apiBase: string;
  token: string;
  equipmentId: number;
  intervalMs: number;
} | null = null;

async function sendHeartbeat() {
  if (!currentConfig) return;
  const { apiBase, token, equipmentId } = currentConfig;
  try {
    const res = await fetch(`${apiBase}/api/workouts/heartbeat/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ equipment_id: equipmentId }),
    });
    if (!res.ok) {
      consecutiveFailures += 1;
      (self as any).postMessage({ type: 'failure', consecutiveFailures });
    } else {
      consecutiveFailures = 0;
      (self as any).postMessage({ type: 'ok' });
    }
  } catch (e: any) {
    consecutiveFailures += 1;
    (self as any).postMessage({ type: 'failure', consecutiveFailures, message: e?.message });
  }
}

function start(config: any) {
  currentConfig = config;
  if (intervalId) clearInterval(intervalId);
  // immediate first
  sendHeartbeat();
  intervalId = setInterval(sendHeartbeat, config.intervalMs) as unknown as number;
}

function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  currentConfig = null;
}

(self as any).onmessage = (e: MessageEvent) => {
  const data = e.data;
  switch (data?.type) {
    case 'start':
      start({
        apiBase: data.apiBase,
        token: data.token,
        equipmentId: data.equipmentId,
        intervalMs: data.intervalMs || 20000,
      });
      break;
    case 'pulse':
      sendHeartbeat();
      break;
    case 'stop':
      stop();
      break;
    default:
      (self as any).postMessage({ type: 'error', message: 'Unknown message type' });
  }
};
