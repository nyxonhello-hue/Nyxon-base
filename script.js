/* =====================================================
   NYXON BASE — Resume Studio
   script.js — Complete State & Render Engine
   =====================================================

   This JavaScript file contains the entire client-side application logic
   for the resume builder. It handles:
   - application state and mode selection
   - dynamic form rendering for experience, education, certifications, skills,
     cover letters, and portfolio projects
   - live preview updates for resume, CV, cover letter, and portfolio modes
   - template selection and rendering for multiple design styles
   - data sanitization and PDF export integration through html2pdf

   The file is organized into sections:
   1. STATE: in-memory data objects that represent the current user inputs.
   2. TEMPLATE DEFINITIONS: available design options for resume, cover, and portfolio.
   3. INIT: startup logic executed when the page loads.
   4. UI CONTROLS: functions that toggle sections, handle inputs, and switch modes.
   5. DATA HELPERS: utility helpers for reading form fields and formatting data.
   6. RENDERERS: functions that build the HTML string for each document style.
*/

// ── STATE ──────────────────────────────────────────────
// currentMode: selected top-level document type (resume, cv, cover, portfolio)
let currentMode     = 'resume';
// currentTemplate: selected resume visual style for resume/cv modes
let currentTemplate = 'modern';
// currentCoverStyle: selected cover letter layout style
let currentCoverStyle   = 'editorial';
// currentPortStyle: selected portfolio layout style
let currentPortStyle    = 'agency';

// Data arrays hold repeatable items for the document.
let experiences  = [];
let educations   = [];
let certifications = [];
let skills       = [];
let projects     = [];
let references   = [];

// Provide a safe global loader API early so UI handlers can call it
// even if the real loader is defined later in the file. Calls will be
// queued and executed once the real loader is available.
if (!window.loadDemoData) {
  // hold any demo requests that occur before the real loader is defined
  window._queuedDemoProfiles = window._queuedDemoProfiles || [];
  window.loadDemoData = function(profile) {
    // If a demo was already loaded, ignore further requests
      // allow multiple demo loads; do not block if one was previously loaded
    if (window.__realLoadDemo && typeof window.__realLoadDemo === 'function') {
      return window.__realLoadDemo(profile);
    }
    // queue the request for later (support a single queued demo)
    if (!window._queuedDemoProfiles.includes(profile)) {
      window._queuedDemoProfiles.push(profile);
      console.warn('loadDemoData called before loader ready, queued:', profile);
      // show a non-blocking toast if the toast helper exists
      if (typeof showToast === 'function') showToast(`Demo queued: ${profile}`);
      // add a visible demo log entry if the UI helper exists
      if (typeof demoLogAdd === 'function') demoLogAdd(profile, 'queued');
    } else {
      try { if (typeof showToast === 'function') showToast('Demo already queued'); } catch (e) {}
    }
  };
}

// Helper to append entries to the demo log UI (if present)
function demoLogAdd(profile, status) {
  try {
    const el = document.getElementById('demoLog');
    if (!el) return;
    const div = document.createElement('div');
    div.className = 'demo-log-entry ' + (status === 'processed' ? 'processed' : (status === 'error' ? 'error' : 'queued'));
    const ts = new Date().toLocaleTimeString();
    div.textContent = `${ts} — ${status === 'processed' ? 'Loaded' : (status === 'error' ? 'Error' : 'Queued')}: ${profile}`;
    el.prepend(div);
    // auto-expire after 6s with fade
    setTimeout(() => {
      try {
        div.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        div.style.opacity = '0';
        div.style.transform = 'translateY(-6px)';
        setTimeout(() => { try { div.remove(); } catch(e){} }, 420);
      } catch (e) {}
    }, 6000);
  } catch (e) { /* ignore logging errors */ }
}

// Loader readiness flag & helper
window.loaderReady = false;
function setLoaderReady(val) {
  window.loaderReady = !!val;
  const btn = document.getElementById('loadDemoBtn');
  if (btn) {
    if (window.loaderReady) btn.removeAttribute('disabled');
    else btn.setAttribute('disabled', '');
  }
  try { if (window.loaderReady && typeof demoLogAdd === 'function') demoLogAdd('loader','processed'); } catch (e) {}
}

// Validate that expected form IDs/containers exist and log missing ones
function validateFormIds(list) {
  if (!Array.isArray(list)) return true;
  const missing = [];
  list.forEach(id => { if (!document.getElementById(id)) missing.push(id); });
  if (missing.length) {
    missing.forEach(id => {
      console.warn('Missing form element:', id);
      try { if (typeof demoLogAdd === 'function') demoLogAdd(id, 'error'); } catch (e) {}
    });
    return false;
  }
  return true;
}

// Reset demo state: allow demo to be loaded again for testing
// resetDemoState removed — demo loader is reusable by default

// Cover letter object holds the typed sections for a cover letter mode.
let coverLetter  = { company:'', role:'', intro:'', body:'', closing:'' };

// ── TEMPLATE DEFINITIONS ───────────────────────────────
const TEMPLATES = [
  { id:'modern',    name:'Modern',    sub:'Two-col',  thumb:'bg-gradient-to-br from-slate-800 to-slate-900', icon:'◐' },
  { id:'classic',   name:'Classic',   sub:'Serif',    thumb:'bg-white border border-slate-300',              icon:'❡' },
  { id:'minimal',   name:'Minimal',   sub:'Airy',     thumb:'bg-slate-50',                                   icon:'—' },
  { id:'executive', name:'Executive', sub:'Premium',  thumb:'bg-gradient-to-br from-stone-800 to-amber-900', icon:'◆' },
  { id:'creative',  name:'Creative',  sub:'Bold',     thumb:'bg-gradient-to-br from-rose-600 to-pink-400',   icon:'✦' },
  { id:'technical', name:'Technical', sub:'Dev',      thumb:'bg-slate-950 font-mono',                        icon:'<>' },
  { id:'academic',  name:'Academic',  sub:'Scholarly',thumb:'bg-amber-50 border border-amber-200',           icon:'∂' },
  { id:'ats',       name:'ATS Safe',  sub:'Clean',    thumb:'bg-white border-2 border-green-400',            icon:'✓' },
  { id:'startup',   name:'Startup',   sub:'Energy',   thumb:'bg-gradient-to-r from-cyan-500 to-violet-600',  icon:'⚡' },
  { id:'corporate', name:'Corporate', sub:'Refined',  thumb:'bg-gradient-to-br from-slate-700 to-blue-900',  icon:'▦' },
  { id:'freelance', name:'Freelance', sub:'Studio',   thumb:'bg-gradient-to-br from-amber-400 to-orange-500',icon:'◈' },
  { id:'editorial', name:'Editorial', sub:'Magazine', thumb:'bg-gradient-to-br from-violet-700 to-fuchsia-600',icon:'⊞' },
];

const COVER_STYLES = [
  { id:'editorial',  name:'Editorial',  sub:'Magazine-style opener' },
  { id:'classic',    name:'Classic',    sub:'Traditional business letter' },
  { id:'modern',     name:'Modern',     sub:'Clean card layout' },
  { id:'creative',   name:'Creative',   sub:'Bold dark design' },
  { id:'minimalist', name:'Minimalist', sub:'Stripped to essence' },
  { id:'executive',  name:'Executive',  sub:'Premium dark header' },
  { id:'warm',       name:'Warm',       sub:'Friendly & approachable' },
  { id:'technical',  name:'Technical',  sub:'Clean monospace style' },
];

const PORT_STYLES = [
  { id:'agency',     name:'Agency',     sub:'Immersive dark showcase' },
  { id:'gallery',    name:'Gallery',    sub:'Light card grid' },
  { id:'casestudy',  name:'Case Study', sub:'Deep-dive narrative' },
  { id:'bold',       name:'Bold',       sub:'Full-bleed impact' },
  { id:'minimal',    name:'Minimal',    sub:'Text-first clarity' },
];

// ── INIT ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();

  // no-op: demo menu handled inline

  buildTemplateGrid();
  buildCoverStyleGrid();
  buildPortStyleGrid();
  addExperience();
  addEducation();
  addCertification();
  addReference();

  // Collapse all sidebar panels on first load
  collapseAllSidebarPanels();

  setMode('resume');
  updatePreview();
});

// ── THEME (Light / Dark) ────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('nyxon-theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved === 'light' || saved === 'dark' ? saved : (prefersDark ? 'dark' : 'light');
  setTheme(theme, { persist: false });
}

window.setTheme = function(theme, opts = {}) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  const persist = opts.persist !== false;
  if (persist) localStorage.setItem('nyxon-theme', t);

  const darkBtn = document.getElementById('theme-btn-dark');
  const lightBtn = document.getElementById('theme-btn-light');
  if (darkBtn) darkBtn.classList.toggle('active', t === 'dark');
  if (lightBtn) lightBtn.classList.toggle('active', t === 'light');
};

// Ensure default theme attribute exists early (before CSS loads)
(function ensureThemeAttr() {
  if (!document.documentElement.getAttribute('data-theme')) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();


// ── SECTION COLLAPSE ───────────────────────────────────
function toggleSection(secId) {
  let body = document.querySelector(`#${secId} .section-body`);
  if (!body) body = document.getElementById(`${secId}-body`);
  if (!body) return;
  const section = body.closest('.sidebar-section');
  const chevron = section ? section.querySelector('.section-chevron') : document.querySelector(`#${secId} .section-chevron`);
  const isCollapsed = body.classList.contains('collapsed');
  body.classList.toggle('collapsed');
  if (chevron) chevron.style.transform = isCollapsed ? '' : 'rotate(-90deg)';
}

function collapseAllSidebarPanels() {
  document.querySelectorAll('#sidebar .sidebar-section .section-body').forEach(body => {
    body.classList.add('collapsed');

    const section = body.closest('.sidebar-section');
    const chevron = section ? section.querySelector('.section-chevron') : null;
    if (chevron) chevron.style.transform = 'rotate(-90deg)';
  });
}


// ── TEMPLATE GRID ──────────────────────────────────────
function buildTemplateGrid() {
  const grid = document.getElementById('templateGrid');
  grid.innerHTML = TEMPLATES.map(t => `
    <div class="tpl-card ${t.id === currentTemplate ? 'active' : ''}" id="tpl-${t.id}" onclick="setTemplate('${t.id}')">
      <div class="tpl-thumb ${t.thumb}" style="font-size:14px;color:white;letter-spacing:-0.02em;">${t.icon}</div>
      <div class="tpl-name">${t.name}</div>
      <div class="tpl-sub">${t.sub}</div>
    </div>
  `).join('');
}

function buildCoverStyleGrid() {
  const grid = document.getElementById('coverStyleGrid');
  grid.innerHTML = COVER_STYLES.map(s => `
    <div class="style-card ${s.id === currentCoverStyle ? 'active' : ''}" id="cvr-${s.id}" onclick="setCoverStyle('${s.id}')">
      <div class="style-card-name">${s.name}</div>
      <div class="style-card-sub">${s.sub}</div>
    </div>
  `).join('');
}

function buildPortStyleGrid() {
  const grid = document.getElementById('portStyleGrid');
  grid.innerHTML = PORT_STYLES.map(s => `
    <div class="style-card ${s.id === currentPortStyle ? 'active' : ''}" id="prt-${s.id}" onclick="setPortStyle('${s.id}')">
      <div class="style-card-name">${s.name}</div>
      <div class="style-card-sub">${s.sub}</div>
    </div>
  `).join('');
}

function setTemplate(id) {
  currentTemplate = id;
  document.querySelectorAll('.tpl-card').forEach(c => c.classList.toggle('active', c.id === `tpl-${id}`));
    const selectedCard = document.getElementById(`tpl-${id}`);
  if (selectedCard) selectedCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  updatePreview();
}

function setCoverStyle(id) {
  currentCoverStyle = id;
  document.querySelectorAll('#coverStyleGrid .style-card').forEach(c => c.classList.toggle('active', c.id === `cvr-${id}`));
  updatePreview();
}

function setPortStyle(id) {
  currentPortStyle = id;
  document.querySelectorAll('#portStyleGrid .style-card').forEach(c => c.classList.toggle('active', c.id === `prt-${id}`));
  updatePreview();
}

// ── MODE ───────────────────────────────────────────────
function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.mode-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.mode === mode);
  });

  // show/hide sidebar panels
  document.getElementById('sec-template').style.display    = (mode==='resume'||mode==='cv') ? '' : 'none';
  document.getElementById('sec-cover-style').style.display = mode==='cover'     ? '' : 'none';
  document.getElementById('sec-port-style').style.display  = mode==='portfolio' ? '' : 'none';
  const refsEl = document.getElementById('sec-refs');
  if (refsEl) refsEl.style.display = mode==='cv' ? '' : 'none';
  document.getElementById('sec-refs').style.display       = mode==='cv' ? '' : 'none';
  document.getElementById('sec-exp-wrap').style.display    = (mode==='cover') ? 'none' : '';
  document.getElementById('sec-edu-wrap').style.display    = (mode==='cover') ? 'none' : '';
  document.getElementById('sec-skills').style.display      = (mode==='cover') ? 'none' : '';
  document.getElementById('sec-cert').style.display        = (mode==='cover' || mode==='portfolio') ? 'none' : '';
  document.getElementById('sec-cover-fields').style.display = mode==='cover'    ? '' : 'none';
  const pf = document.getElementById('personalFields');
  if (pf) pf.style.display = (mode==='cover' || mode==='portfolio') ? 'none' : '';
  document.getElementById('sec-projects').style.display    = mode==='portfolio' ? '' : 'none';
  document.getElementById('targetJobGroup').style.display  = (mode==='resume')  ? '' : 'none';

  if (mode==='portfolio' && projects.length===0) addProject();
  updatePreview();
}

// Demo menu toggle (header)
function toggleDemoMenu(e) {
  e.stopPropagation();
  const m = document.getElementById('demoMenu');
  if (!m) return;
  m.style.display = (m.style.display === 'none' || !m.style.display) ? '' : 'none';
}
document.addEventListener('click', () => {
  const m = document.getElementById('demoMenu'); if (m) m.style.display = 'none';
});

// Wire demo menu buttons (delegated) to ensure profile loading works
(function wireDemoMenu() {
  function attach() {
    const demoMenu = document.getElementById('demoMenu');
    if (!demoMenu) return;
    // avoid double-attaching
    if (demoMenu._demoWired) return; demoMenu._demoWired = true;
    demoMenu.addEventListener('click', (e) => {
      try {
        // ensure we have an Element to call closest on (handle text node clicks)
        let node = e.target;
        while (node && node.nodeType !== 1) node = node.parentNode;
        if (!node) return;
        const btn = node.closest('[data-demo]');
        if (!btn) return;
        const profile = btn.getAttribute('data-demo');
        console.log('Demo menu clicked:', profile);
        // prefer calling a specific per-profile loader (e.g. loadAva) if present
        const pname = String(profile || 'ava').toLowerCase();
        const fnName = 'load' + (pname.charAt(0).toUpperCase() + pname.slice(1));
        if (window && typeof window[fnName] === 'function') {
          window[fnName]();
        } else if (window && typeof window.loadDemoData === 'function') {
          window.loadDemoData(profile);
        } else if (typeof loadDemoData === 'function') {
          loadDemoData(profile);
        } else throw new Error('loadDemoData is not defined');
      } catch (err) {
        console.error('Error loading demo profile', err);
        alert('Failed to load demo: ' + (err && err.message ? err.message : String(err)));
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();

// ── ZOOM ───────────────────────────────────────────────
function updateZoom(val) {
  document.getElementById('preview-scaler').style.transform = `scale(${val})`;
  document.getElementById('zoom-label').textContent = Math.round(val*100) + '%';
}

// ── FORM DATA ──────────────────────────────────────────
function getFormData() {
  return {
    firstName: v('firstName'),
    lastName:  v('lastName'),
    title:     v('title'),
    targetJob: v('targetJob'),
    email:     v('email'),
    phone:     v('phone'),
    location:  v('location'),
    website:   v('website'),
    linkedin:  v('linkedin'),
    github:    v('github'),
    dob:       v('dob'),
    gender:    v('gender'),
    nationality: v('nationality'),
    maritalStatus: v('maritalStatus'),
    languages: v('languages'),
    religion:  v('religion'),
    summary:   v('summary'),
    experiences:    experiences.filter(e => e.company || e.position),
    educations:     educations.filter(e => e.school || e.degree),
    certifications: certifications.filter(c => c.name),
    skills,
    coverLetter,
    projects: projects.filter(p => p.name || p.description),
    references: references.filter(r => r.name || r.email || r.institution || r.number),
  };
}
function v(id) { return (document.getElementById(id)||{}).value || ''; }
function fullName(d) { return (`${d.firstName} ${d.lastName}`).trim() || 'Your Name'; }

// highlight skill if it appears in target job
function isHighlighted(skill, data) {
  if (!data.targetJob) return false;
  return data.targetJob.toLowerCase().includes(skill.toLowerCase());
}

// ── EXPERIENCE ─────────────────────────────────────────
function addExperience() {
  experiences.push({ id: Date.now(), company:'', position:'', startDate:'', endDate:'', description:'' });
  renderExperienceInputs();
}
function removeExperience(id) {
  experiences = experiences.filter(e => e.id !== id);
  renderExperienceInputs(); updatePreview();
}
function updateExperience(id, field, value) {
  const e = experiences.find(e => e.id === id);
  if (e) { e[field] = value; updatePreview(); }
}
function renderExperienceInputs() {
  document.getElementById('expList').innerHTML = experiences.map((e,i) => `
    <div class="rep-item">
      <div class="rep-item-header">
        <span>Position ${i+1}</span>
        <button class="btn-remove" onclick="removeExperience(${e.id})">Remove</button>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Company</label>
          <input class="form-input" value="${esc(e.company)}" oninput="updateExperience(${e.id},'company',this.value)" placeholder="Acme Inc.">
        </div>
        <div class="form-group">
          <label class="form-label">Position</label>
          <input class="form-input" value="${esc(e.position)}" oninput="updateExperience(${e.id},'position',this.value)" placeholder="Senior Designer">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Start</label>
          <input class="form-input" value="${esc(e.startDate)}" oninput="updateExperience(${e.id},'startDate',this.value)" placeholder="Jan 2022">
        </div>
        <div class="form-group">
          <label class="form-label">End</label>
          <input class="form-input" value="${esc(e.endDate)}" oninput="updateExperience(${e.id},'endDate',this.value)" placeholder="Present">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea class="form-textarea" oninput="updateExperience(${e.id},'description',this.value)" placeholder="Key responsibilities and achievements…">${esc(e.description)}</textarea>
      </div>
    </div>
  `).join('');
}

// ── EDUCATION ──────────────────────────────────────────
function addEducation() {
  educations.push({ id: Date.now(), school:'', degree:'', field:'', year:'' });
  renderEducationInputs();
}
function removeEducation(id) {
  educations = educations.filter(e => e.id !== id);
  renderEducationInputs(); updatePreview();
}
function updateEducation(id, field, value) {
  const e = educations.find(e => e.id === id);
  if (e) { e[field] = value; updatePreview(); }
}
function renderEducationInputs() {
  document.getElementById('eduList').innerHTML = educations.map((e,i) => `
    <div class="rep-item">
      <div class="rep-item-header">
        <span>Degree ${i+1}</span>
        <button class="btn-remove" onclick="removeEducation(${e.id})">Remove</button>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">School</label>
          <input class="form-input" value="${esc(e.school)}" oninput="updateEducation(${e.id},'school',this.value)" placeholder="MIT">
        </div>
        <div class="form-group">
          <label class="form-label">Year</label>
          <input class="form-input" value="${esc(e.year)}" oninput="updateEducation(${e.id},'year',this.value)" placeholder="2020">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Degree</label>
          <input class="form-input" value="${esc(e.degree)}" oninput="updateEducation(${e.id},'degree',this.value)" placeholder="B.S.">
        </div>
        <div class="form-group">
          <label class="form-label">Field</label>
          <input class="form-input" value="${esc(e.field)}" oninput="updateEducation(${e.id},'field',this.value)" placeholder="Computer Science">
        </div>
      </div>
    </div>
  `).join('');
}

// ── CERTIFICATIONS ─────────────────────────────────────
function addCertification() {
  certifications.push({ id: Date.now(), name:'', issuer:'', year:'' });
  renderCertificationInputs();
}
function removeCertification(id) {
  certifications = certifications.filter(c => c.id !== id);
  renderCertificationInputs(); updatePreview();
}
function updateCertification(id, field, value) {
  const c = certifications.find(c => c.id === id);
  if (c) { c[field] = value; updatePreview(); }
}
function renderCertificationInputs() {
  document.getElementById('certList').innerHTML = certifications.map((c,i) => `
    <div class="rep-item">
      <div class="rep-item-header">
        <span>Cert ${i+1}</span>
        <button class="btn-remove" onclick="removeCertification(${c.id})">Remove</button>
      </div>
      <div class="form-group">
        <label class="form-label">Certificate Name</label>
        <input class="form-input" value="${esc(c.name)}" oninput="updateCertification(${c.id},'name',this.value)" placeholder="AWS Solutions Architect">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Issuer</label>
          <input class="form-input" value="${esc(c.issuer)}" oninput="updateCertification(${c.id},'issuer',this.value)" placeholder="Amazon">
        </div>
        <div class="form-group">
          <label class="form-label">Year</label>
          <input class="form-input" value="${esc(c.year)}" oninput="updateCertification(${c.id},'year',this.value)" placeholder="2023">
        </div>
      </div>
    </div>
  `).join('');
}

// ── REFERENCES (CV) ───────────────────────────────────
function addReference() {
  references.push({ id: Date.now(), name:'', title:'', institution:'', email:'', number:'' });
  renderReferenceInputs();
}
function removeReference(id) {
  references = references.filter(r => r.id !== id);
  renderReferenceInputs(); updatePreview();
}
function updateReference(id, field, value) {
  const r = references.find(x => x.id === id);
  if (r) { r[field] = value; updatePreview(); }
}
function renderReferenceInputs() {
  const container = document.getElementById('refsList');
  if (!container) return;
  container.innerHTML = references.map((r,i) => `
    <div class="rep-item">
      <div class="rep-item-header">
        <span>Reference ${i+1}</span>
        <button class="btn-remove" onclick="removeReference(${r.id})">Remove</button>
      </div>
      <div class="form-group">
        <label class="form-label">Name</label>
        <input class="form-input" value="${esc(r.name)}" oninput="updateReference(${r.id},'name',this.value)" placeholder="Dr. Jane Doe">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Title</label>
          <input class="form-input" value="${esc(r.title)}" oninput="updateReference(${r.id},'title',this.value)" placeholder="Professor of Design">
        </div>
        <div class="form-group">
          <label class="form-label">Institution</label>
          <input class="form-input" value="${esc(r.institution)}" oninput="updateReference(${r.id},'institution',this.value)" placeholder="University of Example">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-input" value="${esc(r.email)}" oninput="updateReference(${r.id},'email',this.value)" placeholder="jane.doe@example.edu">
        </div>
        <div class="form-group">
          <label class="form-label">Phone</label>
          <input class="form-input" value="${esc(r.number)}" oninput="updateReference(${r.id},'number',this.value)" placeholder="+1 555 000 0000">
        </div>
      </div>
    </div>
  `).join('');
}

// ── SKILLS ─────────────────────────────────────────────
function handleSkillKeypress(e) { if (e.key==='Enter') addSkill(); }
function addSkill() {
  const input = document.getElementById('skillInput');
  const val = input.value.trim();
  if (val && !skills.includes(val)) {
    skills.push(val);
    renderSkills(); updatePreview();
  }
  input.value = '';
}
function removeSkill(skill) {
  skills = skills.filter(s => s !== skill);
  renderSkills(); updatePreview();
}
function renderSkills() {
  document.getElementById('skillTags').innerHTML = skills.map(s => `
    <span class="skill-tag">
      ${esc(s)}
      <button class="skill-tag-remove" onclick="removeSkill('${esc(s)}')" title="Remove">
        <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </span>
  `).join('');
}

// ── PROJECTS ───────────────────────────────────────────
function addProject() {
  projects.push({ id: Date.now(), name:'', role:'', description:'', problem:'', outcome:'', link:'', year:'' });
  renderProjectInputs();
}
function removeProject(id) {
  projects = projects.filter(p => p.id !== id);
  renderProjectInputs(); updatePreview();
}
function updateProject(id, field, value) {
  const p = projects.find(p => p.id === id);
  if (p) { p[field] = value; updatePreview(); }
}
function renderProjectInputs() {
  document.getElementById('projList').innerHTML = projects.map((p,i) => `
    <div class="rep-item">
      <div class="rep-item-header">
        <span>${p.name || `Project ${i+1}`}</span>
        <button class="btn-remove" onclick="removeProject(${p.id})">Remove</button>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Project Name</label>
          <input class="form-input" value="${esc(p.name)}" oninput="updateProject(${p.id},'name',this.value)" placeholder="e.g. Nyxon Dashboard">
        </div>
        <div class="form-group">
          <label class="form-label">Year</label>
          <input class="form-input" value="${esc(p.year)}" oninput="updateProject(${p.id},'year',this.value)" placeholder="2024">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Your Role</label>
          <input class="form-input" value="${esc(p.role)}" oninput="updateProject(${p.id},'role',this.value)" placeholder="e.g. Lead Designer">
        </div>
        <div class="form-group">
          <label class="form-label">Live Link</label>
          <input class="form-input" value="${esc(p.link)}" oninput="updateProject(${p.id},'link',this.value)" placeholder="myapp.com">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">What you built</label>
        <textarea class="form-textarea" oninput="updateProject(${p.id},'description',this.value)" placeholder="Describe what the project is and what you specifically built or designed…">${esc(p.description)}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Problem it solved</label>
        <textarea class="form-textarea" oninput="updateProject(${p.id},'problem',this.value)" placeholder="What challenge or problem did this project address?">${esc(p.problem)}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Outcome & Impact</label>
        <textarea class="form-textarea" oninput="updateProject(${p.id},'outcome',this.value)" placeholder="Results and impact — use numbers where possible (e.g. 40% faster, 12k users)">${esc(p.outcome)}</textarea>
      </div>
    </div>
  `).join('');
}

// ── COVER LETTER ───────────────────────────────────────
function updateCoverLetter(field, value) {
  coverLetter[field] = value;
  updatePreview();
}

// ── AI TOAST ───────────────────────────────────────────
// Show a small toast; optional `msg` overrides default text.
function showToast(msg) {
  const t = document.getElementById('ai-toast');
  if (!t) return;
  const span = t.querySelector('span');
  if (span) span.textContent = msg || 'Nyxon is refreshing your document…';
  t.classList.remove('hidden');
  // auto-hide after a short duration
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(() => t.classList.add('hidden'), 2000);
}

// ── MAIN RENDER DISPATCHER ─────────────────────────────
// The updatePreview() function is the central render loop.
// It collects the current form data, chooses the right renderer based on
// the selected mode and template, and updates the preview pane HTML.
function updatePreview() {
  const data = getFormData();
  const el = document.getElementById('resumePreview');
  if (currentMode === 'cover')     el.innerHTML = renderCoverLetter(data);
  else if (currentMode === 'portfolio') el.innerHTML = renderPortfolio(data);
  else {
    // Both 'resume' and 'cv' use the template renderers
    // CV mode uses 'academic' template by default but respects user template choice
    const renderers = {
      modern: renderModern, classic: renderClassic, minimal: renderMinimal,
      executive: renderExecutive, creative: renderCreative, technical: renderTechnical,
      academic: renderAcademic, ats: renderATS, startup: renderStartup,
      corporate: renderCorporate, freelance: renderFreelance, editorial: renderEditorial,
    };
    // For CV mode, if template is 'modern' (default), use the dedicated CV renderer
    if (currentMode === 'cv' && currentTemplate === 'modern') {
      el.innerHTML = renderCV(data);
    } else {
      el.innerHTML = (renderers[currentTemplate] || renderModern)(data);
    }
  }
}

// ── UTILS ──────────────────────────────────────────────
function esc(s='') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function contactLine(d, sep=' · ') {
  const parts = [];
  if (d.email) parts.push(esc(d.email));
  if (d.phone) parts.push(esc(d.phone));
  if (d.location) parts.push(esc(d.location));
  if (d.website) parts.push(makeLink(d.website, d.website));
  if (d.linkedin) parts.push(makeLink(d.linkedin, d.linkedin));
  if (d.github) parts.push(makeLink(d.github, d.github));
  return parts.filter(Boolean).join(sep);
}

function normalizeUrl(u) {
  if (!u) return '';
  const trimmed = String(u).trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return 'https://' + trimmed.replace(/^\/+/, '');
}

function makeLink(url, label) {
  const href = normalizeUrl(url);
  return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;">${esc(label)}</a>`;
}

function personalBlock(d, theme='modern') {
  const items = [];
  if (d.dob) items.push(`<div style="font-size:12px;color:${theme==='modern'?'#94a3b8':'#6b7280'};"><strong>Date of Birth:</strong> ${esc(d.dob)}</div>`);
  if (d.gender) items.push(`<div style="font-size:12px;color:${theme==='modern'?'#94a3b8':'#6b7280'};"><strong>Gender:</strong> ${esc(d.gender)}</div>`);
  if (d.nationality) items.push(`<div style="font-size:12px;color:${theme==='modern'?'#94a3b8':'#6b7280'};"><strong>Nationality:</strong> ${esc(d.nationality)}</div>`);
  if (d.maritalStatus) items.push(`<div style="font-size:12px;color:${theme==='modern'?'#94a3b8':'#6b7280'};"><strong>Marital Status:</strong> ${esc(d.maritalStatus)}</div>`);
  if (d.languages) items.push(`<div style="font-size:12px;color:${theme==='modern'?'#94a3b8':'#6b7280'};"><strong>Languages:</strong> ${esc(d.languages)}</div>`);
  if (d.religion) items.push(`<div style="font-size:12px;color:${theme==='modern'?'#94a3b8':'#6b7280'};"><strong>Religion:</strong> ${esc(d.religion)}</div>`);
  if (!items.length) return '';
  return `<div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">${items.join('')}</div>`;
}
function dateRange(exp) {
  if (!exp.startDate && !exp.endDate) return '';
  if (!exp.endDate) return exp.startDate;
  return `${exp.startDate} – ${exp.endDate}`;
}

// ─────────────────────────────────────────────────────
// RESUME RENDERERS
// Each has a completely distinct layout, typography, and visual language
// ─────────────────────────────────────────────────────

// ── MODERN: Dark sidebar left, clean right ─────────────
function renderModern(data) {
  const name = fullName(data);
  return `<div style="display:flex;min-height:297mm;font-family:'DM Sans',sans-serif;">
    <div style="width:38%;background:#0f172a;color:white;padding:36px 28px;display:flex;flex-direction:column;gap:24px;">
      <div>
        <div style="font-family:'Syne',sans-serif;font-size:26px;font-weight:800;line-height:1.1;letter-spacing:-0.03em;">${name}</div>
        ${data.title ? `<div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#7dd3fc;margin-top:8px;">${data.title}</div>` : ''}
      </div>
      <div style="height:2px;background:linear-gradient(90deg,#8b5cf6,#06b6d4);border-radius:2px;"></div>
      ${contactBlock(data, 'modern')}
      ${personalBlock(data, 'modern')}
      ${data.skills.length ? `
      <div>
        <div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#475569;margin-bottom:12px;font-weight:700;">Skills</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;">
          ${data.skills.map(s => `<span style="padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;
            ${isHighlighted(s,data) ? 'background:#7c3aed;color:white;' : 'background:rgba(255,255,255,0.07);color:#cbd5e1;'}">${s}</span>`).join('')}
        </div>
      </div>` : ''}
      ${data.educations.length ? `
      <div>
        <div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#475569;margin-bottom:10px;font-weight:700;">Education</div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${data.educations.map(e => `<div>
            <div style="font-size:13px;font-weight:600;color:white;">${e.school||'School'}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${e.degree||''}${e.degree&&e.field?' — ':''}${e.field||''}</div>
            ${e.year ? `<div style="font-size:10px;color:#475569;margin-top:2px;">${e.year}</div>` : ''}
          </div>`).join('')}
        </div>
      </div>` : ''}
      ${data.certifications.length ? `
      <div>
        <div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#475569;margin-bottom:10px;font-weight:700;">Certifications</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${data.certifications.map(c => `<div>
            <div style="font-size:12px;color:#e2e8f0;font-weight:500;">${c.name}</div>
            <div style="font-size:10px;color:#64748b;">${c.issuer||''}${c.issuer&&c.year?' · ':''}${c.year||''}</div>
          </div>`).join('')}
        </div>
      </div>` : ''}
    </div>
    <div style="width:62%;background:white;padding:40px 36px;display:flex;flex-direction:column;gap:24px;">
      ${data.targetJob ? `<div style="padding:8px 14px;background:#f0fdf4;border-left:3px solid #22c55e;font-size:11px;color:#166534;">Targeting: ${data.targetJob}</div>` : ''}
      ${data.summary ? `
      <div>
        <div style="font-size:9px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#1e293b;margin-bottom:10px;display:flex;align-items:center;gap:8px;">
          <span style="display:inline-block;width:20px;height:2px;background:#8b5cf6;"></span>PROFILE
        </div>
        <div style="font-size:13px;color:#475569;line-height:1.7;">${data.summary}</div>
      </div>` : ''}
      ${data.experiences.length ? `
      <div>
        <div style="font-size:9px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#1e293b;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
          <span style="display:inline-block;width:20px;height:2px;background:#8b5cf6;"></span>EXPERIENCE
        </div>
        <div style="display:flex;flex-direction:column;gap:20px;">
          ${data.experiences.map(e => `
          <div style="padding-left:14px;border-left:2px solid #e2e8f0;position:relative;">
            <div style="position:absolute;left:-5px;top:3px;width:8px;height:8px;border-radius:50%;background:#8b5cf6;"></div>
            <div style="font-size:14px;font-weight:700;color:#0f172a;">${e.position||'Position'}</div>
            <div style="font-size:12px;color:#8b5cf6;font-weight:600;margin-top:2px;">${e.company||'Company'}</div>
            ${dateRange(e) ? `<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;margin-top:4px;">${dateRange(e)}</div>` : ''}
            ${e.description ? `<div style="font-size:12px;color:#64748b;line-height:1.7;margin-top:6px;">${e.description}</div>` : ''}
          </div>`).join('')}
        </div>
      </div>` : ''}
    </div>
  </div>`;
}

function contactBlock(data, theme='modern') {
  const items = [
    data.email    ? { icon:'✉', val: data.email } : null,
    data.phone    ? { icon:'✆', val: data.phone } : null,
    data.location ? { icon:'⌖', val: data.location } : null,
    data.website  ? { icon:'⊕', val: data.website, href: normalizeUrl(data.website) } : null,
    data.linkedin ? { icon:'in', val: data.linkedin, href: normalizeUrl(data.linkedin) } : null,
    data.github   ? { icon:'gh', val: data.github, href: normalizeUrl(data.github) } : null,
  ].filter(Boolean);
  if (!items.length) return '';
  const textColor = theme==='modern' ? '#94a3b8' : '#64748b';
  return `<div style="display:flex;flex-direction:column;gap:7px;">
    <div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#475569;margin-bottom:4px;font-weight:700;">Contact</div>
    ${items.map(i => `<div style="display:flex;align-items:center;gap:8px;font-size:11px;color:${textColor};">
      <span style="font-size:12px;opacity:0.7;">${i.icon}</span>${i.href?makeLink(i.href, i.val):esc(i.val)}
    </div>`).join('')}
  </div>`;
}

// ── CLASSIC: Serif centered header, traditional layout ─
function renderClassic(data) {
  const name = fullName(data);
  return `<div style="padding:48px 56px;min-height:297mm;background:white;font-family:'EB Garamond',Georgia,serif;color:#1a1a2a;">
    <div style="text-align:center;padding-bottom:20px;border-bottom:2px solid #1a1a2a;margin-bottom:28px;">
      <div style="font-family:'Playfair Display',Georgia,serif;font-size:38px;font-weight:700;letter-spacing:-0.02em;color:#0f172a;">${name}</div>
      ${data.title ? `<div style="font-size:15px;font-style:italic;color:#64748b;margin-top:6px;font-family:'Playfair Display',serif;">${data.title}</div>` : ''}
      ${data.targetJob ? `<div style="font-size:11px;color:#9ca3af;margin-top:4px;font-style:italic;">Targeting: ${data.targetJob}</div>` : ''}
      <div style="margin-top:10px;font-size:12px;color:#64748b;display:flex;justify-content:center;gap:16px;flex-wrap:wrap;">
        ${[data.email,data.phone,data.location,data.website].filter(Boolean).map(v=>`<span>${v}</span>`).join('<span style="color:#d1d5db;">|</span>')}
      </div>
      ${personalBlock(data,'classic')}
    </div>
    ${data.summary ? classicSection('Professional Summary', `<p style="font-size:13.5px;line-height:1.8;color:#374151;text-align:justify;">${data.summary}</p>`) : ''}
    ${data.experiences.length ? classicSection('Professional Experience', data.experiences.map(e => `
      <div style="margin-bottom:18px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
          <div style="font-size:15px;font-weight:600;color:#0f172a;">${e.position||'Position'}</div>
          <div style="font-size:12px;font-style:italic;color:#6b7280;">${dateRange(e)}</div>
        </div>
        <div style="font-size:13px;color:#374151;font-style:italic;margin-top:2px;">${e.company||'Company'}</div>
        ${e.description ? `<div style="font-size:13px;color:#4b5563;line-height:1.7;margin-top:6px;">${e.description}</div>` : ''}
      </div>`).join('')) : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:4px;">
      ${data.educations.length ? classicSection('Education', data.educations.map(e => `
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
          <div><div style="font-size:14px;font-weight:600;color:#0f172a;">${e.school||'School'}</div>
          <div style="font-size:12px;font-style:italic;color:#6b7280;">${e.degree||''}${e.degree&&e.field?', ':''}${e.field||''}</div></div>
          <div style="font-size:12px;color:#9ca3af;">${e.year||''}</div>
        </div>`).join('')) : ''}
      <div>
        ${data.skills.length ? classicSection('Skills', `<div style="display:flex;flex-wrap:wrap;gap:4px;">${data.skills.map(s => `<span style="padding:2px 10px;border:1px solid #d1d5db;border-radius:2px;font-size:12px;color:#374151;${isHighlighted(s,data)?'background:#f0fdf4;border-color:#86efac;':''}"> ${s}</span>`).join('')}</div>`) : ''}
        ${data.certifications.length ? classicSection('Certifications', data.certifications.map(c=>`<div style="font-size:13px;color:#374151;margin-bottom:4px;">${c.name}${c.issuer?` — ${c.issuer}`:''}${c.year?` (${c.year})`:''}</div>`).join('')) : ''}
      </div>
    </div>
  </div>`;
}
function classicSection(title, html) {
  return `<div style="margin-bottom:22px;">
    <div style="font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#1a1a2a;border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin-bottom:12px;font-family:'DM Sans',sans-serif;">${title}</div>
    ${html}
  </div>`;
}

// ── MINIMAL: Extreme whitespace, tiny typography ───────
function renderMinimal(data) {
  const name = fullName(data);
  return `<div style="padding:64px 72px;min-height:297mm;background:#fafafa;font-family:'Outfit',sans-serif;">
    <div style="margin-bottom:40px;">
      <div style="font-size:34px;font-weight:300;letter-spacing:-0.04em;color:#111827;">${name}</div>
      ${data.title ? `<div style="font-size:13px;color:#9ca3af;margin-top:6px;font-weight:400;">${data.title}</div>` : ''}
      <div style="margin-top:12px;font-size:11px;color:#9ca3af;">${contactLine(data)}</div>
      ${personalBlock(data,'minimal')}
      ${data.targetJob ? `<div style="margin-top:4px;font-size:10px;color:#c4b5fd;">↳ ${data.targetJob}</div>` : ''}
    </div>
    ${data.summary ? `<div style="margin-bottom:40px;max-width:480px;"><div style="font-size:12px;color:#6b7280;line-height:1.9;">${data.summary}</div></div>` : ''}
    ${data.experiences.length ? `
    <div style="margin-bottom:36px;">
      <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#d1d5db;margin-bottom:20px;">Work</div>
      ${data.experiences.map(e => `
      <div style="display:grid;grid-template-columns:130px 1fr;gap:16px;margin-bottom:18px;">
        <div style="font-size:11px;color:#9ca3af;padding-top:2px;">${dateRange(e)||'—'}</div>
        <div>
          <div style="font-size:13px;font-weight:600;color:#111827;">${e.position||'Position'}</div>
          <div style="font-size:12px;color:#9ca3af;">${e.company||'Company'}</div>
          ${e.description ? `<div style="font-size:12px;color:#6b7280;line-height:1.7;margin-top:6px;">${e.description}</div>` : ''}
        </div>
      </div>`).join('')}
    </div>` : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;">
      ${data.educations.length ? `
      <div>
        <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#d1d5db;margin-bottom:14px;">Education</div>
      ${data.references && data.references.length ? cvSection('References', data.references.map(r=>`<div style="margin-bottom:10px;"><div style="font-size:13px;font-weight:600;color:#0f172a;">${r.name||'Reference'}</div><div style="font-size:12px;color:#6b7280;">${r.title||''}${r.title&&r.institution?', ':''}${r.institution||''}</div><div style="font-size:12px;color:#4b5563;margin-top:4px;">${r.email?`Email: ${r.email}`:''}${r.email&&r.number?` · `:''}${r.number?`Tel: ${r.number}`:''}</div></div>`).join('')) : ''}
        ${data.educations.map(e=>`<div style="margin-bottom:12px;">
          <div style="font-size:13px;font-weight:600;color:#111827;">${e.school||'School'}</div>
          <div style="font-size:11px;color:#9ca3af;">${e.degree||''}${e.degree&&e.field?', ':''}${e.field||''} ${e.year?`· ${e.year}`:''}</div>
        </div>`).join('')}
      </div>` : ''}
      ${data.skills.length ? `
      <div>
        <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#d1d5db;margin-bottom:14px;">Skills</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">
          ${data.skills.map(s=>`<span style="font-size:11px;color:${isHighlighted(s,data)?'#7c3aed':'#6b7280'};font-weight:${isHighlighted(s,data)?'700':'400'};">${s}${isHighlighted(s,data)?'*':''}</span>`).join('<span style="color:#d1d5db;"> / </span>')}
        </div>
        ${data.certifications.length?`<div style="margin-top:20px;"><div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#d1d5db;margin-bottom:10px;">Certs</div>${data.certifications.map(c=>`<div style="font-size:11px;color:#6b7280;margin-bottom:4px;">${c.name}${c.issuer?` · ${c.issuer}`:''}${c.year?` (${c.year})`:''}</div>`).join('')}</div>`:''}
      </div>` : ''}
    </div>
  </div>`;
}

// ── EXECUTIVE: Gold & dark prestige ────────────────────
function renderExecutive(data) {
  const name = fullName(data);
  return `<div style="min-height:297mm;background:white;font-family:'Cormorant Garamond',Georgia,serif;">
    <div style="background:#1c1408;padding:48px 56px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;">
        <div>
          <div style="font-size:40px;font-weight:600;color:white;letter-spacing:-0.02em;line-height:1.05;">${name}</div>
          ${data.title ? `<div style="font-size:14px;letter-spacing:0.2em;text-transform:uppercase;color:#d97706;margin-top:10px;">${data.title}</div>` : ''}
          ${data.targetJob ? `<div style="font-size:12px;color:#92400e;margin-top:6px;font-style:italic;">For: ${data.targetJob}</div>` : ''}
        </div>
        <div style="text-align:right;font-size:11px;color:#92400e;line-height:1.8;">
          ${data.email ? `<div>${data.email}</div>` : ''}
          ${data.phone ? `<div>${data.phone}</div>` : ''}
          ${data.location ? `<div>${data.location}</div>` : ''}
          ${data.website ? `<div>${data.website}</div>` : ''}
        </div>
      </div>
      <div style="margin-top:24px;height:1px;background:linear-gradient(90deg,#d97706,rgba(217,119,6,0.1));"></div>
    </div>
    <div style="padding:40px 56px;display:flex;gap:40px;">
      <div style="flex:1;display:flex;flex-direction:column;gap:28px;">
        ${data.summary ? `<div>
          <div style="${execLabel()}">Executive Profile</div>
          <div style="font-size:14px;color:#374151;line-height:1.9;font-style:italic;">${data.summary}</div>
        </div>` : ''}
        ${data.experiences.length ? `<div>
          <div style="${execLabel()}">Career History</div>
          <div style="display:flex;flex-direction:column;gap:18px;">
            ${data.experiences.map(e=>`<div style="padding-bottom:18px;border-bottom:1px solid #f3f4f6;">
              <div style="display:flex;justify-content:space-between;align-items:baseline;">
                <div style="font-size:16px;font-weight:600;color:#0f172a;">${e.position||'Position'}</div>
                <div style="font-size:11px;color:#d97706;letter-spacing:0.05em;">${dateRange(e)}</div>
              </div>
              <div style="font-size:13px;color:#92400e;font-style:italic;margin-top:2px;">${e.company||'Company'}</div>
              ${e.description?`<div style="font-size:13px;color:#6b7280;line-height:1.8;margin-top:8px;">${e.description}</div>`:''}
            </div>`).join('')}
          </div>
        </div>` : ''}
      </div>
      <div style="width:200px;display:flex;flex-direction:column;gap:24px;">
        ${data.skills.length ? `<div>
          <div style="${execLabel()}">Expertise</div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            ${data.skills.map(s=>`<div style="font-size:12px;color:${isHighlighted(s,data)?'#92400e':'#4b5563'};font-weight:${isHighlighted(s,data)?'700':'400'};padding:3px 0;border-bottom:1px solid #f9f5ef;">${isHighlighted(s,data)?'◆ ':'◇ '}${s}</div>`).join('')}
          </div>
        </div>` : ''}
        ${data.educations.length ? `<div>
          <div style="${execLabel()}">Education</div>
          ${data.educations.map(e=>`<div style="margin-bottom:10px;">
            <div style="font-size:13px;font-weight:600;color:#1c1408;">${e.school||'School'}</div>
            <div style="font-size:11px;color:#92400e;font-style:italic;">${e.degree||''}${e.degree&&e.field?', ':''}${e.field||''}</div>
            ${e.year?`<div style="font-size:10px;color:#9ca3af;">${e.year}</div>`:''}
          </div>`).join('')}
        </div>` : ''}
        ${data.certifications.length ? `<div>
          <div style="${execLabel()}">Credentials</div>
          ${data.certifications.map(c=>`<div style="font-size:11px;color:#4b5563;margin-bottom:6px;">${c.name}${c.issuer?`<br><span style="color:#9ca3af;">${c.issuer}</span>`:''}${c.year?` · ${c.year}`:''}</div>`).join('')}
        </div>` : ''}
      </div>
    </div>
  </div>`;
}
function execLabel() {
  return `font-size:9px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#d97706;margin-bottom:12px;font-family:'DM Sans',sans-serif;`;
}

// ── CREATIVE: Full-bleed gradient header, expressive ───
function renderCreative(data) {
  const name = fullName(data);
  return `<div style="min-height:297mm;background:white;font-family:'Syne',sans-serif;">
    <div style="background:linear-gradient(135deg,#be123c,#f97316,#fbbf24);padding:48px 48px 36px;">
      <div style="font-size:46px;font-weight:800;color:white;line-height:1;letter-spacing:-0.04em;">${name}</div>
      ${data.title ? `<div style="font-size:12px;letter-spacing:0.25em;text-transform:uppercase;color:rgba(255,255,255,0.8);margin-top:10px;">${data.title}</div>` : ''}
      <div style="margin-top:16px;display:flex;gap:16px;flex-wrap:wrap;">
        ${[data.email,data.phone,data.location,data.website].filter(Boolean).map(v=>`<span style="font-size:11px;color:rgba(255,255,255,0.75);font-family:'DM Sans',sans-serif;">${v}</span>`).join('')}
      </div>
      ${data.targetJob ? `<div style="margin-top:8px;font-size:11px;color:rgba(255,255,255,0.65);">Target: ${data.targetJob}</div>` : ''}
    </div>
    <div style="padding:32px 48px;display:grid;grid-template-columns:2fr 1fr;gap:36px;">
      <div style="display:flex;flex-direction:column;gap:24px;">
        ${data.summary ? `<div style="padding:16px;background:#fff7ed;border-left:3px solid #f97316;font-size:13px;color:#431407;line-height:1.7;">${data.summary}</div>` : ''}
        ${data.experiences.length ? `<div>
          <div style="${creativeLabel('#f97316')}">Experience</div>
          ${data.experiences.map(e=>`<div style="margin-bottom:18px;padding-bottom:18px;border-bottom:2px dashed #fed7aa;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;">
              <div style="font-size:16px;font-weight:800;color:#1c1408;">${e.position||'Position'}</div>
              <div style="font-size:10px;color:#f97316;font-weight:700;letter-spacing:0.1em;">${dateRange(e)}</div>
            </div>
            <div style="font-size:12px;color:#9a3412;font-weight:600;margin-top:2px;">${e.company||'Company'}</div>
            ${e.description?`<div style="font-size:12px;color:#57534e;line-height:1.7;margin-top:6px;font-family:'DM Sans',sans-serif;">${e.description}</div>`:''}
          </div>`).join('')}
        </div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:20px;">
        ${data.skills.length ? `<div>
          <div style="${creativeLabel('#f97316')}">Skills</div>
          ${data.skills.map(s=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
            <div style="flex:1;height:4px;border-radius:2px;background:${isHighlighted(s,data)?'linear-gradient(90deg,#be123c,#f97316)':'#f1f5f9'};"></div>
            <span style="font-size:11px;color:#1c1408;font-weight:${isHighlighted(s,data)?'700':'500'};min-width:0;white-space:nowrap;">${s}</span>
          </div>`).join('')}
        </div>` : ''}
        ${data.educations.length ? `<div>
          <div style="${creativeLabel('#f97316')}">Education</div>
          ${data.educations.map(e=>`<div style="margin-bottom:10px;padding:10px;background:#fff7ed;border-radius:4px;">
            <div style="font-size:13px;font-weight:700;color:#1c1408;">${e.school||'School'}</div>
            <div style="font-size:11px;color:#9a3412;">${e.degree||''}${e.degree&&e.field?', ':''}${e.field||''}</div>
            ${e.year?`<div style="font-size:10px;color:#f97316;margin-top:2px;">${e.year}</div>`:''}
          </div>`).join('')}
        </div>` : ''}
        ${data.certifications.length ? `<div>
          <div style="${creativeLabel('#f97316')}">Certifications</div>
          ${data.certifications.map(c=>`<div style="font-size:11px;color:#57534e;margin-bottom:5px;padding-left:8px;border-left:2px solid #fed7aa;">${c.name}${c.issuer?` — ${c.issuer}`:''}${c.year?` (${c.year})`:''}</div>`).join('')}
        </div>` : ''}
      </div>
    </div>
  </div>`;
}
function creativeLabel(color) {
  return `font-size:10px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:${color};margin-bottom:12px;`;
}

// ── TECHNICAL: Terminal-inspired monospace ─────────────
function renderTechnical(data) {
  const name = fullName(data);
  return `<div style="min-height:297mm;background:#0a0a0f;font-family:'Space Mono',monospace;color:#e2e8f0;">
    <div style="background:#0d1117;border-bottom:1px solid #30363d;padding:28px 36px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <div style="width:10px;height:10px;border-radius:50%;background:#ff5f57;"></div>
        <div style="width:10px;height:10px;border-radius:50%;background:#febc2e;"></div>
        <div style="width:10px;height:10px;border-radius:50%;background:#28c840;"></div>
        <span style="margin-left:8px;font-size:10px;color:#8b949e;">resume.json</span>
      </div>
      <div style="font-size:10px;color:#58a6ff;margin-bottom:4px;">&gt; whoami</div>
      <div style="font-size:28px;font-weight:700;color:#c9d1d9;letter-spacing:-0.03em;">${name}</div>
      ${data.title ? `<div style="font-size:12px;color:#3fb950;margin-top:6px;"># ${data.title}</div>` : ''}
      ${data.targetJob ? `<div style="font-size:10px;color:#8b949e;margin-top:4px;">// target: ${data.targetJob}</div>` : ''}
      <div style="margin-top:12px;font-size:10px;color:#8b949e;font-family:'Space Mono',monospace;">
        ${[data.email&&`email: ${data.email}`, data.phone&&`tel: ${data.phone}`, data.location&&`loc: ${data.location}`, data.website&&`url: ${data.website}`].filter(Boolean).join(' | ')}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 260px;">
      <div style="padding:28px 28px 28px 36px;display:flex;flex-direction:column;gap:24px;border-right:1px solid #21262d;">
        ${data.summary ? `<div>
          <div style="${techLabel()}">/* profile */</div>
          <div style="font-size:11px;color:#8b949e;line-height:1.8;white-space:pre-wrap;">${data.summary}</div>
        </div>` : ''}
        ${data.experiences.length ? `<div>
          <div style="${techLabel()}">/* experience */</div>
          ${data.experiences.map(e=>`<div style="margin-bottom:16px;padding:12px;background:#161b22;border:1px solid #21262d;border-radius:4px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;">
              <span style="font-size:13px;color:#c9d1d9;font-weight:700;">${e.position||'Position'}</span>
              <span style="font-size:9px;color:#8b949e;">${dateRange(e)}</span>
            </div>
            <div style="font-size:11px;color:#3fb950;margin-top:2px;">${e.company||'Company'}</div>
            ${e.description?`<div style="font-size:10px;color:#6e7681;line-height:1.7;margin-top:6px;font-family:'DM Sans',sans-serif;">${e.description}</div>`:''}
          </div>`).join('')}
        </div>` : ''}
        ${data.educations.length ? `<div>
          <div style="${techLabel()}">/* education */</div>
          ${data.educations.map(e=>`<div style="margin-bottom:10px;padding:10px;background:#161b22;border:1px solid #21262d;border-radius:4px;">
            <div style="font-size:12px;color:#c9d1d9;font-weight:700;">${e.school||'School'}</div>
            <div style="font-size:10px;color:#8b949e;">${e.degree||''}${e.degree&&e.field?' / ':''}${e.field||''} ${e.year?`// ${e.year}`:''}</div>
          </div>`).join('')}
        </div>` : ''}
      </div>
      <div style="padding:28px 24px;display:flex;flex-direction:column;gap:20px;">
        ${data.skills.length ? `<div>
          <div style="${techLabel()}">skills[]</div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            ${data.skills.map(s=>`<div style="font-size:10px;padding:4px 8px;background:${isHighlighted(s,data)?'rgba(63,185,80,0.1)':'rgba(255,255,255,0.03)'};border:1px solid ${isHighlighted(s,data)?'#3fb950':'#21262d'};border-radius:3px;color:${isHighlighted(s,data)?'#3fb950':'#8b949e'};">"${s}"</div>`).join('')}
          </div>
        </div>` : ''}
        ${data.certifications.length ? `<div>
          <div style="${techLabel()}">certs[]</div>
          ${data.certifications.map(c=>`<div style="font-size:9px;color:#8b949e;margin-bottom:6px;padding:6px;background:#161b22;border:1px solid #21262d;border-radius:3px;">
            <div style="color:#c9d1d9;">${c.name}</div>
            <div>${c.issuer||''} ${c.year?`(${c.year})`:''}</div>
          </div>`).join('')}
        </div>` : ''}
      </div>
    </div>
  </div>`;
}
function techLabel() {
  return `font-size:10px;color:#6e7681;font-family:'Space Mono',monospace;margin-bottom:10px;`;
}

// ── ACADEMIC: Scholarly, structured ───────────────────
function renderAcademic(data) {
  const name = fullName(data);
  return `<div style="padding:56px 64px;min-height:297mm;background:white;font-family:'EB Garamond',Georgia,serif;color:#1a1a2a;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="font-family:'Playfair Display',serif;font-size:36px;font-weight:400;color:#1a1a2a;letter-spacing:-0.01em;">${name}</div>
      ${data.title ? `<div style="font-size:14px;color:#6b7280;margin-top:4px;font-style:italic;">${data.title}</div>` : ''}
      <div style="margin-top:10px;font-size:12px;color:#9ca3af;">${contactLine(data,' · ')}</div>
      ${data.targetJob ? `<div style="margin-top:4px;font-size:11px;color:#9ca3af;font-style:italic;">${data.targetJob}</div>` : ''}
    </div>
    <div style="width:60px;height:2px;background:#92400e;margin:0 auto 32px;"></div>
    ${data.summary ? `<div style="margin-bottom:28px;">
      <div style="${acadLabel()}">Research Summary</div>
      <div style="font-size:13.5px;color:#374151;line-height:2;text-align:justify;">${data.summary}</div>
    </div>` : ''}
    ${data.educations.length ? `<div style="margin-bottom:28px;">
      <div style="${acadLabel()}">Education</div>
      ${data.educations.map(e=>`<div style="display:grid;grid-template-columns:1fr auto;gap:8px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #f3f4f6;">
        <div>
          <div style="font-size:14px;font-weight:600;color:#1a1a2a;">${e.degree||'Degree'}${e.field?`, ${e.field}`:''}</div>
          <div style="font-size:13px;font-style:italic;color:#6b7280;">${e.school||'School'}</div>
        </div>
        <div style="font-size:12px;color:#9ca3af;white-space:nowrap;">${e.year||''}</div>
      </div>`).join('')}
    </div>` : ''}
    ${data.experiences.length ? `<div style="margin-bottom:28px;">
      <div style="${acadLabel()}">Academic & Professional Experience</div>
      ${data.experiences.map(e=>`<div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #f3f4f6;">
        <div style="display:flex;justify-content:space-between;">
          <div style="font-size:14px;font-weight:600;color:#1a1a2a;">${e.position||'Position'}</div>
          <div style="font-size:12px;color:#9ca3af;">${dateRange(e)}</div>
        </div>
        <div style="font-size:13px;font-style:italic;color:#6b7280;">${e.company||'Institution'}</div>
        ${e.description?`<div style="font-size:13px;color:#4b5563;line-height:1.9;margin-top:6px;">${e.description}</div>`:''}
      </div>`).join('')}
    </div>` : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;">
      ${data.certifications.length ? `<div>
        <div style="${acadLabel()}">Honours & Credentials</div>
        ${data.certifications.map(c=>`<div style="font-size:13px;color:#374151;margin-bottom:6px;">${c.name}${c.issuer?` — ${c.issuer}`:''}${c.year?` (${c.year})`:''}</div>`).join('')}
      </div>` : ''}
      ${data.skills.length ? `<div>
        <div style="${acadLabel()}">Areas of Expertise</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">${data.skills.map(s=>`<span style="font-size:12px;color:${isHighlighted(s,data)?'#92400e':'#6b7280'};font-style:italic;">${s};</span>`).join(' ')}</div>
      </div>` : ''}
    </div>
  </div>`;
}
function acadLabel() {
  return `font-family:'DM Sans',sans-serif;font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#92400e;margin-bottom:12px;`;
}

// ── ATS: Pure text, maximum parser compatibility ───────
function renderATS(data) {
  const name = fullName(data);
  return `<div style="padding:40px 48px;min-height:297mm;background:white;font-family:'DM Sans',Arial,sans-serif;color:#111827;">
    <div style="margin-bottom:20px;">
      <div style="font-size:26px;font-weight:700;color:#111827;">${name}</div>
      ${data.title ? `<div style="font-size:14px;color:#374151;margin-top:4px;">${data.title}</div>` : ''}
      <div style="font-size:12px;color:#6b7280;margin-top:6px;">${contactLine(data,' | ')}</div>
      ${data.targetJob ? `<div style="font-size:11px;color:#9ca3af;margin-top:3px;">Targeting: ${data.targetJob}</div>` : ''}
    </div>
    <hr style="border:none;border-top:1px solid #d1d5db;margin-bottom:16px;">
    ${data.summary ? `<div style="margin-bottom:16px;"><div style="${atsLabel()}">SUMMARY</div><div style="font-size:13px;color:#374151;line-height:1.7;">${data.summary}</div></div>` : ''}
    ${data.skills.length ? `<div style="margin-bottom:16px;"><div style="${atsLabel()}">SKILLS</div><div style="font-size:13px;color:#374151;">${data.skills.map(s=>`${isHighlighted(s,data)?'★ ':'• '}${s}`).join('  ')}</div></div>` : ''}
    ${data.experiences.length ? `<div style="margin-bottom:16px;"><div style="${atsLabel()}">WORK EXPERIENCE</div>${data.experiences.map(e=>`<div style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;">
        <span style="font-size:13px;font-weight:700;color:#111827;">${e.position||'Position'}</span>
        <span style="font-size:12px;color:#6b7280;">${dateRange(e)}</span>
      </div>
      <div style="font-size:13px;color:#374151;">${e.company||'Company'}</div>
      ${e.description?`<div style="font-size:12px;color:#4b5563;line-height:1.7;margin-top:4px;">${e.description}</div>`:''}
    </div>`).join('')}</div>` : ''}
    ${data.educations.length ? `<div style="margin-bottom:16px;"><div style="${atsLabel()}">EDUCATION</div>${data.educations.map(e=>`<div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;">
        <span style="font-size:13px;font-weight:700;color:#111827;">${e.school||'School'}</span>
        <span style="font-size:12px;color:#6b7280;">${e.year||''}</span>
      </div>
      <div style="font-size:12px;color:#374151;">${e.degree||''}${e.degree&&e.field?`, ${e.field}`:''}</div>
    </div>`).join('')}</div>` : ''}
    ${data.certifications.length ? `<div><div style="${atsLabel()}">CERTIFICATIONS</div>${data.certifications.map(c=>`<div style="font-size:12px;color:#374151;margin-bottom:4px;">• ${c.name}${c.issuer?`, ${c.issuer}`:''}${c.year?` (${c.year})`:''}</div>`).join('')}</div>` : ''}
  </div>`;
}
function atsLabel() {
  return `font-size:10px;font-weight:800;letter-spacing:0.16em;color:#374151;border-bottom:1px solid #e5e7eb;padding-bottom:4px;margin-bottom:8px;`;
}

// ── STARTUP: Vibrant gradient header, energetic ────────
function renderStartup(data) {
  const name = fullName(data);
  return `<div style="min-height:297mm;background:#f8faff;font-family:'Outfit',sans-serif;">
    <div style="background:linear-gradient(120deg,#0ea5e9,#7c3aed,#0ea5e9);background-size:200%;padding:40px 44px 32px;">
      <div style="font-size:42px;font-weight:800;color:white;letter-spacing:-0.04em;line-height:1.05;">${name}</div>
      ${data.title ? `<div style="font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.75);margin-top:8px;">${data.title}</div>` : ''}
      ${data.summary ? `<div style="margin-top:14px;font-size:13px;color:rgba(255,255,255,0.85);line-height:1.7;max-width:500px;">${data.summary}</div>` : ''}
      <div style="margin-top:14px;display:flex;gap:12px;flex-wrap:wrap;">
        ${[data.email,data.phone,data.location,data.website].filter(Boolean).map(v=>`<span style="font-size:11px;color:rgba(255,255,255,0.7);padding:2px 10px;background:rgba(255,255,255,0.1);border-radius:999px;">${v}</span>`).join('')}
      </div>
      ${data.targetJob ? `<div style="margin-top:8px;font-size:10px;color:rgba(255,255,255,0.5);">⚡ ${data.targetJob}</div>` : ''}
    </div>
    <div style="padding:32px 44px;display:grid;grid-template-columns:2fr 1fr;gap:32px;">
      <div style="display:flex;flex-direction:column;gap:24px;">
        ${data.experiences.length ? `<div>
          <div style="${startupLabel()}">Experience</div>
          ${data.experiences.map(e=>`<div style="padding:16px;background:white;border-radius:12px;margin-bottom:10px;border:1px solid #e0e7ff;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div><div style="font-size:14px;font-weight:700;color:#1e1b4b;">${e.position||'Position'}</div>
              <div style="font-size:12px;color:#7c3aed;font-weight:600;">${e.company||'Company'}</div></div>
              <div style="font-size:10px;color:#a5b4fc;font-weight:600;white-space:nowrap;">${dateRange(e)}</div>
            </div>
            ${e.description?`<div style="font-size:12px;color:#6b7280;line-height:1.7;margin-top:8px;">${e.description}</div>`:''}
          </div>`).join('')}
        </div>` : ''}
        ${data.educations.length ? `<div>
          <div style="${startupLabel()}">Education</div>
          ${data.educations.map(e=>`<div style="padding:12px;background:white;border-radius:8px;margin-bottom:8px;border:1px solid #e0e7ff;">
            <div style="font-size:13px;font-weight:700;color:#1e1b4b;">${e.school||'School'}</div>
            <div style="font-size:11px;color:#6b7280;">${e.degree||''}${e.degree&&e.field?', ':''}${e.field||''}${e.year?` · ${e.year}`:''}</div>
          </div>`).join('')}
        </div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:20px;">
        ${data.skills.length ? `<div style="padding:16px;background:white;border-radius:12px;border:1px solid #e0e7ff;">
          <div style="${startupLabel()}">Skills</div>
          <div style="display:flex;flex-wrap:wrap;gap:5px;">
            ${data.skills.map(s=>`<span style="padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;
              ${isHighlighted(s,data)?'background:#7c3aed;color:white;':'background:#ede9fe;color:#4c1d95;'}">${s}</span>`).join('')}
          </div>
        </div>` : ''}
        ${data.certifications.length ? `<div style="padding:16px;background:white;border-radius:12px;border:1px solid #e0e7ff;">
          <div style="${startupLabel()}">Certifications</div>
          ${data.certifications.map(c=>`<div style="font-size:11px;color:#4b5563;margin-bottom:6px;padding-left:8px;border-left:2px solid #c4b5fd;">${c.name}${c.issuer?`<br><span style='color:#9ca3af;'>${c.issuer}</span>`:''}${c.year?` · ${c.year}`:''}</div>`).join('')}
        </div>` : ''}
      </div>
    </div>
  </div>`;
}
function startupLabel() {
  return `font-size:9px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#7c3aed;margin-bottom:10px;`;
}

// ── CORPORATE: Navy & white, conservative authority ────
function renderCorporate(data) {
  const name = fullName(data);
  return `<div style="min-height:297mm;background:white;font-family:'DM Sans',sans-serif;">
    <div style="background:#1e3a5f;padding:40px 52px;">
      <div style="font-family:'Syne',sans-serif;font-size:36px;font-weight:700;color:white;letter-spacing:-0.03em;">${name}</div>
      ${data.title ? `<div style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#93c5fd;margin-top:8px;">${data.title}</div>` : ''}
      ${data.targetJob ? `<div style="font-size:11px;color:#6b92b5;margin-top:4px;">Applying for: ${data.targetJob}</div>` : ''}
      <div style="margin-top:16px;display:flex;gap:20px;flex-wrap:wrap;">
        ${[data.email,data.phone,data.location,data.website].filter(Boolean).map(v=>`<span style="font-size:11px;color:#93c5fd;">${v}</span>`).join('<span style="color:#3b5a7a;">|</span>')}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 240px;">
      <div style="padding:36px 40px;border-right:1px solid #e2e8f0;display:flex;flex-direction:column;gap:28px;">
        ${data.summary ? `<div>
          <div style="${corpLabel()}">Executive Summary</div>
          <div style="font-size:13px;color:#374151;line-height:1.8;">${data.summary}</div>
        </div>` : ''}
        ${data.experiences.length ? `<div>
          <div style="${corpLabel()}">Professional Experience</div>
          ${data.experiences.map(e=>`<div style="margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid #f1f5f9;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;">
              <div style="font-size:14px;font-weight:700;color:#1e3a5f;">${e.position||'Position'}</div>
              <div style="font-size:10px;color:#93c5fd;font-weight:600;letter-spacing:0.05em;">${dateRange(e)}</div>
            </div>
            <div style="font-size:12px;color:#1e40af;font-weight:600;margin-top:2px;">${e.company||'Company'}</div>
            ${e.description?`<div style="font-size:12px;color:#6b7280;line-height:1.7;margin-top:6px;">${e.description}</div>`:''}
          </div>`).join('')}
        </div>` : ''}
        ${data.educations.length ? `<div>
          <div style="${corpLabel()}">Education</div>
          ${data.educations.map(e=>`<div style="margin-bottom:10px;">
            <div style="font-size:13px;font-weight:700;color:#1e3a5f;">${e.school||'School'}</div>
            <div style="font-size:12px;color:#64748b;">${e.degree||''}${e.degree&&e.field?', ':''}${e.field||''} ${e.year?`· ${e.year}`:''}</div>
          </div>`).join('')}
        </div>` : ''}
      </div>
      <div style="padding:36px 28px;background:#f8faff;display:flex;flex-direction:column;gap:24px;">
        ${data.skills.length ? `<div>
          <div style="${corpLabel()}">Core Skills</div>
          ${data.skills.map(s=>`<div style="padding:5px 0;border-bottom:1px solid #e2e8f0;font-size:12px;color:${isHighlighted(s,data)?'#1e3a5f':'#64748b'};font-weight:${isHighlighted(s,data)?'700':'400'};">
            ${isHighlighted(s,data)?'▶ ':''}${s}
          </div>`).join('')}
        </div>` : ''}
        ${data.certifications.length ? `<div>
          <div style="${corpLabel()}">Credentials</div>
          ${data.certifications.map(c=>`<div style="font-size:11px;color:#64748b;margin-bottom:8px;padding:8px;background:white;border-radius:4px;border:1px solid #e2e8f0;">
            <div style="font-weight:600;color:#1e3a5f;">${c.name}</div>
            <div>${c.issuer||''}${c.issuer&&c.year?' · ':''}${c.year||''}</div>
          </div>`).join('')}
        </div>` : ''}
      </div>
    </div>
  </div>`;
}
function corpLabel() {
  return `font-size:9px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#1e3a5f;margin-bottom:12px;border-bottom:2px solid #1e3a5f;padding-bottom:6px;`;
}

// ── FREELANCE: Warm amber, creative professional ───────
function renderFreelance(data) {
  const name = fullName(data);
  return `<div style="min-height:297mm;background:white;font-family:'Outfit',sans-serif;">
    <div style="display:grid;grid-template-columns:280px 1fr;min-height:297mm;">
      <div style="background:#1c0a00;padding:40px 28px;display:flex;flex-direction:column;gap:24px;">
        <div>
          <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#f59e0b;margin-bottom:8px;">Portfolio</div>
          <div style="font-family:'Syne',sans-serif;font-size:26px;font-weight:800;color:white;line-height:1.1;">${name}</div>
          ${data.title ? `<div style="font-size:12px;color:#d97706;margin-top:8px;">${data.title}</div>` : ''}
          ${data.targetJob ? `<div style="font-size:10px;color:#78350f;margin-top:4px;">${data.targetJob}</div>` : ''}
        </div>
        <div style="height:1px;background:linear-gradient(90deg,#f59e0b,transparent);"></div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${data.email?`<div style="font-size:11px;color:#a16207;">✉ ${data.email}</div>`:''}
          ${data.phone?`<div style="font-size:11px;color:#a16207;">✆ ${data.phone}</div>`:''}
          ${data.location?`<div style="font-size:11px;color:#a16207;">⌖ ${data.location}</div>`:''}
          ${data.website?`<div style="font-size:11px;color:#f59e0b;">⊕ ${data.website}</div>`:''}
        </div>
        ${data.skills.length ? `<div>
          <div style="font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:#78350f;margin-bottom:10px;font-weight:700;">Skills</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;">
            ${data.skills.map(s=>`<span style="padding:3px 9px;border-radius:999px;font-size:10px;font-weight:600;
              ${isHighlighted(s,data)?'background:#f59e0b;color:#1c0a00;':'background:rgba(245,158,11,0.1);color:#d97706;border:1px solid rgba(245,158,11,0.2);'}">${s}</span>`).join('')}
          </div>
        </div>` : ''}
        ${data.educations.length ? `<div>
          <div style="font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:#78350f;margin-bottom:10px;font-weight:700;">Education</div>
          ${data.educations.map(e=>`<div style="margin-bottom:10px;">
            <div style="font-size:12px;font-weight:600;color:white;">${e.school||'School'}</div>
            <div style="font-size:10px;color:#a16207;">${e.degree||''}${e.degree&&e.field?', ':''}${e.field||''}</div>
            ${e.year?`<div style="font-size:9px;color:#78350f;">${e.year}</div>`:''}
          </div>`).join('')}
        </div>` : ''}
        ${data.certifications.length ? `<div>
          <div style="font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:#78350f;margin-bottom:10px;font-weight:700;">Certifications</div>
          ${data.certifications.map(c=>`<div style="font-size:10px;color:#a16207;margin-bottom:5px;padding-left:8px;border-left:2px solid #f59e0b;">${c.name}${c.issuer?` · ${c.issuer}`:''}${c.year?` (${c.year})`:''}</div>`).join('')}
        </div>` : ''}
      </div>
      <div style="padding:40px 36px;display:flex;flex-direction:column;gap:24px;">
        ${data.summary ? `<div style="padding:16px 20px;background:#fffbeb;border-left:4px solid #f59e0b;">
          <div style="font-size:13px;color:#451a03;line-height:1.8;">${data.summary}</div>
        </div>` : ''}
        ${data.experiences.length ? `<div>
          <div style="font-size:9px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#d97706;margin-bottom:14px;">Project Experience</div>
          ${data.experiences.map(e=>`<div style="margin-bottom:18px;padding-bottom:18px;border-bottom:1px dashed #fde68a;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;">
              <div style="font-size:14px;font-weight:700;color:#1c1408;">${e.position||'Project / Role'}</div>
              <div style="font-size:10px;color:#f59e0b;font-weight:600;">${dateRange(e)}</div>
            </div>
            <div style="font-size:12px;color:#d97706;font-weight:600;margin-top:2px;">${e.company||'Client'}</div>
            ${e.description?`<div style="font-size:12px;color:#6b7280;line-height:1.7;margin-top:6px;">${e.description}</div>`:''}
          </div>`).join('')}
        </div>` : ''}
      </div>
    </div>
  </div>`;
}

// ── EDITORIAL: Magazine-style, typographic drama ───────
function renderEditorial(data) {
  const name = fullName(data);
  return `<div style="min-height:297mm;background:white;font-family:'Syne',sans-serif;overflow:hidden;">
    <div style="display:grid;grid-template-columns:1fr 320px;min-height:297mm;">
      <div style="padding:48px 44px;display:flex;flex-direction:column;">
        <div style="flex:0 0 auto;margin-bottom:32px;">
          <div style="font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:#9ca3af;margin-bottom:12px;">Issue № 01 — Career Profile</div>
          <div style="font-family:'Playfair Display',serif;font-size:52px;font-weight:700;color:#0f172a;line-height:0.9;letter-spacing:-0.04em;">${name}</div>
          <div style="height:4px;background:black;width:80px;margin-top:16px;"></div>
          ${data.title ? `<div style="font-size:14px;font-weight:400;color:#4b5563;margin-top:12px;font-family:'DM Sans',sans-serif;">${data.title}</div>` : ''}
          ${data.targetJob ? `<div style="font-size:11px;color:#9ca3af;margin-top:4px;font-family:'DM Sans',sans-serif;">For: ${data.targetJob}</div>` : ''}
        </div>
        ${data.summary ? `<div style="background:#f9fafb;border-top:3px solid black;padding:20px;margin-bottom:28px;">
          <div style="font-size:10px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:8px;color:#1f2937;">Editorial</div>
          <div style="font-family:'DM Sans',sans-serif;font-size:13px;color:#374151;line-height:1.8;">${data.summary}</div>
        </div>` : ''}
        ${data.experiences.length ? `<div>
          <div style="font-size:10px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:16px;color:#1f2937;border-bottom:1px solid black;padding-bottom:8px;">Career</div>
          ${data.experiences.map((e,i)=>`<div style="display:grid;grid-template-columns:48px 1fr;gap:0;margin-bottom:20px;">
            <div style="font-family:'Space Mono',monospace;font-size:10px;color:#9ca3af;padding-top:3px;">${String(i+1).padStart(2,'0')}</div>
            <div>
              <div style="font-size:15px;font-weight:700;color:#0f172a;">${e.position||'Position'}</div>
              <div style="font-size:12px;color:#6366f1;font-weight:600;margin-top:1px;">${e.company||'Company'}</div>
              ${dateRange(e)?`<div style="font-size:10px;font-family:'Space Mono',monospace;color:#d1d5db;margin-top:3px;">${dateRange(e)}</div>`:''}
              ${e.description?`<div style="font-family:'DM Sans',sans-serif;font-size:12px;color:#6b7280;line-height:1.7;margin-top:6px;">${e.description}</div>`:''}
            </div>
          </div>`).join('')}
        </div>` : ''}
      </div>
      <div style="background:#0f172a;padding:40px 28px;display:flex;flex-direction:column;gap:24px;color:white;">
        <div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#475569;">Contents</div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${[data.email&&`✉ ${data.email}`,data.phone&&`✆ ${data.phone}`,data.location&&`⌖ ${data.location}`,data.website&&`↗ ${data.website}`].filter(Boolean).map(v=>`<div style="font-size:11px;color:#94a3b8;font-family:'DM Sans',sans-serif;">${v}</div>`).join('')}
        </div>
        <div style="height:1px;background:#1e293b;"></div>
        ${data.skills.length ? `<div>
          <div style="font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:#475569;margin-bottom:10px;">Skills</div>
          <div style="display:flex;flex-direction:column;gap:5px;">
            ${data.skills.map(s=>`<div style="display:flex;align-items:center;gap:8px;">
              <div style="width:24px;height:2px;background:${isHighlighted(s,data)?'#6366f1':'#1e293b'};"></div>
              <span style="font-size:11px;color:${isHighlighted(s,data)?'#a5b4fc':'#94a3b8'};font-family:'DM Sans',sans-serif;">${s}</span>
            </div>`).join('')}
          </div>
        </div>` : ''}
        ${data.educations.length ? `<div>
          <div style="font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:#475569;margin-bottom:10px;">Education</div>
          ${data.educations.map(e=>`<div style="margin-bottom:10px;">
            <div style="font-size:12px;font-weight:700;color:white;">${e.school||'School'}</div>
            <div style="font-size:10px;color:#64748b;font-family:'DM Sans',sans-serif;">${e.degree||''}${e.degree&&e.field?', ':''}${e.field||''} ${e.year?`· ${e.year}`:''}</div>
          </div>`).join('')}
        </div>` : ''}
        ${data.certifications.length ? `<div>
          <div style="font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:#475569;margin-bottom:10px;">Credentials</div>
          ${data.certifications.map(c=>`<div style="font-size:10px;color:#64748b;margin-bottom:5px;font-family:'DM Sans',sans-serif;">${c.name}${c.issuer?` · ${c.issuer}`:''}${c.year?` (${c.year})`:''}</div>`).join('')}
        </div>` : ''}
      </div>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────────────
// CV RENDERER — Academic folio format, wholly unique from resume
// ─────────────────────────────────────────────────────
function renderCV(data) {
  const name = fullName(data);
  return `<div style="min-height:297mm;background:white;font-family:'EB Garamond',Georgia,serif;">
    <!-- CV Header: horizontal stripe with name left, contact right -->
    <div style="border-bottom:3px double #1a1a2a;padding:40px 56px 28px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:#9ca3af;margin-bottom:10px;font-family:'DM Sans',sans-serif;">Curriculum Vitae</div>
          <div style="font-family:'Playfair Display',serif;font-size:44px;font-weight:700;color:#0f172a;line-height:1;letter-spacing:-0.02em;">${name}</div>
          ${data.title ? `<div style="font-size:15px;color:#6b7280;margin-top:8px;font-style:italic;">${data.title}</div>` : ''}
        </div>
        <div style="text-align:right;font-size:12px;color:#6b7280;line-height:2;font-family:'DM Sans',sans-serif;padding-top:20px;">
          ${data.email?`<div>${data.email}</div>`:''}
          ${data.phone?`<div>${data.phone}</div>`:''}
          ${data.location?`<div>${data.location}</div>`:''}
          ${data.website?`<div style="color:#4f46e5;">${data.website}</div>`:''}
        </div>
      </div>
    </div>
    <div style="padding:32px 56px;display:flex;flex-direction:column;gap:26px;">
      ${data.summary ? cvSection('Personal Statement', `<div style="font-size:14px;color:#374151;line-height:2;font-style:italic;max-width:540px;">${data.summary}</div>`) : ''}
      ${data.educations.length ? cvSection('Education', data.educations.map(e=>`
        <div style="display:grid;grid-template-columns:120px 1fr;gap:24px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px dotted #e5e7eb;">
          <div style="font-size:12px;color:#9ca3af;font-family:'DM Sans',sans-serif;padding-top:3px;">${e.year||'—'}</div>
          <div>
            <div style="font-size:15px;font-weight:600;color:#0f172a;">${e.degree||'Degree'}${e.field?` in ${e.field}`:''}</div>
            <div style="font-size:13px;color:#6b7280;font-style:italic;margin-top:2px;">${e.school||'School'}</div>
          </div>
        </div>`).join('')) : ''}
      ${data.experiences.length ? cvSection('Professional Experience', data.experiences.map(e=>`
        <div style="display:grid;grid-template-columns:120px 1fr;gap:24px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px dotted #e5e7eb;">
          <div style="font-size:11px;color:#9ca3af;font-family:'DM Sans',sans-serif;padding-top:3px;line-height:1.7;">${e.startDate||''}${e.startDate&&e.endDate?'<br>':''}${e.endDate||''}</div>
          <div>
            <div style="font-size:15px;font-weight:600;color:#0f172a;">${e.position||'Position'}</div>
            <div style="font-size:13px;color:#4f46e5;font-style:italic;margin-top:2px;">${e.company||'Organisation'}</div>
            ${e.description?`<div style="font-size:13px;color:#4b5563;line-height:1.9;margin-top:8px;">${e.description}</div>`:''}
          </div>
        </div>`).join('')) : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;">
        ${data.certifications.length ? cvSection('Credentials & Certifications', data.certifications.map(c=>`<div style="font-size:13px;color:#374151;margin-bottom:6px;">${c.name}${c.issuer?` — ${c.issuer}`:''}${c.year?` (${c.year})`:''}</div>`).join('')) : ''}
        ${data.skills.length ? cvSection('Research & Technical Skills', `<div>${data.skills.map(s=>`<span style="display:inline-block;margin:0 6px 4px 0;font-size:13px;color:${isHighlighted(s,data)?'#4f46e5':'#6b7280'};font-style:italic;">${s}${data.skills.indexOf(s)<data.skills.length-1?';':''}</span>`).join('')}</div>`) : ''}
      </div>
    </div>
  </div>`;
}
function cvSection(title, html) {
  return `<div>
    <div style="font-family:'DM Sans',sans-serif;font-size:9px;font-weight:800;letter-spacing:0.22em;text-transform:uppercase;color:#1a1a2a;margin-bottom:14px;display:flex;align-items:center;gap:12px;">
      ${title} <span style="flex:1;height:1px;background:#e5e7eb;display:inline-block;"></span>
    </div>
    ${html}
  </div>`;
}

// ─────────────────────────────────────────────────────
// COVER LETTER RENDERERS — 5 totally unique styles
// Each has its own visual language, typography, and layout
// ─────────────────────────────────────────────────────
function renderCoverLetter(data) {
  const styles = {
    editorial:  renderCoverEditorial,
    classic:    renderCoverClassic,
    modern:     renderCoverModern,
    creative:   renderCoverCreative,
    minimalist: renderCoverMinimalist,
    executive:  renderCoverExecutive,
    warm:       renderCoverWarm,
    technical:  renderCoverTechnical,
  };
  return (styles[currentCoverStyle] || renderCoverEditorial)(data);
}

// Cover: Editorial — full-bleed left bar, magazine opener
function renderCoverEditorial(data) {
  const name = fullName(data);
  const cl = data.coverLetter;
  return `<div style="min-height:297mm;background:white;display:grid;grid-template-columns:6px 1fr;font-family:'Syne',sans-serif;">
    <div style="background:linear-gradient(180deg,#7c3aed,#06b6d4);"></div>
    <div style="padding:56px 52px;display:flex;flex-direction:column;">
      <div style="margin-bottom:40px;">
        <div style="font-size:9px;letter-spacing:0.3em;text-transform:uppercase;color:#9ca3af;margin-bottom:12px;">Cover Letter</div>
        <div style="font-family:'Playfair Display',serif;font-size:40px;font-weight:700;color:#0f172a;line-height:1;letter-spacing:-0.03em;">${name}</div>
        ${data.title ? `<div style="font-size:13px;color:#7c3aed;margin-top:8px;">${data.title}</div>` : ''}
        <div style="margin-top:10px;font-size:11px;color:#9ca3af;font-family:'DM Sans',sans-serif;">${contactLine(data,' · ')}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:20px;flex:1;font-family:'DM Sans',sans-serif;">
        ${cl.company||cl.role ? `<div style="padding:14px 16px;background:#f5f3ff;border-left:3px solid #7c3aed;">
          <div style="font-size:12px;color:#4c1d95;font-weight:600;">Re: ${cl.role||'Position'}${cl.company?` at ${cl.company}`:''}</div>
        </div>` : ''}
        ${cl.intro ? `<div style="font-size:14px;color:#1e293b;line-height:1.9;font-weight:400;">${cl.intro}</div>` : `<div style="font-size:13px;color:#9ca3af;font-style:italic;">Your opening paragraph will appear here…</div>`}
        ${cl.body ? `<div style="font-size:13px;color:#374151;line-height:1.9;">${cl.body}</div>` : ''}
        ${cl.closing ? `<div style="font-size:13px;color:#374151;line-height:1.9;">${cl.closing}</div>` : ''}
        <div style="margin-top:auto;padding-top:40px;">
          <div style="font-size:12px;color:#9ca3af;">Sincerely,</div>
          <div style="font-family:'Playfair Display',serif;font-size:22px;color:#0f172a;margin-top:8px;font-style:italic;">${name}</div>
          ${data.email?`<div style="font-size:11px;color:#7c3aed;margin-top:4px;">${data.email}</div>`:''}
        </div>
      </div>
    </div>
  </div>`;
}

// Cover: Classic — formal business letter
function renderCoverClassic(data) {
  const name = fullName(data);
  const cl = data.coverLetter;
  return `<div style="padding:64px 72px;min-height:297mm;background:white;font-family:'EB Garamond',Georgia,serif;color:#1a1a2a;">
    <div style="margin-bottom:40px;">
      <div style="font-size:20px;font-family:'Playfair Display',serif;font-weight:700;">${name}</div>
      ${data.title ? `<div style="font-size:13px;color:#6b7280;font-style:italic;">${data.title}</div>` : ''}
      <div style="margin-top:6px;font-size:12px;color:#6b7280;font-family:'DM Sans',sans-serif;">${contactLine(data,' | ')}</div>
    </div>
    <div style="margin-bottom:28px;font-size:12px;color:#6b7280;font-family:'DM Sans',sans-serif;">
      <div>${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</div>
    </div>
    ${cl.company ? `<div style="margin-bottom:24px;font-size:13px;line-height:1.7;">
      <div style="font-weight:600;">${cl.company}</div>
      ${cl.role?`<div>Re: ${cl.role}</div>`:''}
    </div>` : ''}
    <div style="margin-bottom:12px;font-size:14px;">Dear Hiring Manager,</div>
    <div style="display:flex;flex-direction:column;gap:16px;font-size:14px;color:#374151;line-height:2;">
      ${cl.intro ? `<div>${cl.intro}</div>` : `<div style="color:#9ca3af;font-style:italic;">Your opening paragraph will appear here…</div>`}
      ${cl.body ? `<div>${cl.body}</div>` : ''}
      ${cl.closing ? `<div>${cl.closing}</div>` : ''}
    </div>
    <div style="margin-top:40px;font-size:14px;">
      <div>Sincerely,</div>
      <div style="font-family:'Playfair Display',serif;font-size:24px;font-style:italic;margin-top:24px;color:#0f172a;">${name}</div>
    </div>
  </div>`;
}

// Cover: Modern — Card-based, clean sans-serif
function renderCoverModern(data) {
  const name = fullName(data);
  const cl = data.coverLetter;
  return `<div style="min-height:297mm;background:#f8fafc;font-family:'Outfit',sans-serif;padding:40px;">
    <div style="background:white;border-radius:16px;padding:48px;box-shadow:0 1px 4px rgba(0,0,0,0.06);min-height:217mm;display:flex;flex-direction:column;gap:28px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:24px;border-bottom:2px solid #f1f5f9;">
        <div>
          <div style="font-size:28px;font-weight:700;color:#0f172a;letter-spacing:-0.03em;">${name}</div>
          ${data.title ? `<div style="font-size:13px;color:#6366f1;margin-top:4px;font-weight:600;">${data.title}</div>` : ''}
        </div>
        <div style="text-align:right;font-size:11px;color:#94a3b8;line-height:1.8;">
          ${[data.email,data.phone,data.location].filter(Boolean).map(v=>`<div>${v}</div>`).join('')}
        </div>
      </div>
      ${cl.company||cl.role ? `<div style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;background:#f0f9ff;border-radius:999px;border:1px solid #bae6fd;">
        <span style="font-size:12px;color:#0369a1;font-weight:600;">${cl.role||'Application'}${cl.company?` — ${cl.company}`:''}</span>
      </div>` : ''}
      <div style="display:flex;flex-direction:column;gap:16px;font-size:13.5px;color:#374151;line-height:1.9;flex:1;">
        ${cl.intro ? `<div>${cl.intro}</div>` : `<div style="color:#cbd5e1;font-style:italic;">Opening paragraph…</div>`}
        ${cl.body ? `<div>${cl.body}</div>` : ''}
        ${cl.closing ? `<div>${cl.closing}</div>` : ''}
      </div>
      <div style="padding-top:24px;border-top:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:flex-end;">
        <div>
          <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">Warm regards,</div>
          <div style="font-size:20px;font-weight:700;color:#0f172a;">${name}</div>
        </div>
        ${data.email?`<div style="font-size:11px;color:#6366f1;">${data.email}</div>`:''}
      </div>
    </div>
  </div>`;
}

// Cover: Creative — Bold typographic, no-rules design
function renderCoverCreative(data) {
  const name = fullName(data);
  const cl = data.coverLetter;
  return `<div style="min-height:297mm;background:#0f172a;font-family:'Syne',sans-serif;padding:52px 48px;color:white;display:flex;flex-direction:column;gap:0;">
    <div style="margin-bottom:48px;">
      <div style="font-size:64px;font-weight:800;letter-spacing:-0.06em;line-height:0.85;color:white;">${data.firstName||'Your'}</div>
      <div style="font-size:64px;font-weight:800;letter-spacing:-0.06em;line-height:0.85;
        background:linear-gradient(90deg,#8b5cf6,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">${data.lastName||'Name'}</div>
      ${data.title ? `<div style="font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:#475569;margin-top:16px;">${data.title}</div>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:1fr 180px;gap:40px;flex:1;">
      <div style="display:flex;flex-direction:column;gap:20px;font-family:'DM Sans',sans-serif;">
        ${cl.company||cl.role ? `<div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#7c3aed;">${cl.role||''}${cl.role&&cl.company?' at ':''}${cl.company||''}</div>` : ''}
        ${cl.intro ? `<div style="font-size:16px;color:#f1f5f9;line-height:1.8;font-weight:300;">${cl.intro}</div>` : `<div style="font-size:13px;color:#334155;font-style:italic;">Opening paragraph…</div>`}
        ${cl.body ? `<div style="font-size:13px;color:#94a3b8;line-height:1.9;">${cl.body}</div>` : ''}
        ${cl.closing ? `<div style="font-size:13px;color:#94a3b8;line-height:1.9;">${cl.closing}</div>` : ''}
        <div style="margin-top:auto;padding-top:32px;">
          <div style="font-size:11px;color:#475569;">— ${name}</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;padding-top:4px;">
        <div style="height:1px;background:#1e293b;margin-bottom:8px;"></div>
        ${[data.email,data.phone,data.location,data.website].filter(Boolean).map(v=>`<div style="font-size:10px;color:#475569;font-family:'DM Sans',sans-serif;word-break:break-all;">${v}</div>`).join('')}
      </div>
    </div>
  </div>`;
}

// Cover: Minimalist — pure text, extreme restraint
function renderCoverMinimalist(data) {
  const name = fullName(data);
  const cl = data.coverLetter;
  return `<div style="padding:80px 96px;min-height:297mm;background:white;font-family:'Outfit',sans-serif;color:#1a1a2a;">
    <div style="margin-bottom:64px;">
      <div style="font-size:13px;color:#9ca3af;">${name}</div>
      <div style="font-size:11px;color:#d1d5db;margin-top:2px;">${contactLine(data,' · ')}</div>
    </div>
    ${cl.company||cl.role ? `<div style="font-size:11px;color:#9ca3af;margin-bottom:32px;letter-spacing:0.05em;">Re: ${cl.role||''}${cl.role&&cl.company?' · ':''}${cl.company||''}</div>` : '<div style="height:32px;"></div>'}
    <div style="display:flex;flex-direction:column;gap:24px;font-size:14px;color:#374151;line-height:2;max-width:480px;">
      ${cl.intro ? `<div>${cl.intro}</div>` : `<div style="color:#d1d5db;font-style:italic;">Opening paragraph will appear here.</div>`}
      ${cl.body ? `<div>${cl.body}</div>` : ''}
      ${cl.closing ? `<div>${cl.closing}</div>` : ''}
    </div>
    <div style="margin-top:64px;">
      <div style="font-size:13px;color:#9ca3af;">${name}</div>
    </div>
  </div>`;
}

// Cover: Executive — dark premium header
function renderCoverExecutive(data) {
  const name = fullName(data);
  const cl = data.coverLetter;
  return `<div style="min-height:297mm;background:white;font-family:'DM Sans',sans-serif;">
    <div style="background:#1c1408;padding:44px 56px 32px;">
      <div style="font-size:36px;font-weight:700;color:white;letter-spacing:-0.02em;">${name}</div>
      ${data.title ? `<div style="font-size:13px;letter-spacing:0.15em;text-transform:uppercase;color:#d97706;margin-top:8px;">${data.title}</div>` : ''}
      <div style="margin-top:14px;font-size:11px;color:#92400e;display:flex;gap:16px;flex-wrap:wrap;">${[data.email,data.phone,data.location,data.website].filter(Boolean).map(v=>`<span>${v}</span>`).join('')}</div>
      <div style="margin-top:20px;height:1px;background:linear-gradient(90deg,#d97706,transparent);"></div>
    </div>
    <div style="padding:40px 56px;display:flex;flex-direction:column;gap:20px;">
      ${cl.company||cl.role ? `<div style="font-size:12px;color:#92400e;font-weight:600;border-left:3px solid #d97706;padding-left:12px;">Re: ${cl.role||'Position'}${cl.company?' at '+cl.company:''}</div>` : ''}
      <div style="font-size:14px;color:#374151;line-height:2;font-style:italic;">Dear Hiring Manager,</div>
      <div style="display:flex;flex-direction:column;gap:18px;font-size:14px;color:#374151;line-height:2;">
        ${cl.intro || '<span style="color:#d1d5db;font-style:italic;">Opening paragraph…</span>'}
        ${cl.body ? `<div>${cl.body}</div>` : ''}
        ${cl.closing ? `<div>${cl.closing}</div>` : ''}
      </div>
      <div style="margin-top:32px;font-size:14px;"><div>Respectfully,</div>
        <div style="font-size:22px;font-weight:700;color:#1c1408;margin-top:20px;">${name}</div>
        ${data.email?`<div style="font-size:11px;color:#d97706;margin-top:4px;">${data.email}</div>`:''}
      </div>
    </div>
  </div>`;
}

// Cover: Warm — friendly amber accents
function renderCoverWarm(data) {
  const name = fullName(data);
  const cl = data.coverLetter;
  return `<div style="min-height:297mm;background:#fffbf5;font-family:'Outfit',sans-serif;padding:56px 64px;">
    <div style="margin-bottom:40px;border-bottom:3px solid #f59e0b;padding-bottom:24px;">
      <div style="font-size:36px;font-weight:800;color:#1c0a00;letter-spacing:-0.03em;">${name}</div>
      ${data.title ? `<div style="font-size:14px;color:#d97706;margin-top:6px;font-weight:600;">${data.title}</div>` : ''}
      <div style="margin-top:10px;font-size:11px;color:#a16207;display:flex;gap:14px;flex-wrap:wrap;">${[data.email,data.phone,data.location,data.website].filter(Boolean).map(v=>`<span>${v}</span>`).join('')}</div>
    </div>
    ${cl.company||cl.role ? `<div style="margin-bottom:24px;display:inline-flex;padding:8px 16px;background:#fef3c7;border-radius:999px;font-size:12px;color:#92400e;font-weight:600;">✉ ${cl.role||''}${cl.role&&cl.company?' at ':''}${cl.company||''}</div>` : ''}
    <div style="font-size:14px;color:#451a03;margin-bottom:20px;">Dear Hiring Manager,</div>
    <div style="display:flex;flex-direction:column;gap:18px;font-size:14px;color:#374151;line-height:2;">
      ${cl.intro || '<span style="color:#d1d5db;font-style:italic;">Opening paragraph…</span>'}
      ${cl.body ? `<div>${cl.body}</div>` : ''}
      ${cl.closing ? `<div>${cl.closing}</div>` : ''}
    </div>
    <div style="margin-top:40px;"><div style="font-size:13px;color:#a16207;">With warmth,</div>
      <div style="font-size:24px;font-weight:800;color:#1c0a00;margin-top:12px;">${name}</div>
    </div>
  </div>`;
}

// Cover: Technical — monospace, clean dev style
function renderCoverTechnical(data) {
  const name = fullName(data);
  const cl = data.coverLetter;
  return `<div style="min-height:297mm;background:#0a0a0f;font-family:'Space Mono',monospace;padding:48px 52px;color:#c9d1d9;">
    <div style="border-bottom:1px solid #21262d;padding-bottom:24px;margin-bottom:32px;">
      <div style="font-size:10px;color:#3fb950;margin-bottom:8px;">&gt; cat cover_letter.md</div>
      <div style="font-size:28px;font-weight:700;color:white;letter-spacing:-0.02em;">${name}</div>
      ${data.title ? `<div style="font-size:11px;color:#3fb950;margin-top:6px;"># ${data.title}</div>` : ''}
      <div style="margin-top:10px;font-size:10px;color:#6e7681;">${[data.email,data.phone,data.location,data.website].filter(Boolean).join('  |  ')}</div>
    </div>
    ${cl.company||cl.role ? `<div style="font-size:10px;color:#8b949e;margin-bottom:24px;">// applying for: ${cl.role||''}${cl.role&&cl.company?' @ ':''}${cl.company||''}</div>` : ''}
    <div style="font-size:11px;color:#8b949e;margin-bottom:16px;">Dear Hiring Manager,</div>
    <div style="display:flex;flex-direction:column;gap:16px;font-size:12px;color:#c9d1d9;line-height:1.9;font-family:'DM Sans',sans-serif;">
      ${cl.intro || '<span style="color:#334155;font-style:italic;">Opening paragraph…</span>'}
      ${cl.body ? `<div>${cl.body}</div>` : ''}
      ${cl.closing ? `<div>${cl.closing}</div>` : ''}
    </div>
    <div style="margin-top:48px;font-size:11px;color:#6e7681;">-- ${name}</div>
  </div>`;
}

// ─────────────────────────────────────────────────────
// PORTFOLIO RENDERERS — 5 wholly distinct layouts
// ─────────────────────────────────────────────────────
function renderPortfolio(data) {
  const styles = {
    agency:    renderPortAgency,
    gallery:   renderPortGallery,
    casestudy: renderPortCaseStudy,
    bold:      renderPortBold,
    minimal:   renderPortMinimal,
  };
  return (styles[currentPortStyle] || renderPortAgency)(data);
}

// Portfolio: Agency — dark immersive showcase
function renderPortAgency(data) {
  const name = fullName(data);
  return `<div style="min-height:297mm;background:#080810;font-family:'Syne',sans-serif;color:white;">
    <div style="padding:48px 44px 32px;background:linear-gradient(180deg,rgba(139,92,246,0.15),transparent);">
      <div style="font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:#7c3aed;margin-bottom:12px;">Portfolio</div>
      <div style="font-size:48px;font-weight:800;letter-spacing:-0.05em;line-height:0.9;">${name}</div>
      ${data.title ? `<div style="font-size:13px;color:#7dd3fc;margin-top:10px;">${data.title}</div>` : ''}
      ${data.summary ? `<div style="font-size:12px;color:#64748b;max-width:440px;line-height:1.7;margin-top:10px;font-family:'DM Sans',sans-serif;">${data.summary}</div>` : ''}
      <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;">
        ${[data.email,data.phone,data.location,data.website].filter(Boolean).map(v=>`<span style="font-size:10px;color:#475569;padding:2px 10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:999px;">${v}</span>`).join('')}
      </div>
    </div>
    ${data.projects.length ? `
    <div style="padding:0 44px 32px;">
      <div style="font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:#334155;margin-bottom:16px;padding-top:24px;border-top:1px solid rgba(255,255,255,0.05);">Selected Work</div>
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${data.projects.map((p,i)=>`<div style="padding:18px 20px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;display:grid;grid-template-columns:32px 1fr auto;">
          <div style="font-family:'Space Mono',monospace;font-size:10px;color:#334155;padding-top:2px;">${String(i+1).padStart(2,'0')}</div>
          <div>
            <div style="font-size:15px;font-weight:700;color:white;">${p.name||'Project'}</div>
            ${p.role ? `<div style="font-size:11px;color:#7c3aed;margin-top:2px;">${p.role}</div>` : ''}
            ${p.description ? `<div style="font-size:11px;color:#64748b;margin-top:6px;line-height:1.7;font-family:'DM Sans',sans-serif;">${p.description}</div>` : ''}
            ${p.problem ? `<div style="margin-top:6px;font-size:10px;font-family:'DM Sans',sans-serif;"><span style="color:#475569;text-transform:uppercase;letter-spacing:0.08em;font-size:9px;">Problem · </span><span style="color:#64748b;">${p.problem}</span></div>` : ''}
            ${p.outcome ? `<div style="margin-top:4px;font-size:10px;font-family:'DM Sans',sans-serif;"><span style="color:#3fb950;text-transform:uppercase;letter-spacing:0.08em;font-size:9px;">Outcome · </span><span style="color:#86efac;">${p.outcome}</span></div>` : ''}
          </div>
          <div style="text-align:right;">
            ${p.year?`<div style="font-size:10px;color:#334155;">${p.year}</div>`:''}
            ${p.link?`<div style="font-size:10px;color:#7c3aed;margin-top:2px;">${p.link}</div>`:''}
          </div>
        </div>`).join('')}
      </div>
    </div>` : ''}
    ${data.skills.length ? `<div style="padding:0 44px 32px;">
      <div style="font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:#334155;margin-bottom:14px;">Skills</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;">
        ${data.skills.map(s=>`<span style="padding:3px 12px;border-radius:999px;font-size:11px;
          ${isHighlighted(s,data)?'background:#7c3aed;color:white;':'background:rgba(255,255,255,0.05);color:#64748b;border:1px solid rgba(255,255,255,0.06);'}">${s}</span>`).join('')}
      </div>
    </div>` : ''}
    <div style="padding:0 44px 44px;display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      ${data.experiences.length ? `<div style="padding:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:8px;">
        <div style="font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:#334155;margin-bottom:10px;">Experience</div>
        ${data.experiences.map(e=>`<div style="margin-bottom:8px;">
          <div style="font-size:12px;font-weight:700;color:#e2e8f0;">${e.position||'Role'}</div>
          <div style="font-size:10px;color:#475569;">${e.company||''}${dateRange(e)?` · ${dateRange(e)}`:''}</div>
        </div>`).join('')}
      </div>` : ''}
      ${data.educations.length ? `<div style="padding:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:8px;">
        <div style="font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:#334155;margin-bottom:10px;">Education</div>
        ${data.educations.map(e=>`<div style="margin-bottom:8px;">
          <div style="font-size:12px;font-weight:700;color:#e2e8f0;">${e.school||'School'}</div>
          <div style="font-size:10px;color:#475569;">${e.degree||''}${e.degree&&e.field?', ':''}${e.field||''} ${e.year?`· ${e.year}`:''}</div>
        </div>`).join('')}
      </div>` : ''}
    </div>
  </div>`;
}

// Portfolio: Gallery — light card grid
function renderPortGallery(data) {
  const name = fullName(data);
  return `<div style="min-height:297mm;background:#f8f9fa;font-family:'Outfit',sans-serif;padding:40px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:32px;padding-bottom:20px;border-bottom:2px solid #e9ecef;">
      <div>
        <div style="font-size:32px;font-weight:800;color:#212529;letter-spacing:-0.04em;">${name}</div>
        ${data.title ? `<div style="font-size:13px;color:#6c757d;margin-top:4px;">${data.title}</div>` : ''}
        <div style="margin-top:6px;font-size:11px;color:#adb5bd;">${contactLine(data,' · ')}</div>
      </div>
      ${data.skills.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;max-width:220px;justify-content:flex-end;">
        ${data.skills.slice(0,6).map(s=>`<span style="padding:2px 10px;border-radius:999px;font-size:10px;font-weight:600;
          ${isHighlighted(s,data)?'background:#212529;color:white;':'background:white;color:#495057;border:1px solid #dee2e6;'}">${s}</span>`).join('')}
      </div>` : ''}
    </div>
    ${data.summary ? `<div style="margin-bottom:24px;font-size:13px;color:#495057;line-height:1.8;max-width:480px;">${data.summary}</div>` : ''}
    ${data.projects.length ? `<div style="margin-bottom:28px;">
      <div style="font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#adb5bd;margin-bottom:14px;">Projects</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        ${data.projects.map(p=>`<div style="background:white;border-radius:10px;padding:16px;border:1px solid #dee2e6;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
            <div style="font-size:13px;font-weight:700;color:#212529;">${p.name||'Project'}</div>
            ${p.year?`<div style="font-size:9px;color:#adb5bd;">${p.year}</div>`:''}
          </div>
          ${p.role ? `<div style="font-size:10px;color:#6c757d;font-weight:600;margin-bottom:5px;">${p.role}</div>` : ''}
          ${p.description ? `<div style="font-size:11px;color:#495057;line-height:1.6;">${p.description}</div>` : ''}
          ${p.problem ? `<div style="margin-top:5px;font-size:10px;"><span style="color:#adb5bd;text-transform:uppercase;letter-spacing:0.08em;font-size:9px;">Problem · </span><span style="color:#6c757d;">${p.problem}</span></div>` : ''}
          ${p.outcome ? `<div style="margin-top:3px;font-size:10px;"><span style="color:#2b9348;text-transform:uppercase;letter-spacing:0.08em;font-size:9px;">Outcome · </span><span style="color:#2b9348;font-weight:600;">${p.outcome}</span></div>` : ''}
          ${p.link ? `<div style="font-size:10px;color:#4361ee;margin-top:6px;">↗ ${p.link}</div>` : ''}
        </div>`).join('')}
      </div>
    </div>` : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
      ${data.experiences.length ? `<div style="background:white;border-radius:10px;padding:14px;border:1px solid #dee2e6;">
        <div style="font-size:9px;font-weight:800;letter-spacing:0.15em;text-transform:uppercase;color:#adb5bd;margin-bottom:10px;">Experience</div>
        ${data.experiences.map(e=>`<div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #f8f9fa;">
          <div style="font-size:11px;font-weight:700;color:#212529;">${e.position||'Role'}</div>
          <div style="font-size:10px;color:#6c757d;">${e.company||''}</div>
          ${dateRange(e)?`<div style="font-size:9px;color:#adb5bd;">${dateRange(e)}</div>`:''}
        </div>`).join('')}
      </div>` : ''}
      ${data.educations.length ? `<div style="background:white;border-radius:10px;padding:14px;border:1px solid #dee2e6;">
        <div style="font-size:9px;font-weight:800;letter-spacing:0.15em;text-transform:uppercase;color:#adb5bd;margin-bottom:10px;">Education</div>
        ${data.educations.map(e=>`<div style="margin-bottom:8px;">
          <div style="font-size:11px;font-weight:700;color:#212529;">${e.school||'School'}</div>
          <div style="font-size:10px;color:#6c757d;">${e.degree||''}${e.field?`, ${e.field}`:''}</div>
          ${e.year?`<div style="font-size:9px;color:#adb5bd;">${e.year}</div>`:''}
        </div>`).join('')}
      </div>` : ''}
      ${data.certifications.length ? `<div style="background:white;border-radius:10px;padding:14px;border:1px solid #dee2e6;">
        <div style="font-size:9px;font-weight:800;letter-spacing:0.15em;text-transform:uppercase;color:#adb5bd;margin-bottom:10px;">Certs</div>
        ${data.certifications.map(c=>`<div style="margin-bottom:8px;font-size:10px;color:#495057;">${c.name}${c.year?` · ${c.year}`:''}</div>`).join('')}
      </div>` : ''}
    </div>
  </div>`;
}

// Portfolio: Case Study — narrative deep-dive
function renderPortCaseStudy(data) {
  const name = fullName(data);
  return `<div style="min-height:297mm;background:white;font-family:'DM Sans',sans-serif;">
    <div style="background:#1a1a2a;padding:44px 52px;">
      <div style="font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:#6366f1;margin-bottom:10px;">Case Studies</div>
      <div style="font-family:'Syne',sans-serif;font-size:38px;font-weight:800;color:white;letter-spacing:-0.04em;">${name}</div>
      ${data.title ? `<div style="font-size:12px;color:#818cf8;margin-top:8px;">${data.title}</div>` : ''}
      <div style="margin-top:10px;font-size:11px;color:#475569;">${contactLine(data,' · ')}</div>
    </div>
    ${data.summary ? `<div style="padding:24px 52px;background:#f0f9ff;border-bottom:1px solid #e0e7ff;">
      <div style="font-size:13px;color:#1e40af;line-height:1.8;max-width:520px;">${data.summary}</div>
    </div>` : ''}
    ${data.projects.length ? `<div style="padding:32px 52px;display:flex;flex-direction:column;gap:28px;">
      ${data.projects.map((p,i)=>`<div style="${i>0?'padding-top:28px;border-top:1px solid #f1f5f9':''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
          <div>
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="width:6px;height:6px;border-radius:50%;background:#6366f1;"></div>
              <div style="font-family:'Syne',sans-serif;font-size:17px;font-weight:700;color:#1a1a2a;">${p.name||'Project'}</div>
            </div>
            ${p.role?`<div style="font-size:11px;color:#6366f1;font-weight:600;margin-top:3px;margin-left:14px;">${p.role}</div>`:''}
          </div>
          <div style="text-align:right;">
            ${p.year?`<div style="font-size:10px;color:#94a3b8;">${p.year}</div>`:''}
            ${p.link?`<div style="font-size:10px;color:#6366f1;margin-top:2px;">↗ ${p.link}</div>`:''}
          </div>
        </div>
        ${p.description?`<div style="font-size:13px;color:#334155;line-height:1.8;padding-left:14px;border-left:2px solid #e0e7ff;">${p.description}</div>`:''}
        ${p.problem?`<div style="margin-top:8px;padding-left:14px;"><span style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;">Problem</span><div style="font-size:12px;color:#475569;line-height:1.7;">${p.problem}</div></div>`:''}
        ${p.outcome?`<div style="margin-top:6px;padding-left:14px;background:#f0fdf4;border-left:2px solid #22c55e;padding:8px 14px;"><span style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:#16a34a;">Outcome</span><div style="font-size:12px;color:#15803d;font-weight:600;line-height:1.7;">${p.outcome}</div></div>`:''}
      </div>`).join('')}
    </div>` : ''}
    <div style="padding:0 52px 40px;display:grid;grid-template-columns:1fr 1fr;gap:28px;">
      ${data.skills.length ? `<div>
        <div style="font-size:9px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#94a3b8;margin-bottom:12px;border-bottom:1px solid #f1f5f9;padding-bottom:8px;">Skills</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;">
          ${data.skills.map(s=>`<span style="padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;
            ${isHighlighted(s,data)?'background:#6366f1;color:white;':'background:#f1f5f9;color:#475569;'}">${s}</span>`).join('')}
        </div>
      </div>` : ''}
      ${data.experiences.length ? `<div>
        <div style="font-size:9px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#94a3b8;margin-bottom:12px;border-bottom:1px solid #f1f5f9;padding-bottom:8px;">Experience</div>
        ${data.experiences.map(e=>`<div style="margin-bottom:8px;">
          <div style="font-size:12px;font-weight:700;color:#1a1a2a;">${e.position||'Role'}</div>
          <div style="font-size:11px;color:#6366f1;">${e.company||''}</div>
          ${dateRange(e)?`<div style="font-size:10px;color:#94a3b8;">${dateRange(e)}</div>`:''}
        </div>`).join('')}
      </div>` : ''}
    </div>
  </div>`;
}

// Portfolio: Bold — high-contrast, typographic impact
function renderPortBold(data) {
  const name = fullName(data);
  return `<div style="min-height:297mm;background:white;font-family:'Syne',sans-serif;overflow:hidden;">
    <div style="background:black;padding:52px 48px 40px;">
      <div style="font-size:72px;font-weight:800;color:white;letter-spacing:-0.06em;line-height:0.85;">${data.firstName||'Your'}<br><span style="color:#f59e0b;">${data.lastName||'Name'}</span></div>
      ${data.title ? `<div style="font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:#6b7280;margin-top:16px;">${data.title}</div>` : ''}
    </div>
    <div style="background:#f59e0b;padding:12px 48px;display:flex;gap:20px;flex-wrap:wrap;">
      ${[data.email,data.phone,data.location,data.website].filter(Boolean).map(v=>`<span style="font-size:11px;color:#1c0a00;font-weight:600;">${v}</span>`).join('<span style="color:rgba(0,0,0,0.2);">·</span>')}
    </div>
    <div style="padding:36px 48px;display:grid;grid-template-columns:2fr 1fr;gap:36px;">
      <div style="display:flex;flex-direction:column;gap:28px;">
        ${data.summary ? `<div style="font-size:16px;color:#1a1a2a;line-height:1.7;font-family:'DM Sans',sans-serif;font-weight:300;">${data.summary}</div>` : ''}
        ${data.projects.length ? `<div>
          <div style="font-size:10px;font-weight:800;letter-spacing:0.22em;text-transform:uppercase;color:#f59e0b;margin-bottom:16px;">Work</div>
          ${data.projects.map(p=>`<div style="margin-bottom:20px;padding-bottom:20px;border-bottom:2px solid #000;">
            <div style="font-size:18px;font-weight:800;color:#0f172a;letter-spacing:-0.02em;">${p.name||'Project'}</div>
            ${p.role?`<div style="font-size:11px;font-weight:600;color:#f59e0b;">${p.role} ${p.year?`· ${p.year}`:''}</div>`:''}
            ${p.description?`<div style="font-size:12px;color:#374151;line-height:1.7;margin-top:6px;font-family:'DM Sans',sans-serif;">${p.description}</div>`:''}
            ${p.problem?`<div style="margin-top:5px;font-size:11px;font-family:'DM Sans',sans-serif;"><span style="color:#9ca3af;font-size:9px;text-transform:uppercase;letter-spacing:0.1em;">Problem · </span>${p.problem}</div>`:''}
            ${p.outcome?`<div style="margin-top:3px;font-size:11px;font-family:'DM Sans',sans-serif;color:#f59e0b;font-weight:700;">↑ ${p.outcome}</div>`:''}
            ${p.link?`<div style="font-size:10px;color:#f59e0b;margin-top:4px;">↗ ${p.link}</div>`:''}
          </div>`).join('')}
        </div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:24px;">
        ${data.skills.length ? `<div>
          <div style="font-size:10px;font-weight:800;letter-spacing:0.22em;text-transform:uppercase;color:#f59e0b;margin-bottom:12px;">Skills</div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            ${data.skills.map(s=>`<div style="font-size:12px;color:${isHighlighted(s,data)?'#0f172a':'#9ca3af'};font-weight:${isHighlighted(s,data)?'800':'400'};padding:4px 0;border-bottom:1px solid ${isHighlighted(s,data)?'#000':'#f3f4f6'};">${isHighlighted(s,data)?'★ ':''}${s}</div>`).join('')}
          </div>
        </div>` : ''}
        ${data.educations.length ? `<div>
          <div style="font-size:10px;font-weight:800;letter-spacing:0.22em;text-transform:uppercase;color:#f59e0b;margin-bottom:12px;">Education</div>
          ${data.educations.map(e=>`<div style="margin-bottom:10px;">
            <div style="font-size:13px;font-weight:800;color:#0f172a;">${e.school||'School'}</div>
            <div style="font-size:11px;color:#9ca3af;">${e.degree||''}${e.field?`, ${e.field}`:''} ${e.year?`· ${e.year}`:''}</div>
          </div>`).join('')}
        </div>` : ''}
      </div>
    </div>
  </div>`;
}

// Portfolio: Minimal — text-first, total restraint
function renderPortMinimal(data) {
  const name = fullName(data);
  return `<div style="padding:72px 80px;min-height:297mm;background:white;font-family:'Outfit',sans-serif;">
    <div style="margin-bottom:48px;">
      <div style="font-size:11px;color:#d1d5db;letter-spacing:0.04em;margin-bottom:10px;">Portfolio</div>
      <div style="font-size:36px;font-weight:300;color:#111827;letter-spacing:-0.04em;">${name}</div>
      ${data.title ? `<div style="font-size:13px;color:#9ca3af;margin-top:4px;">${data.title}</div>` : ''}
      <div style="margin-top:8px;font-size:11px;color:#d1d5db;">${contactLine(data,' · ')}</div>
    </div>
    ${data.summary ? `<div style="margin-bottom:40px;max-width:460px;font-size:14px;color:#6b7280;line-height:2;">${data.summary}</div>` : ''}
    ${data.projects.length ? `<div style="margin-bottom:40px;">
      <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#e5e7eb;margin-bottom:20px;">Projects</div>
      ${data.projects.map(p=>`<div style="display:grid;grid-template-columns:100px 1fr;gap:16px;margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #f9fafb;">
        <div style="font-size:11px;color:#d1d5db;padding-top:3px;">${p.year||'—'}</div>
        <div>
          <div style="font-size:14px;font-weight:600;color:#111827;">${p.name||'Project'}</div>
          ${p.role?`<div style="font-size:11px;color:#9ca3af;margin-top:2px;">${p.role}</div>`:''}
          ${p.description?`<div style="font-size:12px;color:#374151;line-height:1.7;margin-top:4px;">${p.description}</div>`:''}
          ${p.problem?`<div style="margin-top:4px;font-size:11px;color:#9ca3af;"><span style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;">Problem · </span>${p.problem}</div>`:''}
          ${p.outcome?`<div style="margin-top:3px;font-size:11px;color:#111827;font-weight:600;">↑ ${p.outcome}</div>`:''}
          ${p.link?`<div style="font-size:10px;color:#9ca3af;margin-top:4px;">↗ ${p.link}</div>`:''}
        </div>
      </div>`).join('')}
    </div>` : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;">
      ${data.skills.length ? `<div>
        <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#e5e7eb;margin-bottom:14px;">Skills</div>
        <div>${data.skills.map(s=>`<span style="font-size:12px;color:${isHighlighted(s,data)?'#111827':'#9ca3af'};font-weight:${isHighlighted(s,data)?'600':'400'};">${s}</span>`).join('<span style="color:#e5e7eb;"> / </span>')}</div>
      </div>` : ''}
      ${data.experiences.length ? `<div>
        <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#e5e7eb;margin-bottom:14px;">Experience</div>
        ${data.experiences.map(e=>`<div style="margin-bottom:10px;">
          <div style="font-size:13px;font-weight:600;color:#111827;">${e.position||'Role'}</div>
          <div style="font-size:11px;color:#9ca3af;">${e.company||''} ${dateRange(e)?`· ${dateRange(e)}`:''}</div>
        </div>`).join('')}
      </div>` : ''}
    </div>
  </div>`;
}

// ── EXPORT MENU TOGGLE ────────────────────────────────
function toggleExportMenu(e) {
  e.stopPropagation();
  document.getElementById('exportMenu').classList.toggle('open');
}
document.addEventListener('click', () => {
  const menu = document.getElementById('exportMenu');
  if (menu) menu.classList.remove('open');
});

// ── EXPORT PDF ────────────────────────────────────────
function exportToPDF() {
  document.getElementById('exportMenu').classList.remove('open');
  const data = getFormData();
  const fname = `${(data.firstName||'Resume').replace(/[^a-zA-Z0-9_-]/g,'')||'Resume'}-Nyxon.pdf`;
  const el = document.getElementById('resumePreview');
  html2pdf().set({
    margin: 0,
    filename: fname,
    image: { type:'jpeg', quality:0.98 },
    html2canvas: { scale:2, useCORS:true, logging:false },
    jsPDF: { unit:'mm', format:'a4', orientation:'portrait' }
  }).from(el).save();
  showToast();
}

// ── EXPORT DOCX ───────────────────────────────────────
async function exportToDocx() {
  document.getElementById('exportMenu').classList.remove('open');
  showToast();
  const data = getFormData();
  const name = fullName(data);
  const fname = `${(data.firstName||'Resume').replace(/[^a-zA-Z0-9_-]/g,'')||'Resume'}-Nyxon.docx`;

  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel,
    AlignmentType, BorderStyle, Table, TableRow, TableCell,
    WidthType, ShadingType, convertInchesToTwip, UnderlineType
  } = docx;

  const ACCENT = '8B5CF6';
  const DARK   = '0F172A';
  const MUTED  = '64748B';
  const LIGHT  = 'F1F5F9';

  const hRule = () => new Paragraph({
    border: { bottom: { color: 'E2E8F0', size: 6, style: BorderStyle.SINGLE } },
    spacing: { after: 120 },
  });

  const sectionHeading = (text) => new Paragraph({
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 18, color: ACCENT, characterSpacing: 80 })],
    spacing: { before: 280, after: 100 },
    border: { bottom: { color: 'E2E8F0', size: 4, style: BorderStyle.SINGLE } },
  });

  const bodyText = (text, opts = {}) => new Paragraph({
    children: [new TextRun({ text, size: 22, color: opts.color || '374151', bold: opts.bold || false, italics: opts.italic || false })],
    spacing: { after: opts.spaceAfter ?? 60 },
    indent: opts.indent ? { left: convertInchesToTwip(0.15) } : {},
  });

  const children = [];

  // ── Name & title
  children.push(new Paragraph({
    children: [new TextRun({ text: name, bold: true, size: 52, color: DARK })],
    spacing: { after: 60 },
  }));
  if (data.title) children.push(new Paragraph({
    children: [new TextRun({ text: data.title, size: 24, color: MUTED, italics: true })],
    spacing: { after: 80 },
  }));

  // ── Contact line
  const contactParts = [data.email, data.phone, data.location, data.website].filter(Boolean);
  if (contactParts.length) children.push(new Paragraph({
    children: contactParts.map((c, i) => new TextRun({
      text: i < contactParts.length - 1 ? `${c}  ·  ` : c,
      size: 19, color: MUTED,
    })),
    spacing: { after: 200 },
  }));

  children.push(hRule());

  // ── Summary
  if (data.summary) {
    children.push(sectionHeading('Profile'));
    children.push(bodyText(data.summary, { spaceAfter: 200 }));
    children.push(hRule());
  }

  // ── Experience
  if (data.experiences.length) {
    children.push(sectionHeading('Experience'));
    data.experiences.forEach(e => {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: e.position || 'Position', bold: true, size: 24, color: DARK }),
          new TextRun({ text: `  ·  ${e.company || ''}`, size: 22, color: ACCENT }),
        ],
        spacing: { before: 120, after: 40 },
      }));
      if (e.startDate || e.endDate) children.push(new Paragraph({
        children: [new TextRun({ text: `${e.startDate || ''}${e.startDate && e.endDate ? ' – ' : ''}${e.endDate || ''}`, size: 18, color: MUTED, italics: true })],
        spacing: { after: 60 },
      }));
      if (e.description) children.push(bodyText(e.description, { indent: true, spaceAfter: 120 }));
    });
    children.push(hRule());
  }

  // ── Education
  if (data.educations.length) {
    children.push(sectionHeading('Education'));
    data.educations.forEach(e => {
      children.push(new Paragraph({
        children: [new TextRun({ text: e.school || 'School', bold: true, size: 24, color: DARK })],
        spacing: { before: 100, after: 40 },
      }));
      children.push(new Paragraph({
        children: [new TextRun({ text: `${e.degree || ''}${e.degree && e.field ? ', ' : ''}${e.field || ''}${e.year ? '  ·  ' + e.year : ''}`, size: 20, color: MUTED, italics: true })],
        spacing: { after: 100 },
      }));
    });
    children.push(hRule());
  }

  // ── Skills
  if (data.skills.length) {
    children.push(sectionHeading('Skills'));
    children.push(new Paragraph({
      children: data.skills.map((s, i) => new TextRun({
        text: i < data.skills.length - 1 ? `${s}  ·  ` : s,
        size: 21, color: '334155',
      })),
      spacing: { after: 200 },
    }));
    children.push(hRule());
  }

  // ── Certifications (resume/cv only)
  if (data.certifications.length && (currentMode === 'resume' || currentMode === 'cv')) {
    children.push(sectionHeading('Certifications'));
    data.certifications.forEach(c => {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: c.name, bold: true, size: 22, color: DARK }),
          ...(c.issuer ? [new TextRun({ text: `  —  ${c.issuer}`, size: 20, color: MUTED })] : []),
          ...(c.year ? [new TextRun({ text: `  (${c.year})`, size: 18, color: MUTED, italics: true })] : []),
        ],
        spacing: { after: 80 },
      }));
    });
    children.push(hRule());
  }
/* =====================================================
   NYXON BASE — Resume Studio
   script.js — Complete State & Render Engine
   =====================================================

   This JavaScript file contains the entire client-side application logic
   for the resume builder. It handles:
   - application state and mode selection
   - dynamic form rendering for experience, education, certifications, skills,
     cover letters, and portfolio projects
   - live preview updates for resume, CV, cover letter, and portfolio modes
   - template selection and rendering for multiple design styles
   - data sanitization and PDF export integration through html2pdf

   The file is organized into sections:
   1. STATE: in-memory data objects that represent the current user inputs.
   2. TEMPLATE DEFINITIONS: available design options for resume, cover, and portfolio.
   3. INIT: startup logic executed when the page loads.
   4. UI CONTROLS: functions that toggle sections, handle inputs, and switch modes.
   5. DATA HELPERS: utility helpers for reading form fields and formatting data.
   6. RENDERERS: functions that build the HTML string for each document style.
*/

// ── STATE ──────────────────────────────────────────────
// currentMode: selected top-level document type (resume, cv, cover, portfolio)
let currentMode     = 'resume';
// currentTemplate: selected resume visual style for resume/cv modes
let currentTemplate = 'modern';
// currentCoverStyle: selected cover letter layout style
let currentCoverStyle   = 'editorial';
// currentPortStyle: selected portfolio layout style
let currentPortStyle    = 'agency';

// Data arrays hold repeatable items for the document.
let experiences  = [];
let educations   = [];
let certifications = [];
let skills       = [];
let projects     = [];

// Cover letter object holds the typed sections for a cover letter mode.
let coverLetter  = { company:'', role:'', intro:'', body:'', closing:'' };

// ── TEMPLATE DEFINITIONS ───────────────────────────────
const TEMPLATES = [
  { id:'modern',    name:'Modern',    sub:'Two-col',  thumb:'bg-gradient-to-br from-slate-800 to-slate-900', icon:'◐' },
  { id:'classic',   name:'Classic',   sub:'Serif',    thumb:'bg-white border border-slate-300',              icon:'❡' },
  { id:'minimal',   name:'Minimal',   sub:'Airy',     thumb:'bg-slate-50',                                   icon:'—' },
  { id:'executive', name:'Executive', sub:'Premium',  thumb:'bg-gradient-to-br from-stone-800 to-amber-900', icon:'◆' },
  { id:'creative',  name:'Creative',  sub:'Bold',     thumb:'bg-gradient-to-br from-rose-600 to-pink-400',   icon:'✦' },
  { id:'technical', name:'Technical', sub:'Dev',      thumb:'bg-slate-950 font-mono',                        icon:'<>' },
  { id:'academic',  name:'Academic',  sub:'Scholarly',thumb:'bg-amber-50 border border-amber-200',           icon:'∂' },
  { id:'ats',       name:'ATS Safe',  sub:'Clean',    thumb:'bg-white border-2 border-green-400',            icon:'✓' },
  { id:'startup',   name:'Startup',   sub:'Energy',   thumb:'bg-gradient-to-r from-cyan-500 to-violet-600',  icon:'⚡' },
  { id:'corporate', name:'Corporate', sub:'Refined',  thumb:'bg-gradient-to-br from-slate-700 to-blue-900',  icon:'▦' },
  { id:'freelance', name:'Freelance', sub:'Studio',   thumb:'bg-gradient-to-br from-amber-400 to-orange-500',icon:'◈' },
  { id:'editorial', name:'Editorial', sub:'Magazine', thumb:'bg-gradient-to-br from-violet-700 to-fuchsia-600',icon:'⊞' },
];

const COVER_STYLES = [
  { id:'editorial',  name:'Editorial',  sub:'Magazine-style opener' },
  { id:'classic',    name:'Classic',    sub:'Traditional business letter' },
  { id:'modern',     name:'Modern',     sub:'Clean card layout' },
  { id:'creative',   name:'Creative',   sub:'Bold dark design' },
  { id:'minimalist', name:'Minimalist', sub:'Stripped to essence' },
  { id:'executive',  name:'Executive',  sub:'Premium dark header' },
  { id:'warm',       name:'Warm',       sub:'Friendly & approachable' },
  { id:'technical',  name:'Technical',  sub:'Clean monospace style' },
];

const PORT_STYLES = [
  { id:'agency',     name:'Agency',     sub:'Immersive dark showcase' },
  { id:'gallery',    name:'Gallery',    sub:'Light card grid' },
  { id:'casestudy',  name:'Case Study', sub:'Deep-dive narrative' },
  { id:'bold',       name:'Bold',       sub:'Full-bleed impact' },
  { id:'minimal',    name:'Minimal',    sub:'Text-first clarity' },
];

// ── INIT ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();

  buildTemplateGrid();
  buildCoverStyleGrid();
  buildPortStyleGrid();
  addExperience();
  addEducation();
  addCertification();

  // Collapse all sidebar panels on first load
  collapseAllSidebarPanels();

  setMode('resume');
  updatePreview();
});

// ── THEME (Light / Dark) ────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('nyxon-theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved === 'light' || saved === 'dark' ? saved : (prefersDark ? 'dark' : 'light');
  setTheme(theme, { persist: false });
}

window.setTheme = function(theme, opts = {}) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  const persist = opts.persist !== false;
  if (persist) localStorage.setItem('nyxon-theme', t);

  const darkBtn = document.getElementById('theme-btn-dark');
  const lightBtn = document.getElementById('theme-btn-light');
  if (darkBtn) darkBtn.classList.toggle('active', t === 'dark');
  if (lightBtn) lightBtn.classList.toggle('active', t === 'light');
};

// Ensure default theme attribute exists early (before CSS loads)
(function ensureThemeAttr() {
  if (!document.documentElement.getAttribute('data-theme')) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();


// ── SECTION COLLAPSE ───────────────────────────────────
function toggleSection(secId) {
  let body = document.querySelector(`#${secId} .section-body`);
  if (!body) body = document.getElementById(`${secId}-body`);
  if (!body) return;
  const section = body.closest('.sidebar-section');
  const chevron = section ? section.querySelector('.section-chevron') : document.querySelector(`#${secId} .section-chevron`);
  const isCollapsed = body.classList.contains('collapsed');
  body.classList.toggle('collapsed');
  if (chevron) chevron.style.transform = isCollapsed ? '' : 'rotate(-90deg)';
}

function collapseAllSidebarPanels() {
  document.querySelectorAll('#sidebar .sidebar-section .section-body').forEach(body => {
    body.classList.add('collapsed');

    const section = body.closest('.sidebar-section');
    const chevron = section ? section.querySelector('.section-chevron') : null;
    if (chevron) chevron.style.transform = 'rotate(-90deg)';
  });
}


// ── TEMPLATE GRID ──────────────────────────────────────
function buildTemplateGrid() {
  const grid = document.getElementById('templateGrid');
  grid.innerHTML = TEMPLATES.map(t => `
    <div class="tpl-card ${t.id === currentTemplate ? 'active' : ''}" id="tpl-${t.id}" onclick="setTemplate('${t.id}')">
      <div class="tpl-thumb ${t.thumb}" style="font-size:14px;color:white;letter-spacing:-0.02em;">${t.icon}</div>
      <div class="tpl-name">${t.name}</div>
      <div class="tpl-sub">${t.sub}</div>
    </div>
  `).join('');
}

function buildCoverStyleGrid() {
  const grid = document.getElementById('coverStyleGrid');
  grid.innerHTML = COVER_STYLES.map(s => `
    <div class="style-card ${s.id === currentCoverStyle ? 'active' : ''}" id="cvr-${s.id}" onclick="setCoverStyle('${s.id}')">
      <div class="style-card-name">${s.name}</div>
      <div class="style-card-sub">${s.sub}</div>
    </div>
  `).join('');
}

function buildPortStyleGrid() {
  const grid = document.getElementById('portStyleGrid');
  grid.innerHTML = PORT_STYLES.map(s => `
    <div class="style-card ${s.id === currentPortStyle ? 'active' : ''}" id="prt-${s.id}" onclick="setPortStyle('${s.id}')">
      <div class="style-card-name">${s.name}</div>
      <div class="style-card-sub">${s.sub}</div>
    </div>
  `).join('');
}

function setTemplate(id) {
  currentTemplate = id;
  document.querySelectorAll('.tpl-card').forEach(c => c.classList.toggle('active', c.id === `tpl-${id}`));
    const selectedCard = document.getElementById(`tpl-${id}`);
  if (selectedCard) selectedCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  updatePreview();
}

function setCoverStyle(id) {
  currentCoverStyle = id;
  document.querySelectorAll('#coverStyleGrid .style-card').forEach(c => c.classList.toggle('active', c.id === `cvr-${id}`));
  updatePreview();
}

function setPortStyle(id) {
  currentPortStyle = id;
  document.querySelectorAll('#portStyleGrid .style-card').forEach(c => c.classList.toggle('active', c.id === `prt-${id}`));
  updatePreview();
}

// ── MODE ───────────────────────────────────────────────
function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.mode-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.mode === mode);
  });

  // show/hide sidebar panels
  document.getElementById('sec-template').style.display    = (mode==='resume'||mode==='cv') ? '' : 'none';
  document.getElementById('sec-cover-style').style.display = mode==='cover'     ? '' : 'none';
  document.getElementById('sec-port-style').style.display  = mode==='portfolio' ? '' : 'none';
  document.getElementById('sec-exp-wrap').style.display    = (mode==='cover') ? 'none' : '';
  document.getElementById('sec-edu-wrap').style.display    = (mode==='cover') ? 'none' : '';
  document.getElementById('sec-skills').style.display      = (mode==='cover') ? 'none' : '';
  document.getElementById('sec-cert').style.display        = (mode==='cover' || mode==='portfolio') ? 'none' : '';
  document.getElementById('sec-cover-fields').style.display = mode==='cover'    ? '' : 'none';
  document.getElementById('sec-projects').style.display    = mode==='portfolio' ? '' : 'none';
  document.getElementById('targetJobGroup').style.display  = (mode==='resume')  ? '' : 'none';

  if (mode==='portfolio' && projects.length===0) addProject();
  updatePreview();
}

// ── ZOOM ───────────────────────────────────────────────
function updateZoom(val) {
  document.getElementById('preview-scaler').style.transform = `scale(${val})`;
  document.getElementById('zoom-label').textContent = Math.round(val*100) + '%';
}

// ── FORM DATA ──────────────────────────────────────────
function getFormData() {
  return {
    firstName: v('firstName'),
    lastName:  v('lastName'),
    title:     v('title'),
    targetJob: v('targetJob'),
    email:     v('email'),
    phone:     v('phone'),
    location:  v('location'),
    website:   v('website'),
    summary:   v('summary'),
    experiences:    experiences.filter(e => e.company || e.position),
    educations:     educations.filter(e => e.school || e.degree),
    certifications: certifications.filter(c => c.name),
    skills,
    coverLetter,
    projects: projects.filter(p => p.name || p.description),
    references: references.filter(r => r.name || r.email || r.institution || r.number),
  };
}
function v(id) { return (document.getElementById(id)||{}).value || ''; }
function fullName(d) { return (`${d.firstName} ${d.lastName}`).trim() || 'Your Name'; }

// highlight skill if it appears in target job
function isHighlighted(skill, data) {
  if (!data.targetJob) return false;
  return data.targetJob.toLowerCase().includes(skill.toLowerCase());
}

// ── EXPERIENCE ─────────────────────────────────────────
function addExperience() {
  experiences.push({ id: Date.now(), company:'', position:'', startDate:'', endDate:'', description:'' });
  renderExperienceInputs();
}
function removeExperience(id) {
  experiences = experiences.filter(e => e.id !== id);
  renderExperienceInputs(); updatePreview();
}
function updateExperience(id, field, value) {
  const e = experiences.find(e => e.id === id);
  if (e) { e[field] = value; updatePreview(); }
}
// ── COVER LETTER ───────────────────────────────────────
function updateCoverLetter(field, value) {
  coverLetter[field] = value;
  updatePreview();
}

// ── AI TOAST ───────────────────────────────────────────
function showToast() {
  const t = document.getElementById('ai-toast');
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2200);
}

// ── MAIN RENDER DISPATCHER ─────────────────────────────
// The updatePreview() function is the central render loop.
// It collects the current form data, chooses the right renderer based on
// the selected mode and template, and updates the preview pane HTML.
function updatePreview() {
  const data = getFormData();
  const el = document.getElementById('resumePreview');
  if (currentMode === 'cover')     el.innerHTML = renderCoverLetter(data);
  else if (currentMode === 'portfolio') el.innerHTML = renderPortfolio(data);
  else {
    // Both 'resume' and 'cv' use the template renderers
    // CV mode uses 'academic' template by default but respects user template choice
    const renderers = {
      modern: renderModern, classic: renderClassic, minimal: renderMinimal,
      executive: renderExecutive, creative: renderCreative, technical: renderTechnical,
      academic: renderAcademic, ats: renderATS, startup: renderStartup,
      corporate: renderCorporate, freelance: renderFreelance, editorial: renderEditorial,
    };
    // For CV mode, if template is 'modern' (default), use the dedicated CV renderer
    if (currentMode === 'cv' && currentTemplate === 'modern') {
      el.innerHTML = renderCV(data);
    } else {
      el.innerHTML = (renderers[currentTemplate] || renderModern)(data);
    }
  }
}

// ── UTILS ──────────────────────────────────────────────
function esc(s='') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function contactLine(d, sep=' · ') {
  const parts = [];
  if (d.email) parts.push(esc(d.email));
  if (d.phone) parts.push(esc(d.phone));
  if (d.location) parts.push(esc(d.location));
  if (d.website) parts.push(makeLink(d.website, d.website));
  if (d.linkedin) parts.push(makeLink(d.linkedin, d.linkedin));
  if (d.github) parts.push(makeLink(d.github, d.github));
  return parts.filter(Boolean).join(sep);
}
function dateRange(exp) {
  if (!exp.startDate && !exp.endDate) return '';
  if (!exp.endDate) return exp.startDate;
  return `${exp.startDate} – ${exp.endDate}`;
}

// ─────────────────────────────────────────────────────
// RESUME RENDERERS
// Each has a completely distinct layout, typography, and visual language
// ─────────────────────────────────────────────────────

// ── MODERN: Dark sidebar left, clean right ─────────────
function renderModern(data) {
  const name = fullName(data);
  return `<div style="display:flex;min-height:297mm;font-family:'DM Sans',sans-serif;">
    <div style="width:38%;background:#0f172a;color:white;padding:36px 28px;display:flex;flex-direction:column;gap:24px;">
      <div>
        <div style="font-family:'Syne',sans-serif;font-size:26px;font-weight:800;line-height:1.1;letter-spacing:-0.03em;">${name}</div>
        ${data.title ? `<div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#7dd3fc;margin-top:8px;">${data.title}</div>` : ''}
      </div>
      <div style="height:2px;background:linear-gradient(90deg,#8b5cf6,#06b6d4);border-radius:2px;"></div>
      ${contactBlock(data, 'modern')}
      ${data.skills.length ? `
      <div>
        <div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#475569;margin-bottom:12px;font-weight:700;">Skills</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;">
          ${data.skills.map(s => `<span style="padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;
            ${isHighlighted(s,data) ? 'background:#7c3aed;color:white;' : 'background:rgba(255,255,255,0.07);color:#cbd5e1;'}">${s}</span>`).join('')}
        </div>
      </div>` : ''}
      ${data.educations.length ? `
      <div>
        <div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#475569;margin-bottom:10px;font-weight:700;">Education</div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${data.educations.map(e => `<div>
            <div style="font-size:13px;font-weight:600;color:white;">${e.school||'School'}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${e.degree||''}${e.degree&&e.field?' — ':''}${e.field||''}</div>
            ${e.year ? `<div style="font-size:10px;color:#475569;margin-top:2px;">${e.year}</div>` : ''}
          </div>`).join('')}
        </div>
      </div>` : ''}
      ${data.certifications.length ? `
      <div>
        <div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#475569;margin-bottom:10px;font-weight:700;">Certifications</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${data.certifications.map(c => `<div>
            <div style="font-size:12px;color:#e2e8f0;font-weight:500;">${c.name}</div>
            <div style="font-size:10px;color:#64748b;">${c.issuer||''}${c.issuer&&c.year?' · ':''}${c.year||''}</div>
          </div>`).join('')}
        </div>
      </div>` : ''}
    </div>
    <div style="width:62%;background:white;padding:40px 36px;display:flex;flex-direction:column;gap:24px;">
      ${data.targetJob ? `<div style="padding:8px 14px;background:#f0fdf4;border-left:3px solid #22c55e;font-size:11px;color:#166534;">Targeting: ${data.targetJob}</div>` : ''}
      ${data.summary ? `
      <div>
        <div style="font-size:9px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#1e293b;margin-bottom:10px;display:flex;align-items:center;gap:8px;">
          <span style="display:inline-block;width:20px;height:2px;background:#8b5cf6;"></span>PROFILE
        </div>
        <div style="font-size:13px;color:#475569;line-height:1.7;">${data.summary}</div>
      </div>` : ''}
      ${data.experiences.length ? `
      <div>
        <div style="font-size:9px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#1e293b;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
          <span style="display:inline-block;width:20px;height:2px;background:#8b5cf6;"></span>EXPERIENCE
        </div>
        <div style="display:flex;flex-direction:column;gap:20px;">
          ${data.experiences.map(e => `
          <div style="padding-left:14px;border-left:2px solid #e2e8f0;position:relative;">
            <div style="position:absolute;left:-5px;top:3px;width:8px;height:8px;border-radius:50%;background:#8b5cf6;"></div>
            <div style="font-size:14px;font-weight:700;color:#0f172a;">${e.position||'Position'}</div>
            <div style="font-size:12px;color:#8b5cf6;font-weight:600;margin-top:2px;">${e.company||'Company'}</div>
            ${dateRange(e) ? `<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;margin-top:4px;">${dateRange(e)}</div>` : ''}
            ${e.description ? `<div style="font-size:12px;color:#64748b;line-height:1.7;margin-top:6px;">${e.description}</div>` : ''}
          </div>`).join('')}
        </div>
      </div>` : ''}
    </div>
  </div>`;
}

function contactBlock(data, theme='modern') {
  const items = [
    data.email    ? { icon:'✉', val: data.email } : null,
    data.phone    ? { icon:'✆', val: data.phone } : null,
    data.location ? { icon:'⌖', val: data.location } : null,
    data.website  ? { icon:'⊕', val: data.website } : null,
  ].filter(Boolean);
  if (!items.length) return '';
  const textColor = theme==='modern' ? '#94a3b8' : '#64748b';
  return `<div style="display:flex;flex-direction:column;gap:7px;">
    <div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#475569;margin-bottom:4px;font-weight:700;">Contact</div>
    ${items.map(i => `<div style="display:flex;align-items:center;gap:8px;font-size:11px;color:${textColor};">
      <span style="font-size:12px;opacity:0.7;">${i.icon}</span>${i.val}
    </div>`).join('')}
  </div>`;
}

// ── CLASSIC: Serif centered header, traditional layout ─
function renderClassic(data) {
  const name = fullName(data);
  return `<div style="padding:48px 56px;min-height:297mm;background:white;font-family:'EB Garamond',Georgia,serif;color:#1a1a2a;">
    <div style="text-align:center;padding-bottom:20px;border-bottom:2px solid #1a1a2a;margin-bottom:28px;">
      <div style="font-family:'Playfair Display',Georgia,serif;font-size:38px;font-weight:700;letter-spacing:-0.02em;color:#0f172a;">${name}</div>
      ${data.title ? `<div style="font-size:15px;font-style:italic;color:#64748b;margin-top:6px;font-family:'Playfair Display',serif;">${data.title}</div>` : ''}
      ${data.targetJob ? `<div style="font-size:11px;color:#9ca3af;margin-top:4px;font-style:italic;">Targeting: ${data.targetJob}</div>` : ''}
      <div style="margin-top:10px;font-size:12px;color:#64748b;display:flex;justify-content:center;gap:16px;flex-wrap:wrap;">
        ${[data.email,data.phone,data.location,data.website].filter(Boolean).map(v=>`<span>${v}</span>`).join('<span style="color:#d1d5db;">|</span>')}
      </div>
    </div>
    ${data.summary ? classicSection('Professional Summary', `<p style="font-size:13.5px;line-height:1.8;color:#374151;text-align:justify;">${data.summary}</p>`) : ''}
    ${data.experiences.length ? classicSection('Professional Experience', data.experiences.map(e => `
      <div style="margin-bottom:18px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
          <div style="font-size:15px;font-weight:600;color:#0f172a;">${e.position||'Position'}</div>
          <div style="font-size:12px;font-style:italic;color:#6b7280;">${dateRange(e)}</div>
        </div>
        <div style="font-size:13px;color:#374151;font-style:italic;margin-top:2px;">${e.company||'Company'}</div>
        ${e.description ? `<div style="font-size:13px;color:#4b5563;line-height:1.7;margin-top:6px;">${e.description}</div>` : ''}
      </div>`).join('')) : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:4px;">
      ${data.educations.length ? classicSection('Education', data.educations.map(e => `
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
          <div><div style="font-size:14px;font-weight:600;color:#0f172a;">${e.school||'School'}</div>
          <div style="font-size:12px;font-style:italic;color:#6b7280;">${e.degree||''}${e.degree&&e.field?', ':''}${e.field||''}</div></div>
          <div style="font-size:12px;color:#9ca3af;">${e.year||''}</div>
        </div>`).join('')) : ''}
      <div>
        ${data.skills.length ? classicSection('Skills', `<div style="display:flex;flex-wrap:wrap;gap:4px;">${data.skills.map(s => `<span style="padding:2px 10px;border:1px solid #d1d5db;border-radius:2px;font-size:12px;color:#374151;${isHighlighted(s,data)?'background:#f0fdf4;border-color:#86efac;':''}"> ${s}</span>`).join('')}</div>`) : ''}
        ${data.certifications.length ? classicSection('Certifications', data.certifications.map(c=>`<div style="font-size:13px;color:#374151;margin-bottom:4px;">${c.name}${c.issuer?` — ${c.issuer}`:''}${c.year?` (${c.year})`:''}</div>`).join('')) : ''}
      </div>
    </div>
  </div>`;
}
function classicSection(title, html) {
  return `<div style="margin-bottom:22px;">
    <div style="font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#1a1a2a;border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin-bottom:12px;font-family:'DM Sans',sans-serif;">${title}</div>
    ${html}
  </div>`;
}

// ── MINIMAL: Extreme whitespace, tiny typography ───────
function renderMinimal(data) {
  const name = fullName(data);
  return `<div style="padding:64px 72px;min-height:297mm;background:#fafafa;font-family:'Outfit',sans-serif;">
    <div style="margin-bottom:40px;">
      <div style="font-size:34px;font-weight:300;letter-spacing:-0.04em;color:#111827;">${name}</div>
      ${data.title ? `<div style="font-size:13px;color:#9ca3af;margin-top:6px;font-weight:400;">${data.title}</div>` : ''}
      <div style="margin-top:12px;font-size:11px;color:#9ca3af;">${contactLine(data)}</div>
      ${data.targetJob ? `<div style="margin-top:4px;font-size:10px;color:#c4b5fd;">↳ ${data.targetJob}</div>` : ''}
    </div>
    ${data.summary ? `<div style="margin-bottom:40px;max-width:480px;"><div style="font-size:12px;color:#6b7280;line-height:1.9;">${data.summary}</div></div>` : ''}
    ${data.experiences.length ? `
    <div style="margin-bottom:36px;">
      <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#d1d5db;margin-bottom:20px;">Work</div>
      ${data.experiences.map(e => `
      <div style="display:grid;grid-template-columns:130px 1fr;gap:16px;margin-bottom:18px;">
        <div style="font-size:11px;color:#9ca3af;padding-top:2px;">${dateRange(e)||'—'}</div>
        <div>
          <div style="font-size:13px;font-weight:600;color:#111827;">${e.position||'Position'}</div>
          <div style="font-size:12px;color:#9ca3af;">${e.company||'Company'}</div>
          ${e.description ? `<div style="font-size:12px;color:#6b7280;line-height:1.7;margin-top:6px;">${e.description}</div>` : ''}
        </div>
      </div>`).join('')}
    </div>` : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;">
      ${data.educations.length ? `
      <div>
        <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#d1d5db;margin-bottom:14px;">Education</div>
        ${data.educations.map(e=>`<div style="margin-bottom:12px;">
          <div style="font-size:13px;font-weight:600;color:#111827;">${e.school||'School'}</div>
          <div style="font-size:11px;color:#9ca3af;">${e.degree||''}${e.degree&&e.field?', ':''}${e.field||''} ${e.year?`· ${e.year}`:''}</div>
        </div>`).join('')}
      </div>` : ''}
      ${data.skills.length ? `
      <div>
        <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#d1d5db;margin-bottom:14px;">Skills</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">
          ${data.skills.map(s=>`<span style="font-size:11px;color:${isHighlighted(s,data)?'#7c3aed':'#6b7280'};font-weight:${isHighlighted(s,data)?'700':'400'};">${s}${isHighlighted(s,data)?'*':''}</span>`).join('<span style="color:#d1d5db;"> / </span>')}
        </div>
        ${data.certifications.length?`<div style="margin-top:20px;"><div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#d1d5db;margin-bottom:10px;">Certs</div>${data.certifications.map(c=>`<div style="font-size:11px;color:#6b7280;margin-bottom:4px;">${c.name}${c.issuer?` · ${c.issuer}`:''}${c.year?` (${c.year})`:''}</div>`).join('')}</div>`:''}
      </div>` : ''}
    </div>
  </div>`;
}

// ── EXECUTIVE: Gold & dark prestige ────────────────────
function renderExecutive(data) {
  const name = fullName(data);
  return `<div style="min-height:297mm;background:white;font-family:'Cormorant Garamond',Georgia,serif;">
    <div style="background:#1c1408;padding:48px 56px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;">
        <div>
          <div style="font-size:40px;font-weight:600;color:white;letter-spacing:-0.02em;line-height:1.05;">${name}</div>
          ${data.title ? `<div style="font-size:14px;letter-spacing:0.2em;text-transform:uppercase;color:#d97706;margin-top:10px;">${data.title}</div>` : ''}
          ${data.targetJob ? `<div style="font-size:12px;color:#92400e;margin-top:6px;font-style:italic;">For: ${data.targetJob}</div>` : ''}
        </div>
        <div style="text-align:right;font-size:11px;color:#92400e;line-height:1.8;">
          ${data.email ? `<div>${data.email}</div>` : ''}
          ${data.phone ? `<div>${data.phone}</div>` : ''}
          ${data.location ? `<div>${data.location}</div>` : ''}
          ${data.website ? `<div>${data.website}</div>` : ''}
        </div>
      </div>
      <div style="margin-top:24px;height:1px;background:linear-gradient(90deg,#d97706,rgba(217,119,6,0.1));"></div>
    </div>
    <div style="padding:40px 56px;display:flex;gap:40px;">
      <div style="flex:1;display:flex;flex-direction:column;gap:28px;">
        ${data.summary ? `<div>
          <div style="${execLabel()}">Executive Profile</div>
          <div style="font-size:14px;color:#374151;line-height:1.9;font-style:italic;">${data.summary}</div>
        </div>` : ''}
        ${data.experiences.length ? `<div>
          <div style="${execLabel()}">Career History</div>
          <div style="display:flex;flex-direction:column;gap:18px;">
            ${data.experiences.map(e=>`<div style="padding-bottom:18px;border-bottom:1px solid #f3f4f6;">
              <div style="display:flex;justify-content:space-between;align-items:baseline;">
                <div style="font-size:16px;font-weight:600;color:#0f172a;">${e.position||'Position'}</div>
                <div style="font-size:11px;color:#d97706;letter-spacing:0.05em;">${dateRange(e)}</div>
              </div>
              <div style="font-size:13px;color:#92400e;font-style:italic;margin-top:2px;">${e.company||'Company'}</div>
              ${e.description?`<div style="font-size:13px;color:#6b7280;line-height:1.8;margin-top:8px;">${e.description}</div>`:''}
            </div>`).join('')}
          </div>
        </div>` : ''}
      </div>
      <div style="width:200px;display:flex;flex-direction:column;gap:24px;">
        ${data.skills.length ? `<div>
          <div style="${execLabel()}">Expertise</div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            ${data.skills.map(s=>`<div style="font-size:12px;color:${isHighlighted(s,data)?'#92400e':'#4b5563'};font-weight:${isHighlighted(s,data)?'700':'400'};padding:3px 0;border-bottom:1px solid #f9f5ef;">${isHighlighted(s,data)?'◆ ':'◇ '}${s}</div>`).join('')}
          </div>
        </div>` : ''}
        ${data.educations.length ? `<div>
          <div style="${execLabel()}">Education</div>
          ${data.educations.map(e=>`<div style="margin-bottom:10px;">
            <div style="font-size:13px;font-weight:600;color:#1c1408;">${e.school||'School'}</div>
            <div style="font-size:11px;color:#92400e;font-style:italic;">${e.degree||''}${e.degree&&e.field?', ':''}${e.field||''}</div>
            ${e.year?`<div style="font-size:10px;color:#9ca3af;">${e.year}</div>`:''}
          </div>`).join('')}
        </div>` : ''}
        ${data.certifications.length ? `<div>
          <div style="${execLabel()}">Credentials</div>
          ${data.certifications.map(c=>`<div style="font-size:11px;color:#4b5563;margin-bottom:6px;">${c.name}${c.issuer?`<br><span style="color:#9ca3af;">${c.issuer}</span>`:''}${c.year?` · ${c.year}`:''}</div>`).join('')}
        </div>` : ''}
      </div>
    </div>
  </div>`;
}
function execLabel() {
  return `font-size:9px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#d97706;margin-bottom:12px;font-family:'DM Sans',sans-serif;`;
}

// ── CREATIVE: Full-bleed gradient header, expressive ───
function renderCreative(data) {
  const name = fullName(data);
  return `<div style="min-height:297mm;background:white;font-family:'Syne',sans-serif;">
    <div style="background:linear-gradient(135deg,#be123c,#f97316,#fbbf24);padding:48px 48px 36px;">
      <div style="font-size:46px;font-weight:800;color:white;line-height:1;letter-spacing:-0.04em;">${name}</div>
      ${data.title ? `<div style="font-size:12px;letter-spacing:0.25em;text-transform:uppercase;color:rgba(255,255,255,0.8);margin-top:10px;">${data.title}</div>` : ''}
      <div style="margin-top:16px;display:flex;gap:16px;flex-wrap:wrap;">
        ${[data.email,data.phone,data.location,data.website].filter(Boolean).map(v=>`<span style="font-size:11px;color:rgba(255,255,255,0.75);font-family:'DM Sans',sans-serif;">${v}</span>`).join('')}
      </div>
      ${data.targetJob ? `<div style="margin-top:8px;font-size:11px;color:rgba(255,255,255,0.65);">Target: ${data.targetJob}</div>` : ''}
    </div>
    <div style="padding:32px 48px;display:grid;grid-template-columns:2fr 1fr;gap:36px;">
      <div style="display:flex;flex-direction:column;gap:24px;">
        ${data.summary ? `<div style="padding:16px;background:#fff7ed;border-left:3px solid #f97316;font-size:13px;color:#431407;line-height:1.7;">${data.summary}</div>` : ''}
        ${data.experiences.length ? `<div>
          <div style="${creativeLabel('#f97316')}">Experience</div>
          ${data.experiences.map(e=>`<div style="margin-bottom:18px;padding-bottom:18px;border-bottom:2px dashed #fed7aa;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;">
              <div style="font-size:16px;font-weight:800;color:#1c1408;">${e.position||'Position'}</div>
              <div style="font-size:10px;color:#f97316;font-weight:700;letter-spacing:0.1em;">${dateRange(e)}</div>
            </div>
            <div style="font-size:12px;color:#9a3412;font-weight:600;margin-top:2px;">${e.company||'Company'}</div>
            ${e.description?`<div style="font-size:12px;color:#57534e;line-height:1.7;margin-top:6px;font-family:'DM Sans',sans-serif;">${e.description}</div>`:''}
          </div>`).join('')}
        </div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:20px;">
        ${data.skills.length ? `<div>
          <div style="${creativeLabel('#f97316')}">Skills</div>
          ${data.skills.map(s=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
            <div style="flex:1;height:4px;border-radius:2px;background:${isHighlighted(s,data)?'linear-gradient(90deg,#be123c,#f97316)':'#f1f5f9'};"></div>
            <span style="font-size:11px;color:#1c1408;font-weight:${isHighlighted(s,data)?'700':'500'};min-width:0;white-space:nowrap;">${s}</span>
          </div>`).join('')}
        </div>` : ''}
        ${data.educations.length ? `<div>
          <div style="${creativeLabel('#f97316')}">Education</div>
          ${data.educations.map(e=>`<div style="margin-bottom:10px;padding:10px;background:#fff7ed;border-radius:4px;">
            <div style="font-size:13px;font-weight:700;color:#1c1408;">${e.school||'School'}</div>
            <div style="font-size:11px;color:#9a3412;">${e.degree||''}${e.degree&&e.field?', ':''}${e.field||''}</div>
            ${e.year?`<div style="font-size:10px;color:#f97316;margin-top:2px;">${e.year}</div>`:''}
          </div>`).join('')}
        </div>` : ''}
        ${data.certifications.length ? `<div>
          <div style="${creativeLabel('#f97316')}">Certifications</div>
          ${data.certifications.map(c=>`<div style="font-size:11px;color:#57534e;margin-bottom:5px;padding-left:8px;border-left:2px solid #fed7aa;">${c.name}${c.issuer?` — ${c.issuer}`:''}${c.year?` (${c.year})`:''}</div>`).join('')}
        </div>` : ''}
      </div>
    </div>
  </div>`;
}
function creativeLabel(color) {
  return `font-size:10px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:${color};margin-bottom:12px;`;
}

// ── TECHNICAL: Terminal-inspired monospace ─────────────
function renderTechnical(data) {
  const name = fullName(data);
  return `<div style="min-height:297mm;background:#0a0a0f;font-family:'Space Mono',monospace;color:#e2e8f0;">
    <div style="background:#0d1117;border-bottom:1px solid #30363d;padding:28px 36px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <div style="width:10px;height:10px;border-radius:50%;background:#ff5f57;"></div>
        <div style="width:10px;height:10px;border-radius:50%;background:#febc2e;"></div>
        <div style="width:10px;height:10px;border-radius:50%;background:#28c840;"></div>
        <span style="margin-left:8px;font-size:10px;color:#8b949e;">resume.json</span>
      </div>
      <div style="font-size:10px;color:#58a6ff;margin-bottom:4px;">&gt; whoami</div>
      <div style="font-size:28px;font-weight:700;color:#c9d1d9;letter-spacing:-0.03em;">${name}</div>
      ${data.title ? `<div style="font-size:12px;color:#3fb950;margin-top:6px;"># ${data.title}</div>` : ''}
      ${data.targetJob ? `<div style="font-size:10px;color:#8b949e;margin-top:4px;">// target: ${data.targetJob}</div>` : ''}
      <div style="margin-top:12px;font-size:10px;color:#8b949e;font-family:'Space Mono',monospace;">
        ${[data.email&&`email: ${data.email}`, data.phone&&`tel: ${data.phone}`, data.location&&`loc: ${data.location}`, data.website&&`url: ${data.website}`].filter(Boolean).join(' | ')}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 260px;">
      <div style="padding:28px 28px 28px 36px;display:flex;flex-direction:column;gap:24px;border-right:1px solid #21262d;">
        ${data.summary ? `<div>
          <div style="${techLabel()}">/* profile */</div>
          <div style="font-size:11px;color:#8b949e;line-height:1.8;white-space:pre-wrap;">${data.summary}</div>
        </div>` : ''}
        ${data.experiences.length ? `<div>
          <div style="${techLabel()}">/* experience */</div>
          ${data.experiences.map(e=>`<div style="margin-bottom:16px;padding:12px;background:#161b22;border:1px solid #21262d;border-radius:4px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;">
              <span style="font-size:13px;color:#c9d1d9;font-weight:700;">${e.position||'Position'}</span>
              <span style="font-size:9px;color:#8b949e;">${dateRange(e)}</span>
            </div>
            <div style="font-size:11px;color:#3fb950;margin-top:2px;">${e.company||'Company'}</div>
            ${e.description?`<div style="font-size:10px;color:#6e7681;line-height:1.7;margin-top:6px;font-family:'DM Sans',sans-serif;">${e.description}</div>`:''}
          </div>`).join('')}
        </div>` : ''}
        ${data.educations.length ? `<div>
          <div style="${techLabel()}">/* education */</div>
          ${data.educations.map(e=>`<div style="margin-bottom:10px;padding:10px;background:#161b22;border:1px solid #21262d;border-radius:4px;">
            <div style="font-size:12px;color:#c9d1d9;font-weight:700;">${e.school||'School'}</div>
            <div style="font-size:10px;color:#8b949e;">${e.degree||''}${e.degree&&e.field?' / ':''}${e.field||''} ${e.year?`// ${e.year}`:''}</div>
          </div>`).join('')}
        </div>` : ''}
      </div>
      <div style="padding:28px 24px;display:flex;flex-direction:column;gap:20px;">
        ${data.skills.length ? `<div>
          <div style="${techLabel()}">skills[]</div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            ${data.skills.map(s=>`<div style="font-size:10px;padding:4px 8px;background:${isHighlighted(s,data)?'rgba(63,185,80,0.1)':'rgba(255,255,255,0.03)'};border:1px solid ${isHighlighted(s,data)?'#3fb950':'#21262d'};border-radius:3px;color:${isHighlighted(s,data)?'#3fb950':'#8b949e'};">"${s}"</div>`).join('')}
          </div>
        </div>` : ''}
        ${data.certifications.length ? `<div>
          <div style="${techLabel()}">certs[]</div>
          ${data.certifications.map(c=>`<div style="font-size:9px;color:#8b949e;margin-bottom:6px;padding:6px;background:#161b22;border:1px solid #21262d;border-radius:3px;">
            <div style="color:#c9d1d9;">${c.name}</div>
            <div>${c.issuer||''} ${c.year?`(${c.year})`:''}</div>
          </div>`).join('')}
        </div>` : ''}
      </div>
    </div>
  </div>`;
}
function techLabel() {
  return `font-size:10px;color:#6e7681;font-family:'Space Mono',monospace;margin-bottom:10px;`;
}

// ── ACADEMIC: Scholarly, structured ───────────────────
function renderAcademic(data) {
  const name = fullName(data);
  return `<div style="padding:56px 64px;min-height:297mm;background:white;font-family:'EB Garamond',Georgia,serif;color:#1a1a2a;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="font-family:'Playfair Display',serif;font-size:36px;font-weight:400;color:#1a1a2a;letter-spacing:-0.01em;">${name}</div>
      ${data.title ? `<div style="font-size:14px;color:#6b7280;margin-top:4px;font-style:italic;">${data.title}</div>` : ''}
      <div style="margin-top:10px;font-size:12px;color:#9ca3af;">${contactLine(data,' · ')}</div>
      ${data.targetJob ? `<div style="margin-top:4px;font-size:11px;color:#9ca3af;font-style:italic;">${data.targetJob}</div>` : ''}
    </div>
    <div style="width:60px;height:2px;background:#92400e;margin:0 auto 32px;"></div>
    ${data.summary ? `<div style="margin-bottom:28px;">
      <div style="${acadLabel()}">Research Summary</div>
      <div style="font-size:13.5px;color:#374151;line-height:2;text-align:justify;">${data.summary}</div>
    </div>` : ''}
    ${data.educations.length ? `<div style="margin-bottom:28px;">
      <div style="${acadLabel()}">Education</div>
      ${data.educations.map(e=>`<div style="display:grid;grid-template-columns:1fr auto;gap:8px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #f3f4f6;">
        <div>
          <div style="font-size:14px;font-weight:600;color:#1a1a2a;">${e.degree||'Degree'}${e.field?`, ${e.field}`:''}</div>
          <div style="font-size:13px;font-style:italic;color:#6b7280;">${e.school||'School'}</div>
        </div>
        <div style="font-size:12px;color:#9ca3af;white-space:nowrap;">${e.year||''}</div>
      </div>`).join('')}
    </div>` : ''}
    ${data.experiences.length ? `<div style="margin-bottom:28px;">
      <div style="${acadLabel()}">Academic & Professional Experience</div>
      ${data.experiences.map(e=>`<div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #f3f4f6;">
        <div style="display:flex;justify-content:space-between;">
          <div style="font-size:14px;font-weight:600;color:#1a1a2a;">${e.position||'Position'}</div>
          <div style="font-size:12px;color:#9ca3af;">${dateRange(e)}</div>
        </div>
        <div style="font-size:13px;font-style:italic;color:#6b7280;">${e.company||'Institution'}</div>
        ${e.description?`<div style="font-size:13px;color:#4b5563;line-height:1.9;margin-top:6px;">${e.description}</div>`:''}
      </div>`).join('')}
    </div>` : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;">
      ${data.certifications.length ? `<div>
        <div style="${acadLabel()}">Honours & Credentials</div>
        ${data.certifications.map(c=>`<div style="font-size:13px;color:#374151;margin-bottom:6px;">${c.name}${c.issuer?` — ${c.issuer}`:''}${c.year?` (${c.year})`:''}</div>`).join('')}
      </div>` : ''}
      ${data.skills.length ? `<div>
        <div style="${acadLabel()}">Areas of Expertise</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">${data.skills.map(s=>`<span style="font-size:12px;color:${isHighlighted(s,data)?'#92400e':'#6b7280'};font-style:italic;">${s};</span>`).join(' ')}</div>
      </div>` : ''}
    </div>
  </div>`;
}
function acadLabel() {
  return `font-family:'DM Sans',sans-serif;font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#92400e;margin-bottom:12px;`;
}

// ── ATS: Pure text, maximum parser compatibility ───────
function renderATS(data) {
  const name = fullName(data);
  return `<div style="padding:40px 48px;min-height:297mm;background:white;font-family:'DM Sans',Arial,sans-serif;color:#111827;">
    <div style="margin-bottom:20px;">
      <div style="font-size:26px;font-weight:700;color:#111827;">${name}</div>
      ${data.title ? `<div style="font-size:14px;color:#374151;margin-top:4px;">${data.title}</div>` : ''}
      <div style="font-size:12px;color:#6b7280;margin-top:6px;">${contactLine(data,' | ')}</div>
      ${data.targetJob ? `<div style="font-size:11px;color:#9ca3af;margin-top:3px;">Targeting: ${data.targetJob}</div>` : ''}
    </div>
    <hr style="border:none;border-top:1px solid #d1d5db;margin-bottom:16px;">
    ${data.summary ? `<div style="margin-bottom:16px;"><div style="${atsLabel()}">SUMMARY</div><div style="font-size:13px;color:#374151;line-height:1.7;">${data.summary}</div></div>` : ''}
    ${data.skills.length ? `<div style="margin-bottom:16px;"><div style="${atsLabel()}">SKILLS</div><div style="font-size:13px;color:#374151;">${data.skills.map(s=>`${isHighlighted(s,data)?'★ ':'• '}${s}`).join('  ')}</div></div>` : ''}
    ${data.experiences.length ? `<div style="margin-bottom:16px;"><div style="${atsLabel()}">WORK EXPERIENCE</div>${data.experiences.map(e=>`<div style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;">
        <span style="font-size:13px;font-weight:700;color:#111827;">${e.position||'Position'}</span>
        <span style="font-size:12px;color:#6b7280;">${dateRange(e)}</span>
      </div>
      <div style="font-size:13px;color:#374151;">${e.company||'Company'}</div>
      ${e.description?`<div style="font-size:12px;color:#4b5563;line-height:1.7;margin-top:4px;">${e.description}</div>`:''}
    </div>`).join('')}</div>` : ''}
    ${data.educations.length ? `<div style="margin-bottom:16px;"><div style="${atsLabel()}">EDUCATION</div>${data.educations.map(e=>`<div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;">
        <span style="font-size:13px;font-weight:700;color:#111827;">${e.school||'School'}</span>
        <span style="font-size:12px;color:#6b7280;">${e.year||''}</span>
      </div>
      <div style="font-size:12px;color:#374151;">${e.degree||''}${e.degree&&e.field?`, ${e.field}`:''}</div>
    </div>`).join('')}</div>` : ''}
    ${data.certifications.length ? `<div><div style="${atsLabel()}">CERTIFICATIONS</div>${data.certifications.map(c=>`<div style="font-size:12px;color:#374151;margin-bottom:4px;">• ${c.name}${c.issuer?`, ${c.issuer}`:''}${c.year?` (${c.year})`:''}</div>`).join('')}</div>` : ''}
  </div>`;
}
function atsLabel() {
  return `font-size:10px;font-weight:800;letter-spacing:0.16em;color:#374151;border-bottom:1px solid #e5e7eb;padding-bottom:4px;margin-bottom:8px;`;
}

// ── STARTUP: Vibrant gradient header, energetic ────────
function renderStartup(data) {
  const name = fullName(data);
  return `<div style="min-height:297mm;background:#f8faff;font-family:'Outfit',sans-serif;">
    <div style="background:linear-gradient(120deg,#0ea5e9,#7c3aed,#0ea5e9);background-size:200%;padding:40px 44px 32px;">
      <div style="font-size:42px;font-weight:800;color:white;letter-spacing:-0.04em;line-height:1.05;">${name}</div>
      ${data.title ? `<div style="font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.75);margin-top:8px;">${data.title}</div>` : ''}
      ${data.summary ? `<div style="margin-top:14px;font-size:13px;color:rgba(255,255,255,0.85);line-height:1.7;max-width:500px;">${data.summary}</div>` : ''}
      <div style="margin-top:14px;display:flex;gap:12px;flex-wrap:wrap;">
        ${[data.email,data.phone,data.location,data.website].filter(Boolean).map(v=>`<span style="font-size:11px;color:rgba(255,255,255,0.7);padding:2px 10px;background:rgba(255,255,255,0.1);border-radius:999px;">${v}</span>`).join('')}
      </div>
      ${data.targetJob ? `<div style="margin-top:8px;font-size:10px;color:rgba(255,255,255,0.5);">⚡ ${data.targetJob}</div>` : ''}
    </div>
    <div style="padding:32px 44px;display:grid;grid-template-columns:2fr 1fr;gap:32px;">
      <div style="display:flex;flex-direction:column;gap:24px;">
        ${data.experiences.length ? `<div>
          <div style="${startupLabel()}">Experience</div>
          ${data.experiences.map(e=>`<div style="padding:16px;background:white;border-radius:12px;margin-bottom:10px;border:1px solid #e0e7ff;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div><div style="font-size:14px;font-weight:700;color:#1e1b4b;">${e.position||'Position'}</div>
              <div style="font-size:12px;color:#7c3aed;font-weight:600;">${e.company||'Company'}</div></div>
              <div style="font-size:10px;color:#a5b4fc;font-weight:600;white-space:nowrap;">${dateRange(e)}</div>
            </div>
            ${e.description?`<div style="font-size:12px;color:#6b7280;line-height:1.7;margin-top:8px;">${e.description}</div>`:''}
          </div>`).join('')}
        </div>` : ''}
        ${data.educations.length ? `<div>
          <div style="${startupLabel()}">Education</div>
          ${data.educations.map(e=>`<div style="padding:12px;background:white;border-radius:8px;margin-bottom:8px;border:1px solid #e0e7ff;">
            <div style="font-size:13px;font-weight:700;color:#1e1b4b;">${e.school||'School'}</div>
            <div style="font-size:11px;color:#6b7280;">${e.degree||''}${e.degree&&e.field?', ':''}${e.field||''}${e.year?` · ${e.year}`:''}</div>
          </div>`).join('')}
        </div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:20px;">
        ${data.skills.length ? `<div style="padding:16px;background:white;border-radius:12px;border:1px solid #e0e7ff;">
          <div style="${startupLabel()}">Skills</div>
          <div style="display:flex;flex-wrap:wrap;gap:5px;">
            ${data.skills.map(s=>`<span style="padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;
              ${isHighlighted(s,data)?'background:#7c3aed;color:white;':'background:#ede9fe;color:#4c1d95;'}">${s}</span>`).join('')}
          </div>
        </div>` : ''}
        ${data.certifications.length ? `<div style="padding:16px;background:white;border-radius:12px;border:1px solid #e0e7ff;">
          <div style="${startupLabel()}">Certifications</div>
          ${data.certifications.map(c=>`<div style="font-size:11px;color:#4b5563;margin-bottom:6px;padding-left:8px;border-left:2px solid #c4b5fd;">${c.name}${c.issuer?`<br><span style='color:#9ca3af;'>${c.issuer}</span>`:''}${c.year?` · ${c.year}`:''}</div>`).join('')}
        </div>` : ''}
      </div>
    </div>
  </div>`;
}
function startupLabel() {
  return `font-size:9px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#7c3aed;margin-bottom:10px;`;
}

// ── CORPORATE: Navy & white, conservative authority ────
function renderCorporate(data) {
  const name = fullName(data);
  return `<div style="min-height:297mm;background:white;font-family:'DM Sans',sans-serif;">
    <div style="background:#1e3a5f;padding:40px 52px;">
      <div style="font-family:'Syne',sans-serif;font-size:36px;font-weight:700;color:white;letter-spacing:-0.03em;">${name}</div>
      ${data.title ? `<div style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#93c5fd;margin-top:8px;">${data.title}</div>` : ''}
      ${data.targetJob ? `<div style="font-size:11px;color:#6b92b5;margin-top:4px;">Applying for: ${data.targetJob}</div>` : ''}
      <div style="margin-top:16px;display:flex;gap:20px;flex-wrap:wrap;">
        ${[data.email,data.phone,data.location,data.website].filter(Boolean).map(v=>`<span style="font-size:11px;color:#93c5fd;">${v}</span>`).join('<span style="color:#3b5a7a;">|</span>')}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 240px;">
      <div style="padding:36px 40px;border-right:1px solid #e2e8f0;display:flex;flex-direction:column;gap:28px;">
        ${data.summary ? `<div>
          <div style="${corpLabel()}">Executive Summary</div>
          <div style="font-size:13px;color:#374151;line-height:1.8;">${data.summary}</div>
        </div>` : ''}
        ${data.experiences.length ? `<div>
          <div style="${corpLabel()}">Professional Experience</div>
          ${data.experiences.map(e=>`<div style="margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid #f1f5f9;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;">
              <div style="font-size:14px;font-weight:700;color:#1e3a5f;">${e.position||'Position'}</div>
              <div style="font-size:10px;color:#93c5fd;font-weight:600;letter-spacing:0.05em;">${dateRange(e)}</div>
            </div>
            <div style="font-size:12px;color:#1e40af;font-weight:600;margin-top:2px;">${e.company||'Company'}</div>
            ${e.description?`<div style="font-size:12px;color:#6b7280;line-height:1.7;margin-top:6px;">${e.description}</div>`:''}
          </div>`).join('')}
        </div>` : ''}
        ${data.educations.length ? `<div>
          <div style="${corpLabel()}">Education</div>
          ${data.educations.map(e=>`<div style="margin-bottom:10px;">
            <div style="font-size:13px;font-weight:700;color:#1e3a5f;">${e.school||'School'}</div>
            <div style="font-size:12px;color:#64748b;">${e.degree||''}${e.degree&&e.field?', ':''}${e.field||''} ${e.year?`· ${e.year}`:''}</div>
          </div>`).join('')}
        </div>` : ''}
      </div>
      <div style="padding:36px 28px;background:#f8faff;display:flex;flex-direction:column;gap:24px;">
        ${data.skills.length ? `<div>
          <div style="${corpLabel()}">Core Skills</div>
          ${data.skills.map(s=>`<div style="padding:5px 0;border-bottom:1px solid #e2e8f0;font-size:12px;color:${isHighlighted(s,data)?'#1e3a5f':'#64748b'};font-weight:${isHighlighted(s,data)?'700':'400'};">
            ${isHighlighted(s,data)?'▶ ':''}${s}
          </div>`).join('')}
        </div>` : ''}
        ${data.certifications.length ? `<div>
          <div style="${corpLabel()}">Credentials</div>
          ${data.certifications.map(c=>`<div style="font-size:11px;color:#64748b;margin-bottom:8px;padding:8px;background:white;border-radius:4px;border:1px solid #e2e8f0;">
            <div style="font-weight:600;color:#1e3a5f;">${c.name}</div>
            <div>${c.issuer||''}${c.issuer&&c.year?' · ':''}${c.year||''}</div>
          </div>`).join('')}
        </div>` : ''}
      </div>
    </div>
  </div>`;
}
function corpLabel() {
  return `font-size:9px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#1e3a5f;margin-bottom:12px;border-bottom:2px solid #1e3a5f;padding-bottom:6px;`;
}

// ── FREELANCE: Warm amber, creative professional ───────
function renderFreelance(data) {
  const name = fullName(data);
  return `<div style="min-height:297mm;background:white;font-family:'Outfit',sans-serif;">
    <div style="display:grid;grid-template-columns:280px 1fr;min-height:297mm;">
      <div style="background:#1c0a00;padding:40px 28px;display:flex;flex-direction:column;gap:24px;">
        <div>
          <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#f59e0b;margin-bottom:8px;">Portfolio</div>
          <div style="font-family:'Syne',sans-serif;font-size:26px;font-weight:800;color:white;line-height:1.1;">${name}</div>
          ${data.title ? `<div style="font-size:12px;color:#d97706;margin-top:8px;">${data.title}</div>` : ''}
          ${data.targetJob ? `<div style="font-size:10px;color:#78350f;margin-top:4px;">${data.targetJob}</div>` : ''}
        </div>
        <div style="height:1px;background:linear-gradient(90deg,#f59e0b,transparent);"></div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${data.email?`<div style="font-size:11px;color:#a16207;">✉ ${data.email}</div>`:''}
          ${data.phone?`<div style="font-size:11px;color:#a16207;">✆ ${data.phone}</div>`:''}
          ${data.location?`<div style="font-size:11px;color:#a16207;">⌖ ${data.location}</div>`:''}
          ${data.website?`<div style="font-size:11px;color:#f59e0b;">⊕ ${data.website}</div>`:''}
        </div>
        ${data.skills.length ? `<div>
          <div style="font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:#78350f;margin-bottom:10px;font-weight:700;">Skills</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;">
            ${data.skills.map(s=>`<span style="padding:3px 9px;border-radius:999px;font-size:10px;font-weight:600;
              ${isHighlighted(s,data)?'background:#f59e0b;color:#1c0a00;':'background:rgba(245,158,11,0.1);color:#d97706;border:1px solid rgba(245,158,11,0.2);'}">${s}</span>`).join('')}
          </div>
        </div>` : ''}
        ${data.educations.length ? `<div>
          <div style="font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:#78350f;margin-bottom:10px;font-weight:700;">Education</div>
          ${data.educations.map(e=>`<div style="margin-bottom:10px;">
            <div style="font-size:12px;font-weight:600;color:white;">${e.school||'School'}</div>
            <div style="font-size:10px;color:#a16207;">${e.degree||''}${e.degree&&e.field?', ':''}${e.field||''}</div>
            ${e.year?`<div style="font-size:9px;color:#78350f;">${e.year}</div>`:''}
          </div>`).join('')}
        </div>` : ''}
        ${data.certifications.length ? `<div>
          <div style="font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:#78350f;margin-bottom:10px;font-weight:700;">Certifications</div>
          ${data.certifications.map(c=>`<div style="font-size:10px;color:#a16207;margin-bottom:5px;padding-left:8px;border-left:2px solid #f59e0b;">${c.name}${c.issuer?` · ${c.issuer}`:''}${c.year?` (${c.year})`:''}</div>`).join('')}
        </div>` : ''}
      </div>
      <div style="padding:40px 36px;display:flex;flex-direction:column;gap:24px;">
        ${data.summary ? `<div style="padding:16px 20px;background:#fffbeb;border-left:4px solid #f59e0b;">
          <div style="font-size:13px;color:#451a03;line-height:1.8;">${data.summary}</div>
        </div>` : ''}
        ${data.experiences.length ? `<div>
          <div style="font-size:9px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#d97706;margin-bottom:14px;">Project Experience</div>
          ${data.experiences.map(e=>`<div style="margin-bottom:18px;padding-bottom:18px;border-bottom:1px dashed #fde68a;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;">
              <div style="font-size:14px;font-weight:700;color:#1c1408;">${e.position||'Project / Role'}</div>
              <div style="font-size:10px;color:#f59e0b;font-weight:600;">${dateRange(e)}</div>
            </div>
            <div style="font-size:12px;color:#d97706;font-weight:600;margin-top:2px;">${e.company||'Client'}</div>
            ${e.description?`<div style="font-size:12px;color:#6b7280;line-height:1.7;margin-top:6px;">${e.description}</div>`:''}
          </div>`).join('')}
        </div>` : ''}
      </div>
    </div>
  </div>`;
}

// ── EDITORIAL: Magazine-style, typographic drama ───────
function renderEditorial(data) {
  const name = fullName(data);
  return `<div style="min-height:297mm;background:white;font-family:'Syne',sans-serif;overflow:hidden;">
    <div style="display:grid;grid-template-columns:1fr 320px;min-height:297mm;">
      <div style="padding:48px 44px;display:flex;flex-direction:column;">
        <div style="flex:0 0 auto;margin-bottom:32px;">
          <div style="font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:#9ca3af;margin-bottom:12px;">Issue № 01 — Career Profile</div>
          <div style="font-family:'Playfair Display',serif;font-size:52px;font-weight:700;color:#0f172a;line-height:0.9;letter-spacing:-0.04em;">${name}</div>
          <div style="height:4px;background:black;width:80px;margin-top:16px;"></div>
          ${data.title ? `<div style="font-size:14px;font-weight:400;color:#4b5563;margin-top:12px;font-family:'DM Sans',sans-serif;">${data.title}</div>` : ''}
          ${data.targetJob ? `<div style="font-size:11px;color:#9ca3af;margin-top:4px;font-family:'DM Sans',sans-serif;">For: ${data.targetJob}</div>` : ''}
        </div>
        ${data.summary ? `<div style="background:#f9fafb;border-top:3px solid black;padding:20px;margin-bottom:28px;">
          <div style="font-size:10px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:8px;color:#1f2937;">Editorial</div>
          <div style="font-family:'DM Sans',sans-serif;font-size:13px;color:#374151;line-height:1.8;">${data.summary}</div>
        </div>` : ''}
        ${data.experiences.length ? `<div>
          <div style="font-size:10px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:16px;color:#1f2937;border-bottom:1px solid black;padding-bottom:8px;">Career</div>
          ${data.experiences.map((e,i)=>`<div style="display:grid;grid-template-columns:48px 1fr;gap:0;margin-bottom:20px;">
            <div style="font-family:'Space Mono',monospace;font-size:10px;color:#9ca3af;padding-top:3px;">${String(i+1).padStart(2,'0')}</div>
            <div>
              <div style="font-size:15px;font-weight:700;color:#0f172a;">${e.position||'Position'}</div>
              <div style="font-size:12px;color:#6366f1;font-weight:600;margin-top:1px;">${e.company||'Company'}</div>
              ${dateRange(e)?`<div style="font-size:10px;font-family:'Space Mono',monospace;color:#d1d5db;margin-top:3px;">${dateRange(e)}</div>`:''}
              ${e.description?`<div style="font-family:'DM Sans',sans-serif;font-size:12px;color:#6b7280;line-height:1.7;margin-top:6px;">${e.description}</div>`:''}
            </div>
          </div>`).join('')}
        </div>` : ''}
      </div>
      <div style="background:#0f172a;padding:40px 28px;display:flex;flex-direction:column;gap:24px;color:white;">
        <div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#475569;">Contents</div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${[data.email&&`✉ ${data.email}`,data.phone&&`✆ ${data.phone}`,data.location&&`⌖ ${data.location}`,data.website&&`↗ ${data.website}`].filter(Boolean).map(v=>`<div style="font-size:11px;color:#94a3b8;font-family:'DM Sans',sans-serif;">${v}</div>`).join('')}
        </div>
        <div style="height:1px;background:#1e293b;"></div>
        ${data.skills.length ? `<div>
          <div style="font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:#475569;margin-bottom:10px;">Skills</div>
          <div style="display:flex;flex-direction:column;gap:5px;">
            ${data.skills.map(s=>`<div style="display:flex;align-items:center;gap:8px;">
              <div style="width:24px;height:2px;background:${isHighlighted(s,data)?'#6366f1':'#1e293b'};"></div>
              <span style="font-size:11px;color:${isHighlighted(s,data)?'#a5b4fc':'#94a3b8'};font-family:'DM Sans',sans-serif;">${s}</span>
            </div>`).join('')}
          </div>
        </div>` : ''}
        ${data.educations.length ? `<div>
          <div style="font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:#475569;margin-bottom:10px;">Education</div>
          ${data.educations.map(e=>`<div style="margin-bottom:10px;">
            <div style="font-size:12px;font-weight:700;color:white;">${e.school||'School'}</div>
            <div style="font-size:10px;color:#64748b;font-family:'DM Sans',sans-serif;">${e.degree||''}${e.degree&&e.field?', ':''}${e.field||''} ${e.year?`· ${e.year}`:''}</div>
          </div>`).join('')}
        </div>` : ''}
        ${data.certifications.length ? `<div>
          <div style="font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:#475569;margin-bottom:10px;">Credentials</div>
          ${data.certifications.map(c=>`<div style="font-size:10px;color:#64748b;margin-bottom:5px;font-family:'DM Sans',sans-serif;">${c.name}${c.issuer?` · ${c.issuer}`:''}${c.year?` (${c.year})`:''}</div>`).join('')}
        </div>` : ''}
      </div>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────────────
// CV RENDERER — Academic folio format, wholly unique from resume
// ─────────────────────────────────────────────────────
function renderCV(data) {
  const name = fullName(data);
  return `<div style="min-height:297mm;background:white;font-family:'EB Garamond',Georgia,serif;">
    <!-- CV Header: horizontal stripe with name left, contact right -->
    <div style="border-bottom:3px double #1a1a2a;padding:40px 56px 28px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:#9ca3af;margin-bottom:10px;font-family:'DM Sans',sans-serif;">Curriculum Vitae</div>
          <div style="font-family:'Playfair Display',serif;font-size:44px;font-weight:700;color:#0f172a;line-height:1;letter-spacing:-0.02em;">${name}</div>
          ${data.title ? `<div style="font-size:15px;color:#6b7280;margin-top:8px;font-style:italic;">${data.title}</div>` : ''}
        </div>
        <div style="text-align:right;font-size:12px;color:#6b7280;line-height:2;font-family:'DM Sans',sans-serif;padding-top:20px;">
          ${data.email?`<div>${data.email}</div>`:''}
          ${data.phone?`<div>${data.phone}</div>`:''}
          ${data.location?`<div>${data.location}</div>`:''}
          ${data.website?`<div style="color:#4f46e5;">${data.website}</div>`:''}
        </div>
      </div>
    </div>
    <div style="padding:32px 56px;display:flex;flex-direction:column;gap:26px;">
      ${data.summary ? cvSection('Personal Statement', `<div style="font-size:14px;color:#374151;line-height:2;font-style:italic;max-width:540px;">${data.summary}</div>`) : ''}
      ${data.educations.length ? cvSection('Education', data.educations.map(e=>`
        <div style="display:grid;grid-template-columns:120px 1fr;gap:24px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px dotted #e5e7eb;">
          <div style="font-size:12px;color:#9ca3af;font-family:'DM Sans',sans-serif;padding-top:3px;">${e.year||'—'}</div>
          <div>
            <div style="font-size:15px;font-weight:600;color:#0f172a;">${e.degree||'Degree'}${e.field?` in ${e.field}`:''}</div>
            <div style="font-size:13px;color:#6b7280;font-style:italic;margin-top:2px;">${e.school||'School'}</div>
          </div>
        </div>`).join('')) : ''}
      ${data.experiences.length ? cvSection('Professional Experience', data.experiences.map(e=>`
        <div style="display:grid;grid-template-columns:120px 1fr;gap:24px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px dotted #e5e7eb;">
          <div style="font-size:11px;color:#9ca3af;font-family:'DM Sans',sans-serif;padding-top:3px;line-height:1.7;">${e.startDate||''}${e.startDate&&e.endDate?'<br>':''}${e.endDate||''}</div>
          <div>
            <div style="font-size:15px;font-weight:600;color:#0f172a;">${e.position||'Position'}</div>
            <div style="font-size:13px;color:#4f46e5;font-style:italic;margin-top:2px;">${e.company||'Organisation'}</div>
            ${e.description?`<div style="font-size:13px;color:#4b5563;line-height:1.9;margin-top:8px;">${e.description}</div>`:''}
          </div>
        </div>`).join('')) : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;">
        ${data.certifications.length ? cvSection('Credentials & Certifications', data.certifications.map(c=>`<div style="font-size:13px;color:#374151;margin-bottom:6px;">${c.name}${c.issuer?` — ${c.issuer}`:''}${c.year?` (${c.year})`:''}</div>`).join('')) : ''}
        ${data.skills.length ? cvSection('Research & Technical Skills', `<div>${data.skills.map(s=>`<span style="display:inline-block;margin:0 6px 4px 0;font-size:13px;color:${isHighlighted(s,data)?'#4f46e5':'#6b7280'};font-style:italic;">${s}${data.skills.indexOf(s)<data.skills.length-1?';':''}</span>`).join('')}</div>`) : ''}
      </div>
    </div>
  </div>`;
}
function cvSection(title, html) {
  return `<div>
    <div style="font-family:'DM Sans',sans-serif;font-size:9px;font-weight:800;letter-spacing:0.22em;text-transform:uppercase;color:#1a1a2a;margin-bottom:14px;display:flex;align-items:center;gap:12px;">
      ${title} <span style="flex:1;height:1px;background:#e5e7eb;display:inline-block;"></span>
    </div>
    ${html}
  </div>`;
}

// ─────────────────────────────────────────────────────
// COVER LETTER RENDERERS — 5 totally unique styles
// Each has its own visual language, typography, and layout
// ─────────────────────────────────────────────────────
function renderCoverLetter(data) {
  const styles = {
    editorial:  renderCoverEditorial,
    classic:    renderCoverClassic,
    modern:     renderCoverModern,
    creative:   renderCoverCreative,
    minimalist: renderCoverMinimalist,
    executive:  renderCoverExecutive,
    warm:       renderCoverWarm,
    technical:  renderCoverTechnical,
  };
  return (styles[currentCoverStyle] || renderCoverEditorial)(data);
}

// Cover: Editorial — full-bleed left bar, magazine opener
function renderCoverEditorial(data) {
  const name = fullName(data);
  const cl = data.coverLetter;
  return `<div style="min-height:297mm;background:white;display:grid;grid-template-columns:6px 1fr;font-family:'Syne',sans-serif;">
    <div style="background:linear-gradient(180deg,#7c3aed,#06b6d4);"></div>
    <div style="padding:56px 52px;display:flex;flex-direction:column;">
      <div style="margin-bottom:40px;">
        <div style="font-size:9px;letter-spacing:0.3em;text-transform:uppercase;color:#9ca3af;margin-bottom:12px;">Cover Letter</div>
        <div style="font-family:'Playfair Display',serif;font-size:40px;font-weight:700;color:#0f172a;line-height:1;letter-spacing:-0.03em;">${name}</div>
        ${data.title ? `<div style="font-size:13px;color:#7c3aed;margin-top:8px;">${data.title}</div>` : ''}
        <div style="margin-top:10px;font-size:11px;color:#9ca3af;font-family:'DM Sans',sans-serif;">${contactLine(data,' · ')}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:20px;flex:1;font-family:'DM Sans',sans-serif;">
        ${cl.company||cl.role ? `<div style="padding:14px 16px;background:#f5f3ff;border-left:3px solid #7c3aed;">
          <div style="font-size:12px;color:#4c1d95;font-weight:600;">Re: ${cl.role||'Position'}${cl.company?` at ${cl.company}`:''}</div>
        </div>` : ''}
        ${cl.intro ? `<div style="font-size:14px;color:#1e293b;line-height:1.9;font-weight:400;">${cl.intro}</div>` : `<div style="font-size:13px;color:#9ca3af;font-style:italic;">Your opening paragraph will appear here…</div>`}
        ${cl.body ? `<div style="font-size:13px;color:#374151;line-height:1.9;">${cl.body}</div>` : ''}
        ${cl.closing ? `<div style="font-size:13px;color:#374151;line-height:1.9;">${cl.closing}</div>` : ''}
        <div style="margin-top:auto;padding-top:40px;">
          <div style="font-size:12px;color:#9ca3af;">Sincerely,</div>
          <div style="font-family:'Playfair Display',serif;font-size:22px;color:#0f172a;margin-top:8px;font-style:italic;">${name}</div>
          ${data.email?`<div style="font-size:11px;color:#7c3aed;margin-top:4px;">${data.email}</div>`:''}
        </div>
      </div>
    </div>
  </div>`;
}

// Cover: Classic — formal business letter
function renderCoverClassic(data) {
  const name = fullName(data);
  const cl = data.coverLetter;
  return `<div style="padding:64px 72px;min-height:297mm;background:white;font-family:'EB Garamond',Georgia,serif;color:#1a1a2a;">
    <div style="margin-bottom:40px;">
      <div style="font-size:20px;font-family:'Playfair Display',serif;font-weight:700;">${name}</div>
      ${data.title ? `<div style="font-size:13px;color:#6b7280;font-style:italic;">${data.title}</div>` : ''}
      <div style="margin-top:6px;font-size:12px;color:#6b7280;font-family:'DM Sans',sans-serif;">${contactLine(data,' | ')}</div>
    </div>
    <div style="margin-bottom:28px;font-size:12px;color:#6b7280;font-family:'DM Sans',sans-serif;">
      <div>${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</div>
    </div>
    ${cl.company ? `<div style="margin-bottom:24px;font-size:13px;line-height:1.7;">
      <div style="font-weight:600;">${cl.company}</div>
      ${cl.role?`<div>Re: ${cl.role}</div>`:''}
    </div>` : ''}
    <div style="margin-bottom:12px;font-size:14px;">Dear Hiring Manager,</div>
    <div style="display:flex;flex-direction:column;gap:16px;font-size:14px;color:#374151;line-height:2;">
      ${cl.intro ? `<div>${cl.intro}</div>` : `<div style="color:#9ca3af;font-style:italic;">Your opening paragraph will appear here…</div>`}
      ${cl.body ? `<div>${cl.body}</div>` : ''}
      ${cl.closing ? `<div>${cl.closing}</div>` : ''}
    </div>
    <div style="margin-top:40px;font-size:14px;">
      <div>Sincerely,</div>
      <div style="font-family:'Playfair Display',serif;font-size:24px;font-style:italic;margin-top:24px;color:#0f172a;">${name}</div>
    </div>
  </div>`;
}

// Cover: Modern — Card-based, clean sans-serif
function renderCoverModern(data) {
  const name = fullName(data);
  const cl = data.coverLetter;
  return `<div style="min-height:297mm;background:#f8fafc;font-family:'Outfit',sans-serif;padding:40px;">
    <div style="background:white;border-radius:16px;padding:48px;box-shadow:0 1px 4px rgba(0,0,0,0.06);min-height:217mm;display:flex;flex-direction:column;gap:28px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:24px;border-bottom:2px solid #f1f5f9;">
        <div>
          <div style="font-size:28px;font-weight:700;color:#0f172a;letter-spacing:-0.03em;">${name}</div>
          ${data.title ? `<div style="font-size:13px;color:#6366f1;margin-top:4px;font-weight:600;">${data.title}</div>` : ''}
        </div>
        <div style="text-align:right;font-size:11px;color:#94a3b8;line-height:1.8;">
          ${[data.email,data.phone,data.location].filter(Boolean).map(v=>`<div>${v}</div>`).join('')}
        </div>
      </div>
      ${cl.company||cl.role ? `<div style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;background:#f0f9ff;border-radius:999px;border:1px solid #bae6fd;">
        <span style="font-size:12px;color:#0369a1;font-weight:600;">${cl.role||'Application'}${cl.company?` — ${cl.company}`:''}</span>
      </div>` : ''}
      <div style="display:flex;flex-direction:column;gap:16px;font-size:13.5px;color:#374151;line-height:1.9;flex:1;">
        ${cl.intro ? `<div>${cl.intro}</div>` : `<div style="color:#cbd5e1;font-style:italic;">Opening paragraph…</div>`}
        ${cl.body ? `<div>${cl.body}</div>` : ''}
        ${cl.closing ? `<div>${cl.closing}</div>` : ''}
      </div>
      <div style="padding-top:24px;border-top:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:flex-end;">
        <div>
          <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">Warm regards,</div>
          <div style="font-size:20px;font-weight:700;color:#0f172a;">${name}</div>
        </div>
        ${data.email?`<div style="font-size:11px;color:#6366f1;">${data.email}</div>`:''}
      </div>
    </div>
  </div>`;
}

// Cover: Creative — Bold typographic, no-rules design
function renderCoverCreative(data) {
  const name = fullName(data);
  const cl = data.coverLetter;
  return `<div style="min-height:297mm;background:#0f172a;font-family:'Syne',sans-serif;padding:52px 48px;color:white;display:flex;flex-direction:column;gap:0;">
    <div style="margin-bottom:48px;">
      <div style="font-size:64px;font-weight:800;letter-spacing:-0.06em;line-height:0.85;color:white;">${data.firstName||'Your'}</div>
      <div style="font-size:64px;font-weight:800;letter-spacing:-0.06em;line-height:0.85;
        background:linear-gradient(90deg,#8b5cf6,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">${data.lastName||'Name'}</div>
      ${data.title ? `<div style="font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:#475569;margin-top:16px;">${data.title}</div>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:1fr 180px;gap:40px;flex:1;">
      <div style="display:flex;flex-direction:column;gap:20px;font-family:'DM Sans',sans-serif;">
        ${cl.company||cl.role ? `<div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#7c3aed;">${cl.role||''}${cl.role&&cl.company?' at ':''}${cl.company||''}</div>` : ''}
        ${cl.intro ? `<div style="font-size:16px;color:#f1f5f9;line-height:1.8;font-weight:300;">${cl.intro}</div>` : `<div style="font-size:13px;color:#334155;font-style:italic;">Opening paragraph…</div>`}
        ${cl.body ? `<div style="font-size:13px;color:#94a3b8;line-height:1.9;">${cl.body}</div>` : ''}
        ${cl.closing ? `<div style="font-size:13px;color:#94a3b8;line-height:1.9;">${cl.closing}</div>` : ''}
        <div style="margin-top:auto;padding-top:32px;">
          <div style="font-size:11px;color:#475569;">— ${name}</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;padding-top:4px;">
        <div style="height:1px;background:#1e293b;margin-bottom:8px;"></div>
        ${[data.email,data.phone,data.location,data.website].filter(Boolean).map(v=>`<div style="font-size:10px;color:#475569;font-family:'DM Sans',sans-serif;word-break:break-all;">${v}</div>`).join('')}
      </div>
    </div>
  </div>`;
}

// Cover: Minimalist — pure text, extreme restraint
function renderCoverMinimalist(data) {
  const name = fullName(data);
  const cl = data.coverLetter;
  return `<div style="padding:80px 96px;min-height:297mm;background:white;font-family:'Outfit',sans-serif;color:#1a1a2a;">
    <div style="margin-bottom:64px;">
      <div style="font-size:13px;color:#9ca3af;">${name}</div>
      <div style="font-size:11px;color:#d1d5db;margin-top:2px;">${contactLine(data,' · ')}</div>
    </div>
    ${cl.company||cl.role ? `<div style="font-size:11px;color:#9ca3af;margin-bottom:32px;letter-spacing:0.05em;">Re: ${cl.role||''}${cl.role&&cl.company?' · ':''}${cl.company||''}</div>` : '<div style="height:32px;"></div>'}
    <div style="display:flex;flex-direction:column;gap:24px;font-size:14px;color:#374151;line-height:2;max-width:480px;">
      ${cl.intro ? `<div>${cl.intro}</div>` : `<div style="color:#d1d5db;font-style:italic;">Opening paragraph will appear here.</div>`}
      ${cl.body ? `<div>${cl.body}</div>` : ''}
      ${cl.closing ? `<div>${cl.closing}</div>` : ''}
    </div>
    <div style="margin-top:64px;">
      <div style="font-size:13px;color:#9ca3af;">${name}</div>
    </div>
  </div>`;
}

// Cover: Executive — dark premium header
function renderCoverExecutive(data) {
  const name = fullName(data);
  const cl = data.coverLetter;
  return `<div style="min-height:297mm;background:white;font-family:'DM Sans',sans-serif;">
    <div style="background:#1c1408;padding:44px 56px 32px;">
      <div style="font-size:36px;font-weight:700;color:white;letter-spacing:-0.02em;">${name}</div>
      ${data.title ? `<div style="font-size:13px;letter-spacing:0.15em;text-transform:uppercase;color:#d97706;margin-top:8px;">${data.title}</div>` : ''}
      <div style="margin-top:14px;font-size:11px;color:#92400e;display:flex;gap:16px;flex-wrap:wrap;">${[data.email,data.phone,data.location,data.website].filter(Boolean).map(v=>`<span>${v}</span>`).join('')}</div>
      <div style="margin-top:20px;height:1px;background:linear-gradient(90deg,#d97706,transparent);"></div>
    </div>
    <div style="padding:40px 56px;display:flex;flex-direction:column;gap:20px;">
      ${cl.company||cl.role ? `<div style="font-size:12px;color:#92400e;font-weight:600;border-left:3px solid #d97706;padding-left:12px;">Re: ${cl.role||'Position'}${cl.company?' at '+cl.company:''}</div>` : ''}
      <div style="font-size:14px;color:#374151;line-height:2;font-style:italic;">Dear Hiring Manager,</div>
      <div style="display:flex;flex-direction:column;gap:18px;font-size:14px;color:#374151;line-height:2;">
        ${cl.intro || '<span style="color:#d1d5db;font-style:italic;">Opening paragraph…</span>'}
        ${cl.body ? `<div>${cl.body}</div>` : ''}
        ${cl.closing ? `<div>${cl.closing}</div>` : ''}
      </div>
      <div style="margin-top:32px;font-size:14px;"><div>Respectfully,</div>
        <div style="font-size:22px;font-weight:700;color:#1c1408;margin-top:20px;">${name}</div>
        ${data.email?`<div style="font-size:11px;color:#d97706;margin-top:4px;">${data.email}</div>`:''}
      </div>
    </div>
  </div>`;
}

// Cover: Warm — friendly amber accents
function renderCoverWarm(data) {
  const name = fullName(data);
  const cl = data.coverLetter;
  return `<div style="min-height:297mm;background:#fffbf5;font-family:'Outfit',sans-serif;padding:56px 64px;">
    <div style="margin-bottom:40px;border-bottom:3px solid #f59e0b;padding-bottom:24px;">
      <div style="font-size:36px;font-weight:800;color:#1c0a00;letter-spacing:-0.03em;">${name}</div>
      ${data.title ? `<div style="font-size:14px;color:#d97706;margin-top:6px;font-weight:600;">${data.title}</div>` : ''}
      <div style="margin-top:10px;font-size:11px;color:#a16207;display:flex;gap:14px;flex-wrap:wrap;">${[data.email,data.phone,data.location,data.website].filter(Boolean).map(v=>`<span>${v}</span>`).join('')}</div>
    </div>
    ${cl.company||cl.role ? `<div style="margin-bottom:24px;display:inline-flex;padding:8px 16px;background:#fef3c7;border-radius:999px;font-size:12px;color:#92400e;font-weight:600;">✉ ${cl.role||''}${cl.role&&cl.company?' at ':''}${cl.company||''}</div>` : ''}
    <div style="font-size:14px;color:#451a03;margin-bottom:20px;">Dear Hiring Manager,</div>
    <div style="display:flex;flex-direction:column;gap:18px;font-size:14px;color:#374151;line-height:2;">
      ${cl.intro || '<span style="color:#d1d5db;font-style:italic;">Opening paragraph…</span>'}
      ${cl.body ? `<div>${cl.body}</div>` : ''}
      ${cl.closing ? `<div>${cl.closing}</div>` : ''}
    </div>
    <div style="margin-top:40px;"><div style="font-size:13px;color:#a16207;">With warmth,</div>
      <div style="font-size:24px;font-weight:800;color:#1c0a00;margin-top:12px;">${name}</div>
    </div>
  </div>`;
}

// Cover: Technical — monospace, clean dev style
function renderCoverTechnical(data) {
  const name = fullName(data);
  const cl = data.coverLetter;
  return `<div style="min-height:297mm;background:#0a0a0f;font-family:'Space Mono',monospace;padding:48px 52px;color:#c9d1d9;">
    <div style="border-bottom:1px solid #21262d;padding-bottom:24px;margin-bottom:32px;">
      <div style="font-size:10px;color:#3fb950;margin-bottom:8px;">&gt; cat cover_letter.md</div>
      <div style="font-size:28px;font-weight:700;color:white;letter-spacing:-0.02em;">${name}</div>
      ${data.title ? `<div style="font-size:11px;color:#3fb950;margin-top:6px;"># ${data.title}</div>` : ''}
      <div style="margin-top:10px;font-size:10px;color:#6e7681;">${[data.email,data.phone,data.location,data.website].filter(Boolean).join('  |  ')}</div>
    </div>
    ${cl.company||cl.role ? `<div style="font-size:10px;color:#8b949e;margin-bottom:24px;">// applying for: ${cl.role||''}${cl.role&&cl.company?' @ ':''}${cl.company||''}</div>` : ''}
    <div style="font-size:11px;color:#8b949e;margin-bottom:16px;">Dear Hiring Manager,</div>
    <div style="display:flex;flex-direction:column;gap:16px;font-size:12px;color:#c9d1d9;line-height:1.9;font-family:'DM Sans',sans-serif;">
      ${cl.intro || '<span style="color:#334155;font-style:italic;">Opening paragraph…</span>'}
      ${cl.body ? `<div>${cl.body}</div>` : ''}
      ${cl.closing ? `<div>${cl.closing}</div>` : ''}
    </div>
    <div style="margin-top:48px;font-size:11px;color:#6e7681;">-- ${name}</div>
  </div>`;
}

// ─────────────────────────────────────────────────────
// PORTFOLIO RENDERERS — 5 wholly distinct layouts
// ─────────────────────────────────────────────────────
function renderPortfolio(data) {
  const styles = {
    agency:    renderPortAgency,
    gallery:   renderPortGallery,
    casestudy: renderPortCaseStudy,
    bold:      renderPortBold,
    minimal:   renderPortMinimal,
  };
  return (styles[currentPortStyle] || renderPortAgency)(data);
}

// Portfolio: Agency — dark immersive showcase
function renderPortAgency(data) {
  const name = fullName(data);
  return `<div style="min-height:297mm;background:#080810;font-family:'Syne',sans-serif;color:white;">
    <div style="padding:48px 44px 32px;background:linear-gradient(180deg,rgba(139,92,246,0.15),transparent);">
      <div style="font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:#7c3aed;margin-bottom:12px;">Portfolio</div>
      <div style="font-size:48px;font-weight:800;letter-spacing:-0.05em;line-height:0.9;">${name}</div>
      ${data.title ? `<div style="font-size:13px;color:#7dd3fc;margin-top:10px;">${data.title}</div>` : ''}
      ${data.summary ? `<div style="font-size:12px;color:#64748b;max-width:440px;line-height:1.7;margin-top:10px;font-family:'DM Sans',sans-serif;">${data.summary}</div>` : ''}
      <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;">
        ${[data.email,data.phone,data.location,data.website].filter(Boolean).map(v=>`<span style="font-size:10px;color:#475569;padding:2px 10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:999px;">${v}</span>`).join('')}
      </div>
    </div>
    ${data.projects.length ? `
    <div style="padding:0 44px 32px;">
      <div style="font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:#334155;margin-bottom:16px;padding-top:24px;border-top:1px solid rgba(255,255,255,0.05);">Selected Work</div>
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${data.projects.map((p,i)=>`<div style="padding:18px 20px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;display:grid;grid-template-columns:32px 1fr auto;">
          <div style="font-family:'Space Mono',monospace;font-size:10px;color:#334155;padding-top:2px;">${String(i+1).padStart(2,'0')}</div>
          <div>
            <div style="font-size:15px;font-weight:700;color:white;">${p.name||'Project'}</div>
            ${p.role ? `<div style="font-size:11px;color:#7c3aed;margin-top:2px;">${p.role}</div>` : ''}
            ${p.description ? `<div style="font-size:11px;color:#64748b;margin-top:6px;line-height:1.7;font-family:'DM Sans',sans-serif;">${p.description}</div>` : ''}
            ${p.problem ? `<div style="margin-top:6px;font-size:10px;font-family:'DM Sans',sans-serif;"><span style="color:#475569;text-transform:uppercase;letter-spacing:0.08em;font-size:9px;">Problem · </span><span style="color:#64748b;">${p.problem}</span></div>` : ''}
            ${p.outcome ? `<div style="margin-top:4px;font-size:10px;font-family:'DM Sans',sans-serif;"><span style="color:#3fb950;text-transform:uppercase;letter-spacing:0.08em;font-size:9px;">Outcome · </span><span style="color:#86efac;">${p.outcome}</span></div>` : ''}
          </div>
          <div style="text-align:right;">
            ${p.year?`<div style="font-size:10px;color:#334155;">${p.year}</div>`:''}
            ${p.link?`<div style="font-size:10px;color:#7c3aed;margin-top:2px;">${p.link}</div>`:''}
          </div>
        </div>`).join('')}
      </div>
    </div>` : ''}
    ${data.skills.length ? `<div style="padding:0 44px 32px;">
      <div style="font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:#334155;margin-bottom:14px;">Skills</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;">
        ${data.skills.map(s=>`<span style="padding:3px 12px;border-radius:999px;font-size:11px;
          ${isHighlighted(s,data)?'background:#7c3aed;color:white;':'background:rgba(255,255,255,0.05);color:#64748b;border:1px solid rgba(255,255,255,0.06);'}">${s}</span>`).join('')}
      </div>
    </div>` : ''}
    <div style="padding:0 44px 44px;display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      ${data.experiences.length ? `<div style="padding:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:8px;">
        <div style="font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:#334155;margin-bottom:10px;">Experience</div>
        ${data.experiences.map(e=>`<div style="margin-bottom:8px;">
          <div style="font-size:12px;font-weight:700;color:#e2e8f0;">${e.position||'Role'}</div>
          <div style="font-size:10px;color:#475569;">${e.company||''}${dateRange(e)?` · ${dateRange(e)}`:''}</div>
        </div>`).join('')}
      </div>` : ''}
      ${data.educations.length ? `<div style="padding:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:8px;">
        <div style="font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:#334155;margin-bottom:10px;">Education</div>
        ${data.educations.map(e=>`<div style="margin-bottom:8px;">
          <div style="font-size:12px;font-weight:700;color:#e2e8f0;">${e.school||'School'}</div>
          <div style="font-size:10px;color:#475569;">${e.degree||''}${e.degree&&e.field?', ':''}${e.field||''} ${e.year?`· ${e.year}`:''}</div>
        </div>`).join('')}
      </div>` : ''}
    </div>
  </div>`;
}

// Portfolio: Gallery — light card grid
function renderPortGallery(data) {
  const name = fullName(data);
  return `<div style="min-height:297mm;background:#f8f9fa;font-family:'Outfit',sans-serif;padding:40px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:32px;padding-bottom:20px;border-bottom:2px solid #e9ecef;">
      <div>
        <div style="font-size:32px;font-weight:800;color:#212529;letter-spacing:-0.04em;">${name}</div>
        ${data.title ? `<div style="font-size:13px;color:#6c757d;margin-top:4px;">${data.title}</div>` : ''}
        <div style="margin-top:6px;font-size:11px;color:#adb5bd;">${contactLine(data,' · ')}</div>
      </div>
      ${data.skills.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;max-width:220px;justify-content:flex-end;">
        ${data.skills.slice(0,6).map(s=>`<span style="padding:2px 10px;border-radius:999px;font-size:10px;font-weight:600;
          ${isHighlighted(s,data)?'background:#212529;color:white;':'background:white;color:#495057;border:1px solid #dee2e6;'}">${s}</span>`).join('')}
      </div>` : ''}
    </div>
    ${data.summary ? `<div style="margin-bottom:24px;font-size:13px;color:#495057;line-height:1.8;max-width:480px;">${data.summary}</div>` : ''}
    ${data.projects.length ? `<div style="margin-bottom:28px;">
      <div style="font-size:9px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#adb5bd;margin-bottom:14px;">Projects</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        ${data.projects.map(p=>`<div style="background:white;border-radius:10px;padding:16px;border:1px solid #dee2e6;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
            <div style="font-size:13px;font-weight:700;color:#212529;">${p.name||'Project'}</div>
            ${p.year?`<div style="font-size:9px;color:#adb5bd;">${p.year}</div>`:''}
          </div>
          ${p.role ? `<div style="font-size:10px;color:#6c757d;font-weight:600;margin-bottom:5px;">${p.role}</div>` : ''}
          ${p.description ? `<div style="font-size:11px;color:#495057;line-height:1.6;">${p.description}</div>` : ''}
          ${p.problem ? `<div style="margin-top:5px;font-size:10px;"><span style="color:#adb5bd;text-transform:uppercase;letter-spacing:0.08em;font-size:9px;">Problem · </span><span style="color:#6c757d;">${p.problem}</span></div>` : ''}
          ${p.outcome ? `<div style="margin-top:3px;font-size:10px;"><span style="color:#2b9348;text-transform:uppercase;letter-spacing:0.08em;font-size:9px;">Outcome · </span><span style="color:#2b9348;font-weight:600;">${p.outcome}</span></div>` : ''}
          ${p.link ? `<div style="font-size:10px;color:#4361ee;margin-top:6px;">↗ ${p.link}</div>` : ''}
        </div>`).join('')}
      </div>
    </div>` : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
      ${data.experiences.length ? `<div style="background:white;border-radius:10px;padding:14px;border:1px solid #dee2e6;">
        <div style="font-size:9px;font-weight:800;letter-spacing:0.15em;text-transform:uppercase;color:#adb5bd;margin-bottom:10px;">Experience</div>
        ${data.experiences.map(e=>`<div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #f8f9fa;">
          <div style="font-size:11px;font-weight:700;color:#212529;">${e.position||'Role'}</div>
          <div style="font-size:10px;color:#6c757d;">${e.company||''}</div>
          ${dateRange(e)?`<div style="font-size:9px;color:#adb5bd;">${dateRange(e)}</div>`:''}
        </div>`).join('')}
      </div>` : ''}
      ${data.educations.length ? `<div style="background:white;border-radius:10px;padding:14px;border:1px solid #dee2e6;">
        <div style="font-size:9px;font-weight:800;letter-spacing:0.15em;text-transform:uppercase;color:#adb5bd;margin-bottom:10px;">Education</div>
        ${data.educations.map(e=>`<div style="margin-bottom:8px;">
          <div style="font-size:11px;font-weight:700;color:#212529;">${e.school||'School'}</div>
          <div style="font-size:10px;color:#6c757d;">${e.degree||''}${e.field?`, ${e.field}`:''}</div>
          ${e.year?`<div style="font-size:9px;color:#adb5bd;">${e.year}</div>`:''}
        </div>`).join('')}
      </div>` : ''}
      ${data.certifications.length ? `<div style="background:white;border-radius:10px;padding:14px;border:1px solid #dee2e6;">
        <div style="font-size:9px;font-weight:800;letter-spacing:0.15em;text-transform:uppercase;color:#adb5bd;margin-bottom:10px;">Certs</div>
        ${data.certifications.map(c=>`<div style="margin-bottom:8px;font-size:10px;color:#495057;">${c.name}${c.year?` · ${c.year}`:''}</div>`).join('')}
      </div>` : ''}
    </div>
  </div>`;
}

// Portfolio: Case Study — narrative deep-dive
function renderPortCaseStudy(data) {
  const name = fullName(data);
  return `<div style="min-height:297mm;background:white;font-family:'DM Sans',sans-serif;">
    <div style="background:#1a1a2a;padding:44px 52px;">
      <div style="font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:#6366f1;margin-bottom:10px;">Case Studies</div>
      <div style="font-family:'Syne',sans-serif;font-size:38px;font-weight:800;color:white;letter-spacing:-0.04em;">${name}</div>
      ${data.title ? `<div style="font-size:12px;color:#818cf8;margin-top:8px;">${data.title}</div>` : ''}
      <div style="margin-top:10px;font-size:11px;color:#475569;">${contactLine(data,' · ')}</div>
    </div>
    ${data.summary ? `<div style="padding:24px 52px;background:#f0f9ff;border-bottom:1px solid #e0e7ff;">
      <div style="font-size:13px;color:#1e40af;line-height:1.8;max-width:520px;">${data.summary}</div>
    </div>` : ''}
    ${data.projects.length ? `<div style="padding:32px 52px;display:flex;flex-direction:column;gap:28px;">
      ${data.projects.map((p,i)=>`<div style="${i>0?'padding-top:28px;border-top:1px solid #f1f5f9':''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
          <div>
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="width:6px;height:6px;border-radius:50%;background:#6366f1;"></div>
              <div style="font-family:'Syne',sans-serif;font-size:17px;font-weight:700;color:#1a1a2a;">${p.name||'Project'}</div>
            </div>
            ${p.role?`<div style="font-size:11px;color:#6366f1;font-weight:600;margin-top:3px;margin-left:14px;">${p.role}</div>`:''}
          </div>
          <div style="text-align:right;">
            ${p.year?`<div style="font-size:10px;color:#94a3b8;">${p.year}</div>`:''}
            ${p.link?`<div style="font-size:10px;color:#6366f1;margin-top:2px;">↗ ${p.link}</div>`:''}
          </div>
        </div>
        ${p.description?`<div style="font-size:13px;color:#334155;line-height:1.8;padding-left:14px;border-left:2px solid #e0e7ff;">${p.description}</div>`:''}
        ${p.problem?`<div style="margin-top:8px;padding-left:14px;"><span style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;">Problem</span><div style="font-size:12px;color:#475569;line-height:1.7;">${p.problem}</div></div>`:''}
        ${p.outcome?`<div style="margin-top:6px;padding-left:14px;background:#f0fdf4;border-left:2px solid #22c55e;padding:8px 14px;"><span style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:#16a34a;">Outcome</span><div style="font-size:12px;color:#15803d;font-weight:600;line-height:1.7;">${p.outcome}</div></div>`:''}
      </div>`).join('')}
    </div>` : ''}
    <div style="padding:0 52px 40px;display:grid;grid-template-columns:1fr 1fr;gap:28px;">
      ${data.skills.length ? `<div>
        <div style="font-size:9px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#94a3b8;margin-bottom:12px;border-bottom:1px solid #f1f5f9;padding-bottom:8px;">Skills</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;">
          ${data.skills.map(s=>`<span style="padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;
            ${isHighlighted(s,data)?'background:#6366f1;color:white;':'background:#f1f5f9;color:#475569;'}">${s}</span>`).join('')}
        </div>
      </div>` : ''}
      ${data.experiences.length ? `<div>
        <div style="font-size:9px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#94a3b8;margin-bottom:12px;border-bottom:1px solid #f1f5f9;padding-bottom:8px;">Experience</div>
        ${data.experiences.map(e=>`<div style="margin-bottom:8px;">
          <div style="font-size:12px;font-weight:700;color:#1a1a2a;">${e.position||'Role'}</div>
          <div style="font-size:11px;color:#6366f1;">${e.company||''}</div>
          ${dateRange(e)?`<div style="font-size:10px;color:#94a3b8;">${dateRange(e)}</div>`:''}
        </div>`).join('')}
      </div>` : ''}
    </div>
  </div>`;
}

// Portfolio: Bold — high-contrast, typographic impact
function renderPortBold(data) {
  const name = fullName(data);
  return `<div style="min-height:297mm;background:white;font-family:'Syne',sans-serif;overflow:hidden;">
    <div style="background:black;padding:52px 48px 40px;">
      <div style="font-size:72px;font-weight:800;color:white;letter-spacing:-0.06em;line-height:0.85;">${data.firstName||'Your'}<br><span style="color:#f59e0b;">${data.lastName||'Name'}</span></div>
      ${data.title ? `<div style="font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:#6b7280;margin-top:16px;">${data.title}</div>` : ''}
    </div>
    <div style="background:#f59e0b;padding:12px 48px;display:flex;gap:20px;flex-wrap:wrap;">
      ${[data.email,data.phone,data.location,data.website].filter(Boolean).map(v=>`<span style="font-size:11px;color:#1c0a00;font-weight:600;">${v}</span>`).join('<span style="color:rgba(0,0,0,0.2);">·</span>')}
    </div>
    <div style="padding:36px 48px;display:grid;grid-template-columns:2fr 1fr;gap:36px;">
      <div style="display:flex;flex-direction:column;gap:28px;">
        ${data.summary ? `<div style="font-size:16px;color:#1a1a2a;line-height:1.7;font-family:'DM Sans',sans-serif;font-weight:300;">${data.summary}</div>` : ''}
        ${data.projects.length ? `<div>
          <div style="font-size:10px;font-weight:800;letter-spacing:0.22em;text-transform:uppercase;color:#f59e0b;margin-bottom:16px;">Work</div>
          ${data.projects.map(p=>`<div style="margin-bottom:20px;padding-bottom:20px;border-bottom:2px solid #000;">
            <div style="font-size:18px;font-weight:800;color:#0f172a;letter-spacing:-0.02em;">${p.name||'Project'}</div>
            ${p.role?`<div style="font-size:11px;font-weight:600;color:#f59e0b;">${p.role} ${p.year?`· ${p.year}`:''}</div>`:''}
            ${p.description?`<div style="font-size:12px;color:#374151;line-height:1.7;margin-top:6px;font-family:'DM Sans',sans-serif;">${p.description}</div>`:''}
            ${p.problem?`<div style="margin-top:5px;font-size:11px;font-family:'DM Sans',sans-serif;"><span style="color:#9ca3af;font-size:9px;text-transform:uppercase;letter-spacing:0.1em;">Problem · </span>${p.problem}</div>`:''}
            ${p.outcome?`<div style="margin-top:3px;font-size:11px;font-family:'DM Sans',sans-serif;color:#f59e0b;font-weight:700;">↑ ${p.outcome}</div>`:''}
            ${p.link?`<div style="font-size:10px;color:#f59e0b;margin-top:4px;">↗ ${p.link}</div>`:''}
          </div>`).join('')}
        </div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:24px;">
        ${data.skills.length ? `<div>
          <div style="font-size:10px;font-weight:800;letter-spacing:0.22em;text-transform:uppercase;color:#f59e0b;margin-bottom:12px;">Skills</div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            ${data.skills.map(s=>`<div style="font-size:12px;color:${isHighlighted(s,data)?'#0f172a':'#9ca3af'};font-weight:${isHighlighted(s,data)?'800':'400'};padding:4px 0;border-bottom:1px solid ${isHighlighted(s,data)?'#000':'#f3f4f6'};">${isHighlighted(s,data)?'★ ':''}${s}</div>`).join('')}
          </div>
        </div>` : ''}
        ${data.educations.length ? `<div>
          <div style="font-size:10px;font-weight:800;letter-spacing:0.22em;text-transform:uppercase;color:#f59e0b;margin-bottom:12px;">Education</div>
          ${data.educations.map(e=>`<div style="margin-bottom:10px;">
            <div style="font-size:13px;font-weight:800;color:#0f172a;">${e.school||'School'}</div>
            <div style="font-size:11px;color:#9ca3af;">${e.degree||''}${e.field?`, ${e.field}`:''} ${e.year?`· ${e.year}`:''}</div>
          </div>`).join('')}
        </div>` : ''}
      </div>
    </div>
  </div>`;
}

// Portfolio: Minimal — text-first, total restraint
function renderPortMinimal(data) {
  const name = fullName(data);
  return `<div style="padding:72px 80px;min-height:297mm;background:white;font-family:'Outfit',sans-serif;">
    <div style="margin-bottom:48px;">
      <div style="font-size:11px;color:#d1d5db;letter-spacing:0.04em;margin-bottom:10px;">Portfolio</div>
      <div style="font-size:36px;font-weight:300;color:#111827;letter-spacing:-0.04em;">${name}</div>
      ${data.title ? `<div style="font-size:13px;color:#9ca3af;margin-top:4px;">${data.title}</div>` : ''}
      <div style="margin-top:8px;font-size:11px;color:#d1d5db;">${contactLine(data,' · ')}</div>
    </div>
    ${data.summary ? `<div style="margin-bottom:40px;max-width:460px;font-size:14px;color:#6b7280;line-height:2;">${data.summary}</div>` : ''}
    ${data.projects.length ? `<div style="margin-bottom:40px;">
      <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#e5e7eb;margin-bottom:20px;">Projects</div>
      ${data.projects.map(p=>`<div style="display:grid;grid-template-columns:100px 1fr;gap:16px;margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #f9fafb;">
        <div style="font-size:11px;color:#d1d5db;padding-top:3px;">${p.year||'—'}</div>
        <div>
          <div style="font-size:14px;font-weight:600;color:#111827;">${p.name||'Project'}</div>
          ${p.role?`<div style="font-size:11px;color:#9ca3af;margin-top:2px;">${p.role}</div>`:''}
          ${p.description?`<div style="font-size:12px;color:#374151;line-height:1.7;margin-top:4px;">${p.description}</div>`:''}
          ${p.problem?`<div style="margin-top:4px;font-size:11px;color:#9ca3af;"><span style="font-size:9px;text-transform:uppercase;letter-spacing:0.1em;">Problem · </span>${p.problem}</div>`:''}
          ${p.outcome?`<div style="margin-top:3px;font-size:11px;color:#111827;font-weight:600;">↑ ${p.outcome}</div>`:''}
          ${p.link?`<div style="font-size:10px;color:#9ca3af;margin-top:4px;">↗ ${p.link}</div>`:''}
        </div>
      </div>`).join('')}
    </div>` : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;">
      ${data.skills.length ? `<div>
        <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#e5e7eb;margin-bottom:14px;">Skills</div>
        <div>${data.skills.map(s=>`<span style="font-size:12px;color:${isHighlighted(s,data)?'#111827':'#9ca3af'};font-weight:${isHighlighted(s,data)?'600':'400'};">${s}</span>`).join('<span style="color:#e5e7eb;"> / </span>')}</div>
      </div>` : ''}
      ${data.experiences.length ? `<div>
        <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#e5e7eb;margin-bottom:14px;">Experience</div>
        ${data.experiences.map(e=>`<div style="margin-bottom:10px;">
          <div style="font-size:13px;font-weight:600;color:#111827;">${e.position||'Role'}</div>
          <div style="font-size:11px;color:#9ca3af;">${e.company||''} ${dateRange(e)?`· ${dateRange(e)}`:''}</div>
        </div>`).join('')}
      </div>` : ''}
    </div>
  </div>`;
}

// ── EXPORT MENU TOGGLE ────────────────────────────────
function toggleExportMenu(e) {
  e.stopPropagation();
  document.getElementById('exportMenu').classList.toggle('open');
}
document.addEventListener('click', () => {
  const menu = document.getElementById('exportMenu');
  if (menu) menu.classList.remove('open');
});

// ── EXPORT PDF ────────────────────────────────────────
function exportToPDF() {
  document.getElementById('exportMenu').classList.remove('open');
  const data = getFormData();
  const fname = `${(data.firstName||'Resume').replace(/[^a-zA-Z0-9_-]/g,'')||'Resume'}-Nyxon.pdf`;
  const el = document.getElementById('resumePreview');
  html2pdf().set({
    margin: 0,
    filename: fname,
    image: { type:'jpeg', quality:0.98 },
    html2canvas: { scale:2, useCORS:true, logging:false },
    jsPDF: { unit:'mm', format:'a4', orientation:'portrait' }
  }).from(el).save();
  showToast();
}

// ── EXPORT DOCX ───────────────────────────────────────
async function exportToDocx() {
  document.getElementById('exportMenu').classList.remove('open');
  showToast();
  const data = getFormData();
  const name = fullName(data);
  const fname = `${(data.firstName||'Resume').replace(/[^a-zA-Z0-9_-]/g,'')||'Resume'}-Nyxon.docx`;

  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel,
    AlignmentType, BorderStyle, Table, TableRow, TableCell,
    WidthType, ShadingType, convertInchesToTwip, UnderlineType
  } = docx;

  const ACCENT = '8B5CF6';
  const DARK   = '0F172A';
  const MUTED  = '64748B';
  const LIGHT  = 'F1F5F9';

  const hRule = () => new Paragraph({
    border: { bottom: { color: 'E2E8F0', size: 6, style: BorderStyle.SINGLE } },
    spacing: { after: 120 },
  });

  const sectionHeading = (text) => new Paragraph({
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 18, color: ACCENT, characterSpacing: 80 })],
    spacing: { before: 280, after: 100 },
    border: { bottom: { color: 'E2E8F0', size: 4, style: BorderStyle.SINGLE } },
  });

  const bodyText = (text, opts = {}) => new Paragraph({
    children: [new TextRun({ text, size: 22, color: opts.color || '374151', bold: opts.bold || false, italics: opts.italic || false })],
    spacing: { after: opts.spaceAfter ?? 60 },
    indent: opts.indent ? { left: convertInchesToTwip(0.15) } : {},
  });

  const children = [];

  // ── Name & title
  children.push(new Paragraph({
    children: [new TextRun({ text: name, bold: true, size: 52, color: DARK })],
    spacing: { after: 60 },
  }));
  if (data.title) children.push(new Paragraph({
    children: [new TextRun({ text: data.title, size: 24, color: MUTED, italics: true })],
    spacing: { after: 80 },
  }));

  // ── Contact line
  const contactParts = [data.email, data.phone, data.location, data.website].filter(Boolean);
  if (contactParts.length) children.push(new Paragraph({
    children: contactParts.map((c, i) => new TextRun({
      text: i < contactParts.length - 1 ? `${c}  ·  ` : c,
      size: 19, color: MUTED,
    })),
    spacing: { after: 200 },
  }));

  children.push(hRule());

  // ── Summary
  if (data.summary) {
    children.push(sectionHeading('Profile'));
    children.push(bodyText(data.summary, { spaceAfter: 200 }));
    children.push(hRule());
  }

  // ── Experience
  if (data.experiences.length) {
    children.push(sectionHeading('Experience'));
    data.experiences.forEach(e => {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: e.position || 'Position', bold: true, size: 24, color: DARK }),
          new TextRun({ text: `  ·  ${e.company || ''}`, size: 22, color: ACCENT }),
        ],
        spacing: { before: 120, after: 40 },
      }));
      if (e.startDate || e.endDate) children.push(new Paragraph({
        children: [new TextRun({ text: `${e.startDate || ''}${e.startDate && e.endDate ? ' – ' : ''}${e.endDate || ''}`, size: 18, color: MUTED, italics: true })],
        spacing: { after: 60 },
      }));
      if (e.description) children.push(bodyText(e.description, { indent: true, spaceAfter: 120 }));
    });
    children.push(hRule());
  }

  // ── Education
  if (data.educations.length) {
    children.push(sectionHeading('Education'));
    data.educations.forEach(e => {
      children.push(new Paragraph({
        children: [new TextRun({ text: e.school || 'School', bold: true, size: 24, color: DARK })],
        spacing: { before: 100, after: 40 },
      }));
      children.push(new Paragraph({
        children: [new TextRun({ text: `${e.degree || ''}${e.degree && e.field ? ', ' : ''}${e.field || ''}${e.year ? '  ·  ' + e.year : ''}`, size: 20, color: MUTED, italics: true })],
        spacing: { after: 100 },
      }));
    });
    children.push(hRule());
  }

  // ── Skills
  if (data.skills.length) {
    children.push(sectionHeading('Skills'));
    children.push(new Paragraph({
      children: data.skills.map((s, i) => new TextRun({
        text: i < data.skills.length - 1 ? `${s}  ·  ` : s,
        size: 21, color: '334155',
      })),
      spacing: { after: 200 },
    }));
    children.push(hRule());
  }

  // ── Certifications (resume/cv only)
  if (data.certifications.length && (currentMode === 'resume' || currentMode === 'cv')) {
    children.push(sectionHeading('Certifications'));
    data.certifications.forEach(c => {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: c.name, bold: true, size: 22, color: DARK }),
          ...(c.issuer ? [new TextRun({ text: `  —  ${c.issuer}`, size: 20, color: MUTED })] : []),
          ...(c.year ? [new TextRun({ text: `  (${c.year})`, size: 18, color: MUTED, italics: true })] : []),
        ],
        spacing: { after: 80 },
      }));
    });
    children.push(hRule());
  }

  // ── Cover letter body
  if (currentMode === 'cover') {
    const cl = data.coverLetter;
    if (cl.company || cl.role) children.push(new Paragraph({
      children: [new TextRun({ text: `Re: ${cl.role || ''}${cl.role && cl.company ? ' at ' : ''}${cl.company || ''}`, bold: true, size: 22, color: ACCENT })],
      spacing: { before: 120, after: 200 },
    }));
    children.push(bodyText('Dear Hiring Manager,', { spaceAfter: 160 }));
    if (cl.intro)   children.push(bodyText(cl.intro,   { spaceAfter: 160 }));
    if (cl.body)    children.push(bodyText(cl.body,    { spaceAfter: 160 }));
    if (cl.closing) children.push(bodyText(cl.closing, { spaceAfter: 320 }));
    children.push(bodyText('Sincerely,', { spaceAfter: 400 }));
    children.push(new Paragraph({
      children: [new TextRun({ text: name, bold: true, size: 26, color: DARK })],
    }));
  }

  // ── Portfolio projects
  if (currentMode === 'portfolio' && data.projects.length) {
    children.push(sectionHeading('Projects'));
    data.projects.forEach(p => {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: p.name || 'Project', bold: true, size: 24, color: DARK }),
          ...(p.role ? [new TextRun({ text: `  ·  ${p.role}`, size: 21, color: ACCENT })] : []),
          ...(p.year ? [new TextRun({ text: `  (${p.year})`, size: 18, color: MUTED })] : []),
        ],
        spacing: { before: 120, after: 60 },
      }));
      if (p.link) children.push(new Paragraph({
        children: [new TextRun({ text: p.link, size: 18, color: ACCENT, italics: true })],
        spacing: { after: 60 },
      }));
      if (p.description) children.push(bodyText(p.description, { indent: true, spaceAfter: 60 }));
      if (p.problem) children.push(new Paragraph({
        children: [new TextRun({ text: 'Problem: ', bold: true, size: 20, color: MUTED }), new TextRun({ text: p.problem, size: 20, color: MUTED, italics: true })],
        spacing: { after: 60 }, indent: { left: convertInchesToTwip(0.15) },
      }));
      if (p.outcome) children.push(new Paragraph({
        children: [new TextRun({ text: 'Outcome: ', bold: true, size: 20, color: '16a34a' }), new TextRun({ text: p.outcome, size: 20, color: '16a34a', bold: true })],
        spacing: { after: 140 }, indent: { left: convertInchesToTwip(0.15) },
      }));
    });
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22, color: '1a1a2a' },
          paragraph: { spacing: { line: 276 } },
        },
      },
    },
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } }, children }],
  });

  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = fname;
  a.click();
  URL.revokeObjectURL(url);
}


// ── RESET ──────────────────────────────────────────────
function resetAll() {
  ['firstName','lastName','title','targetJob','email','phone','location','website','summary','clCompany','clRole','clIntro','clBody','clClosing'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  experiences = []; educations = []; certifications = []; skills = []; projects = [];
  coverLetter = { company:'', role:'', intro:'', body:'', closing:'' };
  addExperience(); addEducation(); addCertification();
  renderSkills();
  updatePreview();
}

// ── DEMO DATA & PER-PROFILE LOADERS ───────────────────
// Keep demo definitions accessible to per-profile loaders
const DEMOS = {
  ava: {
    firstName: 'Ava', lastName: 'Bennett', title: 'Senior Product Designer',
    dob: '1990-07-14', gender: 'Female', nationality: 'United States', maritalStatus: 'Single', languages: 'English (native), Spanish (fluent)', religion: '',
    linkedin: 'linkedin.com/in/ava-bennett', github: 'github.com/ava-bennett',
    email: 'ava.bennett@studio.io', phone: '+1 555 241 8900', location: 'Austin, TX', website: 'ava.studio',
    targetJob: 'Lead Product Designer at Nova Labs',
    summary: 'Creative product designer with 8 years of experience crafting digital experiences for startups and enterprise teams. I bridge business goals with user needs through research-driven design.',
    experiences: [
      { id:1, company:'Nova Labs', position:'Senior Product Designer', startDate:'Jan 2022', endDate:'Present', description:'Led design strategy for customer-facing SaaS products. Built and maintained a unified design system used across 6 product lines, reducing design-to-dev time by 40%.' },
      { id:2, company:'Arc Interactive', position:'Product Designer', startDate:'Jun 2018', endDate:'Dec 2021', description:'Delivered end-to-end digital experiences through user research, wireframing, and cross-functional design reviews for 12+ product launches.' },
    ],
    educations: [
      { id:3, school:'University of Texas at Austin', degree:'B.A.', field:'Visual Communication', year:'2018' },
      { id:8, school:'General Assembly', degree:'Certificate', field:'User Experience Design', year:'2016' }
    ],
    certifications: [{ id:4, name:'Certified UX Specialist', issuer:'Interaction Design Foundation', year:'2020' }],
    skills: ['Figma','User Research','Prototyping','Design Systems','UI Animation','Accessibility'],
    projects: [
      { id:5, name:'Nyxon Quest Dashboard', role:'Design Lead', description:'Built a career-focused productivity dashboard with a full design system, user flows, and interactive prototype.', problem:'Users were losing track of job applications and had no single place to manage career progress.', outcome:'Shipped to 12,000 users with 78% week-1 retention. Reduced time-to-apply by 34%.', link:'nyxonquest.app', year:'2025' },
    ],
    coverLetter: {
      company:'Nova Labs', role:'Lead Product Designer',
      intro:`I'm genuinely excited to apply for the Lead Product Designer role at Nova Labs. Having shipped products that your team uses daily as a Senior Designer here, I've seen firsthand how design thinking at Nova translates into customer delight — and I want to help shape that at a strategic level.`,
      body:`Over 8 years, I've built and led design systems, run cross-functional research sprints, and shipped experiences that drive measurable retention gains. At Arc, I reduced onboarding drop-off by 34%. At Nova, I cut design-to-dev handoff time by 40% with a unified system. I pair rigorous process with a high craft bar.`,
      closing:`I'd love to discuss how I can help Nova Labs' next chapter. Thank you for your time — I look forward to talking soon.`
    }
  },
  liam: {
    firstName: 'Liam', lastName: 'Park', title: 'Senior Software Engineer',
    dob: '1988-03-02', gender: 'Male', nationality: 'United States', maritalStatus: 'Married', languages: 'English (native), Korean (fluent)', religion: '',
    linkedin: 'linkedin.com/in/liam-park', github: 'github.com/liampark',
    email: 'liam.park@devco.com', phone: '+1 415 555 0199', location: 'San Francisco, CA', website: 'liam.dev',
    targetJob: 'Platform Engineering Lead',
    summary: 'Backend engineer focusing on scalable distributed systems, observability, and platform tooling with 10+ years experience.',
    experiences: [
      { id:11, company:'CloudForge', position:'Senior Software Engineer', startDate:'Mar 2020', endDate:'Present', description:'Built microservices and observability tooling that improved system uptime to 99.99%.' },
      { id:12, company:'DataMesh Inc', position:'Software Engineer', startDate:'Jul 2015', endDate:'Feb 2020', description:'Designed event-driven architectures and data pipelines powering analytics at scale.' },
    ],
    educations: [{ id:13, school:'University of California, Berkeley', degree:'M.S.', field:'Computer Science', year:'2015' }],
    certifications: [{ id:14, name:'GCP Professional Cloud Architect', issuer:'Google', year:'2021' }],
    skills: ['Golang','Distributed Systems','Kubernetes','Postgres','Observability','CI/CD'],
    projects: [{ id:15, name:'StreamPilot', role:'Lead Engineer', description:'High-throughput event processing platform.', link:'streampilot.io', year:'2023' }],
    coverLetter: { company:'CloudForge', role:'Platform Lead', intro:'', body:'', closing:'' }
  },
  chen: {
    firstName: 'Chen', lastName: 'Li', title: 'Assistant Professor',
    dob: '1982-11-21', gender: 'Female', nationality: 'China', maritalStatus: 'Married', languages: 'Mandarin (native), English (fluent)', religion: '',
    linkedin: 'linkedin.com/in/chen-li', github: '',
    email: 'chen.li@uni.edu', phone: '+1 617 555 3344', location: 'Cambridge, MA', website: 'chenli.academia.edu',
    targetJob: 'Tenure-track Assistant Professor',
    summary: 'Researcher specialized in human-computer interaction, published 30+ papers and led multiple funded projects.',
    experiences: [ { id:21, company:'MIT Media Lab', position:'Postdoc Researcher', startDate:'2016', endDate:'2020', description:'Research on adaptive interfaces and community-driven technologies.' } ],
    educations: [{ id:22, school:'Tsinghua University', degree:'Ph.D.', field:'Computer Science', year:'2015' }],
    certifications: [],
    skills: ['HCI Research','Field Studies','Qualitative Analysis','Python','R'],
    projects: [],
    coverLetter: { company:'University', role:'Assistant Professor', intro:'', body:'', closing:'' }
  }
};

// Shared apply logic used by per-profile loaders
function applyDemo(demo, profile) {
  console.log('applyDemo called for', profile);
  if (!demo) demo = DEMOS['ava'];
  // quick validation of expected form fields/containers
  validateFormIds(['firstName','lastName','title','dob','gender','nationality','maritalStatus','languages','religion','linkedin','github','email','phone','location','website','targetJob','summary','clCompany','clRole','clIntro','clBody','clClosing','expList','eduList','certList','projList','refsList']);
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  // basic fields
  set('firstName', demo.firstName); set('lastName', demo.lastName); set('title', demo.title);
  set('dob', demo.dob); set('gender', demo.gender); set('nationality', demo.nationality); set('maritalStatus', demo.maritalStatus); set('languages', demo.languages); set('religion', demo.religion);
  set('linkedin', demo.linkedin); set('github', demo.github);
  set('email', demo.email); set('phone', demo.phone); set('location', demo.location); set('website', demo.website);
  set('targetJob', demo.targetJob); set('summary', demo.summary);

  experiences = demo.experiences ? demo.experiences.slice() : [];
  educations = demo.educations ? demo.educations.slice() : [];
  certifications = demo.certifications ? demo.certifications.slice() : [];
  skills = demo.skills ? demo.skills.slice() : [];
  projects = demo.projects ? demo.projects.slice() : [];
  coverLetter = demo.coverLetter ? Object.assign({}, demo.coverLetter) : { company:'', role:'', intro:'', body:'', closing:'' };

  set('clCompany', coverLetter.company); set('clRole', coverLetter.role);
  set('clIntro', coverLetter.intro); set('clBody', coverLetter.body); set('clClosing', coverLetter.closing);

  // Select a mode/template for each demo to show different layouts
  if (profile === 'ava') {
    setMode('resume');
    setTemplate('modern');
  } else if (profile === 'liam') {
    setMode('cv');
    setTemplate('technical');
  } else if (profile === 'chen') {
    setMode('cover');
    setCoverStyle('classic');
  }

  renderExperienceInputs(); renderEducationInputs(); renderCertificationInputs(); renderSkills(); renderProjectInputs();
  // Dispatch input events to ensure any listeners pick up programmatic value changes
  const dispatchInput = (el) => { if (!el) return; try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) { /* ignore */ } };
  ['firstName','lastName','title','dob','gender','nationality','maritalStatus','languages','religion','linkedin','github','email','phone','location','website','targetJob','summary','clCompany','clRole','clIntro','clBody','clClosing'].forEach(id => dispatchInput(document.getElementById(id)));
  // also dispatch for dynamically rendered repeatable lists
  ['expList','eduList','certList','projList','refsList'].forEach(containerId => {
    const c = document.getElementById(containerId);
    if (!c) return;
    c.querySelectorAll('input,textarea').forEach(dispatchInput);
  });

  showToast(`Loaded demo: ${demo.firstName || profile}`);
  try { if (typeof demoLogAdd === 'function') demoLogAdd(profile, 'processed'); } catch (e) {}
  try {
    if (typeof updatePreview === 'function') updatePreview();
    else console.warn('updatePreview is not a function');
  } catch (err) {
    console.error('Error updating preview after demo load', err);
    try { if (typeof demoLogAdd === 'function') demoLogAdd(profile + ' (preview error)', 'error'); } catch (e) {}
  }
  const m = document.getElementById('demoMenu'); if (m) m.style.display = 'none';
}

// Per-profile loader functions (exported on window for direct calls)
function loadAva() { applyDemo(DEMOS.ava, 'ava'); }
function loadLiam() { applyDemo(DEMOS.liam, 'liam'); }
function loadChen() { applyDemo(DEMOS.chen, 'chen'); }

// Backwards-compatible dispatcher — prefers specific loader function if present
function loadDemoData(profile = 'ava') {
  const name = String(profile || 'ava').toLowerCase();
  const fnName = 'load' + (name.charAt(0).toUpperCase() + name.slice(1));
  if (typeof window[fnName] === 'function') return window[fnName]();
  const demo = DEMOS[name] || DEMOS['ava'];
  return applyDemo(demo, name);
}

// Expose real loader and per-profile functions
window.loadAva = loadAva; window.loadLiam = loadLiam; window.loadChen = loadChen;
window.__realLoadDemo = loadDemoData;
window.loadDemoData = loadDemoData;
// Mark loader ready and enable UI
try { setLoaderReady(true); } catch (e) {}
// Drain any queued demo requests (FIFO)
if (window._queuedDemoProfiles && window._queuedDemoProfiles.length) {
  try {
    while (window._queuedDemoProfiles.length) {
      const p = window._queuedDemoProfiles.shift();
      try {
        window.__realLoadDemo(p);
        try { if (typeof demoLogAdd === 'function') demoLogAdd(p, 'processed'); } catch (e) {}
      } catch (e) {
        console.error('Queued demo load failed for', p, e);
        try { if (typeof demoLogAdd === 'function') demoLogAdd(p, 'error'); } catch (ee) {}
      }
    }
  } catch (e) { console.error('Error draining queued demos', e); }
  window._queuedDemoProfiles = [];
}


/* =====================================================
   ANIMATION ENGINE — NYXON MOTION SYSTEM
   ===================================================== */

// ── Cursor glow that follows mouse in preview area ──
(function initCursorGlow() {
  const glow = document.createElement('div');
  glow.id = 'cursor-glow';
  document.body.appendChild(glow);
  document.addEventListener('mousemove', e => {
    glow.style.left = e.clientX + 'px';
    glow.style.top  = e.clientY + 'px';
  });
})();

// ── Floating preview area particles ──
(function initParticles() {
  const area = document.getElementById('preview-area');
  if (!area) return;
  const colors = ['#8b5cf6','#06b6d4','#f43f5e','#f59e0b'];
  for (let i = 0; i < 10; i++) {
    const p = document.createElement('div');
    p.className = 'preview-particle';
    const size = 3 + Math.random() * 5;
    p.style.cssText = `
      width:${size}px; height:${size}px;
      left:${10 + Math.random() * 80}%;
      bottom:${Math.random() * 40}px;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      animation-duration:${4 + Math.random() * 8}s;
      animation-delay:${Math.random() * 6}s;
      opacity:0.12;
    `;
    area.appendChild(p);
  }
})();

// ── Animated preview update: add class then remove ──
const _origUpdatePreview = updatePreview;
window.updatePreview = function() {
  _origUpdatePreview();
  const doc = document.getElementById('resumePreview');
  doc.classList.remove('doc-animate');
  void doc.offsetWidth; // force reflow
  doc.classList.add('doc-animate');
};

// ── Mode switch: flash the doc border ──
const _origSetMode = setMode;
window.setMode = function(mode) {
  _origSetMode(mode);
  const doc = document.getElementById('resumePreview');
  doc.classList.remove('mode-switched');
  void doc.offsetWidth;
  doc.classList.add('mode-switched');
  setTimeout(() => doc.classList.remove('mode-switched'), 600);
};

// ── Template card select: ripple effect ──
const _origSetTemplate = setTemplate;
window.setTemplate = function(id) {
  _origSetTemplate(id);
  const card = document.getElementById(`tpl-${id}`);
  if (!card) return;
  const ripple = document.createElement('div');
  ripple.style.cssText = `
    position:absolute; border-radius:50%;
    background:rgba(139,92,246,0.35);
    width:10px; height:10px;
    top:50%; left:50%;
    transform:translate(-50%,-50%) scale(0);
    animation: rippleExpand 0.45s ease forwards;
    pointer-events:none; z-index:10;
  `;
  if (!document.getElementById('ripple-style')) {
    const st = document.createElement('style');
    st.id = 'ripple-style';
    st.textContent = `@keyframes rippleExpand {
      to { transform:translate(-50%,-50%) scale(12); opacity:0; }
    }`;
    document.head.appendChild(st);
  }
  card.style.position = 'relative';
  card.appendChild(ripple);
  setTimeout(() => ripple.remove(), 500);
};

// ── Input focus: subtle label color via CSS is handled,
//    but we also add a glow ring on the section ──
document.querySelectorAll('.form-input, .form-textarea, .skill-add-input').forEach(el => {
  el.addEventListener('focus', () => {
    const section = el.closest('.sidebar-section');
    if (section) {
      section.style.borderColor = 'rgba(139,92,246,0.3)';
      section.style.boxShadow = '0 0 0 2px rgba(139,92,246,0.08)';
      section.style.transition = 'border-color 0.2s ease, box-shadow 0.2s ease';
    }
  });
  el.addEventListener('blur', () => {
    const section = el.closest('.sidebar-section');
    if (section) {
      section.style.borderColor = '';
      section.style.boxShadow = '';
    }
  });
});

// ── Skill add: stagger existing tags on first load ──
function reanimateSkillTags() {
  document.querySelectorAll('.skill-tag').forEach((tag, i) => {
    tag.style.animationDelay = `${i * 40}ms`;
  });
}

// ── Scroll-triggered preview shimmer (when user scrolls preview) ──
(function initPreviewScroll() {
  const area = document.getElementById('preview-area');
  if (!area) return;
  let ticking = false;
  area.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const scaler = document.getElementById('preview-scaler');
        const scrolled = area.scrollTop;
        // subtle parallax on doc shadow
        const doc = document.getElementById('resumePreview');
        if (doc) {
          const depth = Math.min(scrolled * 0.04, 8);
          doc.style.boxShadow = `0 ${32+depth}px ${64+depth*2}px rgba(0,0,0,${0.5+depth*0.01}), 0 0 0 1px rgba(0,0,0,0.3)`;
        }
        ticking = false;
      });
      ticking = true;
    }
  });
})();

// ── Export button: particle burst on click ──
document.querySelector('.hdr-btn-export')?.addEventListener('click', function(e) {
  const btn = e.currentTarget;
  const rect = btn.getBoundingClientRect();
  for (let i = 0; i < 8; i++) {
    const burst = document.createElement('div');
    const angle = (i / 8) * Math.PI * 2;
    const dist  = 40 + Math.random() * 30;
    burst.style.cssText = `
      position:fixed;
      left:${rect.left + rect.width/2}px;
      top:${rect.top + rect.height/2}px;
      width:5px; height:5px;
      border-radius:50%;
      background:${['#8b5cf6','#06b6d4','#f43f5e'][i%3]};
      pointer-events:none;
      z-index:9999;
      animation: burst_${i} 0.55s ease forwards;
    `;
    const keyframe = `@keyframes burst_${i} {
      0%   { transform: translate(0,0) scale(1); opacity:1; }
      100% { transform: translate(${Math.cos(angle)*dist}px,${Math.sin(angle)*dist}px) scale(0); opacity:0; }
    }`;
    const st = document.createElement('style');
    st.textContent = keyframe;
    document.head.appendChild(st);
    document.body.appendChild(burst);
    setTimeout(() => { burst.remove(); st.remove(); }, 600);
  }
});

// ── Section toggle: animate chevron ──
const _origToggleSection = toggleSection;
window.toggleSection = function(secId) {
  _origToggleSection(secId);
  const chevron = document.querySelector(`#${secId} .section-chevron`);
  const body    = document.querySelector(`#${secId} .section-body`);
  if (chevron && body) {
    chevron.style.transform = body.classList.contains('collapsed') ? 'rotate(-90deg)' : '';
  }
};

// ── Preview area background: subtle hue shift on mode change ──
const modeColors = {
  resume:    '#efefff',
  cv:        '#efefff',
  cover:     '#efefff',
  portfolio: '#efefff',
};
const _origSetMode2 = window.setMode;
window.setMode = function(mode) {
  _origSetMode2(mode);
  const area = document.getElementById('preview-area');
  if (area) area.style.background = modeColors[mode] || '#1c1c2e';
};

// ── Staggered initial appearance of template cards ──
(function staggerTplCards() {
  // wait for DOM population
  setTimeout(() => {
    document.querySelectorAll('.tpl-card').forEach((card, i) => {
      card.style.opacity = '0';
      card.style.transform = 'scale(0.8) translateY(6px)';
      card.style.transition = 'none';
      setTimeout(() => {
        card.style.transition = 'all 0.3s cubic-bezier(0.34,1.56,0.64,1)';
        card.style.opacity = '1';
        card.style.transform = '';
      }, 80 + i * 35);
    });
  }, 150);
})();

// ── Typing shimmer: pulse preview border while user types ──
let typingTimer;
const allInputs = document.querySelectorAll('.form-input, .form-textarea, .skill-add-input');
allInputs.forEach(el => {
  el.addEventListener('input', () => {
    const doc = document.getElementById('resumePreview');
    if (!doc) return;
    doc.style.outline = '2px solid rgba(139,92,246,0.3)';
    doc.style.outlineOffset = '3px';
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      doc.style.outline = '';
      doc.style.outlineOffset = '';
    }, 600);
  });
});
  // ── Cover letter body
  if (currentMode === 'cover') {
    const cl = data.coverLetter;
    if (cl.company || cl.role) children.push(new Paragraph({
      children: [new TextRun({ text: `Re: ${cl.role || ''}${cl.role && cl.company ? ' at ' : ''}${cl.company || ''}`, bold: true, size: 22, color: ACCENT })],
      spacing: { before: 120, after: 200 },
    }));
    children.push(bodyText('Dear Hiring Manager,', { spaceAfter: 160 }));
    if (cl.intro)   children.push(bodyText(cl.intro,   { spaceAfter: 160 }));
    if (cl.body)    children.push(bodyText(cl.body,    { spaceAfter: 160 }));
    if (cl.closing) children.push(bodyText(cl.closing, { spaceAfter: 320 }));
    children.push(bodyText('Sincerely,', { spaceAfter: 400 }));
    children.push(new Paragraph({
      children: [new TextRun({ text: name, bold: true, size: 26, color: DARK })],
    }));
  }

  // ── Portfolio projects
  if (currentMode === 'portfolio' && data.projects.length) {
    children.push(sectionHeading('Projects'));
    data.projects.forEach(p => {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: p.name || 'Project', bold: true, size: 24, color: DARK }),
          ...(p.role ? [new TextRun({ text: `  ·  ${p.role}`, size: 21, color: ACCENT })] : []),
          ...(p.year ? [new TextRun({ text: `  (${p.year})`, size: 18, color: MUTED })] : []),
        ],
        spacing: { before: 120, after: 60 },
      }));
      if (p.link) children.push(new Paragraph({
        children: [new TextRun({ text: p.link, size: 18, color: ACCENT, italics: true })],
        spacing: { after: 60 },
      }));
      if (p.description) children.push(bodyText(p.description, { indent: true, spaceAfter: 60 }));
      if (p.problem) children.push(new Paragraph({
        children: [new TextRun({ text: 'Problem: ', bold: true, size: 20, color: MUTED }), new TextRun({ text: p.problem, size: 20, color: MUTED, italics: true })],
        spacing: { after: 60 }, indent: { left: convertInchesToTwip(0.15) },
      }));
      if (p.outcome) children.push(new Paragraph({
        children: [new TextRun({ text: 'Outcome: ', bold: true, size: 20, color: '16a34a' }), new TextRun({ text: p.outcome, size: 20, color: '16a34a', bold: true })],
        spacing: { after: 140 }, indent: { left: convertInchesToTwip(0.15) },
      }));
    });
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22, color: '1a1a2a' },
          paragraph: { spacing: { line: 276 } },
        },
      },
    },
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } }, children }],
  });

  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = fname;
  a.click();
  URL.revokeObjectURL(url);
}


// ── RESET ──────────────────────────────────────────────
function resetAll() {
  ['firstName','lastName','title','targetJob','email','phone','location','website','summary','clCompany','clRole','clIntro','clBody','clClosing'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  experiences = []; educations = []; certifications = []; skills = []; projects = [];
  coverLetter = { company:'', role:'', intro:'', body:'', closing:'' };
  addExperience(); addEducation(); addCertification();
  renderSkills();
  updatePreview();
}

/* DEMO DATA is defined earlier as a multi-profile loader (loadDemoData(profile)).
   Removed duplicate single-profile function to ensure correct demo selection. */

/* =====================================================
   ANIMATION ENGINE — NYXON MOTION SYSTEM
   ===================================================== */

// ── Cursor glow that follows mouse in preview area ──
(function initCursorGlow() {
  const glow = document.createElement('div');
  glow.id = 'cursor-glow';
  document.body.appendChild(glow);
  document.addEventListener('mousemove', e => {
    glow.style.left = e.clientX + 'px';
    glow.style.top  = e.clientY + 'px';
  });
})();

// ── Floating preview area particles ──
(function initParticles() {
  const area = document.getElementById('preview-area');
  if (!area) return;
  const colors = ['#8b5cf6','#06b6d4','#f43f5e','#f59e0b'];
  for (let i = 0; i < 10; i++) {
    const p = document.createElement('div');
    p.className = 'preview-particle';
    const size = 3 + Math.random() * 5;
    p.style.cssText = `
      width:${size}px; height:${size}px;
      left:${10 + Math.random() * 80}%;
      bottom:${Math.random() * 40}px;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      animation-duration:${4 + Math.random() * 8}s;
      animation-delay:${Math.random() * 6}s;
      opacity:0.12;
    `;
    area.appendChild(p);
  }
})();

// ── Animated preview update: add class then remove ──
const _origUpdatePreview = updatePreview;
window.updatePreview = function() {
  _origUpdatePreview();
  const doc = document.getElementById('resumePreview');
  doc.classList.remove('doc-animate');
  void doc.offsetWidth; // force reflow
  doc.classList.add('doc-animate');
};

// ── Mode switch: flash the doc border ──
const _origSetMode = setMode;
window.setMode = function(mode) {
  _origSetMode(mode);
  const doc = document.getElementById('resumePreview');
  doc.classList.remove('mode-switched');
  void doc.offsetWidth;
  doc.classList.add('mode-switched');
  setTimeout(() => doc.classList.remove('mode-switched'), 600);
};

// ── Template card select: ripple effect ──
const _origSetTemplate = setTemplate;
window.setTemplate = function(id) {
  _origSetTemplate(id);
  const card = document.getElementById(`tpl-${id}`);
  if (!card) return;
  const ripple = document.createElement('div');
  ripple.style.cssText = `
    position:absolute; border-radius:50%;
    background:rgba(139,92,246,0.35);
    width:10px; height:10px;
    top:50%; left:50%;
    transform:translate(-50%,-50%) scale(0);
    animation: rippleExpand 0.45s ease forwards;
    pointer-events:none; z-index:10;
  `;
  if (!document.getElementById('ripple-style')) {
    const st = document.createElement('style');
    st.id = 'ripple-style';
    st.textContent = `@keyframes rippleExpand {
      to { transform:translate(-50%,-50%) scale(12); opacity:0; }
    }`;
    document.head.appendChild(st);
  }
  card.style.position = 'relative';
  card.appendChild(ripple);
  setTimeout(() => ripple.remove(), 500);
};

// ── Input focus: subtle label color via CSS is handled,
//    but we also add a glow ring on the section ──
document.querySelectorAll('.form-input, .form-textarea, .skill-add-input').forEach(el => {
  el.addEventListener('focus', () => {
    const section = el.closest('.sidebar-section');
    if (section) {
      section.style.borderColor = 'rgba(139,92,246,0.3)';
      section.style.boxShadow = '0 0 0 2px rgba(139,92,246,0.08)';
      section.style.transition = 'border-color 0.2s ease, box-shadow 0.2s ease';
    }
  });
  el.addEventListener('blur', () => {
    const section = el.closest('.sidebar-section');
    if (section) {
      section.style.borderColor = '';
      section.style.boxShadow = '';
    }
  });
});

// ── Skill add: stagger existing tags on first load ──
function reanimateSkillTags() {
  document.querySelectorAll('.skill-tag').forEach((tag, i) => {
    tag.style.animationDelay = `${i * 40}ms`;
  });
}

// ── Scroll-triggered preview shimmer (when user scrolls preview) ──
(function initPreviewScroll() {
  const area = document.getElementById('preview-area');
  if (!area) return;
  let ticking = false;
  area.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const scaler = document.getElementById('preview-scaler');
        const scrolled = area.scrollTop;
        // subtle parallax on doc shadow
        const doc = document.getElementById('resumePreview');
        if (doc) {
          const depth = Math.min(scrolled * 0.04, 8);
          doc.style.boxShadow = `0 ${32+depth}px ${64+depth*2}px rgba(0,0,0,${0.5+depth*0.01}), 0 0 0 1px rgba(0,0,0,0.3)`;
        }
        ticking = false;
      });
      ticking = true;
    }
  });
})();

// ── Export button: particle burst on click ──
document.querySelector('.hdr-btn-export')?.addEventListener('click', function(e) {
  const btn = e.currentTarget;
  const rect = btn.getBoundingClientRect();
  for (let i = 0; i < 8; i++) {
    const burst = document.createElement('div');
    const angle = (i / 8) * Math.PI * 2;
    const dist  = 40 + Math.random() * 30;
    burst.style.cssText = `
      position:fixed;
      left:${rect.left + rect.width/2}px;
      top:${rect.top + rect.height/2}px;
      width:5px; height:5px;
      border-radius:50%;
      background:${['#8b5cf6','#06b6d4','#f43f5e'][i%3]};
      pointer-events:none;
      z-index:9999;
      animation: burst_${i} 0.55s ease forwards;
    `;
    const keyframe = `@keyframes burst_${i} {
      0%   { transform: translate(0,0) scale(1); opacity:1; }
      100% { transform: translate(${Math.cos(angle)*dist}px,${Math.sin(angle)*dist}px) scale(0); opacity:0; }
    }`;
    const st = document.createElement('style');
    st.textContent = keyframe;
    document.head.appendChild(st);
    document.body.appendChild(burst);
    setTimeout(() => { burst.remove(); st.remove(); }, 600);
  }
});

// ── Section toggle: animate chevron ──
const _origToggleSection = toggleSection;
window.toggleSection = function(secId) {
  _origToggleSection(secId);
  const chevron = document.querySelector(`#${secId} .section-chevron`);
  const body    = document.querySelector(`#${secId} .section-body`);
  if (chevron && body) {
    chevron.style.transform = body.classList.contains('collapsed') ? 'rotate(-90deg)' : '';
  }
};

// ── Preview area background: subtle hue shift on mode change ──
const modeColors = {
  resume:    '#1c1c2e',
  cv:        '#1a1e2e',
  cover:     '#1e1c1a',
  portfolio: '#1a1c1e',
};
const _origSetMode2 = window.setMode;
window.setMode = function(mode) {
  _origSetMode2(mode);
  const area = document.getElementById('preview-area');
  if (area) area.style.background = modeColors[mode] || '#1c1c2e';
};

// ── Staggered initial appearance of template cards ──
(function staggerTplCards() {
  // wait for DOM population
  setTimeout(() => {
    document.querySelectorAll('.tpl-card').forEach((card, i) => {
      card.style.opacity = '0';
      card.style.transform = 'scale(0.8) translateY(6px)';
      card.style.transition = 'none';
      setTimeout(() => {
        card.style.transition = 'all 0.3s cubic-bezier(0.34,1.56,0.64,1)';
        card.style.opacity = '1';
        card.style.transform = '';
      }, 80 + i * 35);
    });
  }, 150);
})();

// ── Typing shimmer: pulse preview border while user types ──
let typingTimer;
const allInputs = document.querySelectorAll('.form-input, .form-textarea, .skill-add-input');
allInputs.forEach(el => {
  el.addEventListener('input', () => {
    const doc = document.getElementById('resumePreview');
    if (!doc) return;
    doc.style.outline = '2px solid rgba(139,92,246,0.3)';
    doc.style.outlineOffset = '3px';
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      doc.style.outline = '';
      doc.style.outlineOffset = '';
    }, 600);
  });
});