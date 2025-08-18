import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PlayCircle,
  Square,
  Gift,
  Coins,
  Users,
  Link as LinkIcon,
  LogIn,
  LogOut,
  ChevronRight,
  Copy,
  Check,
  Wallet,
  Settings,
} from "lucide-react";

// ---- Helpers ----
const cn = (...c) => c.filter(Boolean).join(" ");
const fmt = (n) => Number(n || 0).toLocaleString("id-ID", { maximumFractionDigits: 8 });
const now = () => Date.now();
const uid = () => Math.random().toString(36).slice(2, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// URL hash router ("#/reg", "#/dashboard", etc.)
const useHashRoute = () => {
  const [hash, setHash] = useState(() => window.location.hash || "#/home");
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || "#/home");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const path = hash.split("?")[0];
  const params = useMemo(() => new URLSearchParams(hash.split("?")[1] || ""), [hash]);
  return { path, params, push: (p) => (window.location.hash = p) };
};

// Persistent storage
const KEYS = {
  users: "app.users",
  session: "app.session",
  wallet: (uid) => `wallet.${uid}`,
};

const read = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : d;
  } catch {
    return d;
  }
};
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// Simulated miner tick (adds coin per second based on hashrate)
const useMiner = (active, baseHash = 12.5, boost = 1) => {
  const [earned, setEarned] = useState(0);
  const lastRef = useRef(now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      const tnow = now();
      const dt = (tnow - lastRef.current) / 1000; // seconds
      lastRef.current = tnow;
      const rate = (baseHash * boost) / 1_000_000_000; // pretend: GHash -> coin
      setEarned((e) => e + dt * rate);
    }, 1000);
    return () => clearInterval(t);
  }, [active, baseHash, boost]);
  useEffect(() => {
    lastRef.current = now();
  }, [active]);
  return earned;
};

// Toast component
const Toast = ({ text, show }) => (
  <AnimatePresence>
    {show && (
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        className="fixed bottom-4 inset-x-0 mx-auto w-fit rounded-2xl px-4 py-2 bg-black/80 text-white text-sm shadow-xl"
      >
        {text}
      </motion.div>
    )}
  </AnimatePresence>
);

// CopyButton
const CopyButton = ({ value, className }) => {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setOk(true);
          setTimeout(() => setOk(false), 1200);
        } catch {}
      }}
      className={cn(
        "inline-flex items-center gap-1 rounded-xl px-3 py-2 bg-neutral-900 text-white text-xs active:scale-[.98]",
        className
      )}
    >
      {ok ? <Check size={16} /> : <Copy size={16} />} {ok ? "Disalin" : "Salin"}
    </button>
  );
};

// ---- Main App ----
export default function App() {
  const router = useHashRoute();
  const { path, params, push } = router;

  // Referral from URL (e.g. #/reg?ref=NAME)
  const refFromUrl = useMemo(() => params.get("ref") || "", [params]);

  const [users, setUsers] = useState(() => read(KEYS.users, []));
  const [session, setSession] = useState(() => read(KEYS.session, null));
  const me = users.find((u) => u.id === session?.uid);

  useEffect(() => write(KEYS.users, users), [users]);
  useEffect(() => write(KEYS.session, session), [session]);

  // Wallet for current user
  const [wallet, setWallet] = useState(() => (me ? read(KEYS.wallet(me.id), {
    balance: 0,
    totalMined: 0,
    lastBonus: 0,
    hashrate: 12.5, // GH/s (pretend)
    mining: false,
    boosts: 1,
  }) : null));

  useEffect(() => {
    if (!me) return;
    const w = read(KEYS.wallet(me.id), {
      balance: 0,
      totalMined: 0,
      lastBonus: 0,
      hashrate: 12.5,
      mining: false,
      boosts: 1,
    });
    setWallet(w);
  }, [me?.id]);

  useEffect(() => {
    if (!me || !wallet) return;
    write(KEYS.wallet(me.id), wallet);
  }, [me?.id, wallet]);

  const earned = useMiner(wallet?.mining, wallet?.hashrate, wallet?.boosts);

  // Accumulate earned into balance every 3s (to keep numbers tidy)
  useEffect(() => {
    if (!me || !wallet) return;
    const i = setInterval(() => {
      setWallet((w) => {
        if (!w) return w;
        const add = earned;
        return { ...w, balance: w.balance + add, totalMined: w.totalMined + add };
      });
    }, 3000);
    return () => clearInterval(i);
  }, [earned, me, wallet?.mining]);

  // Pre-fill referral on /reg if provided
  const [regRef, setRegRef] = useState("");
  useEffect(() => {
    if (path === "#/reg") setRegRef(refFromUrl);
  }, [path, refFromUrl]);

  const handleRegister = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") || "").toString().trim();
    const email = (fd.get("email") || "").toString().trim();
    const pass = (fd.get("password") || "").toString();
    const ref = (fd.get("ref") || "").toString().trim();
    if (!name || !email || !pass) return alert("Lengkapi semua field.");
    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase()))
      return alert("Email sudah terdaftar.");
    const id = uid();
    const newUser = { id, name, email, referrer: ref || null, createdAt: now() };
    const newUsers = [...users, newUser];
    setUsers(newUsers);
    setSession({ uid: id });
    write(KEYS.wallet(id), {
      balance: 0,
      totalMined: 0,
      lastBonus: 0,
      hashrate: 12.5,
      mining: false,
      boosts: 1,
    });
    // Simple referral reward (once):
    if (ref) {
      const refUser = newUsers.find((u) => (u.name === ref || u.email === ref || u.id === ref));
      if (refUser) {
        const wk = KEYS.wallet(refUser.id);
        const rw = read(wk, null) || { balance: 0 };
        rw.balance = (rw.balance || 0) + 0.01; // bonus kecil
        write(wk, rw);
      }
    }
    push("#/dashboard");
  };

  const handleLogin = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = (fd.get("email") || "").toString().trim();
    if (!email) return alert("Masukkan email.");
    const u = users.find((x) => x.email.toLowerCase() === email.toLowerCase());
    if (!u) return alert("Akun tidak ditemukan.");
    setSession({ uid: u.id });
    push("#/dashboard");
  };

  const logout = () => {
    setSession(null);
    push("#/home");
  };

  const claimDaily = () => {
    if (!wallet) return;
    const DAY = 24 * 60 * 60 * 1000;
    if (now() - wallet.lastBonus < DAY) {
      const left = DAY - (now() - wallet.lastBonus);
      const h = Math.floor(left / 3600000);
      const m = Math.floor((left % 3600000) / 60000);
      return alert(`Tunggu ${h}j ${m}m lagi.`);
    }
    setWallet((w) => ({ ...w, lastBonus: now(), balance: w.balance + 0.005 }));
  };

  const referralLink = useMemo(() => {
    if (!me) return "";
    const base = window.location.href.split("#")[0];
    return `${base}#/reg?ref=${encodeURIComponent(me.name)}`;
  }, [me]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950 text-neutral-100">
      <Header me={me} onLogout={logout} push={push} />

      <main className="max-w-5xl mx-auto px-4 pb-24">
        <AnimatePresence mode="wait">
          {path === "#/home" && <Home key="home" push={push} refFromUrl={refFromUrl} />}
          {path === "#/reg" && (
            <Register key="reg" onSubmit={handleRegister} regRef={regRef} setRegRef={setRegRef} />
          )}
          {path === "#/login" && <Login key="login" onSubmit={handleLogin} />}
          {path === "#/dashboard" && me && wallet && (
            <Dashboard
              key="dash"
              me={me}
              wallet={wallet}
              setWallet={setWallet}
              referralLink={referralLink}
            />
          )}
        </AnimatePresence>
      </main>

      <Footer />
    </div>
  );
}

// ---- UI Sections ----
const Header = ({ me, onLogout, push }) => {
  return (
    <div className="sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/70 border-b border-white/5">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <motion.div initial={{ scale: 0.8, rotate: -10 }} animate={{ scale: 1, rotate: 0 }}>
            <Coins className="text-yellow-400" />
          </motion.div>
          <span className="font-bold tracking-tight">Nickt Lite</span>
        </div>
        <nav className="flex items-center gap-2">
          <NavBtn onClick={() => (window.location.hash = "#/home")}>Beranda</NavBtn>
          <NavBtn onClick={() => (window.location.hash = "#/reg")}>Daftar</NavBtn>
          {me ? (
            <>
              <NavBtn onClick={() => (window.location.hash = "#/dashboard")}>Dashboard</NavBtn>
              <button onClick={onLogout} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-red-600 text-white">
                <LogOut size={16} /> Keluar
              </button>
            </>
          ) : (
            <button onClick={() => (window.location.hash = "#/login")} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-200 text-neutral-900">
              <LogIn size={16} /> Masuk
            </button>
          )}
        </nav>
      </div>
    </div>
  );
};

const NavBtn = ({ children, onClick }) => (
  <button onClick={onClick} className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 text-white hover:bg-white/10">
    {children}
  </button>
);

const Home = ({ push, refFromUrl }) => {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="py-10"
    >
      <div className="grid sm:grid-cols-2 gap-6 items-center">
        <div className="space-y-4">
          <h1 className="text-3xl sm:text-5xl font-extrabold leading-tight">
            Bentuk Tim & Hasilkan <span className="text-yellow-400">Penghasilan</span>
          </h1>
          <p className="text-neutral-300">
            Daftar gratis, aktifkan penambang cloud, dan dapatkan bonus harian. Ajak teman bergabung lewat tautan referalmu.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={() => (window.location.hash = "#/reg")} className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-yellow-400 text-neutral-900 font-semibold">
              Mulai Sekarang <ChevronRight size={18} />
            </button>
            <button onClick={() => (window.location.hash = "#/login")} className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/10 text-white">
              Saya sudah punya akun
            </button>
          </div>
          {refFromUrl && (
            <div className="text-xs text-neutral-400">Direferensikan oleh: <span className="text-white font-medium">{refFromUrl}</span></div>
          )}
        </div>
        <HeroCard />
      </div>
    </motion.section>
  );
};

const HeroCard = () => {
  const [fakeActive, setFakeActive] = useState(true);
  useEffect(() => {
    const t = setInterval(() => setFakeActive((v) => !v), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <motion.div className="rounded-3xl p-6 bg-white/5 border border-white/10 shadow-2xl">
      <div className="flex items-center justify-between">
        <div className="text-sm text-neutral-300">Cloud Miner</div>
        <div className={cn("text-xs px-2 py-1 rounded-full", fakeActive ? "bg-emerald-500/20 text-emerald-300" : "bg-neutral-700 text-neutral-300")}>{fakeActive ? "Aktif" : "Siaga"}</div>
      </div>
      <div className="mt-6 text-4xl font-bold">GH/s 12.5</div>
      <div className="mt-2 text-xs text-neutral-400">Simulasi hashrate pemula • tingkatkan melalui tim</div>
      <div className="mt-6 flex gap-3">
        <div className="h-2 w-full rounded bg-neutral-800 overflow-hidden">
          <motion.div initial={{ width: "0%" }} animate={{ width: fakeActive ? "80%" : "30%" }} transition={{ duration: 1.6 }} className="h-2 bg-yellow-400" />
        </div>
      </div>
    </motion.div>
  );
};

const Register = ({ onSubmit, regRef, setRegRef }) => (
  <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="py-10">
    <div className="max-w-lg mx-auto rounded-3xl p-6 bg-white/5 border border-white/10">
      <h2 className="text-2xl font-bold">Daftar Akun</h2>
      <p className="text-sm text-neutral-400 mt-1">Gratis • butuh email aktif • referal opsional</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="Nama" name="name" placeholder="Nama panggilan" />
        <Field label="Email" name="email" type="email" placeholder="kamu@mail.com" />
        <Field label="Kata sandi" name="password" type="password" placeholder="••••••••" />
        <Field label="Kode referal (opsional)" name="ref" placeholder="Nama/Email/ID Sponsor" value={regRef} onChange={(e) => setRegRef(e.target.value)} />
        <button className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-yellow-400 text-neutral-900 font-semibold">
          Buat Akun <ChevronRight size={18} />
        </button>
        <div className="text-center text-sm text-neutral-400">
          Sudah punya akun? <a href="#/login" className="underline">Masuk</a>
        </div>
      </form>
    </div>
  </motion.section>
);

const Login = ({ onSubmit }) => (
  <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="py-10">
    <div className="max-w-md mx-auto rounded-3xl p-6 bg-white/5 border border-white/10">
      <h2 className="text-2xl font-bold">Masuk</h2>
      <p className="text-sm text-neutral-400 mt-1">Cukup gunakan email yang terdaftar</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="Email" name="email" type="email" placeholder="kamu@mail.com" />
        <button className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-neutral-200 text-neutral-900 font-semibold">
          Masuk <ChevronRight size={18} />
        </button>
      </form>
    </div>
  </motion.section>
);

const Dashboard = ({ me, wallet, setWallet, referralLink }) => {
  const [toast, setToast] = useState("");
  const showToast = (t) => {
    setToast(t);
    setTimeout(() => setToast(""), 1200);
  };

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="py-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Halo, {me.name} 👋</h2>
        <p className="text-neutral-400 text-sm">Kelola penambang, bonus, dan referalmu di sini.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Miner Card */}
        <div className="rounded-3xl p-5 bg-white/5 border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Cloud Miner</div>
            <div className="text-xs text-neutral-400">Hashrate: {wallet.hashrate} GH/s</div>
          </div>
          <div className="text-3xl font-bold">Saldo: {fmt(wallet.balance)} NKT</div>
          <div className="text-xs text-neutral-400">Total ditambang: {fmt(wallet.totalMined)} NKT</div>
          <div className="h-2 w-full rounded bg-neutral-800 overflow-hidden">
            <motion.div initial={{ width: "0%" }} animate={{ width: wallet.mining ? "85%" : "20%" }} transition={{ duration: 1.2 }} className="h-2 bg-yellow-400" />
          </div>
          <div className="flex gap-3">
            {wallet.mining ? (
              <button onClick={() => setWallet({ ...wallet, mining: false })} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white">
                <Square size={16} /> Stop
              </button>
            ) : (
              <button onClick={() => setWallet({ ...wallet, mining: true })} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 text-white">
                <PlayCircle size={18} /> Mulai Mining
              </button>
            )}
            <button onClick={() => { setWallet({ ...wallet, balance: 0 }); showToast("Saldo ditarik ke dompet eksternal (simulasi)"); }} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10">
              <Wallet size={16} /> Withdraw (demo)
            </button>
          </div>
        </div>

        {/* Daily Bonus */}
        <div className="rounded-3xl p-5 bg-white/5 border border-white/10 space-y-3">
          <div className="flex items-center gap-2 font-semibold"><Gift size={18} /> Bonus Harian</div>
          <div className="text-sm text-neutral-300">Klaim 0.005 NKT setiap 24 jam.</div>
          <button onClick={() => {
            const DAY = 24 * 60 * 60 * 1000;
            const left = now() - wallet.lastBonus;
            if (left < DAY) {
              const remain = DAY - left;
              const h = Math.floor(remain / 3600000);
              const m = Math.floor((remain % 3600000) / 60000);
              return alert(`Tunggu ${h}j ${m}m lagi.`);
            }
            setWallet({ ...wallet, lastBonus: now(), balance: wallet.balance + 0.005 });
            showToast("Bonus +0.005 NKT");
          }} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-yellow-400 text-neutral-900 font-semibold">
            Klaim Sekarang
          </button>
          <div className="text-xs text-neutral-400">Terakhir klaim: {wallet.lastBonus ? new Date(wallet.lastBonus).toLocaleString() : "-"}</div>
        </div>

        {/* Referral */}
        <div className="rounded-3xl p-5 bg-white/5 border border-white/10 space-y-3">
          <div className="flex items-center gap-2 font-semibold"><Users size={18} /> Program Referal</div>
          <div className="text-sm text-neutral-300">Bagikan tautan di bawah. Saat teman daftar, kamu mendapat 0.01 NKT (sekali).</div>
          <div className="text-xs break-all rounded-xl bg-black/30 border border-white/10 p-3">
            {referralLink || "Buat akun untuk mendapatkan tautan"}
          </div>
          {referralLink && <CopyButton value={referralLink} />}
        </div>
      </div>

      <div className="mt-6 rounded-3xl p-5 bg-white/5 border border-white/10">
        <div className="flex items-center gap-2 font-semibold"><LinkIcon size={18} /> Tips</div>
        <ul className="mt-2 text-sm text-neutral-300 list-disc pl-5 space-y-1">
          <li>Untuk menautkan referal otomatis, gunakan format <code>#/reg?ref=NamaKamu</code>.</li>
          <li>Aplikasi ini bersifat demo, semua data tersimpan di perangkat (localStorage).</li>
          <li>Sesuaikan merek, warna, dan logika hadiah sesuai kebutuhanmu.</li>
        </ul>
      </div>

      <Toast text={toast} show={!!toast} />
    </motion.section>
  );
};

const Field = ({ label, name, type = "text", placeholder, value, onChange }) => (
  <label className="block">
    <div className="text-sm mb-1 text-neutral-300">{label}</div>
    <input
      name={name}
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className="w-full px-4 py-3 rounded-2xl bg-black/40 border border-white/10 outline-none focus:border-yellow-400"
      autoComplete="off"
      required={name !== "ref"}
    />
  </label>
);

const Footer = () => (
  <footer className="mt-10 border-t border-white/5">
    <div className="max-w-5xl mx-auto px-4 py-6 text-xs text-neutral-500 flex items-center justify-between">
      <div>© {new Date().getFullYear()} Nickt Lite • Demo</div>
      <a href="#/home" className="hover:underline inline-flex items-center gap-1"><Settings size={14} /> Preferensi</a>
    </div>
  </footer>
);

