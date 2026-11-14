// phrases.js — модуль фраз для v3.0
import {
    createPhrases, getTodayPhrases,
    getAllPhrases, updatePhrase, deletePhrase, postponePhrase
} from './db.js';
// 🚀 v3.1: прямых обращений к Firestore здесь больше нет — всё через db.js (кэш + обновление кэша при записи)

function esc(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
}

// ===== ТАБЫ В TODAY =====
const tabTodayWords = document.getElementById('tabTodayWords');
const tabTodayPhrases = document.getElementById('tabTodayPhrases');
const todayWordsContainer = document.getElementById('todayCardsContainer');
const todayPhrasesContainer = document.getElementById('todayPhrasesContainer');
const todayTitle = document.getElementById('todayTitle');

if (tabTodayWords && tabTodayPhrases) {
    tabTodayWords.addEventListener('click', () => {
        tabTodayWords.classList.add('active');
        tabTodayPhrases.classList.remove('active');
        todayWordsContainer.classList.remove('hidden');
        todayPhrasesContainer.classList.add('hidden');
        if (todayTitle) todayTitle.textContent = "📅 Today's Words";
        // Возвращаем счётчик на количество слов
        if (typeof window.updateTodayCount === 'function') {
            window.updateTodayCount('words');
        }
    });
    tabTodayPhrases.addEventListener('click', async () => {
        tabTodayPhrases.classList.add('active');
        tabTodayWords.classList.remove('active');
        todayPhrasesContainer.classList.remove('hidden');
        todayWordsContainer.classList.add('hidden');
        if (todayTitle) todayTitle.textContent = "💬 Today's Phrases";
        await loadTodayPhrases();
    });
}

// ===== ТАБЫ В LIBRARY =====
const tabLibWords = document.getElementById('tabLibWords');
const tabLibPhrases = document.getElementById('tabLibPhrases');
const libWordsContainer = document.getElementById('libWordsContainer');
const libPhrasesContainer = document.getElementById('libPhrasesContainer');

if (tabLibWords && tabLibPhrases) {
    tabLibWords.addEventListener('click', () => {
        tabLibWords.classList.add('active');
        tabLibPhrases.classList.remove('active');
        libWordsContainer.classList.remove('hidden');
        libPhrasesContainer.classList.add('hidden');
    });
    tabLibPhrases.addEventListener('click', () => {
        tabLibPhrases.classList.add('active');
        tabLibWords.classList.remove('active');
        libPhrasesContainer.classList.remove('hidden');
        libWordsContainer.classList.add('hidden');
        loadLibraryPhrases();
    });
}

// ===== ТАБЫ В CREATE =====
const tabCreateWord = document.getElementById('tabCreateWord');
const tabCreatePhrase = document.getElementById('tabCreatePhrase');
const createWordForm = document.getElementById('createWordForm');
const createPhraseForm = document.getElementById('createPhraseForm');
const phraseLimitInfo = document.getElementById('phraseLimitInfo');

if (tabCreateWord && tabCreatePhrase) {
    tabCreateWord.addEventListener('click', () => {
        tabCreateWord.classList.add('active');
        tabCreatePhrase.classList.remove('active');
        createWordForm.classList.remove('hidden');
        createPhraseForm.classList.add('hidden');
    });
    tabCreatePhrase.addEventListener('click', async () => {
        tabCreatePhrase.classList.add('active');
        tabCreateWord.classList.remove('active');
        createPhraseForm.classList.remove('hidden');
        createWordForm.classList.add('hidden');
        // 🚀 v3.7: дневной лимит фраз убран — больше не показываем счётчик
        if (phraseLimitInfo) phraseLimitInfo.textContent = '';
    });
}

// ===== ВЫБОР ИСТОЧНИКОВ ДЛЯ ФРАЗ =====
// ===== ВЫБОР ИСТОЧНИКОВ ДЛЯ ФРАЗ (ТОЛЬКО ОДИН) =====
let selectedPhraseSource = null; // Теперь храним только одну строку, а не Set

document.querySelectorAll('.phrase-source-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const s = this.dataset.source;
        
        if (selectedPhraseSource === s) {
            // Если кликнули по уже выбранному — снимаем выбор
            selectedPhraseSource = null;
            this.classList.remove('btn-green'); 
            this.classList.add('btn-ghost');
        } else {
            // Снимаем выделение со всех остальных
            document.querySelectorAll('.phrase-source-btn').forEach(b => {
                b.classList.remove('btn-green'); 
                b.classList.add('btn-ghost');
            });
            
            // Выделяем только текущий
            selectedPhraseSource = s;
            this.classList.remove('btn-ghost'); 
            this.classList.add('btn-green');
        }
    });
});

// ===== ДАТА СОЗДАНИЯ ФРАЗ =====
function setPhraseDate() {
    // Возвращает YYYY-MM-DD для <input type="date">
    const n = new Date();
    const day = String(n.getDate()).padStart(2, '0');
    const month = String(n.getMonth() + 1).padStart(2, '0');
    const year = n.getFullYear();
    return `${year}-${month}-${day}`;
}
const createPhraseDate = document.getElementById('createPhraseDate');
if (createPhraseDate) createPhraseDate.value = setPhraseDate();

// ===== СОЗДАНИЕ ФРАЗ =====
const savePhraseBtn = document.getElementById('savePhraseBtn');
if (savePhraseBtn) {
    savePhraseBtn.addEventListener('click', async function() {
        if (this.disabled) return;
        
        const text = document.getElementById('phrasesInput').value;
        const interval = parseInt(document.getElementById('phraseIntervalSelect').value) || 1;
        
        // 🚨 ВАЛИДАЦИЯ ТЕГА
        if (!selectedPhraseSource) {
            showToast('⚠️ Пожалуйста, выберите категорию (Phrase source)!', 'warning');
            // Подсветим красным блок с тегами
            const sourceBlock = document.querySelector('.phrase-source-btn').parentElement;
            sourceBlock.style.border = '1px solid #ef4444';
            sourceBlock.style.borderRadius = '8px';
            sourceBlock.style.padding = '4px';
            setTimeout(() => {
                sourceBlock.style.border = 'none';
                sourceBlock.style.padding = '0';
            }, 2000);
            return;
        }

        if (!text.trim()) { alert('Введи фразы'); return; }
        
        this.disabled = true;
        const originalText = this.textContent;
        this.textContent = '⏳ Saving...';
        
        try {
            const dateVal = document.getElementById('createPhraseDate').value;
            // Передаём массив с одним выбранным тегом
            const res = await createPhrases(text, interval, [selectedPhraseSource], [], dateVal);
            
            let msg = `Created ${res.created} phrase(s)`;
            if (res.skipped > 0) msg += ` (${res.skipped} skipped — invalid or duplicate)`;
            showToast(msg, 'success');
            
            document.getElementById('phrasesInput').value = '';
            selectedPhraseSource = null; // Сбрасываем
            
            document.querySelectorAll('.phrase-source-btn').forEach(b => {
                b.classList.remove('btn-green'); 
                b.classList.add('btn-ghost');
            });
            if (createPhraseDate) createPhraseDate.value = setPhraseDate();
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            this.disabled = false;
            this.textContent = originalText;
        }
    });
}

// ===== ЗАГРУЗКА ФРАЗ НА СЕГОДНЯ =====
// ===== ЗАГРУЗКА ФРАЗ НА СЕГОДНЯ (С ГРУППИРОВКОЙ ПО ДАТЕ) =====
async function loadTodayPhrases() {
    const container = document.getElementById('todayPhrasesContainer');
    if (!container) return;

    const phrases = await getTodayPhrases();

    // Обновляем счётчик в шапке
    const countEl = document.getElementById('todayCount');
    if (countEl) countEl.textContent = phrases.length;

    if (phrases.length === 0) {
        container.innerHTML = '<div class="bg-[#0f0f1a] rounded-xl p-8 text-center text-gray-400 border border-[#2a2a4a]">🎉 Нет фраз на сегодня</div>';
        return;
    }

    container.innerHTML = '';

    // ===== ГРУППИРУЕМ ПО ДАТЕ СОЗДАНИЯ (как словари в словах) =====
    const grouped = {};
    for (const ph of phrases) {
        // Берём дату из createdAt (формат ДД.ММ.ГГ:ЧЧ.ММ.СС) — первые 8 символов
        const dateKey = ph.createdAt ? ph.createdAt.slice(0, 8) : 'Без даты';
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(ph);
    }

    // Сортируем даты от новых к старым
    const sortedDates = Object.keys(grouped).sort((a, b) => {
        // Парсим ДД.ММ.ГГ в дату для сортировки
        const parse = (s) => {
            const [d, m, y] = s.split('.');
            return new Date(`20${y}-${m}-${d}`);
        };
        return parse(b) - parse(a);
    });

    // ===== СТРОИМ КАЖДЫЙ БЛОК (по дате) =====
    for (const dateKey of sortedDates) {
        const datePhrases = grouped[dateKey];

        // ===== HEADER BLOCK =====
        const headerDiv = document.createElement('div');
        headerDiv.className = 'bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-4 rounded-2xl mb-2 mt-4';
        headerDiv.dataset.phraseDate = dateKey;

        // Собираем все источники этого дня
        const allSources = new Set();
        datePhrases.forEach(p => {
            if (p.sources && p.sources.length) {
                p.sources.forEach(s => allSources.add(s));
            }
        });
        const sourceLabels = {
            'everyday': '💬 Everyday English',
            'university': '🎓 University & Lectures',
            'discussion': '🗣️ Communication & Discussions',
            'it': '💻 IT & Programming',
            'ai-cyber': '🤖 AI & Cybersecurity',
            'academic': '📚 Academic English'
        };
        const sourcesDisplay = Array.from(allSources).map(s => sourceLabels[s] || s).join(' ');

        const topRow = document.createElement('div');
        topRow.className = 'flex flex-wrap justify-between items-center gap-2 mb-2';
        topRow.innerHTML = `
            <div>
                <span class="text-white font-bold text-lg">📘 ${dateKey} (${datePhrases.length})</span>
                <span class="text-white/50 text-sm ml-2">✅ <span class="phrase-checked-count-${dateKey.replace(/\./g, '')}">0</span></span>
                ${sourcesDisplay ? `<div class="text-white/50 text-[10px] mt-1 flex flex-wrap gap-1">📌 ${sourcesDisplay}</div>` : ''}
            </div>
            <div class="flex gap-2 flex-wrap">
                <button class="copy-phrases-btn bg-blue-500 hover:bg-blue-600 text-white font-bold py-1.5 px-3 rounded-lg transition text-sm" data-date="${dateKey}">📋 Copy Phrases</button>
                <button class="close-phrases-btn bg-green-500 hover:bg-green-600 text-white font-bold py-1.5 px-4 rounded-lg transition text-sm" data-date="${dateKey}">✅ Done</button>
            </div>
        `;
        headerDiv.appendChild(topRow);

        // ===== INTERVALS ROW =====
        const bottomRow = document.createElement('div');
        bottomRow.className = 'flex items-center gap-1 flex-wrap bg-white/10 rounded-lg p-2';
        bottomRow.innerHTML = `
            <span class="text-white text-xs font-medium mr-1">📌</span>
            <button data-interval="1" data-date="${dateKey}" class="phrase-interval-btn bg-white/20 hover:bg-white/40 text-white font-medium py-0.5 px-2 rounded text-xs transition">1d</button>
            <button data-interval="3" data-date="${dateKey}" class="phrase-interval-btn bg-white/20 hover:bg-white/40 text-white font-medium py-0.5 px-2 rounded text-xs transition">3d</button>
            <button data-interval="7" data-date="${dateKey}" class="phrase-interval-btn bg-white/20 hover:bg-white/40 text-white font-medium py-0.5 px-2 rounded text-xs transition">7d</button>
            <button data-interval="14" data-date="${dateKey}" class="phrase-interval-btn bg-white/20 hover:bg-white/40 text-white font-medium py-0.5 px-2 rounded text-xs transition">14d</button>
            <button data-interval="30" data-date="${dateKey}" class="phrase-interval-btn bg-white/20 hover:bg-white/40 text-white font-medium py-0.5 px-2 rounded text-xs transition">30d</button>
            <button data-interval="60" data-date="${dateKey}" class="phrase-interval-btn bg-white/20 hover:bg-white/40 text-white font-medium py-0.5 px-2 rounded text-xs transition">60d</button>
            <div class="flex items-center gap-0.5 bg-white/10 rounded px-1.5 py-0.5">
                <span class="text-white/80 text-xs">⚡</span>
                <input type="number" class="phrase-custom-interval-${dateKey.replace(/\./g, '')} w-10 bg-white/20 text-white placeholder-white/50 rounded px-1 py-0.5 text-xs text-center border-0 focus:outline-none" min="1" value="7">
                <button data-date="${dateKey}" class="phrase-custom-btn bg-purple-500 hover:bg-purple-600 text-white font-bold py-0.5 px-2 rounded text-xs transition">OK</button>
            </div>
        `;
        headerDiv.appendChild(bottomRow);
        container.appendChild(headerDiv);

        // ===== LIST OF PHRASES (для этой даты) =====
        const listDiv = document.createElement('div');
        listDiv.className = 'bg-[#0f0f1a] border border-[#2a2a4a] rounded-2xl p-2 space-y-1 mb-4';
        listDiv.dataset.dateList = dateKey;

        const truncate = (str, max = 22) => {
            if (!str) return '—';
            return str.length > max ? str.slice(0, max) + '…' : str;
        };

        datePhrases.forEach((ph, i) => {
            const row = document.createElement('div');
            row.className = 'grid grid-cols-12 gap-2 items-center px-3 py-2 rounded hover:bg-[#1a1a2e] transition border-b border-[#2a2a4a] last:border-0';
            row.dataset.phraseId = ph.id;
            row.dataset.date = dateKey;
            row.innerHTML = `
                <div class="col-span-1 text-center text-[11px] font-bold text-indigo-400">${i + 1}</div>
                <div class="col-span-1 text-center">
                    <input type="checkbox" class="phrase-cb w-4 h-4 accent-green rounded" data-id="${ph.id}" data-date="${dateKey}">
                </div>
                <div class="col-span-4 text-indigo-300 text-sm truncate phrase-clickable cursor-pointer hover:text-indigo-200 transition" 
                     data-phrase-id="${ph.id}"
                     data-english="${esc(ph.english)}" 
                     data-russian="${esc(ph.russian)}"
                     title="Click to see full phrase">${esc(truncate(ph.english, 22))}</div>
                <div class="col-span-4 text-green-300 text-sm truncate phrase-clickable cursor-pointer hover:text-green-200 transition"
                     data-phrase-id="${ph.id}"
                     data-english="${esc(ph.english)}" 
                     data-russian="${esc(ph.russian)}"
                     title="Click to see full translation">${esc(truncate(ph.russian, 22))}</div>
                <div class="col-span-2 text-right">
                    <button class="copy-phrase-btn text-gray-400 hover:text-white transition text-sm" 
                            data-text="${esc(ph.english)} — ${esc(ph.russian)}"
                            title="Copy phrase">📋</button>
                </div>
            `;
            listDiv.appendChild(row);
        });
        container.appendChild(listDiv);
    }

    // ===== СОБЫТИЯ =====

    // Обновление счётчика галочек (в своём блоке)
    container.querySelectorAll('.phrase-cb').forEach(cb => {
        cb.addEventListener('change', function() {
            const date = this.dataset.date;
            const listEl = container.querySelector(`[data-date-list="${date}"]`);
            const count = listEl ? listEl.querySelectorAll('.phrase-cb:checked').length : 0;
            const countSpan = container.querySelector(`[class*="phrase-checked-count-${date.replace(/\./g, '')}"]`);
            if (countSpan) countSpan.textContent = count;
        });
    });

    // КЛИК ПО ФРАЗЕ → модалка
    container.querySelectorAll('.phrase-clickable').forEach(el => {
        el.addEventListener('click', function() {
            showPhraseModal(
                this.dataset.english,
                this.dataset.russian,
                this.dataset.phraseId
            );
        });
    });

    // КОПИРОВАНИЕ одной фразы
    container.querySelectorAll('.copy-phrase-btn').forEach(btn => {
        btn.addEventListener('click', async function(e) {
            e.stopPropagation();
            const text = this.dataset.text;
            const ok = await copyToClipboard(text);
            if (ok) {
                const orig = this.textContent;
                this.textContent = '✅';
                setTimeout(() => this.textContent = orig, 1500);
                showToast('Phrase copied to clipboard', 'success');
            } else {
                showToast('Failed to copy', 'error');
            }
        });
    });

    // КОПИРОВАТЬ ВСЕ фразы в блоке (по дате)
    container.querySelectorAll('.copy-phrases-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const date = this.dataset.date;
            const listEl = container.querySelector(`[data-date-list="${date}"]`);
            const rows = listEl.querySelectorAll('.phrase-clickable[data-english]');
            const seen = new Set();
            const lines = [];
            rows.forEach(r => {
                const en = r.dataset.english;
                const ru = r.dataset.russian;
                const key = en + '|' + ru;
                if (!seen.has(key)) {
                    seen.add(key);
                    lines.push(`${en} — ${ru}`);
                }
            });
            const ok = await copyToClipboard(lines.join('\n'));
            if (ok) {
                const orig = this.textContent;
                this.textContent = '✅ Copied!';
                setTimeout(() => this.textContent = orig, 1500);
                showToast(`${lines.length} phrase(s) copied to clipboard`, 'success');
            } else {
                showToast('Failed to copy', 'error');
            }
        });
    });

    // DONE — удалить выученные в блоке
    container.querySelectorAll('.close-phrases-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const date = this.dataset.date;
            const listEl = container.querySelector(`[data-date-list="${date}"]`);
            const checked = listEl.querySelectorAll('.phrase-cb:checked');
            if (checked.length === 0) { alert('⚠️ Ничего не отмечено в этом блоке'); return; }
            if (!confirm(`✅ Выучено ${checked.length} фраз за ${date} — удалить навсегда?`)) return;
            const promises = [];
            checked.forEach(cb => promises.push(deletePhrase(cb.dataset.id))); // db.js сам уберёт фразу из кэша
            await Promise.all(promises);
            showToast(`Deleted ${checked.length} learned phrase(s)`, 'success');
            loadTodayPhrases();
            updatePhraseAnalytics();
        });
    });

    // ОТЛОЖИТЬ на N дней (в блоке)
    container.querySelectorAll('.phrase-interval-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const days = parseInt(this.dataset.interval);
            const date = this.dataset.date;
            const listEl = container.querySelector(`[data-date-list="${date}"]`);
            const ids = Array.from(listEl.querySelectorAll('.phrase-cb')).map(cb => cb.dataset.id);
            const promises = [];
            ids.forEach(id => promises.push(
                import('./db.js').then(({ postponePhrase }) => postponePhrase(id, days))
            ));
            await Promise.all(promises);
            showToast(`Postponed ${ids.length} phrase(s) by ${days} day(s) → ${formatFutureDate(days)}`, 'success');
            loadTodayPhrases();
        });
    });

    // КАСТОМНЫЙ ИНТЕРВАЛ (в блоке)
    container.querySelectorAll('.phrase-custom-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const date = this.dataset.date;
            const input = container.querySelector(`.phrase-custom-interval-${date.replace(/\./g, '')}`);
            const days = parseInt(input.value);
            if (!days || days < 1) { alert('⚠️ Введите число > 0'); return; }
            if (days > 365) { alert('⚠️ Максимум 365 дней'); return; }
            const listEl = container.querySelector(`[data-date-list="${date}"]`);
            const ids = Array.from(listEl.querySelectorAll('.phrase-cb')).map(cb => cb.dataset.id);
            const promises = [];
            ids.forEach(id => promises.push(
                import('./db.js').then(({ postponePhrase }) => postponePhrase(id, days))
            ));
            await Promise.all(promises);
            showToast(`Postponed ${ids.length} phrase(s) by ${days} day(s) → ${formatFutureDate(days)}`, 'success');
            loadTodayPhrases();
        });
    });
}

// ===== МОДАЛКА: ПОЛНАЯ ФРАЗА + ПЕРЕВОД =====
// ===== МОДАЛКА: ПОЛНАЯ ФРАЗА + ПЕРЕВОД + РЕДАКТИРОВАНИЕ =====
function showPhraseModal(english, russian, phraseId) {
    const old = document.getElementById('phraseModal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'phraseModal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-[#0f0f1a] rounded-2xl max-w-md w-full p-6 border border-[#2a2a4a] shadow-2xl">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-bold text-indigo-400">💬 Phrase</h3>
                <div class="flex items-center gap-2">
                    <button class="edit-phrase-btn text-gray-400 hover:text-green-400 transition text-sm font-bold" title="Correct phrase">✏️ Correction</button>
                    <button class="close-phrase-modal text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </div>
            </div>

            <div class="space-y-3">
                <!-- ENGLISH -->
                <div class="bg-[#0a0a0a] rounded-xl p-4 border border-[#2a2a4a]">
                    <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">🇬🇧 English</div>
                    <p class="text-white text-base break-words whitespace-pre-wrap phrase-view-en">${esc(english)}</p>
                    <textarea class="phrase-edit-en hidden w-full bg-[#0a0a0a] border border-[#22c55e] rounded-lg p-2 text-base text-white mt-1 focus:outline-none" rows="3">${esc(english)}</textarea>
                </div>

                <!-- RUSSIAN -->
                <div class="bg-[#0a0a0a] rounded-xl p-4 border border-[#2a2a4a]">
                    <div class="text-xs text-gray-500 uppercase tracking-wider mb-1">🇷🇺 Русский</div>
                    <p class="text-green-400 text-base break-words whitespace-pre-wrap phrase-view-ru">${esc(russian)}</p>
                    <textarea class="phrase-edit-ru hidden w-full bg-[#0a0a0a] border border-[#22c55e] rounded-lg p-2 text-base text-green-400 mt-1 focus:outline-none" rows="3">${esc(russian)}</textarea>
                </div>
            </div>

            <!-- SAVE BUTTON (скрыта пока не редактируем) -->
            <button class="save-phrase-modal hidden w-full mt-4 bg-green-500 hover:bg-green-600 text-black font-bold py-2 rounded-lg transition">💾 Save</button>

            <!-- CLOSE -->
            <button class="close-phrase-modal w-full mt-2 btn-ghost py-2 rounded-lg">Close</button>
        </div>
    `;
    document.body.appendChild(modal);

    // ===== ЗАКРЫТИЕ =====
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    modal.querySelectorAll('.close-phrase-modal').forEach(b => b.addEventListener('click', () => modal.remove()));
    document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape') {
            const m = document.getElementById('phraseModal');
            if (m) m.remove();
            document.removeEventListener('keydown', esc);
        }
    });

    // ===== РЕДАКТИРОВАНИЕ =====
    const editBtn = modal.querySelector('.edit-phrase-btn');
    const saveBtn = modal.querySelector('.save-phrase-modal');
    const viewEn = modal.querySelector('.phrase-view-en');
    const viewRu = modal.querySelector('.phrase-view-ru');
    const editEn = modal.querySelector('.phrase-edit-en');
    const editRu = modal.querySelector('.phrase-edit-ru');

    editBtn.addEventListener('click', () => {
        // Переключаем режим: показать textarea, скрыть <p>
        viewEn.classList.add('hidden');
        viewRu.classList.add('hidden');
        editEn.classList.remove('hidden');
        editRu.classList.remove('hidden');
        saveBtn.classList.remove('hidden');
        editBtn.classList.add('hidden'); // прячем кнопку Correction
        editEn.focus();
    });

    // ===== СОХРАНЕНИЕ =====
    saveBtn.addEventListener('click', async () => {
        const newEn = editEn.value.trim();
        const newRu = editRu.value.trim();

        if (!newEn || !newRu) {
            showToast('Both fields required', 'warning');
            return;
        }

        if (!phraseId) {
            showToast('Phrase ID not found', 'error');
            return;
        }

        try {
            // Импортируем updatePhrase динамически
            const { updatePhrase } = await import('./db.js');
            await updatePhrase(phraseId, {
                english: newEn,
                russian: newRu
            });
            showToast('Phrase saved', 'success');
            modal.remove();
            loadTodayPhrases();
        } catch (e) {
            console.error('Ошибка сохранения:', e);
            showToast('Failed to save', 'error');
        }
    });
}

// ===== КОПИРОВАНИЕ =====
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            document.body.removeChild(ta);
            return true;
        } catch (e) {
            document.body.removeChild(ta);
            return false;
        }
    }
}

// ===== TOAST для слов (единый стиль) =====
function showToast(message, type = 'success') {
    const old = document.getElementById('appToast');
    if (old) old.remove();

    const colors = {
        success: 'bg-green-500 text-black',
        error:   'bg-red-500 text-white',
        info:    'bg-white text-black',
        warning: 'bg-yellow-500 text-black'
    };
    const icons = {
        success: '✅',
        error:   '❌',
        info:    'ℹ️',
        warning: '⚠️'
    };

    const toast = document.createElement('div');
    toast.id = 'appToast';
    toast.className = `fixed top-4 right-4 z-[9999] ${colors[type] || colors.success} font-bold px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 whitespace-nowrap`;
    toast.style.transform = 'translateX(120%)';
    toast.style.opacity = '0';
    toast.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.35s ease';
    toast.innerHTML = `<span>${icons[type] || '✅'}</span><span>${message}</span>`;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.transform = 'translateX(0)';
        toast.style.opacity = '1';
    });

    setTimeout(() => {
        toast.style.transition = 'transform 0.4s cubic-bezier(0.6, 0, 1, 1), opacity 0.4s ease';
        toast.style.transform = 'translateX(-150%)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 450);
    }, 8000);
}

function formatFutureDate(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
}

// ===== LIBRARY: ФРАЗЫ =====
// ===== LIBRARY: ФРАЗЫ (как словари — по датам) =====
async function loadLibraryPhrases() {
    const container = document.getElementById('phrasesList');
    if (!container) return;
    const phrases = await getAllPhrases();

    if (phrases.length === 0) {
        container.innerHTML = '<div class="bg-[#0f0f1a] rounded-xl p-8 text-center text-gray-400 border border-[#2a2a4a]">📭 Нет фраз</div>';
        return;
    }

    // 📌 Группировка ПО ДАТЕ СОЗДАНИЯ (не по тегам!)
    const byDate = {};
    phrases.forEach(ph => {
        const dateKey = ph.createdAt ? ph.createdAt.slice(0, 8) : 'Unknown';
        if (!byDate[dateKey]) byDate[dateKey] = [];
        byDate[dateKey].push(ph);
    });

    // Сортируем даты от новых к старым
    const sortedDates = Object.keys(byDate).sort((a, b) => {
        const parse = s => {
            const [d, m, y] = s.split('.');
            return new Date(`20${y}-${m}-${d}`);
        };
        return parse(b) - parse(a);
    });

    // Labels для тегов
    const sourceLabels = {
        'everyday': '💬 Everyday English',
        'university': '🎓 University & Lectures',
        'discussion': '🗣️ Communication & Discussions',
        'it': '💻 IT & Programming',
        'ai-cyber': '🤖 AI & Cybersecurity',
        'academic': '📚 Academic English'
    };

    container.innerHTML = '';

    for (const dateKey of sortedDates) {
        const datePhrases = byDate[dateKey];

        // 📌 Собираем ВСЕ источники этого дня
        const allSources = new Set();
        datePhrases.forEach(p => {
            if (p.sources && p.sources.length) {
                p.sources.forEach(s => allSources.add(s));
            }
        });
        const sourcesDisplay = Array.from(allSources)
            .map(s => sourceLabels[s] || s)
            .join(' ');

        // ===== ОДИН БЛОК НА ДАТУ =====
        const block = document.createElement('div');
        block.className = 'border border-[#2a2a4a] rounded-xl overflow-hidden bg-[#1a1a2e] mb-3';

        block.innerHTML = `
            <div class="flex justify-between items-center p-4 bg-[#0f0f1a] hover:bg-[#1a1a2e] cursor-pointer transition phrase-block-toggle">
                <div class="flex items-center gap-3 flex-wrap">
                    <span class="font-bold text-lg text-indigo-400">📅 ${dateKey}</span>
                    <span class="text-xs bg-indigo-600/30 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30">${datePhrases.length} phrase${datePhrases.length > 1 ? 's' : ''}</span>
                </div>
                <span class="toggle-icon text-gray-400">▼</span>
            </div>

            <!-- ТЕГИ СВЕРХУ (видны когда раскрыто) -->
            <div class="tags-row hidden px-4 py-2 border-t border-[#2a2a4a] bg-[#0a0a0a]">
                ${sourcesDisplay ? `<div class="text-xs text-gray-400 flex flex-wrap gap-2"><b>Tegs:</b> ${sourcesDisplay}</div>` : '<div class="text-xs text-gray-500">📌 No sources</div>'}
            </div>

            <div class="dict-content hidden border-t border-[#2a2a4a] p-3">
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-[#0f0f1a]">
                            <tr>
                                <th class="p-2 text-left text-gray-400">#</th>
                                <th class="p-2 text-left text-gray-400">English</th>
                                <th class="p-2 text-left text-gray-400">Russian</th>
                                <th class="p-2 text-left text-gray-400">Time</th>
                                <th class="p-2 text-left text-gray-400">Actions</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
            </div>
        `;

        const tbody = block.querySelector('tbody');

        datePhrases.forEach((ph, i) => {
            const time = ph.createdAt ? ph.createdAt.slice(9) : '—';
            const row = tbody.insertRow();
            row.className = 'border-b border-[#2a2a4a] hover:bg-[#0f0f1a] transition';
            row.innerHTML = `
                <td class="p-2 text-xs text-gray-500">${i + 1}</td>
                <td class="p-2"><input class="edit-phrase w-full p-1 border border-[#2a2a4a] rounded text-sm bg-[#0f0f1a] text-indigo-300 focus:border-indigo-500 transition" data-field="english" value="${esc(ph.english)}"></td>
                <td class="p-2"><input class="edit-phrase w-full p-1 border border-[#2a2a4a] rounded text-sm bg-[#0f0f1a] text-green-300 focus:border-indigo-500 transition" data-field="russian" value="${esc(ph.russian)}"></td>
                <td class="p-2 text-xs text-gray-500">${time}</td>
                <td class="p-2 whitespace-nowrap">
                    <button data-id="${ph.id}" class="save-phrase-lib-btn text-green-400 hover:text-green-300 mr-2 transition">💾</button>
                    <button data-id="${ph.id}" class="delete-phrase-lib-btn text-red-400 hover:text-red-300 transition">🗑</button>
                </td>
            `;
        });

        // Toggle раскрытие (клик по шапке ИЛИ по строке тегов)
        const header = block.querySelector('.phrase-block-toggle');
        const tagsRow = block.querySelector('.tags-row');
        const content = block.querySelector('.dict-content');
        const icon = block.querySelector('.toggle-icon');

        const toggle = () => {
            content.classList.toggle('hidden');
            tagsRow.classList.toggle('hidden');
            icon.textContent = content.classList.contains('hidden') ? '▼' : '▲';
        };

        header.addEventListener('click', toggle);

        // Save
        tbody.querySelectorAll('.save-phrase-lib-btn').forEach(b => b.addEventListener('click', async (e) => {
            e.stopPropagation();
            const row = b.closest('tr');
            const updates = {};
            row.querySelectorAll('.edit-phrase').forEach(inp => {
                updates[inp.dataset.field] = inp.value;
            });
            try {
                await updatePhrase(b.dataset.id, updates);
                showToast('Phrase saved', 'success');
            } catch (err) {
                console.error(err);
                showToast('Failed to save', 'error');
            }
        }));

        // Delete
        tbody.querySelectorAll('.delete-phrase-lib-btn').forEach(b => b.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('🗑️ Delete phrase permanently?')) return;
            await deletePhrase(b.dataset.id);
            showToast('Phrase deleted', 'success');
            loadLibraryPhrases();
            updatePhraseAnalytics();
        }));

        container.appendChild(block);
    }
}

// ===== ТРЕКЕР ФРАЗ В ANALYTICS =====
async function updatePhraseAnalytics() {
    const all = await getAllPhrases();
    const total = document.getElementById('totalPhrases');
    const active = document.getElementById('activePhrases');
    const learned = document.getElementById('learnedPhrases');
    if (!total) return;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    total.textContent = all.length;
    if (active) active.textContent = all.filter(p => p.status === 'active').length;
    if (learned) learned.textContent = all.filter(p => p.status === 'finished').length;
}

// Обновляем трекер при переходе в Analytics
document.querySelectorAll('[data-nav="analytics"]').forEach(btn => {
    btn.addEventListener('click', () => setTimeout(updatePhraseAnalytics, 300));
});

// 🚀 v3.5: «первичная загрузка» убрана — она читала все фразы при каждом открытии страницы.
// Счётчики обновляются при входе в Analytics (обработчик выше), данные берутся из кэша.