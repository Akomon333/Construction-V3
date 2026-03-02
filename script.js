const firebaseConfig = {
  apiKey: "AIzaSyBWbVRiYKugqy8axQ_MOW0P8fM8z4iE7XY",
  authDomain: "ehitusturg-64173.firebaseapp.com",
  databaseURL: "https://ehitusturg-64173-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "ehitusturg-64173",
  storageBucket: "ehitusturg-64173.firebasestorage.app",
  messagingSenderId: "466211818119",
  appId: "1:466211818119:web:fa65719a98bcc5dacbc622"
};

const CLOUDINARY_CLOUD_NAME = "dagx8psvi";
const CLOUDINARY_UPLOAD_PRESET = "ehitusturg_logo"; 
const USE_CLOUDINARY = CLOUDINARY_CLOUD_NAME && CLOUDINARY_UPLOAD_PRESET; 

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

let currentUser = null;
let currentLanguage = localStorage.getItem('selectedLanguage') || 'et';
let selectedLogoFile = null;
let currentExistingLogoUrl = null;
let editingFirmId = null;

// Scale-Optimization State
let lastLoadedKey = null;
let isLoading = false;
let hasMore = true;
let currentCategory = 'all';
let currentSearch = '';
let searchTimer = null;
const PAGE_SIZE = 15;

const i18n = {
    et: { 
        profile: "Minu profiil", postFirm: "+ Postita", addNew: "+ Lisa uus firma", logout: "Logi välja", 
        edit: "Muuda", delete: "Kustuta", confirm: "Kas oled kindel?", years: "a. kogemust", 
        loading: "Laeb...", empty: "Tulemusi ei leitud", web: "WEB", call: "Helista:" 
    },
    ru: { 
        profile: "Мой профиль", postFirm: "+ Разместить", addNew: "+ Добавить фирму", logout: "Выйти", 
        edit: "Изм.", delete: "Удалить", confirm: "Вы уверены?", years: "л. опыта", 
        loading: "Загрузка...", empty: "Ничего не найдено", web: "САЙТ", call: "Звоните:" 
    }
};

// ============ 3. HIGH-TRAFFIC DATA FETCHING ============

async function fetchFirms(reset = false) {
    if (isLoading || (!hasMore && !reset)) return;
    
    isLoading = true;
    const grid = document.getElementById('main-grid');
    const loader = document.getElementById('loader-sentinel');

    if (reset) {
        grid.innerHTML = '';
        lastLoadedKey = null;
        hasMore = true;
    }

    if (loader) loader.textContent = i18n[currentLanguage].loading;

    try {
        let query = db.ref('allFirms');

        // Priority Logic: Search > Category > Default
        if (currentSearch) {
            query = query.orderByChild('name').startAt(currentSearch).endAt(currentSearch + '\uf8ff');
        } else if (currentCategory !== 'all') {
            query = query.orderByChild('category').equalTo(currentCategory);
        } else {
            query = query.orderByKey();
        }

        // Apply Pagination Key
        if (lastLoadedKey) query = query.endAt(lastLoadedKey);

        // Fetch PAGE_SIZE + 1 to check for next page availability
        const snapshot = await query.limitToLast(PAGE_SIZE + 1).once('value');
        const data = snapshot.val() || {};
        
        // Convert to array and Sort Newest First (Descending)
        let items = Object.entries(data).map(([key, val]) => ({ key, ...val }));
        items.sort((a, b) => b.key.localeCompare(a.key));

        // Remove the duplicate "pivot" key
        if (lastLoadedKey && items.length > 0 && items[0].key === lastLoadedKey) {
            items.shift();
        }

        if (items.length <= PAGE_SIZE) hasMore = false;
        
        if (items.length > 0) {
            lastLoadedKey = items[items.length - 1].key;
            renderItems(items);
        } else if (reset) {
            grid.innerHTML = `<p style="grid-column:1/-1; text-align:center; padding:40px; opacity:0.6;">${i18n[currentLanguage].empty}</p>`;
        }
    } catch (err) {
        console.error("Fetch Error:", err);
    } finally {
        isLoading = false;
        if (loader && !hasMore) loader.textContent = "";
    }
}

function renderItems(items) {
    const grid = document.getElementById('main-grid');
    const fragment = document.createDocumentFragment(); // Memory optimization

    items.forEach(firm => {
        const row = document.createElement('div');
        row.className = 'firm-row';
        
        // Cloudinary Bandwidth Saver: Force 200px width, Auto Format, Auto Quality
        const thumbUrl = firm.logo 
            ? firm.logo.replace('/upload/', '/upload/w_200,c_scale,f_auto,q_auto/') 
            : 'https://via.placeholder.com/150x100?text=No+Logo';

        row.innerHTML = `
            <div class="firm-image"><img src="${thumbUrl}" loading="lazy" alt="logo"></div>
            <div class="firm-main">
                <h2 class="name">${escapeHtml(firm.name)}</h2>
                <div class="meta-data">
                    <span>${escapeHtml(firm.city)}</span> • <span>${firm.experience} ${i18n[currentLanguage].years}</span>
                </div>
            </div>
            <div class="firm-actions">
                <a href="tel:${firm.phone.replace(/\s/g, '')}" class="tel-link" style="white-space:nowrap;">
                    ${escapeHtml(firm.phone)}
                </a>
                ${firm.website ? `<a href="${escapeHtml(firm.website)}" target="_blank" class="visit-btn">${i18n[currentLanguage].web}</a>` : ''}
            </div>
        `;
        fragment.appendChild(row);
    });
    grid.appendChild(fragment);
}

// ============ 4. USER AUTH & FIRM MANAGEMENT ============

auth.onAuthStateChanged(user => {
    currentUser = user;
    updateAuthUI();
    if (user) loadUserFirms();
});

function updateAuthUI() {
    const btn = document.querySelector('.add-firm-btn');
    if (btn) btn.textContent = currentUser ? i18n[currentLanguage].profile : i18n[currentLanguage].postFirm;
}

async function submitFirm() {
    if (!currentUser) return;
    const name = document.getElementById('firmName').value.trim();
    let phone = document.getElementById('firmPhone').value.trim();
    
    if (!name || !phone) return alert("Palun täida väljad!");
    if (!phone.startsWith('+')) phone = "+372 " + phone;

    try {
        let logoUrl = currentExistingLogoUrl;
        if (selectedLogoFile) {
            const formData = new FormData();
            formData.append('file', selectedLogoFile);
            formData.append('upload_preset', CLOUDINARY_PRESET);
            const resp = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
            const cloudData = await resp.json();
            logoUrl = cloudData.secure_url;
        }

        const firmId = editingFirmId || db.ref().child('allFirms').push().key;
        const firmData = {
            id: firmId, uid: currentUser.uid, name,
            category: document.getElementById('firmCategory').value,
            city: document.getElementById('firmCity').value.trim(),
            phone, website: document.getElementById('firmWebsite').value.trim(),
            experience: document.getElementById('firmExperience').value,
            logo: logoUrl, timestamp: firebase.database.ServerValue.TIMESTAMP
        };

        const updates = {};
        updates[`/firms/${currentUser.uid}/${firmId}`] = firmData;
        updates[`/allFirms/${firmId}`] = firmData;

        await db.ref().update(updates);
        showSuccessStep();
        fetchFirms(true);
    } catch (e) { alert(e.message); }
}

function loadUserFirms() {
    db.ref(`firms/${currentUser.uid}`).on('value', snap => {
        const container = document.getElementById('userFirmsList');
        if (!container) return;
        const data = snap.val() || {};
        const lang = i18n[currentLanguage];
        
        // Profile view styled with website palette (#2c3e50)
        container.innerHTML = `
            <button onclick="resetForm(); showFirmStep()" class="submit-btn" style="background:#2c3e50; color:white; margin-bottom:12px; width:100%; font-weight:600;">
                ${lang.addNew}
            </button>
            <button onclick="logout()" style="background:transparent; color:#7f8c8d; margin-bottom:20px; width:100%; border:1px solid #bdc3c7; border-radius:8px; padding:8px;">
                ${lang.logout}
            </button>
        `;

        Object.keys(data).forEach(id => {
            const d = document.createElement('div');
            d.style = "display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee; background:white; margin-bottom:5px; border-radius:4px;";
            d.innerHTML = `
                <span style="font-weight:500; color:#2c3e50;">${escapeHtml(data[id].name)}</span>
                <div>
                    <button onclick="openEdit('${id}')" style="background:none; border:none; color:#2980b9; font-weight:600; cursor:pointer;">${lang.edit}</button>
                    <button onclick="deleteFirm('${id}')" style="background:none; border:none; color:#c0392b; margin-left:12px; font-weight:600; cursor:pointer;">${lang.delete}</button>
                </div>`;
            container.appendChild(d);
        });
    });
}

// ============ 5. UI HELPERS ============

function handleSearch(val) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        currentSearch = val.trim();
        fetchFirms(true);
    }, 500);
}

function filterCat(cat, btn) {
    if (currentCategory === cat && !currentSearch) return;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCategory = cat;
    currentSearch = '';
    const sInput = document.getElementById('searchInput');
    if (sInput) sInput.value = '';
    fetchFirms(true);
}

function backToAuth() { /* Intentionally empty as requested */ }

function setLang(lang) {
    currentLanguage = lang;
    localStorage.setItem('selectedLanguage', lang);
    document.querySelectorAll('[data-et]').forEach(el => {
        el.textContent = el.getAttribute(`data-${lang}`);
    });
    updateAuthUI();
}

function escapeHtml(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}

// Modal Toggle Logic
function openPostFirmModal() {
    document.getElementById('postFirmModal').classList.add('active');
    document.getElementById('modalOverlay').classList.add('active');
    currentUser ? showUserFirmsStep() : showAuthStep();
}

function closePostFirmModal() {
    document.getElementById('postFirmModal').classList.remove('active');
    document.getElementById('modalOverlay').classList.remove('active');
    resetForm();
}

function hideAllSteps() {
    ['authStep', 'firmStep', 'userFirmsStep', 'successStep'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
}

function showAuthStep() { hideAllSteps(); document.getElementById('authStep').classList.remove('hidden'); }
function showFirmStep() { hideAllSteps(); document.getElementById('firmStep').classList.remove('hidden'); }
function showUserFirmsStep() { hideAllSteps(); document.getElementById('userFirmsStep').classList.remove('hidden'); }
function showSuccessStep() { hideAllSteps(); document.getElementById('successStep').classList.remove('hidden'); }

// ============ 6. EVENT LISTENERS ============

window.addEventListener('load', () => {
    setLang(currentLanguage);
    fetchFirms(true);

    // Infinite Scroll Sentinel
    const observer = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && !isLoading && hasMore) fetchFirms();
    }, { rootMargin: '400px' });
    
    const sentinel = document.getElementById('loader-sentinel');
    if (sentinel) observer.observe(sentinel);

    // Logo Preview Logic
    document.getElementById('logoFile').addEventListener('change', e => {
        if (e.target.files[0]) {
            selectedLogoFile = e.target.files[0];
            const reader = new FileReader();
            reader.onload = ev => {
                document.getElementById('logoPreviewImg').src = ev.target.result;
                document.getElementById('logoPreview').classList.remove('hidden');
            };
            reader.readAsDataURL(selectedLogoFile);
        }
    });
});

// Auth Helpers
function loginUser() {
    const email = document.getElementById('userEmail').value.trim();
    const pass = document.getElementById('userPassword').value;
    auth.signInWithEmailAndPassword(email, pass).catch(e => alert(i18n[currentLanguage].errorLogin));
}
function registerUser() {
    const email = document.getElementById('userEmail').value.trim();
    const pass = document.getElementById('userPassword').value;
    if (pass.length < 6) return alert("Min 6 märki");
    auth.createUserWithEmailAndPassword(email, pass).catch(e => alert(e.message));
}
function logout() { auth.signOut().then(() => location.reload()); }
function resetForm() {
    editingFirmId = null; selectedLogoFile = null; currentExistingLogoUrl = null;
    document.getElementById('firmForm').reset();
    document.getElementById('logoPreview').classList.add('hidden');
}