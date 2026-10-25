import React, { useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut
} from 'firebase/auth';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot,
  query, serverTimestamp, setDoc, updateDoc, where, writeBatch
} from 'firebase/firestore';
import { auth, db } from './firebase';
import {
  Activity, BookOpenCheck, CalendarDays, Check, ChevronDown, CircleAlert,
  ClipboardList, Download, LogOut, Menu, Plus, RefreshCw, School, Search,
  ShieldCheck, Users, X
} from 'lucide-react';

const today = () => new Date().toLocaleDateString('en-CA');
const blankStudent = { name: '', studentCode: '', classId: '', gender: '', guardianPhone: '' };
const blankClass = { name: '', grade: '', section: '' };

function friendlyError(e) {
  const code = e?.code || '';
  if (code.includes('permission-denied')) return 'Permission denied. Check Firestore rules and confirm your account role is set correctly.';
  if (code.includes('auth/invalid-credential') || code.includes('auth/wrong-password') || code.includes('auth/user-not-found')) return 'Email or password is incorrect.';
  if (code.includes('auth/too-many-requests')) return 'Too many attempts. Wait a little and try again.';
  if (code.includes('unavailable')) return 'Network unavailable. Check your internet connection.';
  return e?.message || 'Something went wrong.';
}

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoadError, setProfileLoadError] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage] = useState('overview');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedDate, setSelectedDate] = useState(today());
  const [search, setSearch] = useState('');
  const [studentForm, setStudentForm] = useState(blankStudent);
  const [classForm, setClassForm] = useState(blankClass);
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [showClassForm, setShowClassForm] = useState(false);
  const [teacherEmail, setTeacherEmail] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [teacherUid, setTeacherUid] = useState('');
  const [assignmentClass, setAssignmentClass] = useState('');

  useEffect(() => onAuthStateChanged(auth, async current => {
    setUser(current);
    setProfile(null);
    setProfileLoadError('');
    setError('');
    if (!current) {
      setAuthLoading(false);
      return;
    }
    setAuthLoading(true);
    try {
      const snap = await getDoc(doc(db, 'users', current.uid));
      if (snap.exists()) {
        setProfile({ uid: current.uid, ...snap.data() });
      } else {
        setProfileLoadError('PROFILE_MISSING: Your account is signed in, but Firestore has no users/' + current.uid + ' document. Create that exact document with name, email, role, and active fields.');
      }
    } catch (e) {
      const code = e?.code || 'unknown';
      setProfileLoadError('PROFILE_READ_FAILED (' + code + '): ' + friendlyError(e) + ' Check that src/firebase.js uses project school-attendance-4a743, that this UID matches Authentication, and that Firestore rules allow this user to read their own users/{uid} document.');
    } finally {
      setAuthLoading(false);
    }
  }), []);

  useEffect(() => {
    if (!user || !profile?.active) return;
    const unsub = [];
    const listen = (col, setter) => unsub.push(onSnapshot(collection(db, col), snap => {
      setter(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setError('');
    }, e => setError(friendlyError(e))));
    listen('classes', setClasses);
    listen('students', setStudents);
    listen('attendance', setAttendance);
    if (profile.role === 'admin') {
      listen('teachers', setTeachers);
      listen('assignments', setAssignments);
    } else if (profile.role === 'teacher') {
      const q = query(collection(db, 'assignments'), where('teacherId', '==', user.uid));
      unsub.push(onSnapshot(q, snap => setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() }))), e => setError(friendlyError(e))));
    }
    return () => unsub.forEach(fn => fn());
  }, [user, profile?.role, profile?.active]);

  useEffect(() => {
    if (classes.length && !selectedClass) {
      const allowed = profile?.role === 'teacher'
        ? classes.filter(c => assignments.some(a => a.classId === c.id))
        : classes;
      if (allowed.length) setSelectedClass(allowed[0].id);
    }
  }, [classes, assignments, profile, selectedClass]);

  const myClasses = useMemo(() => profile?.role === 'teacher'
    ? classes.filter(c => assignments.some(a => a.classId === c.id))
    : classes, [classes, assignments, profile]);
  const visibleStudents = useMemo(() => students
    .filter(s => !selectedClass || s.classId === selectedClass)
    .filter(s => (s.name || '').toLowerCase().includes(search.toLowerCase()) || (s.studentCode || '').toLowerCase().includes(search.toLowerCase())),
    [students, selectedClass, search]);
  const dateRecords = useMemo(() => attendance.filter(a => a.date === selectedDate && (!selectedClass || a.classId === selectedClass)), [attendance, selectedDate, selectedClass]);
  const stats = useMemo(() => {
    const eligible = attendance.filter(a => a.status !== 'Excused');
    const present = attendance.filter(a => a.status === 'Present').length;
    const late = attendance.filter(a => a.status === 'Late').length;
    const absent = attendance.filter(a => a.status === 'Absent').length;
    const denominator = eligible.length;
    return { students: students.length, classes: classes.length, present, late, absent, rate: denominator ? Math.round((present + late) / denominator * 100) : 0 };
  }, [students, classes, attendance]);

  async function login(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try { await signInWithEmailAndPassword(auth, email.trim(), password); setPassword(''); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  }
  async function logout() {
    await signOut(auth); setProfile(null); setPage('overview'); setError(''); setNotice('');
  }
  async function addClass(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await addDoc(collection(db, 'classes'), { ...classForm, createdAt: serverTimestamp() });
      setClassForm(blankClass); setShowClassForm(false); setNotice('Class created.');
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  async function addStudent(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (!studentForm.name.trim() || !studentForm.studentCode.trim() || !studentForm.classId) throw new Error('Name, student ID, and class are required.');
      await addDoc(collection(db, 'students'), { ...studentForm, name: studentForm.name.trim(), studentCode: studentForm.studentCode.trim(), createdAt: serverTimestamp() });
      setStudentForm(blankStudent); setShowStudentForm(false); setNotice('Student added.');
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  async function removeStudent(s) {
    if (!confirm(`Delete student ${s.name}? Attendance records will remain in reports.`)) return;
    try { await deleteDoc(doc(db, 'students', s.id)); setNotice('Student deleted.'); } catch(e) { setError(friendlyError(e)); }
  }
  async function removeClass(c) {
    if (!confirm(`Delete class ${c.name}? Do this only if it has no students or attendance records.`)) return;
    try { await deleteDoc(doc(db, 'classes', c.id)); setNotice('Class deleted.'); } catch(e) { setError(friendlyError(e)); }
  }
  async function saveAttendance(student, status) {
    const recordId = `${selectedDate}_${selectedClass}_${student.id}`;
    const payload = { date: selectedDate, classId: selectedClass, studentId: student.id, studentName: student.name, studentCode: student.studentCode || '', status, teacherId: user.uid, updatedAt: serverTimestamp() };
    try {
      await setDoc(doc(db, 'attendance', recordId), payload, { merge: true });
      setNotice(`Saved ${student.name}: ${status}`);
    } catch(e) { setError(friendlyError(e)); }
  }
  async function markAll(status) {
    if (!selectedClass || !visibleStudents.length) return;
    setBusy(true); setError('');
    try {
      const batch = writeBatch(db);
      visibleStudents.forEach(s => {
        const id = `${selectedDate}_${selectedClass}_${s.id}`;
        batch.set(doc(db, 'attendance', id), { date: selectedDate, classId: selectedClass, studentId: s.id, studentName: s.name, studentCode: s.studentCode || '', status, teacherId: user.uid, updatedAt: serverTimestamp() }, { merge: true });
      });
      await batch.commit(); setNotice(`Marked ${visibleStudents.length} students ${status.toLowerCase()}.`);
    } catch(e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  async function createTeacherRecord(e) {
    e.preventDefault(); setError('');
    try {
      if (!teacherUid.trim() || !teacherName.trim() || !teacherEmail.trim()) throw new Error('Teacher name, email, and Firebase Auth UID are required.');
      await setDoc(doc(db, 'teachers', teacherUid.trim()), { name: teacherName.trim(), email: teacherEmail.trim(), uid: teacherUid.trim(), createdAt: serverTimestamp() });
      await setDoc(doc(db, 'users', teacherUid.trim()), { name: teacherName.trim(), email: teacherEmail.trim(), role: 'teacher', active: true });
      setTeacherUid(''); setTeacherName(''); setTeacherEmail(''); setNotice('Teacher profile created. Assign a class below.');
    } catch(e) { setError(friendlyError(e)); }
  }
  async function assignTeacher(e) {
    e.preventDefault(); setError('');
    try {
      if (!teacherUid.trim() || !assignmentClass) throw new Error('Enter teacher UID and choose a class.');
      const id = `${teacherUid.trim()}_${assignmentClass}`;
      await setDoc(doc(db, 'assignments', id), { teacherId: teacherUid.trim(), classId: assignmentClass, teacherName: teachers.find(t => t.id === teacherUid.trim())?.name || teacherUid.trim(), className: classes.find(c => c.id === assignmentClass)?.name || '' });
      setNotice('Class assigned to teacher.');
    } catch(e) { setError(friendlyError(e)); }
  }
  function downloadCsv() {
    const rows = [['Date','Class','Student ID','Student Name','Status'], ...attendance
      .filter(a => !selectedClass || a.classId === selectedClass)
      .filter(a => a.date === selectedDate)
      .map(a => [a.date, classes.find(c=>c.id===a.classId)?.name || a.classId, a.studentCode, a.studentName, a.status])];
    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replaceAll('"','""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
    const a = document.createElement('a'); a.href = url; a.download = `datasana-attendance-${selectedDate}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  if (authLoading) return <div className="loading"><div className="spinner" />Loading DataSana…</div>;
  if (!user) return <main className="login-wrap">
    <section className="login-card">
      <div className="brand-mark"><School size={34}/></div>
      <p className="eyebrow">DATA SANA MEMORIAL SCHOOL</p>
      <h1>Attendance Portal</h1>
      <p className="muted">Sign in with your school account to continue.</p>
      {error && <div className="alert error"><CircleAlert size={18}/>{error}</div>}
      <form onSubmit={login} className="stack">
        <label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@school.com" required autoComplete="username"/></label>
        <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password" required autoComplete="current-password"/></label>
        <button className="primary full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in securely'}</button>
      </form>
      <p className="login-foot"><ShieldCheck size={15}/> Protected by Firebase Authentication</p>
    </section>
  </main>;

  if (!profile) return <main className="login-wrap"><section className="login-card">
    <div className="brand-mark"><ShieldCheck size={32}/></div><h1>{profileLoadError.startsWith('PROFILE_MISSING:') ? 'Account setup needed' : 'Could not load account'}</h1>
    <p className="muted">{profileLoadError || 'The school profile has not loaded yet. Sign out and try again.'}</p>
    {error && <div className="alert error">{error}</div>}<button className="primary full" onClick={logout}>Sign out</button>
  </section></main>;

  if (!profile.active || !['admin','teacher','student'].includes(profile.role)) return <main className="login-wrap"><section className="login-card"><h1>Access not enabled</h1><p className="muted">Your account is inactive or has no valid school role. Contact the administrator.</p><button className="primary full" onClick={logout}>Sign out</button></section></main>;

  const isAdmin = profile.role === 'admin';
  const roleLabel = profile.role.charAt(0).toUpperCase() + profile.role.slice(1);
  const nav = [
    {id:'overview',label:'Overview',icon:Activity,roles:['admin','teacher','student']},
    {id:'attendance',label:'Take attendance',icon:ClipboardList,roles:['admin','teacher']},
    {id:'students',label:'Students',icon:Users,roles:['admin','teacher']},
    {id:'classes',label:'Classes',icon:School,roles:['admin']},
    {id:'teachers',label:'Teachers & assignments',icon:BookOpenCheck,roles:['admin']},
    {id:'reports',label:'Reports',icon:CalendarDays,roles:['admin','teacher','student']}
  ].filter(n=>n.roles.includes(profile.role));

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="side-brand"><div className="mini-logo"><School size={23}/></div><div><strong>DataSana</strong><small>Attendance Portal</small></div></div>
      <div className="school-label">SCHOOL MANAGEMENT</div>
      <nav>{nav.map(n=><button key={n.id} className={page===n.id?'nav-item active':'nav-item'} onClick={()=>setPage(n.id)}><n.icon size={18}/><span>{n.label}</span></button>)}</nav>
      <div className="side-bottom"><div className="profile-mini"><div className="avatar">{(profile.name||user.email||'U').slice(0,1).toUpperCase()}</div><div className="profile-text"><strong>{profile.name || user.email}</strong><small>{roleLabel}</small></div></div><button className="logout" onClick={logout}><LogOut size={17}/> Sign out</button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div><p className="eyebrow">DATA SANA MEMORIAL SCHOOL</p><h2>{nav.find(n=>n.id===page)?.label || 'Attendance Portal'}</h2></div><div className="top-actions"><span className="role-pill"><ShieldCheck size={15}/>{roleLabel}</span><button className="icon-btn" title="Refresh page data" onClick={()=>window.location.reload()}><RefreshCw size={17}/></button></div></header>
      <div className="content">
        {error && <div className="alert error"><CircleAlert size={18}/><span>{error}</span><button onClick={()=>setError('')}><X size={16}/></button></div>}
        {notice && <div className="alert success"><Check size={18}/><span>{notice}</span><button onClick={()=>setNotice('')}><X size={16}/></button></div>}
        {page==='overview' && <Overview stats={stats} classes={myClasses} students={students} attendance={attendance} profile={profile} setPage={setPage} />}
        {page==='attendance' && <section className="panel">
          <div className="panel-head"><div><h3>Daily attendance</h3><p>Choose a class and date, then mark each student.</p></div><button className="outline" onClick={downloadCsv}><Download size={16}/> Export CSV</button></div>
          <div className="toolbar">
            <label>Class<select value={selectedClass} onChange={e=>setSelectedClass(e.target.value)} required><option value="">Choose class</option>{myClasses.map(c=><option key={c.id} value={c.id}>{c.name || `${c.grade} ${c.section}`}</option>)}</select></label>
            <label>Date<input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)} required/></label>
            <label className="search-label">Search student<div className="searchbox"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name or student ID"/></div></label>
          </div>
          {selectedClass && <div className="bulk-actions"><span>{visibleStudents.length} students</span><div><button className="status-btn present" disabled={busy} onClick={()=>markAll('Present')}>Mark all present</button><button className="status-btn absent" disabled={busy} onClick={()=>markAll('Absent')}>Mark all absent</button></div></div>}
          {!selectedClass ? <Empty text="Create or select a class to begin."/> : visibleStudents.length===0 ? <Empty text="No students found in this class. Add students first."/> :
            <div className="table-wrap"><table><thead><tr><th>Student</th><th>Student ID</th><th>Current status</th><th>Mark attendance</th></tr></thead><tbody>
              {visibleStudents.map(s=>{const rec=dateRecords.find(a=>a.studentId===s.id);return <tr key={s.id}><td><strong>{s.name}</strong><small className="cell-sub">{s.gender||'—'}</small></td><td>{s.studentCode||'—'}</td><td><Status status={rec?.status}/></td><td><div className="status-group">{['Present','Absent','Late','Excused'].map(st=><button key={st} disabled={!isAdmin && profile.role!=='teacher'} onClick={()=>saveAttendance(s,st)} className={`status-btn ${st.toLowerCase()} ${rec?.status===st?'chosen':''}`}>{st}</button>)}</div></td></tr>})}
            </tbody></table></div>}
        </section>}
        {page==='students' && <section className="panel">
          <div className="panel-head"><div><h3>Student directory</h3><p>Student records are stored in Firestore.</p></div>{isAdmin&&<button className="primary" onClick={()=>setShowStudentForm(v=>!v)}><Plus size={17}/> Add student</button>}</div>
          <div className="toolbar"><label>Class<select value={selectedClass} onChange={e=>setSelectedClass(e.target.value)}><option value="">All classes</option>{myClasses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="search-label">Search<div className="searchbox"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name or ID"/></div></label></div>
          {showStudentForm&&<form className="inline-form" onSubmit={addStudent}><h4>New student</h4><div className="form-grid"><label>Full name<input value={studentForm.name} onChange={e=>setStudentForm({...studentForm,name:e.target.value})} required/></label><label>Student ID<input value={studentForm.studentCode} onChange={e=>setStudentForm({...studentForm,studentCode:e.target.value})} required/></label><label>Class<select value={studentForm.classId} onChange={e=>setStudentForm({...studentForm,classId:e.target.value})} required><option value="">Choose class</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Gender (optional)<select value={studentForm.gender} onChange={e=>setStudentForm({...studentForm,gender:e.target.value})}><option value="">Not specified</option><option>Female</option><option>Male</option></select></label><label>Guardian phone (optional)<input value={studentForm.guardianPhone} onChange={e=>setStudentForm({...studentForm,guardianPhone:e.target.value})}/></label></div><div className="form-actions"><button type="button" className="outline" onClick={()=>setShowStudentForm(false)}>Cancel</button><button className="primary" disabled={busy}>Save student</button></div></form>}
          <div className="table-wrap"><table><thead><tr><th>Student name</th><th>Student ID</th><th>Class</th><th>Attendance rate</th>{isAdmin&&<th>Action</th>}</tr></thead><tbody>{visibleStudents.map(s=>{const recs=attendance.filter(a=>a.studentId===s.id&&a.status!=='Excused');const pct=recs.length?Math.round(recs.filter(a=>['Present','Late'].includes(a.status)).length/recs.length*100):null;return <tr key={s.id}><td><strong>{s.name}</strong></td><td>{s.studentCode||'—'}</td><td>{classes.find(c=>c.id===s.classId)?.name||'—'}</td><td>{pct===null?'N/A':`${pct}%`}</td>{isAdmin&&<td><button className="text-danger" onClick={()=>removeStudent(s)}>Delete</button></td>}</tr>})}</tbody></table></div>
        </section>}
        {page==='classes' && isAdmin && <section className="panel"><div className="panel-head"><div><h3>Classes</h3><p>Create classes before enrolling students or assigning teachers.</p></div><button className="primary" onClick={()=>setShowClassForm(v=>!v)}><Plus size={17}/> Add class</button></div>
          {showClassForm&&<form className="inline-form" onSubmit={addClass}><h4>Create class</h4><div className="form-grid"><label>Class name<input placeholder="e.g. Grade 9 A" value={classForm.name} onChange={e=>setClassForm({...classForm,name:e.target.value})} required/></label><label>Grade<input placeholder="e.g. 9" value={classForm.grade} onChange={e=>setClassForm({...classForm,grade:e.target.value})}/></label><label>Section<input placeholder="e.g. A" value={classForm.section} onChange={e=>setClassForm({...classForm,section:e.target.value})}/></label></div><div className="form-actions"><button type="button" className="outline" onClick={()=>setShowClassForm(false)}>Cancel</button><button className="primary" disabled={busy}>Save class</button></div></form>}
          <div className="class-grid">{classes.map(c=><article className="class-card" key={c.id}><div className="class-icon"><School size={22}/></div><h4>{c.name||`Grade ${c.grade} ${c.section}`}</h4><p>{students.filter(s=>s.classId===c.id).length} students</p><button className="text-danger" onClick={()=>removeClass(c)}>Delete class</button></article>)}</div>{!classes.length&&<Empty text="No classes yet. Add your first class."/>}
        </section>}
        {page==='teachers' && isAdmin && <section className="panel"><div className="panel-head"><div><h3>Teachers & assignments</h3><p>Create a teacher profile using their Firebase Authentication UID.</p></div></div>
          <div className="setup-note"><strong>Important:</strong> First create the teacher's email/password account in Firebase Console → Authentication. Copy that user's UID, then enter it below. This form does not create Firebase Auth accounts.</div>
          <form className="inline-form" onSubmit={createTeacherRecord}><h4>Register teacher profile</h4><div className="form-grid"><label>Teacher full name<input value={teacherName} onChange={e=>setTeacherName(e.target.value)} required/></label><label>Teacher email<input type="email" value={teacherEmail} onChange={e=>setTeacherEmail(e.target.value)} required/></label><label>Firebase Auth UID<input value={teacherUid} onChange={e=>setTeacherUid(e.target.value)} required/></label></div><div className="form-actions"><button className="primary">Save teacher profile</button></div></form>
          <form className="inline-form" onSubmit={assignTeacher}><h4>Assign teacher to class</h4><div className="form-grid"><label>Teacher UID<input value={teacherUid} onChange={e=>setTeacherUid(e.target.value)} required/></label><label>Class<select value={assignmentClass} onChange={e=>setAssignmentClass(e.target.value)} required><option value="">Choose class</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div><div className="form-actions"><button className="primary">Save assignment</button></div></form>
          <div className="table-wrap"><table><thead><tr><th>Teacher</th><th>Email</th><th>Assigned classes</th><th>UID</th></tr></thead><tbody>{teachers.map(t=><tr key={t.id}><td><strong>{t.name}</strong></td><td>{t.email}</td><td>{assignments.filter(a=>a.teacherId===t.id).map(a=>a.className||classes.find(c=>c.id===a.classId)?.name).join(', ')||'—'}</td><td className="uid">{t.uid}</td></tr>)}</tbody></table></div>
        </section>}
        {page==='reports' && <section className="panel"><div className="panel-head"><div><h3>Attendance reports</h3><p>Review daily attendance and export the selected date.</p></div><button className="outline" onClick={downloadCsv}><Download size={16}/> Export CSV</button></div><div className="toolbar"><label>Class<select value={selectedClass} onChange={e=>setSelectedClass(e.target.value)}><option value="">All classes</option>{myClasses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Date<input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}/></label></div><div className="stats-grid compact"><Stat title="Present" value={dateRecords.filter(a=>a.status==='Present').length} tone="green"/><Stat title="Late" value={dateRecords.filter(a=>a.status==='Late').length} tone="amber"/><Stat title="Absent" value={dateRecords.filter(a=>a.status==='Absent').length} tone="red"/><Stat title="Excused" value={dateRecords.filter(a=>a.status==='Excused').length} tone="purple"/></div><div className="table-wrap"><table><thead><tr><th>Student</th><th>Class</th><th>Date</th><th>Status</th></tr></thead><tbody>{dateRecords.filter(a=>profile.role!=='student'||a.studentId===profile.studentId).map(a=><tr key={a.id}><td>{a.studentName||students.find(s=>s.id===a.studentId)?.name||'Student'}</td><td>{classes.find(c=>c.id===a.classId)?.name||'—'}</td><td>{a.date}</td><td><Status status={a.status}/></td></tr>)}</tbody></table></div>{!dateRecords.length&&<Empty text="No attendance records for this date and class."/>}</section>}
      </div>
      <footer className="footer">Data Sana Memorial School <span>•</span> “To Seek, Know and Serve”</footer>
    </main>
  </div>;
}

function Overview({stats, classes, students, attendance, profile, setPage}) {
  const recent = [...attendance].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,6);
  return <div className="overview">
    <section className="welcome"><div><p className="eyebrow light">WELCOME BACK</p><h1>{profile.name || 'School user'}</h1><p>Manage attendance records for Data Sana Memorial School.</p></div><div className="welcome-icon"><School size={42}/></div></section>
    {profile.role==='student' ? <div className="panel"><h3>My attendance</h3><p className="muted">Your attendance history is available in Reports.</p><button className="primary" onClick={()=>setPage('reports')}>View my attendance</button></div> : <>
      <div className="stats-grid"><Stat title="Total students" value={stats.students} tone="purple" icon={<Users size={20}/>} /><Stat title="Classes" value={stats.classes} tone="blue" icon={<School size={20}/>} /><Stat title="Present records" value={stats.present} tone="green" icon={<Check size={20}/>} /><Stat title="Overall attendance" value={`${stats.rate}%`} tone="amber" icon={<Activity size={20}/>} /></div>
      <div className="overview-grid"><section className="panel"><div className="panel-head"><div><h3>Quick actions</h3><p>Common tasks</p></div></div><div className="quick-list"><button onClick={()=>setPage('attendance')}><span className="quick-icon purple-bg"><ClipboardList size={19}/></span><span><strong>Take attendance</strong><small>Mark a class for a selected date</small></span><ChevronDown className="quick-arrow" size={17}/></button><button onClick={()=>setPage('students')}><span className="quick-icon blue-bg"><Users size={19}/></span><span><strong>Student directory</strong><small>Search student records</small></span><ChevronDown className="quick-arrow" size={17}/></button>{profile.role==='admin'&&<button onClick={()=>setPage('classes')}><span className="quick-icon green-bg"><School size={19}/></span><span><strong>Manage classes</strong><small>Create classes and sections</small></span><ChevronDown className="quick-arrow" size={17}/></button>}<button onClick={()=>setPage('reports')}><span className="quick-icon amber-bg"><CalendarDays size={19}/></span><span><strong>View reports</strong><small>Review and export attendance</small></span><ChevronDown className="quick-arrow" size={17}/></button></div></section>
      <section className="panel"><div className="panel-head"><div><h3>Recent attendance</h3><p>Latest saved records</p></div><button className="link-btn" onClick={()=>setPage('reports')}>View all</button></div>{recent.length?<div className="recent-list">{recent.map(r=><div className="recent-row" key={r.id}><div className="recent-avatar">{(r.studentName||'S').slice(0,1)}</div><div className="recent-info"><strong>{r.studentName||'Student'}</strong><small>{r.date} · {classes.find(c=>c.id===r.classId)?.name||'Class'}</small></div><Status status={r.status}/></div>)}</div>:<Empty text="No attendance records yet."/>}</section></div>
    </>}
  </div>;
}
function Stat({title,value,tone,icon}) { return <div className="stat-card"><div className={`stat-icon ${tone}`}>{icon||<Activity size={20}/>}</div><div><p>{title}</p><strong>{value}</strong></div></div>; }
function Status({status}) { if(!status) return <span className="status neutral">Not marked</span>; return <span className={`status ${status.toLowerCase()}`}>{status}</span>; }
function Empty({text}) { return <div className="empty-state"><ClipboardList size={27}/><p>{text}</p></div>; }
