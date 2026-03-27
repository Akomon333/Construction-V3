const CLOUDINARY_CLOUD_NAME = "ddplimxar";
const CLOUDINARY_PRESET = "ehitusturg_logos"; 
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
const USE_CLOUDINARY = CLOUDINARY_CLOUD_NAME && CLOUDINARY_PRESET;

const firebaseConfig = {
  apiKey: "AIzaSyBH-gxdcZNj25rgCds4l-TtNuBDhTBy9Yo",
  authDomain: "ehiko-86b2e.firebaseapp.com",
  databaseURL: "https://ehiko-86b2e-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "ehiko-86b2e",
  storageBucket: "ehiko-86b2e.firebasestorage.app",
  messagingSenderId: "402563759174",
  appId: "1:402563759174:web:1cbbcf40f93156dd731e47"
};

firebase.initializeApp(firebaseConfig);

const appCheck = firebase.appCheck();
appCheck.activate(
  '6LfOkZosAAAAAPoVrl4cB7W-mV7gZ8h6f6bi2WA2', 
);

const db = firebase.database();
const auth = firebase.auth();

const PAGE_SIZE = 10;

let currentUser = null;
let currentLanguage = localStorage.getItem('selectedLanguage') || 'et';
let selectedLogoFile = null;
let currentExistingLogoUrl = null;
let editingFirmId = null;
let lastLoadedKey = null;
let isLoading = false;
let hasMore = true;

let currentCategory = 'all';
let currentCity = 'all';
let currentSearch = '';
let searchTimer = null;
let userFirmsRef = null;
let userFirmsListener = null;

const i18n = {
    et: {
        profile: "Minu profiil", postFirm: "+ Postita", addNew: "+ Lisa uus firma", logout: "Logi välja",
        edit: "Muuda", delete: "Kustuta", confirm: "Kas oled kindel?", years: "a. kogemust",
        loading: "Laeb...", empty: "Tulemusi ei leitud", web: "WEB", call: "Helista:", 
        errorLogin: "Vale e-mail või parool",
        fillFields: "Palun täida kõik kohustuslikud väljad!",
        enterEmail: "Palun sisesta e-mail",
        minChars: "Parool peab olema vähemalt 6 märki pikk",
        configError: "Süsteemi viga: piltide üleslaadimine pole seadistatud.",
        success: "Salvestatud!",
        duplicateName: "Firma selle nimega on juba olemas!",
        cookieText: "See veebileht kasutab küpsiseid liikluse analüüsimiseks.",
        accept: "Nõustun",
        decline: "Keeldu",
        upgrade: "Telli Premium",
        premiumActive: "Premium Aktiivne",
        premiumBadge: "SOOVITATUD",
        forgotPass: "Unustasid parooli?",
        resetSent: "Parooli lähtestamise link saadeti e-mailile!",
        loginToRate: "Hindamiseks pead sisse logima!",
        ratingSaved: "Hinnang antud!",
        verifyEmailSent: "Kinnituslink saadetud e-mailile!",
        pleaseVerify: "Palun kinnita oma e-posti aadress!"
    },
    ru: {
        profile: "Мой профиль", postFirm: "+ Разместить", addNew: "+ Добавить фирму", logout: "Выйти",
        edit: "Изм.", delete: "Удалить", confirm: "Вы уверены?", years: "л. опыта",
        loading: "Загрузка...", empty: "Ничего не найдено", web: "САЙТ", call: "Звоните:", 
        errorLogin: "Неверный email или пароль",
        fillFields: "Пожалуйста, заполните все обязательные поля!",
        enterEmail: "Пожалуйста, введите e-mail",
        minChars: "Пароль должен быть не менее 6 символов",
        configError: "Системная ошибка: загрузка изображений не настроена.",
        success: "Сохранено!",
        duplicateName: "Фирма с таким названием уже существует!",
        cookieText: "Этот сайт использует файлы cookie для анализа трафика.",
        accept: "Принять",
        decline: "Отклонить",
        upgrade: "Заказать Premium",
        premiumActive: "Premium Активен",
        premiumBadge: "РЕКОМЕНДУЕМ",
        forgotPass: "Забыли пароль?",
        resetSent: "Ссылка для сброса пароля отправлена на email!",
        loginToRate: "Войдите, чтобы оценить!",
        ratingSaved: "Оценка сохранена!",
        verifyEmailSent: "Ссылка для подтверждения отправлена!",
        pleaseVerify: "Пожалуйста, подтвердите email!"
    }
};

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

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

        if (currentSearch) {
            const searchVal = currentSearch.charAt(0).toUpperCase() + currentSearch.slice(1).toLowerCase();
            query = query.orderByChild('name').startAt(searchVal).endAt(searchVal + '\uf8ff');
            
        } else if (currentCategory !== 'all' && currentCity !== 'all') {
            query = query.orderByChild('category_city').equalTo(`${currentCategory}_${currentCity}`);
            
        } else if (currentCategory !== 'all') {
            query = query.orderByChild('category').equalTo(currentCategory);
            
        } else if (currentCity !== 'all') {
            query = query.orderByChild('city').equalTo(currentCity);
            
        } else {
            query = query.orderByKey();
            if (lastLoadedKey) query = query.endAt(lastLoadedKey);
        }

        const limitCount = PAGE_SIZE + 1;
        const snapshot = await query.limitToLast(limitCount).once('value');
        const data = snapshot.val() || {};

        let items = Object.entries(data).map(([key, val]) => ({ key, ...val }));
        
        items.sort((a, b) => b.key.localeCompare(a.key));

        if (lastLoadedKey && items.length > 0 && items[0].key === lastLoadedKey) {
            items.shift();
        }

        if (items.length > PAGE_SIZE) {
            hasMore = true;
            items = items.slice(0, PAGE_SIZE);
        } else {
            hasMore = false;
        }

        if (items.length > 0) {
            lastLoadedKey = items[items.length - 1].key;
            renderItems(items);
        } else if (reset) {
            grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;padding:40px;opacity:0.6;">${i18n[currentLanguage].empty}</p>`;
        }

    } catch (err) {
        console.error("Fetch Error:", err);
    } finally {
        isLoading = false;
        if (loader) loader.textContent = '';
    }
}

function renderItems(items) {
    const grid = document.getElementById('main-grid');
    const fragment = document.createDocumentFragment();

    items.sort((a, b) => (b.isPremium === true ? 1 : 0) - (a.isPremium === true ? 1 : 0));

    items.forEach(firm => {
        const row = document.createElement('div');
        row.className = `firm-row ${firm.isPremium ? 'premium' : ''}`;
        const thumbUrl = firm.logo
            ? firm.logo.replace('/upload/', '/upload/w_200,c_scale,f_auto,q_auto/')
            : 'https://via.placeholder.com/150x100?text=No+Logo';
        const badgeHtml = firm.isPremium 
            ? `<div class="premium-badge">🌟 ${i18n[currentLanguage].premiumBadge}</div>` 
            : '';

        let starsHtml = `<div class="rating-container">`;
        const avgRating = Math.round(firm.ratingAvg || 0); 
        
        for (let i = 1; i <= 5; i++) {
            starsHtml += `<span class="star ${i <= avgRating ? 'filled' : ''}" onclick="rateFirm('${firm.key}', '${firm.uid}', ${i})">★</span>`;
        }
        
        const exactAvg = Number(firm.ratingAvg || 0).toFixed(1);
        const ratingCount = firm.ratingCount || 0;
        starsHtml += `<span class="rating-score">${exactAvg} (${ratingCount})</span></div>`;

        row.innerHTML = `
            ${badgeHtml}
            <div class="firm-image"><img src="${thumbUrl}" loading="lazy" alt="logo"></div>
            <div class="firm-main">
                <h2 class="name">${escapeHtml(firm.name || '')}</h2>
                <div class="meta-data">
                    <span style="text-transform: capitalize;">${escapeHtml(firm.city || '')}</span> • <span>${firm.experience || 0} ${i18n[currentLanguage].years}</span>
                </div>${starsHtml}
            </div>
            <div class="firm-actions">
                <a href="tel:${(firm.phone || '').replace(/\s/g, '')}" class="tel-link">${escapeHtml(firm.phone || '')}</a>
                ${firm.website ? `<a href="${escapeHtml(firm.website)}" target="_blank" class="visit-btn">${i18n[currentLanguage].web}</a>` : ''}
            </div>`;
        fragment.appendChild(row);
    });
    grid.appendChild(fragment);
}

async function submitFirm() {
    if (!currentUser) return;
    
    const name = document.getElementById('firmName').value.trim();
    const catValue = document.getElementById('firmCategory').value;
    const cityValue = document.getElementById('firmCity').value;
    let rawPhone = document.getElementById('firmPhone').value.trim();
    
    if (!name || !rawPhone || !catValue || !cityValue) {
        return showToast(i18n[currentLanguage].fillFields, 'error');
    }

    let wasPremium = false;
    let isDuplicate = false;
    const existingSnap = await db.ref('allFirms').orderByChild('name').equalTo(name).once('value');
    
    if (existingSnap.exists()) {
        existingSnap.forEach(child => {
            if (child.key === editingFirmId) {
                wasPremium = child.val().isPremium === true;
            } else {
                isDuplicate = true;
            }
        });
    }

    if (isDuplicate) {
        return showToast(i18n[currentLanguage].duplicateName, 'error');
    }

    let phone = rawPhone;
    if (!phone.startsWith('+')) {
        phone = '+372 ' + phone.replace(/^0/, ''); 
    }

    const submitBtn = document.querySelector('#firmStep .submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    try {
        let logoUrl = currentExistingLogoUrl || null;
        if (selectedLogoFile) {
            logoUrl = await uploadToCloudinary(selectedLogoFile);
        }

        const firmId = editingFirmId || db.ref().child('allFirms').push().key;
        
        const firmData = {
            id: firmId,
            uid: currentUser.uid,
            name,
            category: catValue,
            city: cityValue,
            category_city: `${catValue}_${cityValue}`,
            phone,
            website: document.getElementById('firmWebsite').value.trim(),
            experience: parseInt(document.getElementById('firmExperience').value) || 0,
            logo: logoUrl,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            isPremium: wasPremium
        };

        const updates = {};
        updates[`/firms/${currentUser.uid}/${firmId}`] = firmData;
        updates[`/allFirms/${firmId}`] = firmData;
        
        await db.ref().update(updates);
        
        showToast(i18n[currentLanguage].success, 'success');
        showSuccessStep();
        fetchFirms(true);
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

function handleSearch(val) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        currentSearch = val.trim();
        fetchFirms(true);
    }, 500);
}

function filterCat(cat, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCategory = cat;
    currentSearch = '';
    fetchFirms(true);
}

function filterCity(city) {
    currentCity = city;
    currentSearch = '';
    fetchFirms(true);
}

async function openEdit(firmId) {
    if (!currentUser) return;
    const snap = await db.ref(`firms/${currentUser.uid}/${firmId}`).once('value');
    const d = snap.val();
    if (!d) return;

    editingFirmId = firmId;
    currentExistingLogoUrl = d.logo || null;
    selectedLogoFile = null;

    document.getElementById('firmName').value = d.name || '';
    document.getElementById('firmPhone').value = d.phone || '';
    document.getElementById('firmCity').value = d.city || '';
    document.getElementById('firmWebsite').value = d.website || '';
    document.getElementById('firmExperience').value = d.experience || '';
    document.getElementById('firmCategory').value = d.category || '';

    const preview = document.getElementById('logoPreview');
    const previewImg = document.getElementById('logoPreviewImg');
    if (d.logo && preview && previewImg) {
        previewImg.src = d.logo;
        preview.classList.remove('hidden');
    }
    showFirmStep();
}

auth.onAuthStateChanged(user => {
    currentUser = user;
    updateAuthUI();
    if (user) {
        attachUserFirmsListener();
    } else {
        detachUserFirmsListener();
        const container = document.getElementById('userFirmsList');
        if (container) container.innerHTML = '';
    }
});

function attachUserFirmsListener() {
    if (!currentUser) return;
    detachUserFirmsListener();

    userFirmsRef = db.ref(`firms/${currentUser.uid}`);
    userFirmsListener = userFirmsRef.on('value', snap => {
        renderUserFirms(snap.val() || {});
    }, err => {
        console.error('User firms listener error:', err);
    });
}

function detachUserFirmsListener() {
    if (userFirmsRef && userFirmsListener) {
        userFirmsRef.off('value', userFirmsListener);
    }
    userFirmsRef = null;
    userFirmsListener = null;
}

function renderUserFirms(data) {
    const container = document.getElementById('userFirmsList');
    if (!container) return;

    container.innerHTML = `
        <button onclick="resetForm(); showFirmStep()" class="submit-btn">${i18n[currentLanguage].addNew}</button>
        <button onclick="logout()" class="back-btn" style="margin-top:10px; background:#95a5a6; width:100%; border:none; color:white; padding:10px; border-radius:8px; cursor:pointer;">${i18n[currentLanguage].logout}</button>
        <div style="margin-top:20px;"></div>`;

    const entries = Object.entries(data);

    if (entries.length === 0) {
        const empty = document.createElement('p');
        empty.style = "text-align:center; opacity:0.6; margin-top:20px;";
        empty.textContent = i18n[currentLanguage].empty;
        container.appendChild(empty);
        return;
    }

    entries.forEach(([id, firm]) => {
        const item = document.createElement('div');
        item.className = "user-firm-item";
        item.style = "padding:15px; border:1px solid #eee; margin-bottom:10px; border-radius:8px; background:#f9f9f9;";
        item.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:bold;">${escapeHtml(firm.name)}</span>
                <div>
                    <button onclick="openEdit('${id}')" style="color:#2ecc71; background:none; border:none; cursor:pointer;">${i18n[currentLanguage].edit}</button>
                    <button onclick="deleteFirm('${id}')" style="color:#e74c3c; background:none; border:none; cursor:pointer; margin-left:10px;">${i18n[currentLanguage].delete}</button>
                </div>
            </div>
            `;
        container.appendChild(item);
    });
}

function updateAuthUI() {
    const btn = document.querySelector('.add-firm-btn');
    if (btn) btn.textContent = currentUser ? i18n[currentLanguage].profile : i18n[currentLanguage].postFirm;
}

function loginUser() {
    const email = document.getElementById('userEmail').value.trim();
    const pass = document.getElementById('userPassword').value;
    if (!email || !pass) return showToast(i18n[currentLanguage].fillFields, 'error');

    auth.signInWithEmailAndPassword(email, pass)
        .then((userCredential) => {
            if (!userCredential.user.emailVerified) {
                userCredential.user.sendEmailVerification(); 
                showToast(currentLanguage === 'et' ? "E-mail on kinnitamata. Saatsime uue lingi!" : "Email не подтвержден. Мы отправили новую ссылку!", 'info');
                auth.signOut();
            } else {
                showUserFirmsStep();
            }
        })
        .catch(() => showToast(i18n[currentLanguage].errorLogin, 'error'));
}

function registerUser() {
    const email = document.getElementById('userEmail').value.trim();
    const pass = document.getElementById('userPassword').value;
    if (!email) return showToast(i18n[currentLanguage].enterEmail, 'error');
    if (pass.length < 6) return showToast(i18n[currentLanguage].minChars, 'error');

    auth.createUserWithEmailAndPassword(email, pass)
        .then((userCredential) => {
            userCredential.user.sendEmailVerification();
            showToast(i18n[currentLanguage].verifyEmailSent, 'success');
            auth.signOut(); 
            closePostFirmModal();
        })
        .catch(e => showToast(e.message, 'error'));
}

function forgotPassword() {
    const email = document.getElementById('userEmail').value;
    if (!email) {
        showToast(currentLang === 'et' ? "Palun sisesta email!" : "Пожалуйста, введите email!", "error");
        return;
    }

    firebase.auth().sendPasswordResetEmail(email)
        .then(() => {
            showToast(currentLang === 'et' 
                ? "Parooli lähtestamise link saadetud!" 
                : "Ссылка для сброса пароля отправлена!", "success");
        })
        .catch((error) => {
            showToast(error.message, "error");
        });
}

function logout() {
    auth.signOut().then(() => {
        currentUser = null;
        updateAuthUI();
        closePostFirmModal();
    });
}

function loadUserFirms() {
    if (!currentUser) return;
    const container = document.getElementById('userFirmsList');
    if (!container) return;
    if (!userFirmsListener) {
        attachUserFirmsListener();
    }
}

async function deleteFirm(firmId) {
    if (!currentUser || !confirm(i18n[currentLanguage].confirm)) return;
    const updates = {};
    updates[`/firms/${currentUser.uid}/${firmId}`] = null;
    updates[`/allFirms/${firmId}`] = null;
    await db.ref().update(updates);
    fetchFirms(true);
}

async function uploadToCloudinary(file) {
    if (typeof USE_CLOUDINARY === 'undefined' || !USE_CLOUDINARY) throw new Error(i18n[currentLanguage].configError);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_PRESET);
    const resp = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
    if (!resp.ok) throw new Error('Upload failed');
    const data = await resp.json();
    return data.secure_url;
}

function setLang(lang) {
    firebase.auth().languageCode = lang;
    currentLanguage = lang;
    localStorage.setItem('selectedLanguage', lang);
    document.querySelectorAll('[data-et]').forEach(el => {
        if (el.hasAttribute(`data-${lang}`)) {
            el.textContent = el.getAttribute(`data-${lang}`);
        }
        if((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.hasAttribute(`data-${lang}`)) {
            el.placeholder = el.getAttribute(`data-${lang}`);
        }
    });
    updateAuthUI();
}

function escapeHtml(t) {
    if (!t) return '';
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}

function openPostFirmModal() {
    const modal = document.getElementById('postFirmModal');
    const overlay = document.getElementById('modalOverlay');
    
    if (modal) modal.classList.add('active');
    if (overlay) overlay.classList.add('active');
    
    if (currentUser) {
        showUserFirmsStep();
    } else {
        showAuthStep();
    }
}

function closePostFirmModal() {
    const modal = document.getElementById('postFirmModal');
    const overlay = document.getElementById('modalOverlay');
    
    if (modal) modal.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    
    resetForm();
}

function hideAllSteps() {
    ['authStep', 'firmStep', 'userFirmsStep', 'successStep'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
}

function showAuthStep() { hideAllSteps(); document.getElementById('authStep').classList.remove('hidden'); }
function showFirmStep() { hideAllSteps(); document.getElementById('firmStep').classList.remove('hidden'); }
function showUserFirmsStep() { hideAllSteps(); document.getElementById('userFirmsStep').classList.remove('hidden'); }
function showSuccessStep() { hideAllSteps(); document.getElementById('successStep').classList.remove('hidden'); }

function resetForm() {
    editingFirmId = null;
    selectedLogoFile = null;
    currentExistingLogoUrl = null;
    const form = document.getElementById('firmForm');
    if (form) form.reset();
    const preview = document.getElementById('logoPreview');
    if (preview) preview.classList.add('hidden');
    
    const submitBtn = document.querySelector('#firmStep .submit-btn');
    if (submitBtn) submitBtn.disabled = false;
}

window.addEventListener('load', () => {
    setLang(currentLanguage);
    fetchFirms(true);

    const observer = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && !isLoading && hasMore) {
            fetchFirms();
        }
    }, { rootMargin: '200px', threshold: 0.1 });

    const sentinel = document.getElementById('loader-sentinel');
    if (sentinel) observer.observe(sentinel);

    const logoInput = document.getElementById('logoFile');
    if (logoInput) {
        logoInput.addEventListener('change', e => {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 5 * 1024 * 1024) {
                    showToast('Pilt on liiga suur (maksimaalselt 5MB)', 'error');
                    e.target.value = '';
                    return;
                }
                selectedLogoFile = file;
                const reader = new FileReader();
                reader.onload = ev => {
                    document.getElementById('logoPreviewImg').src = ev.target.result;
                    document.getElementById('logoPreview').classList.remove('hidden');
                };
                reader.readAsDataURL(file);
            }
        });
    }
});

function startUpgrade(firmId) {
    const modal = document.getElementById('premiumModal');
    if (modal) {
        modal.style.display = 'flex';
        setLang(currentLanguage);
    }
}

function closePremiumModal() {
    const modal = document.getElementById('premiumModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function rateFirm(firmId, ownerUid, score) {
    if (!currentUser) return showToast(i18n[currentLanguage].loginToRate, 'error');
    
    if (currentUser.uid === ownerUid) {
        return showToast(currentLanguage === 'et' ? "Oma firmat ei saa hinnata!" : "Нельзя оценивать свою фирму!", 'error');
    }

    try {
        await db.ref(`ratings/${firmId}/${currentUser.uid}`).set(score);
        
        const snap = await db.ref(`ratings/${firmId}`).once('value');
        const ratings = Object.values(snap.val() || {});
        const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
        
        const updates = {};
        const ratingData = { ratingAvg: avg.toFixed(1), ratingCount: ratings.length };
        
        updates[`/allFirms/${firmId}/ratingAvg`] = ratingData.ratingAvg;
        updates[`/allFirms/${firmId}/ratingCount`] = ratingData.ratingCount;
        updates[`/firms/${ownerUid}/${firmId}/ratingAvg`] = ratingData.ratingAvg;
        updates[`/firms/${ownerUid}/${firmId}/ratingCount`] = ratingData.ratingCount;

        await db.ref().update(updates);
        showToast(i18n[currentLanguage].ratingSaved, 'success');
        fetchFirms(true); 
    } catch (e) {
        showToast("Viga salvestamisel", 'error');
    }
}

function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth' 
    });
}