import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/api";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const ROLES = [
  {
    id: "manager",
    icon: "🏢",
    title: "Manager",
    desc: "I manage a team — workload oversight, approvals, capacity planning",
    dbRole: "manager",
  },
  {
    id: "analyst",
    icon: "📊",
    title: "Analyst",
    desc: "I analyse data and work on tasks assigned by my manager",
    dbRole: "member",
  },
  {
    id: "solo",
    icon: "🧑‍💻",
    title: "Solo / Freelancer",
    desc: "Just me — tracking my own work and projects",
    dbRole: "member",
  },
  {
    id: "business",
    icon: "🚀",
    title: "Business Owner",
    desc: "Running a company — need full visibility across teams",
    dbRole: "manager",
  },
];

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();

  // Step 1 = credentials, Step 2 = role selection
  const [step, setStep] = useState(1);
  const [form, setForm]   = useState({ name: "", email: "", password: "", confirm: "" });
  const [selectedRole, setSelectedRole] = useState(null);
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [googleConfigured, setGoogleConfigured] = useState(false);

  useEffect(() => {
    api.get("/auth/google/status")
      .then(({ data }) => setGoogleConfigured(data.configured === true))
      .catch(() => setGoogleConfigured(false));
  }, []);

  // ── Step 1 submit — validate then go to role step
  const handleStep1 = (e) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) return setError("Passwords do not match.");
    if (form.password.length < 8) return setError("Password must be at least 8 characters.");
    setStep(2);
  };

  // ── Step 2 submit — create account with chosen role
  const handleStep2 = async () => {
    if (!selectedRole) return setError("Please choose how you'll use Taskora.");
    setError(""); setLoading(true);
    try {
      await register(form.name, form.email, form.password, selectedRole.dbRole);
      navigate("/onboarding");
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed. Please try again.");
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  const pwStrength = form.password.length === 0 ? null
    : form.password.length < 8  ? { label: "Weak",   color: "#ef4444" }
    : form.password.length < 12 ? { label: "Good",   color: "#6366f1" }
    :                              { label: "Strong", color: "#10b981" };

  return (
    <div style={S.root}>
      <div style={S.blob1} /><div style={S.blob2} />

      <div style={S.card}>
        {/* Logo */}
        <div style={S.logoRow}>
          <div style={S.logoMark}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="10" width="4" height="12" rx="1.5" fill="#fff"/>
              <rect x="10" y="6" width="4" height="16" rx="1.5" fill="#fff"/>
              <rect x="18" y="2" width="4" height="20" rx="1.5" fill="#fff"/>
            </svg>
          </div>
          <span style={S.logoText}>Taskora</span>
          <span style={{fontSize:10,fontWeight:700,color:"#6366f1",background:"rgba(99,102,241,0.1)",borderRadius:4,padding:"2px 5px"}}>AI</span>
          <div style={{flex:1}} />
          {/* Step indicator */}
          <div style={S.stepIndicator}>
            <div style={{...S.stepDot, background: "#6366f1"}} />
            <div style={{...S.stepDot, background: step === 2 ? "#6366f1" : "#e2e8f0"}} />
          </div>
        </div>

        {error && (
          <div style={S.errorBox}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{flexShrink:0}}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        {/* ── STEP 1: Credentials ── */}
        {step === 1 && (
          <>
            <h1 style={S.heading}>Create your account</h1>
            <p style={S.subtext}>Free forever · No credit card required</p>

            {/* Google sign up — only shown when configured */}
            {googleConfigured && (
              <button
                type="button"
                style={S.googleBtn}
                onClick={() => { window.location.href = `${BACKEND_URL}/api/auth/google`; }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Sign up with Google
              </button>
            )}

            {googleConfigured && (
              <div style={S.orDivider}>
                <div style={S.orLine} />
                <span style={S.orText}>or with email</span>
                <div style={S.orLine} />
              </div>
            )}

            <form onSubmit={handleStep1} style={S.form}>
              <div style={S.field}>
                <label style={S.label}>Full name</label>
                <input type="text" style={S.input} placeholder="Alex Johnson"
                  value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  required autoFocus
                  onFocus={e => e.target.style.borderColor="#6366f1"}
                  onBlur={e => e.target.style.borderColor="#e2e8f0"} />
              </div>

              <div style={S.field}>
                <label style={S.label}>Email address</label>
                <input type="email" style={S.input} placeholder="you@company.com"
                  value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                  required
                  onFocus={e => e.target.style.borderColor="#6366f1"}
                  onBlur={e => e.target.style.borderColor="#e2e8f0"} />
              </div>

              <div style={S.field}>
                <label style={S.label}>Password</label>
                <div style={S.passWrap}>
                  <input type={showPass ? "text" : "password"} style={{...S.input, paddingRight:40}}
                    placeholder="Min. 8 characters"
                    value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                    required
                    onFocus={e => e.target.style.borderColor="#6366f1"}
                    onBlur={e => e.target.style.borderColor="#e2e8f0"} />
                  <button type="button" style={S.eyeBtn} onClick={() => setShowPass(v => !v)}>
                    {showPass
                      ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                  </button>
                </div>
                {pwStrength && (
                  <div style={S.strengthRow}>
                    {[1,2,3].map(i => (
                      <div key={i} style={{...S.strengthBar,
                        background: form.password.length >= i*4 ? pwStrength.color : "#e2e8f0"}} />
                    ))}
                    <span style={{fontSize:11, color: pwStrength.color, fontWeight:600}}>{pwStrength.label}</span>
                  </div>
                )}
              </div>

              <div style={S.field}>
                <label style={S.label}>Confirm password</label>
                <input type={showPass ? "text" : "password"} style={S.input}
                  placeholder="Repeat password"
                  value={form.confirm} onChange={e => setForm({...form, confirm: e.target.value})}
                  required
                  onFocus={e => e.target.style.borderColor="#6366f1"}
                  onBlur={e => e.target.style.borderColor="#e2e8f0"} />
              </div>

              <button type="submit" style={S.submitBtn}>Continue →</button>
            </form>

            <div style={S.divider}><span>Already have an account?</span></div>
            <Link to="/login" style={S.switchLink}>Sign in instead</Link>
            <div style={S.helpRow}>
              <a href="/privacy" style={S.helpLink}>Privacy</a>
              <span style={S.helpDot}>·</span>
              <a href="/terms" style={S.helpLink}>Terms</a>
              <span style={S.helpDot}>·</span>
              <a href="/contact" style={S.helpLink}>Help</a>
            </div>
          </>
        )}

        {/* ── STEP 2: Role selection ── */}
        {step === 2 && (
          <>
            <h1 style={S.heading}>How will you use Taskora?</h1>
            <p style={S.subtext}>We'll set up your workspace to match your needs</p>

            <div style={S.roleGrid}>
              {ROLES.map(role => (
                <button
                  key={role.id}
                  type="button"
                  style={{
                    ...S.roleCard,
                    ...(selectedRole?.id === role.id ? S.roleCardActive : {}),
                  }}
                  onClick={() => setSelectedRole(role)}
                >
                  <div style={S.roleIcon}>{role.icon}</div>
                  <div style={S.roleTitle}>{role.title}</div>
                  <div style={S.roleDesc}>{role.desc}</div>
                  {selectedRole?.id === role.id && (
                    <div style={S.roleCheck}>✓</div>
                  )}
                </button>
              ))}
            </div>

            <button
              style={!selectedRole || loading
                ? {...S.submitBtn, opacity:0.5, cursor:"not-allowed"}
                : S.submitBtn}
              disabled={!selectedRole || loading}
              onClick={handleStep2}
            >
              {loading
                ? <span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                    <svg style={{animation:"spin 0.7s linear infinite"}} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/>
                    </svg>
                    Creating account…
                  </span>
                : "Create my workspace →"}
            </button>

            <button style={S.backBtn} onClick={() => { setStep(1); setError(""); }}>
              ← Back
            </button>
          </>
        )}
      </div>

      <div style={S.pills}>
        {["📋 Kanban boards","🏃 Sprint planning","📅 Calendar view","👥 Team workload"].map(p => (
          <div key={p} style={S.pill}>{p}</div>
        ))}
      </div>
    </div>
  );
}

const S = {
  root: {
    minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
    background:"linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
    padding:"24px", position:"relative", overflow:"hidden",
    flexDirection:"column", gap:"24px",
  },
  blob1: { position:"absolute", width:500, height:500, borderRadius:"50%",
    background:"radial-gradient(circle, rgba(99,102,241,0.3) 0%, transparent 70%)",
    top:"-100px", left:"-100px", pointerEvents:"none" },
  blob2: { position:"absolute", width:400, height:400, borderRadius:"50%",
    background:"radial-gradient(circle, rgba(168,85,247,0.2) 0%, transparent 70%)",
    bottom:"-80px", right:"-80px", pointerEvents:"none" },
  card: {
    background:"#ffffff", borderRadius:20, padding:"40px 44px",
    width:"100%", maxWidth:480,
    boxShadow:"0 25px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)",
    position:"relative", zIndex:1,
  },
  logoRow: { display:"flex", alignItems:"center", gap:10, marginBottom:28 },
  logoMark: { width:36, height:36, borderRadius:10, flexShrink:0,
    background:"linear-gradient(135deg, #6366f1, #8b5cf6)",
    display:"flex", alignItems:"center", justifyContent:"center" },
  logoText: { fontSize:20, fontWeight:800, color:"#0f172a", letterSpacing:"-0.5px", flex:1 },
  stepIndicator: { display:"flex", gap:6, alignItems:"center" },
  stepDot: { width:8, height:8, borderRadius:"50%", transition:"background 0.3s" },
  heading: { fontSize:26, fontWeight:800, color:"#0f172a", margin:"0 0 6px", letterSpacing:"-0.5px" },
  subtext: { fontSize:14, color:"#64748b", margin:"0 0 24px" },
  errorBox: { display:"flex", alignItems:"center", gap:8, background:"#fef2f2",
    border:"1px solid #fecaca", color:"#dc2626", borderRadius:10,
    padding:"10px 14px", fontSize:13, fontWeight:500, marginBottom:18 },
  form: { display:"flex", flexDirection:"column", gap:16 },
  field: { display:"flex", flexDirection:"column", gap:6 },
  label: { fontSize:13, fontWeight:600, color:"#374151" },
  input: { width:"100%", padding:"11px 14px", border:"1.5px solid #e2e8f0",
    borderRadius:10, fontSize:14, color:"#0f172a", background:"#f8fafc",
    outline:"none", transition:"border-color 0.15s", boxSizing:"border-box", fontFamily:"inherit" },
  passWrap: { position:"relative" },
  eyeBtn: { position:"absolute", right:10, top:"50%", transform:"translateY(-50%)",
    background:"none", border:"none", cursor:"pointer", padding:4,
    display:"flex", alignItems:"center" },
  strengthRow: { display:"flex", alignItems:"center", gap:4, marginTop:4 },
  strengthBar: { flex:1, height:3, borderRadius:99, transition:"background 0.3s" },
  submitBtn: { width:"100%", padding:"13px",
    background:"linear-gradient(135deg, #6366f1, #8b5cf6)",
    color:"#fff", border:"none", borderRadius:10, fontSize:15,
    fontWeight:700, cursor:"pointer", marginTop:4, letterSpacing:"0.2px",
    transition:"opacity 0.15s" },
  backBtn: { display:"block", width:"100%", marginTop:10, padding:"10px",
    background:"none", border:"1.5px solid #e2e8f0", borderRadius:10,
    fontSize:14, fontWeight:600, color:"#64748b", cursor:"pointer",
    transition:"all 0.15s" },
  divider: { textAlign:"center", margin:"22px 0 16px", fontSize:13, color:"#94a3b8" },
  switchLink: { display:"block", textAlign:"center", padding:"11px",
    border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:14,
    fontWeight:600, color:"#6366f1", textDecoration:"none" },
  roleGrid: { display:"flex", flexDirection:"column", gap:10, marginBottom:20 },
  roleCard: {
    display:"flex", flexDirection:"column", alignItems:"flex-start",
    gap:4, padding:"16px 18px", border:"2px solid #e2e8f0",
    borderRadius:12, cursor:"pointer", background:"#f8fafc",
    textAlign:"left", position:"relative", transition:"all 0.15s",
  },
  roleCardActive: {
    border:"2px solid #6366f1", background:"#eef2ff",
  },
  roleIcon: { fontSize:24, marginBottom:4 },
  roleTitle: { fontSize:15, fontWeight:700, color:"#0f172a" },
  roleDesc:  { fontSize:13, color:"#64748b", lineHeight:1.4 },
  roleCheck: {
    position:"absolute", top:12, right:14,
    width:22, height:22, borderRadius:"50%",
    background:"#6366f1", color:"#fff",
    display:"flex", alignItems:"center", justifyContent:"center",
    fontSize:12, fontWeight:800,
  },
  pills: { display:"flex", gap:10, flexWrap:"wrap", justifyContent:"center", position:"relative", zIndex:1 },
  pill: { background:"rgba(255,255,255,0.08)", backdropFilter:"blur(8px)",
    border:"1px solid rgba(255,255,255,0.12)", borderRadius:99,
    padding:"6px 14px", fontSize:12, color:"rgba(255,255,255,0.75)", fontWeight:500 },
  googleBtn: {
    width:"100%", padding:"11px 16px",
    background:"#fff", border:"1.5px solid #e2e8f0",
    borderRadius:10, fontSize:14, fontWeight:600, color:"#374151",
    cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
    gap:10, marginBottom:4,
  },
  orDivider: { display:"flex", alignItems:"center", gap:10, margin:"14px 0" },
  orLine: { flex:1, height:1, background:"#f1f5f9" },
  orText: { fontSize:12, color:"#94a3b8", fontWeight:500, flexShrink:0 },
  helpRow: { display:"flex", alignItems:"center", justifyContent:"center", gap:6, marginTop:14 },
  helpLink: { fontSize:12, color:"#94a3b8", textDecoration:"none" },
  helpDot: { fontSize:12, color:"#cbd5e1" },
};
