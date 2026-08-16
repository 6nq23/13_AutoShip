import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { AlertTriangle, BarChart3, Box, CalendarDays, Camera, Check, ChevronRight, CircleUserRound, Clock3, Database, Download, Filter, History, Inbox, Keyboard, LoaderCircle, LogOut, MessageCircle, PackageCheck, Plus, RefreshCw, ScanLine, Search, Settings, ShieldCheck, TicketCheck, Trash2, Truck, Users } from "lucide-react";
import { api, clearToken, getToken, HistoryItem, normalizeOrder, setToken, ShipResult, ShippingJob, ShippingLog, SupportOverview, User } from "./api";

type Tab = "scan" | "history" | "analytics" | "support" | "settings";

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
        <NavButton active={tab === "analytics"} onClick={() => setTab("analytics")} icon={<BarChart3 />}>Analytics</NavButton>
        {user.role === "admin" && <NavButton active={tab === "support"} onClick={() => setTab("support")} icon={<MessageCircle />}>Support</NavButton>}
        {user.role === "admin" && <NavButton active={tab === "settings"} onClick={() => setTab("settings")} icon={<Settings />}>Settings</NavButton>}
      </nav>
      <div className="profile"><div className="avatar">{user.username.slice(0, 2).toUpperCase()}</div><div><strong>{user.username}</strong><small>{user.role}</small></div><button aria-label="Sign out" onClick={onLogout}><LogOut /></button></div>
    </aside>
    <header className="mobile-header"><div className="brand-mark"><Truck size={20} /> AutoShip</div><button onClick={onLogout} aria-label="Sign out"><LogOut /></button></header>
    {demoMode && <div className="demo-banner"><span>Demo mode</span> Try RBD4023, RBD4030, RBD4035, and RBD4044</div>}
    <main className="workspace">{tab === "scan" ? <ShipWorkspace /> : tab === "history" ? <HistoryPage /> : tab === "analytics" ? <AnalyticsPage /> : tab === "support" ? <SupportPage /> : <SettingsPage />}</main>
    <nav className="bottom-nav" aria-label="Mobile navigation">
      <NavButton active={tab === "scan"} onClick={() => setTab("scan")} icon={<ScanLine />}>Ship</NavButton>
      <NavButton active={tab === "history"} onClick={() => setTab("history")} icon={<History />}>History</NavButton>
      <NavButton active={tab === "analytics"} onClick={() => setTab("analytics")} icon={<BarChart3 />}>Analytics</NavButton>
      {user.role === "admin" && <NavButton active={tab === "support"} onClick={() => setTab("support")} icon={<MessageCircle />}>Support</NavButton>}
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

type AnalyticsRange = "all" | "today" | "yesterday" | "day-before" | "tomorrow" | "week" | "month" | "last-7" | "last-30" | "custom";
type AnalyticsRow = {
  key: string; createdAt: string; batchId: string; shippedBy: string; status: "shipped" | "failed";
  orderNumber: string; orderId: string; awb: string; courier: string; cost: number; code: string; error: string; alreadyBooked: boolean;
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) => { const next = new Date(date); next.setDate(next.getDate() + days); return next; };
const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const compactNumber = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

function AnalyticsPage() {
  const [batches, setBatches] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState<AnalyticsRange>("all");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [query, setQuery] = useState(""); const [status, setStatus] = useState("all");
  const [courier, setCourier] = useState("all"); const [operator, setOperator] = useState("all");

  useEffect(() => {
    api.history().then(({ batches: items }) => setBatches(items)).catch((cause) => setError(cause instanceof Error ? cause.message : "Analytics could not be loaded.")).finally(() => setLoading(false));
  }, []);

  const rows = useMemo<AnalyticsRow[]>(() => batches.flatMap((batch) => [
    ...batch.shipped.map((item, index) => ({ key: `${batch.batchId}-s-${index}`, createdAt: batch.createdAt, batchId: batch.batchId, shippedBy: batch.shippedBy, status: "shipped" as const, orderNumber: item.orderNumber, orderId: item.orderId, awb: item.awb, courier: item.courier, cost: item.cost, code: "", error: "", alreadyBooked: Boolean(item.alreadyBooked) })),
    ...batch.failed.map((item, index) => ({ key: `${batch.batchId}-f-${index}`, createdAt: batch.createdAt, batchId: batch.batchId, shippedBy: batch.shippedBy, status: "failed" as const, orderNumber: item.orderNumber, orderId: "", awb: "", courier: "", cost: 0, code: item.code, error: item.error, alreadyBooked: false })),
  ]).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)), [batches]);

  const couriers = useMemo(() => [...new Set(rows.map((row) => row.courier).filter(Boolean))].sort(), [rows]);
  const operators = useMemo(() => [...new Set(rows.map((row) => row.shippedBy).filter(Boolean))].sort(), [rows]);
  const bounds = useMemo(() => {
    const today = startOfDay(new Date()); let start: Date | null = null; let end: Date | null = null;
    if (range === "today") { start = today; end = addDays(today, 1); }
    if (range === "yesterday") { start = addDays(today, -1); end = today; }
    if (range === "day-before") { start = addDays(today, -2); end = addDays(today, -1); }
    if (range === "tomorrow") { start = addDays(today, 1); end = addDays(today, 2); }
    if (range === "week") { start = addDays(today, -((today.getDay() + 6) % 7)); end = addDays(today, 1); }
    if (range === "month") { start = new Date(today.getFullYear(), today.getMonth(), 1); end = addDays(today, 1); }
    if (range === "last-7") { start = addDays(today, -6); end = addDays(today, 1); }
    if (range === "last-30") { start = addDays(today, -29); end = addDays(today, 1); }
    if (range === "custom") { start = from ? startOfDay(new Date(`${from}T00:00:00`)) : null; end = to ? addDays(startOfDay(new Date(`${to}T00:00:00`)), 1) : null; }
    return { start, end };
  }, [range, from, to]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const time = Date.parse(row.createdAt);
      if (bounds.start && time < bounds.start.getTime()) return false;
      if (bounds.end && time >= bounds.end.getTime()) return false;
      if (status !== "all" && row.status !== status) return false;
      if (courier !== "all" && row.courier !== courier) return false;
      if (operator !== "all" && row.shippedBy !== operator) return false;
      return !needle || [row.orderNumber, row.orderId, row.awb, row.batchId, row.shippedBy, row.courier, row.code, row.error].some((value) => value.toLowerCase().includes(needle));
    });
  }, [rows, bounds, query, status, courier, operator]);

  const metrics = useMemo(() => {
    const shipped = filtered.filter((row) => row.status === "shipped"); const failed = filtered.length - shipped.length;
    const totalCost = shipped.reduce((sum, row) => sum + row.cost, 0); const batchCount = new Set(filtered.map((row) => row.batchId)).size;
    return { shipped: shipped.length, failed, total: filtered.length, totalCost, batchCount, success: filtered.length ? shipped.length / filtered.length * 100 : 0, averageCost: shipped.length ? totalCost / shipped.length : 0 };
  }, [filtered]);

  const periodTotals = useMemo(() => {
    const today = startOfDay(new Date());
    const count = (start: Date, end: Date) => rows.filter((row) => row.status === "shipped" && Date.parse(row.createdAt) >= start.getTime() && Date.parse(row.createdAt) < end.getTime()).length;
    return [
      { label: "Today", value: count(today, addDays(today, 1)), note: today.toLocaleDateString(undefined, { day: "numeric", month: "short" }) },
      { label: "Tomorrow", value: count(addDays(today, 1), addDays(today, 2)), note: addDays(today, 1).toLocaleDateString(undefined, { day: "numeric", month: "short" }) },
      { label: "Yesterday", value: count(addDays(today, -1), today), note: addDays(today, -1).toLocaleDateString(undefined, { day: "numeric", month: "short" }) },
      { label: "Day before", value: count(addDays(today, -2), addDays(today, -1)), note: addDays(today, -2).toLocaleDateString(undefined, { day: "numeric", month: "short" }) },
      { label: "This week", value: count(addDays(today, -((today.getDay() + 6) % 7)), addDays(today, 1)), note: "Mon to today" },
      { label: "This month", value: count(new Date(today.getFullYear(), today.getMonth(), 1), addDays(today, 1)), note: today.toLocaleDateString(undefined, { month: "long" }) },
    ];
  }, [rows]);

  const daily = useMemo(() => {
    const today = startOfDay(new Date());
    const points = Array.from({ length: 14 }, (_, index) => { const date = addDays(today, index - 13); return { date, key: dayKey(date), shipped: 0, failed: 0 }; });
    const byDay = new Map(points.map((point) => [point.key, point]));
    filtered.forEach((row) => { const point = byDay.get(dayKey(new Date(row.createdAt))); if (point) point[row.status] += 1; });
    return points;
  }, [filtered]);
  const chartMax = Math.max(1, ...daily.map((point) => point.shipped + point.failed));

  const courierStats = useMemo(() => {
    const grouped = new Map<string, { name: string; count: number; cost: number }>();
    filtered.filter((row) => row.status === "shipped").forEach((row) => { const item = grouped.get(row.courier) || { name: row.courier || "Unknown", count: 0, cost: 0 }; item.count += 1; item.cost += row.cost; grouped.set(row.courier, item); });
    return [...grouped.values()].sort((a, b) => b.count - a.count);
  }, [filtered]);
  const failureStats = useMemo(() => {
    const grouped = new Map<string, { code: string; message: string; count: number }>();
    filtered.filter((row) => row.status === "failed").forEach((row) => { const key = row.code || "UNKNOWN"; const item = grouped.get(key) || { code: key, message: row.error, count: 0 }; item.count += 1; grouped.set(key, item); });
    return [...grouped.values()].sort((a, b) => b.count - a.count);
  }, [filtered]);
  const operatorStats = useMemo(() => operators.map((name) => { const own = filtered.filter((row) => row.shippedBy === name); return { name, total: own.length, shipped: own.filter((row) => row.status === "shipped").length }; }).filter((item) => item.total).sort((a, b) => b.total - a.total), [filtered, operators]);
  const weeklyStats = useMemo(() => {
    const today = startOfDay(new Date()); const currentMonday = addDays(today, -((today.getDay() + 6) % 7));
    return Array.from({ length: 8 }, (_, index) => { const start = addDays(currentMonday, (index - 7) * 7); const end = addDays(start, 7); const own = filtered.filter((row) => { const time = Date.parse(row.createdAt); return time >= start.getTime() && time < end.getTime(); }); return { key: dayKey(start), label: `${start.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${addDays(end, -1).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`, shipped: own.filter((row) => row.status === "shipped").length, failed: own.filter((row) => row.status === "failed").length }; }).reverse();
  }, [filtered]);
  const monthlyStats = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, index) => { const start = new Date(now.getFullYear(), now.getMonth() + index - 5, 1); const end = new Date(start.getFullYear(), start.getMonth() + 1, 1); const own = filtered.filter((row) => { const time = Date.parse(row.createdAt); return time >= start.getTime() && time < end.getTime(); }); return { key: `${start.getFullYear()}-${start.getMonth()}`, label: start.toLocaleDateString(undefined, { month: "long", year: "numeric" }), shipped: own.filter((row) => row.status === "shipped").length, failed: own.filter((row) => row.status === "failed").length }; }).reverse();
  }, [filtered]);

  function exportAnalytics() {
    const quote = (value: string | number | boolean) => `"${String(value).replace(/"/g, '""')}"`;
    const header = ["date_time", "status", "order_number", "order_id", "awb", "courier", "shipping_cost", "already_booked", "failure_code", "failure_reason", "batch_id", "shipped_by"];
    const data = filtered.map((row) => [row.createdAt, row.status, row.orderNumber, row.orderId, row.awb, row.courier, row.cost, row.alreadyBooked, row.code, row.error, row.batchId, row.shippedBy].map(quote).join(","));
    downloadFile(`autoship-analytics-${dayKey(new Date())}.csv`, [header.join(","), ...data].join("\n"), "text/csv;charset=utf-8");
  }
  const resetFilters = () => { setRange("all"); setFrom(""); setTo(""); setQuery(""); setStatus("all"); setCourier("all"); setOperator("all"); };

  if (loading) return <div className="analytics-loading"><LoaderCircle className="spin" /><span>Calculating every shipment metric...</span></div>;
  if (error) return <div className="alert error"><AlertTriangle />{error}</div>;
  return <>
    <div className="page-heading analytics-heading"><div><p className="eyebrow">Complete visibility</p><h1>Analytics</h1><p>Every order, outcome, courier, cost, operator, and date range in one view.</p></div><button className="button primary" onClick={exportAnalytics} disabled={!filtered.length}><Download /> Export {filtered.length} rows</button></div>

    <section className="card analytics-filter-card">
      <div className="filter-title"><span><Filter /> Filters</span><button onClick={resetFilters}>Reset all</button></div>
      <div className="quick-ranges" aria-label="Date range">{([['all','All time'],['today','Today'],['yesterday','Yesterday'],['day-before','Day before'],['tomorrow','Tomorrow'],['week','This week'],['month','This month'],['last-7','Last 7 days'],['last-30','Last 30 days'],['custom','Custom']] as [AnalyticsRange, string][]).map(([value, label]) => <button className={range === value ? "active" : ""} key={value} onClick={() => setRange(value)}>{label}</button>)}</div>
      <div className="filter-grid">
        <label className="search-filter"><span>Search anything</span><div><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Order, ID, AWB, batch, error..." /></div></label>
        <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="shipped">Shipped</option><option value="failed">Failed</option></select></label>
        <label><span>Courier</span><select value={courier} onChange={(event) => setCourier(event.target.value)}><option value="all">All couriers</option>{couriers.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Operator</span><select value={operator} onChange={(event) => setOperator(event.target.value)}><option value="all">All operators</option>{operators.map((item) => <option key={item}>{item}</option>)}</select></label>
        {range === "custom" && <><label><span>From date</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label><span>To date</span><input type="date" min={from} value={to} onChange={(event) => setTo(event.target.value)} /></label></>}
      </div>
    </section>

    <div className="metric-grid">
      <article className="card metric-card"><span>Total orders</span><strong>{compactNumber.format(metrics.total)}</strong><small>{metrics.batchCount} batches in selection</small></article>
      <article className="card metric-card shipped"><span>Shipped</span><strong>{compactNumber.format(metrics.shipped)}</strong><small>{metrics.success.toFixed(1)}% success rate</small></article>
      <article className="card metric-card failed"><span>Failed</span><strong>{compactNumber.format(metrics.failed)}</strong><small>{metrics.total ? (metrics.failed / metrics.total * 100).toFixed(1) : "0.0"}% failure rate</small></article>
      <article className="card metric-card"><span>Shipping spend</span><strong>{money.format(metrics.totalCost)}</strong><small>{money.format(metrics.averageCost)} average / shipped</small></article>
    </div>

    <section className="period-grid">{periodTotals.map((item) => <article className="card period-card" key={item.label}><div><span>{item.label}</span><small>{item.note}</small></div><strong>{item.value}</strong><em>shipped</em></article>)}</section>

    <div className="analytics-grid">
      <section className="card chart-card"><div className="analytics-section-title"><div><h2>14-day shipment trend</h2><p>Shipped versus failed orders using the active filters.</p></div><div className="chart-legend"><span><i className="success-dot" /> Shipped</span><span><i className="failure-dot" /> Failed</span></div></div><div className="bar-chart">{daily.map((point) => <div className="bar-column" key={point.key} title={`${point.key}: ${point.shipped} shipped, ${point.failed} failed`}><div className="bar-value">{point.shipped + point.failed || ""}</div><div className="bar-stack" style={{ height: `${Math.max(3, (point.shipped + point.failed) / chartMax * 150)}px` }}>{point.failed > 0 && <span className="failed-bar" style={{ flex: point.failed }} />}{point.shipped > 0 && <span className="shipped-bar" style={{ flex: point.shipped }} />}</div><small>{point.date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</small></div>)}</div></section>
      <section className="card breakdown-card"><div className="analytics-section-title"><div><h2>Courier performance</h2><p>Volume and spend by courier.</p></div></div>{courierStats.length ? <div className="breakdown-list">{courierStats.map((item) => <div className="breakdown-row" key={item.name}><div><strong>{item.name}</strong><small>{money.format(item.cost)} spend</small></div><span>{item.count} shipped</span></div>)}</div> : <div className="mini-analytics-empty">No shipped orders match.</div>}</section>
    </div>

    <div className="analytics-grid lower">
      <section className="card breakdown-card"><div className="analytics-section-title"><div><h2>Failure reasons</h2><p>Every error grouped by its response code.</p></div></div>{failureStats.length ? <div className="breakdown-list">{failureStats.map((item) => <div className="breakdown-row failure" key={item.code}><div><strong>{item.code}</strong><small>{item.message}</small></div><span>{item.count}</span></div>)}</div> : <div className="mini-analytics-empty success-text"><Check /> No failures match this view.</div>}</section>
      <section className="card breakdown-card"><div className="analytics-section-title"><div><h2>Team output</h2><p>Orders processed and shipped by operator.</p></div></div>{operatorStats.length ? <div className="breakdown-list">{operatorStats.map((item) => <div className="breakdown-row" key={item.name}><div><strong>{item.name}</strong><small>{item.total ? (item.shipped / item.total * 100).toFixed(1) : 0}% success rate</small></div><span>{item.shipped} / {item.total}</span></div>)}</div> : <div className="mini-analytics-empty">No operator activity matches.</div>}</section>
    </div>

    <div className="analytics-grid lower">
      <section className="card breakdown-card rollup-card"><div className="analytics-section-title"><div><h2>Weekly rollup</h2><p>Shipped and failed totals for each of the last 8 weeks.</p></div></div><div className="breakdown-list">{weeklyStats.map((item) => <div className="breakdown-row" key={item.key}><strong>{item.label}</strong><div className="rollup-values"><span>{item.shipped} shipped</span><em>{item.failed} failed</em></div></div>)}</div></section>
      <section className="card breakdown-card rollup-card"><div className="analytics-section-title"><div><h2>Monthly rollup</h2><p>Shipped and failed totals for each of the last 6 months.</p></div></div><div className="breakdown-list">{monthlyStats.map((item) => <div className="breakdown-row" key={item.key}><strong>{item.label}</strong><div className="rollup-values"><span>{item.shipped} shipped</span><em>{item.failed} failed</em></div></div>)}</div></section>
    </div>

    <section className="card analytics-table-card"><div className="analytics-section-title table-title"><div><h2>Order-level ledger</h2><p>{filtered.length} matching records · newest first · all times shown in your local timezone</p></div><button className="button secondary" onClick={exportAnalytics} disabled={!filtered.length}><Download /> CSV</button></div>{filtered.length ? <div className="analytics-table-wrap"><table><thead><tr><th>Date & time</th><th>Status</th><th>Order</th><th>Order ID</th><th>AWB</th><th>Courier / error</th><th>Cost</th><th>Operator</th><th>Batch ID</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.key}><td><strong>{new Date(row.createdAt).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}</strong><small>{new Date(row.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</small></td><td><span className={`analytics-status ${row.status}`}>{row.status}</span></td><td><strong>{row.orderNumber}</strong>{row.alreadyBooked && <small>Already booked</small>}</td><td>{row.orderId || "—"}</td><td>{row.awb || "—"}</td><td>{row.status === "shipped" ? row.courier : <span className="table-error"><strong>{row.code}</strong><small>{row.error}</small></span>}</td><td>{row.status === "shipped" ? money.format(row.cost) : "—"}</td><td>{row.shippedBy}</td><td><code title={row.batchId}>{row.batchId.slice(0, 8)}...</code></td></tr>)}</tbody></table></div> : <div className="empty-state analytics-empty"><BarChart3 /><strong>No records match these filters</strong><span>Change the date range or clear one of the filters.</span><button className="button secondary" onClick={resetFilters}>Reset filters</button></div>}</section>
  </>;
}

function SupportPage() {
  const [overview, setOverview] = useState<SupportOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ticketFilter, setTicketFilter] = useState<"open" | "resolved" | "all">("open");
  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try { setOverview(await api.supportOverview()); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Support activity could not be loaded."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(true); const timer = window.setInterval(() => void load(), 5_000); return () => window.clearInterval(timer); }, [load]);

  async function setTicketStatus(ticketId: string, status: "open" | "resolved") {
    try {
      await api.updateSupportTicket(ticketId, status);
      setOverview((current) => current ? { ...current, tickets: current.tickets.map((ticket) => ticket.ticketId === ticketId ? { ...ticket, status, resolvedAt: status === "resolved" ? new Date().toISOString() : undefined } : ticket), stats: { ...current.stats, openTickets: current.stats.openTickets + (status === "open" ? 1 : -1) } } : current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ticket status could not be updated."); }
  }

  async function setBotPaused(phone: string, paused: boolean) {
    try {
      await api.setBotPaused(phone, paused);
      setOverview((current) => {
        if (!current) return current;
        const botPauses = paused
          ? [{ phone, reason: "manual" as const, pausedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString() }, ...current.botPauses.filter((item) => item.phone !== phone)]
          : current.botPauses.filter((item) => item.phone !== phone);
        return { ...current, botPauses, conversations: paused ? current.conversations.filter((item) => item.phone !== phone) : current.conversations };
      });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Bot control could not be updated."); }
  }

  if (loading) return <div className="analytics-loading"><LoaderCircle className="spin" /><span>Loading WhatsApp support activity...</span></div>;
  if (!overview) return <div className="alert error"><AlertTriangle />{error || "Support data is unavailable."}</div>;
  const tickets = overview.tickets.filter((ticket) => ticketFilter === "all" || ticket.status === ticketFilter);
  const connectionEntries = Object.entries(overview.connections) as Array<[keyof SupportOverview["connections"], boolean]>;
  const recentPhones = [...new Set(overview.messages.filter((message) => message.direction === "inbound").map((message) => message.phone))].slice(0, 20);
  const pausedPhones = new Set(overview.botPauses.map((item) => item.phone));
  return <>
    <div className="page-heading support-heading"><div><p className="eyebrow">Customer care</p><h1>WhatsApp support</h1><p>Live conversations, automation health, and escalated tickets in one place.</p></div><button className="button secondary" onClick={() => void load(true)}><RefreshCw /> Refresh</button></div>
    {error && <div className="alert error" role="alert"><AlertTriangle />{error}</div>}
    <div className="connection-strip" aria-label="Support connections">{connectionEntries.map(([name, connected]) => <span className={connected ? "connection connected" : "connection disconnected"} key={name}><i />{name} {connected ? "ready" : "needs setup"}</span>)}</div>
    <div className="metric-grid support-metrics">
      <article className="card metric-card"><span>Inbound today</span><strong>{overview.stats.inboundToday}</strong><small>Customer messages received</small></article>
      <article className="card metric-card shipped"><span>Bot replies today</span><strong>{overview.stats.outboundToday}</strong><small>Automated responses sent</small></article>
      <article className="card metric-card"><span>Active flows</span><strong>{overview.stats.activeConversations}</strong><small>Conversations awaiting input</small></article>
      <article className="card metric-card failed"><span>Open tickets</span><strong>{overview.stats.openTickets}</strong><small>Human follow-up required</small></article>
    </div>
    <div className="support-grid">
      <section className="card support-panel message-panel"><div className="support-panel-title"><div><MessageCircle /><span><h2>Live message feed</h2><p>Newest first · refreshes every 5 seconds</p></span></div><span className="count-pill">{overview.messages.length}</span></div>{overview.messages.length ? <div className="message-feed" aria-live="polite">{overview.messages.map((message) => <article className={`support-message ${message.direction}`} key={message.id}><div><strong>{message.direction === "inbound" ? formatPhone(message.phone) : message.source === "agent" ? "Human agent" : "AutoShip bot"}</strong><time>{new Date(message.createdAt).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time></div><p>{message.text}</p><footer>{message.intent && <span>{friendlyIntent(message.intent)}</span>}{message.orderNumber && <span>{message.orderNumber}</span>}</footer></article>)}</div> : <SupportEmpty icon={<Inbox />} title="No WhatsApp messages yet" detail="Incoming webhook messages and bot replies will appear here." />}</section>
      <section className="card support-panel ticket-panel"><div className="support-panel-title"><div><TicketCheck /><span><h2>Escalated tickets</h2><p>Refund, return, missing-item, and recovery work</p></span></div></div><div className="ticket-filters" aria-label="Ticket filter">{(["open", "resolved", "all"] as const).map((filter) => <button className={ticketFilter === filter ? "active" : ""} onClick={() => setTicketFilter(filter)} key={filter}>{filter}</button>)}</div>{tickets.length ? <div className="ticket-list">{tickets.map((ticket) => <article className="support-ticket" key={ticket.ticketId}><header><span className={`ticket-status ${ticket.status}`}>{ticket.status}</span><time>{new Date(ticket.createdAt).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time></header><strong>{ticket.orderNumber || "Order not identified"}</strong><p>{ticket.description || friendlyIntent("refund_return")}</p><div><span>{formatPhone(ticket.phone)}</span><span>{ticket.category}</span></div><button className="button secondary" onClick={() => void setTicketStatus(ticket.ticketId, ticket.status === "open" ? "resolved" : "open")}>{ticket.status === "open" ? <><Check /> Mark resolved</> : <><RefreshCw /> Reopen</>}</button></article>)}</div> : <SupportEmpty icon={<TicketCheck />} title={`No ${ticketFilter === "all" ? "" : `${ticketFilter} `}tickets`} detail="Escalations created by the bot will appear here." />}</section>
    </div>
    <section className="card support-panel conversation-panel"><div className="support-panel-title"><div><MessageCircle /><span><h2>Human takeover</h2><p>Pause AutoShip while you reply manually. Pauses expire after 24 hours unless resumed sooner.</p></span></div><span className="count-pill">{overview.botPauses.length} paused</span></div>{recentPhones.length ? <div className="conversation-list">{recentPhones.map((phone) => { const paused = pausedPhones.has(phone); return <article key={phone}><span className="conversation-avatar">{phone.slice(-2)}</span><div><strong>{formatPhone(phone)}</strong><small>{paused ? "Human agent controls this chat" : "AutoShip is active"}</small></div><span>{paused ? "bot paused" : "bot active"}</span><button className={`button ${paused ? "secondary" : "danger"}`} onClick={() => void setBotPaused(phone, !paused)}>{paused ? "Resume bot" : "Pause bot"}</button></article>; })}</div> : <SupportEmpty icon={<Users />} title="No recent customers" detail="Customer conversations will appear here." />}</section>
    <section className="card support-panel conversation-panel"><div className="support-panel-title"><div><Users /><span><h2>Active conversation states</h2><p>Flows waiting for a customer reply; each expires after 24 hours.</p></span></div><span className="count-pill">{overview.conversations.length}</span></div>{overview.conversations.length ? <div className="conversation-list">{overview.conversations.map((conversation) => <article key={conversation.phone}><span className="conversation-avatar">{conversation.phone.slice(-2)}</span><div><strong>{formatPhone(conversation.phone)}</strong><small>{conversation.intent ? friendlyIntent(conversation.intent) : "Choosing a support topic"}</small></div><span>{conversation.step.replace(/_/g, " ")}</span><time>expires {new Date(conversation.expiresAt).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time></article>)}</div> : <SupportEmpty icon={<Users />} title="No active conversations" detail="All current customer flows are complete or expired." />}</section>
  </>;
}

function SupportEmpty({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) { return <div className="support-empty">{icon}<strong>{title}</strong><span>{detail}</span></div>; }
const friendlyIntent = (intent: string) => ({ confirm_order: "Order confirmation", change_address: "Address / phone change", order_status: "Order tracking", not_dispatched: "Dispatch delay", order_failed: "Failed delivery", refund_return: "Refund / return / missing" } as Record<string, string>)[intent] || intent.replace(/_/g, " ");
const formatPhone = (phone: string) => phone.length === 10 ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` : `+${phone}`;

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
