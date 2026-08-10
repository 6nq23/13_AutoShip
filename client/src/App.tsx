import { useCallback, useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { AlertTriangle, Box, Camera, Check, ChevronRight, CircleUserRound, Clock3, Database, Download, History, Keyboard, LoaderCircle, LogOut, PackageCheck, Plus, RefreshCw, ScanLine, Settings, ShieldCheck, Trash2, Truck } from "lucide-react";
import { api, clearToken, getToken, HistoryItem, normalizeOrder, setToken, ShipResult, ShippingJob, ShippingLog, User } from "./api";

type Tab = "scan" | "history" | "settings";

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    if (!getToken()) return setLoading(false);
    api.me().then(({ user: next, demoMode: demo }) => { setUser(next); setDemoMode(demo); }).catch(clearToken).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="center-page"><LoaderCircle className="spin" /><span>Loading your workspace…</span></div>;
  if (!user) return <Login onLogin={(next, demo) => { setUser(next); setDemoMode(demo); }} />;
  return <Workspace user={user} demoMode={demoMode} onLogout={() => { clearToken(); setUser(null); }} />;
}

function Login({ onLogin }: { onLogin: (user: User, demoMode: boolean) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    if (mode === "register" && password !== confirmPassword) { setError("Passwords do not match."); setBusy(false); return; }
    try { const result = mode === "register" ? await api.register(username, password) : await api.login(username, password); setToken(result.token); onLogin(result.user, result.demoMode); }
    catch (cause) { setError(cause instanceof Error ? cause.message : mode === "register" ? "Account creation failed" : "Login failed"); }
    finally { setBusy(false); }
  }

  function switchMode(nextMode: "login" | "register") {
    setMode(nextMode); setUsername(nextMode === "login" ? "admin" : ""); setPassword(nextMode === "login" ? "admin123" : ""); setConfirmPassword(""); setError("");
  }

  return <main className="login-page">
    <section className="login-copy">
      <div className="brand-mark"><Truck size={23} /> AutoShip</div>
      <p className="eyebrow">NimbusPost shipping workspace</p>
      <h1>From packed<br />to shipped in <em>one scan.</em></h1>
      <p className="lede">Scan order labels, book the best available courier, and print every shipping label in one clean batch.</p>
      <div className="login-proof"><span><Check /> No repetitive data entry</span><span><Check /> Automatic courier allocation</span><span><Check /> One merged label PDF</span></div>
    </section>
    <section className="login-panel">
      <form onSubmit={submit} className="card login-card">
        <div className="mobile-brand"><Truck size={21} /> AutoShip</div>
        <p className="eyebrow">{mode === "login" ? "Welcome back" : "Join the team"}</p><h2>{mode === "login" ? "Sign in to ship" : "Create your account"}</h2><p className="muted">{mode === "login" ? "Use your team account to continue." : "Create a non-admin account for scanning and shipping orders."}</p>
        <label>Username<input autoComplete="username" minLength={3} maxLength={32} pattern="[A-Za-z0-9._-]+" title="Use letters, numbers, dots, dashes, or underscores" value={username} onChange={(e) => setUsername(e.target.value)} required /></label>
        <label>Password<input type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={mode === "register" ? 15 : undefined} maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {mode === "register" && <><p className="password-hint">Use at least 15 characters. Spaces and passphrases are welcome.</p><label>Confirm password<input type="password" autoComplete="new-password" minLength={15} maxLength={72} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></label><p className="role-note"><ShieldCheck /> Your account will be a team-member account, not an admin.</p></>}
        {error && <div className="alert error" role="alert"><AlertTriangle />{error}</div>}
        <button className="button primary wide" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <>{mode === "login" ? "Sign in" : "Create account"} <ChevronRight /></>}</button>
        <div className="auth-switch"><span>{mode === "login" ? "Need a team account?" : "Already have an account?"}</span><button type="button" onClick={() => switchMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Create account" : "Sign in"}</button></div>
        {mode === "login" && <p className="demo-note"><ShieldCheck /> Demo login is pre-filled. Add NimbusPost credentials to ship live.</p>}
      </form>
    </section>
  </main>;
}

function Workspace({ user, demoMode, onLogout }: { user: User; demoMode: boolean; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("scan");
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-mark"><Truck size={22} /> AutoShip</div>
      <nav aria-label="Main navigation">
        <NavButton active={tab === "scan"} onClick={() => setTab("scan")} icon={<ScanLine />}>Ship orders</NavButton>
        <NavButton active={tab === "history"} onClick={() => setTab("history")} icon={<History />}>History</NavButton>
        {user.role === "admin" && <NavButton active={tab === "settings"} onClick={() => setTab("settings")} icon={<Settings />}>Settings</NavButton>}
      </nav>
      <div className="profile"><div className="avatar">{user.username.slice(0, 2).toUpperCase()}</div><div><strong>{user.username}</strong><small>{user.role}</small></div><button aria-label="Sign out" onClick={onLogout}><LogOut /></button></div>
    </aside>
    <header className="mobile-header"><div className="brand-mark"><Truck size={20} /> AutoShip</div><button onClick={onLogout} aria-label="Sign out"><LogOut /></button></header>
    {demoMode && <div className="demo-banner"><span>Demo mode</span> Try RBD4023, RBD4030, RBD4035, and RBD4044</div>}
    <main className="workspace">{tab === "scan" ? <ShipWorkspace /> : tab === "history" ? <HistoryPage /> : <SettingsPage />}</main>
    <nav className="bottom-nav" aria-label="Mobile navigation">
      <NavButton active={tab === "scan"} onClick={() => setTab("scan")} icon={<ScanLine />}>Ship</NavButton>
      <NavButton active={tab === "history"} onClick={() => setTab("history")} icon={<History />}>History</NavButton>
      {user.role === "admin" && <NavButton active={tab === "settings"} onClick={() => setTab("settings")} icon={<Settings />}>Settings</NavButton>}
    </nav>
  </div>;
}

function NavButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return <button className={active ? "nav-button active" : "nav-button"} onClick={onClick}>{icon}<span>{children}</span></button>;
}

function ShipWorkspace() {
  const [orders, setOrders] = useState<string[]>(() => (JSON.parse(localStorage.getItem("autoship_orders") || "[]") as unknown[]).map((value) => typeof value === "string" ? normalizeOrder(value) : null).filter((value): value is string => Boolean(value)));
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [job, setJob] = useState<ShippingJob | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const shipping = job?.status === "queued" || job?.status === "processing";

  useEffect(() => localStorage.setItem("autoship_orders", JSON.stringify(orders)), [orders]);
  useEffect(() => {
    let cancelled = false;
    const recover = async () => {
      const savedJobId = localStorage.getItem("autoship_shipping_job"); let recovered: ShippingJob | null = null;
      if (savedJobId) recovered = await api.shippingJob(savedJobId).then(({ job: saved }) => saved).catch(() => null);
      if (!recovered) recovered = await api.activeShippingJob().then(({ job: active }) => active).catch(() => null);
      if (!cancelled && recovered) { setJob(recovered); localStorage.setItem("autoship_shipping_job", recovered.jobId); if (recovered.status === "completed") setOrders(recovered.failed.map((item) => item.orderNumber)); }
    };
    recover(); return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!job || !["queued", "processing"].includes(job.status)) return;
    let cancelled = false; let timer = 0;
    const poll = async () => {
      try {
        const { job: next } = await api.shippingJob(job.jobId); if (cancelled) return; setJob(next);
        if (next.status === "completed") { setOrders(next.failed.map((item) => item.orderNumber)); setNotice({ kind: next.failed.length ? "error" : "ok", text: `Batch complete: ${next.shipped.length} shipped, ${next.failed.length} failed.` }); return; }
        if (next.status === "failed") { setNotice({ kind: "error", text: next.error || "The shipment stopped because of a server error." }); return; }
      } catch (cause) { if (!cancelled) setNotice({ kind: "error", text: cause instanceof Error ? `Progress check failed: ${cause.message}` : "Could not check shipment progress." }); }
      if (!cancelled) timer = window.setTimeout(poll, document.hidden ? 2500 : 1000);
    };
    timer = window.setTimeout(poll, 500); return () => { cancelled = true; window.clearTimeout(timer); };
  }, [job?.jobId, job?.status]);
  const add = useCallback((value: string) => {
    if (shipping) return setNotice({ kind: "error", text: "A shipment is running. Wait for it to finish before changing this batch." });
    const normalized = normalizeOrder(value);
    if (!normalized) return setNotice({ kind: "error", text: "That isn’t a valid RBD order number." });
    if (orders.includes(normalized)) return setNotice({ kind: "error", text: `${normalized} is already in this batch.` });
    if (job && ["completed", "failed"].includes(job.status)) { setJob(null); localStorage.removeItem("autoship_shipping_job"); }
    setOrders((current) => [normalized, ...current]); setInput(""); setNotice({ kind: "ok", text: `${normalized} added to the batch.` });
    navigator.vibrate?.(50);
  }, [job, orders, shipping]);

  async function ship(list = orders) {
    if (!list.length || shipping) return; setNotice(null);
    try { const { job: next } = await api.startShipping(list); setJob(next); localStorage.setItem("autoship_shipping_job", next.jobId); }
    catch (cause) { const active = await api.activeShippingJob().then(({ job: current }) => current).catch(() => null); if (active) { setJob(active); localStorage.setItem("autoship_shipping_job", active.jobId); } else setNotice({ kind: "error", text: cause instanceof Error ? cause.message : "Shipping failed" }); }
  }

  return <>
    <div className="page-heading"><div><p className="eyebrow">Fast fulfilment</p><h1>Ship a batch</h1><p>Scan QR labels or enter order numbers manually.</p></div><div className="batch-count"><strong>{orders.length}</strong><span>orders ready</span></div></div>
    <div className="ship-grid">
      <section className="card capture-card">
        <div className="section-title"><div className="step">1</div><div><h2>Add orders</h2><p>QR codes should contain an RBD order number.</p></div></div>
        <button className="scanner-target" disabled={shipping} onClick={() => setCameraOpen(true)}><span className="scan-corners"><ScanLine /></span><strong>Open camera scanner</strong><small>{shipping ? "Batch changes are locked while shipping" : "Point your phone at an order QR code"}</small></button>
        <div className="or"><span>or enter manually</span></div>
        <form className="manual-row" onSubmit={(e) => { e.preventDefault(); add(`#RBD${input}`); }}><Keyboard /><div className="manual-input"><span aria-hidden="true">#RBD</span><input aria-label="Order number digits" inputMode="numeric" pattern="[0-9]*" autoComplete="off" placeholder="4023" value={input} disabled={shipping} onChange={(e) => setInput(e.target.value.replace(/\D/g, ""))} /></div><button className="button secondary" disabled={shipping}><Plus /> Add</button></form>
        {notice && <div className={`alert ${notice.kind}`} role="status">{notice.kind === "ok" ? <Check /> : <AlertTriangle />}{notice.text}</div>}
      </section>
      <section className="card batch-card">
        <div className="section-title"><div className="step">2</div><div><h2>Review & ship</h2><p>AutoShip selects your top serviceable courier.</p></div></div>
        {orders.length ? <div className="order-list">{orders.map((order, index) => <div className="order-row" key={order}><span className="order-index">{String(index + 1).padStart(2, "0")}</span><Box /><strong>{order}</strong><button disabled={shipping} aria-label={`Remove ${order}`} onClick={() => setOrders((current) => current.filter((item) => item !== order))}><Trash2 /></button></div>)}</div> : <div className="empty-state"><PackageCheck /><strong>No orders yet</strong><span>Your scanned orders will appear here.</span></div>}
        <button className="button ship-button" disabled={!orders.length || shipping} onClick={() => ship()}>{shipping ? <><LoaderCircle className="spin" /> {job && job.total > 1 ? "Bulk processing" : "Processing"} {job?.processed || 0}/{job?.total || orders.length}…</> : <><Truck /> {orders.length > 1 ? `Bulk ship ${orders.length} orders` : orders.length === 1 ? "Ship 1 order" : "Ship orders"}</>}</button>
      </section>
    </div>
    {job && <JobProgress job={job} />}
    {job?.result && <Results result={job.result} logs={job.logs} onRetry={() => ship(job.result!.failed.map((item) => item.orderNumber))} />}
    {cameraOpen && <CameraScanner onClose={() => setCameraOpen(false)} onScan={(value) => { add(value); setCameraOpen(false); }} />}
  </>;
}

function CameraScanner({ onScan, onClose }: { onScan: (value: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [activeDeviceId, setActiveDeviceId] = useState("");
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let controls: IScannerControls | undefined; let stream: MediaStream | undefined; let cancelled = false;
    const preview = video.current;
    if (!preview || !navigator.mediaDevices?.getUserMedia) { setError("Camera access is not available here. Open AutoShip over HTTPS or use manual entry."); return; }
    const start = async () => {
      setStarting(true); setError("");
      const knownCameras = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput");
      const preferredCamera = selectedDeviceId
        ? knownCameras.find((device) => device.deviceId === selectedDeviceId)
        : knownCameras.find((device) => /back|rear|environment/i.test(device.label)) || knownCameras.find((device) => device.label && !/infrared|\bir\b|depth|virtual/i.test(device.label));
      const requestedDeviceId = selectedDeviceId || preferredCamera?.deviceId || "";
      stream = await navigator.mediaDevices.getUserMedia({ video: requestedDeviceId ? { deviceId: { exact: requestedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
      preview.srcObject = stream; preview.muted = true; preview.playsInline = true; preview.autoplay = true;
      await preview.play();
      await new Promise<void>((resolve, reject) => {
        if (preview.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && preview.videoWidth > 0) return resolve();
        const timeout = window.setTimeout(() => { cleanup(); reject(new Error("NO_VIDEO_FRAMES")); }, 8_000);
        const ready = () => { if (preview.videoWidth > 0) { cleanup(); resolve(); } };
        const cleanup = () => { window.clearTimeout(timeout); preview.removeEventListener("loadeddata", ready); preview.removeEventListener("playing", ready); };
        preview.addEventListener("loadeddata", ready); preview.addEventListener("playing", ready);
      });
      if (cancelled) return;
      const cameraDevices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput");
      setDevices(cameraDevices); setActiveDeviceId(stream.getVideoTracks()[0]?.getSettings().deviceId || selectedDeviceId); setStarting(false);
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 200 });
      const nextControls = reader.scan(preview, (result) => {
        if (result && !cancelled) onScan(result.getText());
      }, () => stream?.getTracks().forEach((track) => track.stop()));
      if (cancelled) nextControls.stop(); else controls = nextControls;
    };
    start().catch((cause: unknown) => {
      const name = cause instanceof DOMException ? cause.name : "";
      if (name === "NotAllowedError") setError("Camera access was blocked. Allow camera permission in your browser, then open the scanner again.");
      else if (name === "NotFoundError") setError("No camera was found on this device. Connect a camera or use manual entry.");
      else if (cause instanceof Error && cause.message === "NO_VIDEO_FRAMES") setError("Camera permission was granted, but no video arrived. Choose another camera above or close other camera apps and retry.");
      else setError("The camera could not start. Close other camera apps and try again, or use manual entry.");
      setStarting(false);
    });
    return () => { cancelled = true; controls?.stop(); stream?.getTracks().forEach((track) => track.stop()); if (preview.srcObject) preview.srcObject = null; };
  }, [onScan, selectedDeviceId]);
  return <div className="modal" role="dialog" aria-modal="true" aria-label="QR camera scanner"><div className="camera-box"><div className="camera-top"><span><Camera /> Scan order QR</span><div>{devices.length > 1 && <select className="camera-select" aria-label="Camera" value={selectedDeviceId || activeDeviceId} onChange={(event) => setSelectedDeviceId(event.target.value)}>{devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select>}<button onClick={onClose}>Close</button></div></div><video ref={video} muted playsInline autoPlay />{starting && !error && <div className="camera-loading"><LoaderCircle className="spin" /> Starting camera…</div>}{error && <div className="alert error"><AlertTriangle />{error}</div>}<div className="camera-guide"><span /><small>Hold the QR code inside the frame</small></div></div></div>;
}

function downloadFile(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type })); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function downloadFailureReport(result: ShipResult) {
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rows = ["order_number,error_code,error", ...result.failed.map((item) => [item.orderNumber, item.code, item.error].map(quote).join(","))];
  downloadFile(`autoship-errors-${result.batchId}.csv`, rows.join("\n"), "text/csv;charset=utf-8");
}

function downloadLogs(logs: ShippingLog[], jobId: string) {
  const lines = logs.map((entry) => `${entry.at} [${entry.level.toUpperCase()}]${entry.orderNumber ? ` [${entry.orderNumber}]` : ""} ${entry.message}`);
  downloadFile(`autoship-log-${jobId}.txt`, lines.join("\n"), "text/plain;charset=utf-8");
}

function JobProgress({ job }: { job: ShippingJob }) {
  const running = job.status === "queued" || job.status === "processing"; const percent = job.total ? Math.round((job.processed / job.total) * 100) : 0; const bulk = job.total > 1;
  const activities = job.orderNumbers.map((orderNumber) => {
    const shipped = job.shipped.find((item) => item.orderNumber === orderNumber); const failed = job.failed.find((item) => item.orderNumber === orderNumber); const latest = [...job.logs].reverse().find((entry) => entry.orderNumber === orderNumber);
    if (shipped) return { orderNumber, state: "success", label: `Shipped with ${shipped.courier}`, icon: <Check /> };
    if (failed) return { orderNumber, state: "error", label: failed.error, icon: <AlertTriangle /> };
    if (latest) return { orderNumber, state: "active", label: latest.message, icon: <LoaderCircle className={running ? "spin" : ""} /> };
    return { orderNumber, state: "pending", label: "Waiting for a processing slot", icon: <Clock3 /> };
  });
  const heading = running ? `${bulk ? "Bulk shipment" : "Shipment"} in progress` : job.status === "completed" ? `${bulk ? "Bulk shipment" : "Shipment"} finished` : "Shipment stopped";
  const detail = running ? bulk ? `${job.total} orders submitted. Up to 5 orders process at the same time; courier priorities are tried one by one inside each order. You can switch tabs or refresh safely.` : "This is a single-order shipment. Add at least 2 orders before shipping to create a bulk batch. You can switch tabs or refresh safely." : `${job.shipped.length} shipped · ${job.failed.length} failed`;
  return <section className="card job-card" aria-live="polite"><div className="job-heading"><div><p className="eyebrow">Live shipment activity</p><h2>{heading}</h2><p>{detail}</p></div><button className="button secondary" onClick={() => downloadLogs(job.logs, job.jobId)}><Download /> Download logs</button></div><div className="job-progress"><progress max={job.total} value={job.processed} /><span>{job.processed} of {job.total} processed · {percent}%</span></div><div className="order-activity" aria-label="Per-order shipment status">{activities.map((activity) => <div className={`order-activity-row ${activity.state}`} key={activity.orderNumber}>{activity.icon}<strong>{activity.orderNumber}</strong><span>{activity.label}</span></div>)}</div>{job.error && <div className="alert error"><AlertTriangle />{job.error}</div>}<h3 className="log-title">Detailed activity log</h3><div className="job-logs" aria-label="Shipment logs">{job.logs.map((entry, index) => <div className={`job-log ${entry.level}`} key={`${entry.at}-${index}`}><time>{new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><span>{entry.orderNumber && <strong>{entry.orderNumber}</strong>}{entry.message}</span></div>)}</div></section>;
}

function Results({ result, logs, onRetry }: { result: ShipResult; logs: ShippingLog[]; onRetry: () => void }) {
  return <section className="results-section"><div className="page-heading compact"><div><p className="eyebrow">Batch result</p><h2>{result.totalFailed ? "Partially shipped" : "All done"}</h2></div><div className="result-actions">{result.labelUrl && <a className="button primary" href={result.labelUrl} target="_blank" rel="noreferrer"><Download /> Download labels</a>}{result.failed.length > 0 && <button className="button error-download" onClick={() => downloadFailureReport(result)}><Download /> Download errors</button>}<button className="button secondary" onClick={() => downloadLogs(logs, result.batchId)}><Download /> Download logs</button></div></div><div className="results-grid"><div className="card result-card success-card"><div className="result-title"><span><Check /></span><div><strong>{result.totalShipped} shipped</strong><small>Ready for labels</small></div></div>{result.shipped.map((item) => <div className="result-row" key={item.orderNumber}><div><strong>{item.orderNumber}</strong><small>{item.awb}</small></div><div><span>{item.courier}</span><small>₹{item.cost.toFixed(2)}{item.alreadyBooked ? " · already booked" : ""}</small></div></div>)}</div><div className="card result-card failure-card"><div className="result-title"><span><AlertTriangle /></span><div><strong>{result.totalFailed} need attention</strong><small>Fix and try again</small></div></div>{result.failed.length ? result.failed.map((item) => <div className="result-row" key={item.orderNumber}><div><strong>{item.orderNumber}</strong><small>{item.code}</small></div><span>{item.error}</span></div>) : <div className="mini-empty">No failures in this batch.</div>}{result.failed.length > 0 && <button className="button secondary wide" onClick={onRetry}><RefreshCw /> Retry failed</button>}</div></div></section>;
}

function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { api.history().then(({ batches }) => setItems(batches)).finally(() => setLoading(false)); }, []);
  return <><div className="page-heading"><div><p className="eyebrow">Operations</p><h1>Shipping history</h1><p>Every batch, label, and exception in one place.</p></div></div><section className="card history-card">{loading ? <div className="empty-state"><LoaderCircle className="spin" />Loading batches…</div> : items.length ? items.map((item) => <div className="history-row" key={item.batchId}><div className="history-icon"><PackageCheck /></div><div><strong>{new Date(item.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</strong><small><Clock3 /> {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · by {item.shippedBy}</small></div><div className="history-metrics"><span className="success-text">{item.totalShipped} shipped</span><span className={item.totalFailed ? "error-text" : "muted"}>{item.totalFailed} failed</span></div><div className="history-actions">{item.labelUrl && <a href={item.labelUrl} target="_blank" rel="noreferrer" aria-label="Download labels" title="Download labels"><Download /></a>}{item.failed.length > 0 && <button onClick={() => downloadFailureReport(item)} aria-label="Download errors" title="Download errors"><AlertTriangle /></button>}{item.logs?.length ? <button onClick={() => downloadLogs(item.logs!, item.batchId)} aria-label="Download logs" title="Download logs"><Clock3 /></button> : null}</div></div>) : <div className="empty-state"><History /><strong>No shipping history yet</strong><span>Your completed batches will appear here.</span></div>}</section></>;
}

function SettingsPage() {
  const [status, setStatus] = useState<{ connected: boolean; demoMode: boolean; apiUrl: string; database: string } | null>(null);
  useEffect(() => { api.status().then(setStatus); }, []);
  return <><div className="page-heading"><div><p className="eyebrow">Workspace</p><h1>Settings</h1><p>Connection and account readiness.</p></div></div><div className="settings-grid"><section className="card setting-card"><div className="setting-icon"><ShieldCheck /></div><div><h2>NimbusPost connection</h2><p>{status?.demoMode ? "Demo data is active. Add your API key pair to ship real orders." : status?.connected ? "Connected and ready for live shipping." : "Checking connection…"}</p><span className={`status-pill ${status?.connected ? "connected" : "demo"}`}>{status?.connected ? "Live" : "Demo mode"}</span></div></section><section className="card setting-card"><div className="setting-icon"><Database /></div><div><h2>Database</h2><p>Users, order lookups, and shipping batches are stored persistently in PostgreSQL.</p><span className="status-pill connected">{status?.database || "Checking…"}</span></div></section><section className="card setting-card"><div className="setting-icon"><CircleUserRound /></div><div><h2>Team access</h2><p>All signed-in users can scan, ship, and view shipment history. Only admins can open connection settings.</p><span className="status-pill">Role-based access</span></div></section></div></>;
}

export default App;
