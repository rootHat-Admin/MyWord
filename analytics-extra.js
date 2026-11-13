// analytics-extra.js — v3.0 расширенная аналитика
// 🚀 v3.1: данные берём из кэша db.js, собственного подключения к Firestore здесь больше нет
import { getAllCards, getAllPhrases } from './db.js';

function esc(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
}

function toDate(raw) {
    if (!raw) return null;
    if (raw.toDate) return raw.toDate();
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
}

async function loadAll() {
    // Из кэша: 0 чтений, если данные свежие (раньше — 2 полных getDocs на КАЖДЫЙ клик по фильтру и при загрузке страницы)
    const [cards, phrases] = await Promise.all([getAllCards(), getAllPhrases()]);
    return { cards, phrases };
}

// ===== 1. БОЛЬШОЙ ГРАФИК (слова + фразы вместе) =====
// ===== 1. БОЛЬШОЙ ГРАФИК (слова + фразы вместе) =====
function drawChart(cards, phrases, filter = 'week') {
    const container = document.getElementById('chartContainer');
    if (!container) return;
    container.innerHTML = '';

    // Сколько дней показывать в зависимости от фильтра
    let days;
    switch (filter) {
        case 'day':      days = 1;   break;
        case 'week':     days = 7;   break;
        case 'month':    days = 30;  break;
        case '6months':  days = 180; break;
        case 'year':     days = 365; break;
        case 'all':      days = 0;   break; // 0 = все данные
        default:         days = 7;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Определяем стартовую дату
    let startDate;
    if (days === 0) {
        // All Time — берём самую раннюю дату из данных
        const allDates = [
            ...cards.map(c => toDate(c.createdAtRaw)),
            ...phrases.map(p => toDate(p.createdAtRaw))
        ].filter(Boolean);
        startDate = allDates.length ? new Date(Math.min(...allDates.map(d => d.getTime()))) : new Date(today);
        startDate.setHours(0, 0, 0, 0);
    } else {
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - (days - 1));
    }

    // Считаем количество дней между startDate и today
    const totalDays = Math.max(1, Math.round((today - startDate) / 86400000) + 1);

    // Собираем данные по дням
    const data = [];
    for (let i = 0; i < totalDays; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        const label = d.toLocaleDateString('en', { day: '2-digit', month: 'short' });
        const wordsCount = cards.filter(c => {
            const cd = toDate(c.createdAtRaw);
            return cd && cd.toDateString() === d.toDateString();
        }).length;
        const phrasesCount = phrases.filter(p => {
            const pd = toDate(p.createdAtRaw);
            return pd && pd.toDateString() === d.toDateString();
        }).length;
        data.push({ label, words: wordsCount, phrases: phrasesCount, date: d });
    }

    // Агрегируем, если дней много (иначе не влезет)
    let displayData = data;
    let groupBy = 1;
    if (totalDays > 60) {
        groupBy = Math.ceil(totalDays / 30); // группируем в ~30 точек
        displayData = [];
        for (let i = 0; i < data.length; i += groupBy) {
            const chunk = data.slice(i, i + groupBy);
            const first = chunk[0];
            const last = chunk[chunk.length - 1];
            displayData.push({
                label: `${first.label} - ${last.label}`,
                words: chunk.reduce((s, x) => s + x.words, 0),
                phrases: chunk.reduce((s, x) => s + x.phrases, 0),
                date: first.date
            });
        }
    }

    const max = Math.max(...displayData.map(d => Math.max(d.words, d.phrases)), 1);
    const w = 500;
    const h = 200;
    const px = 30, bottomY = 160, chartH = 120, chartW = w - px * 2;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '200');

    // Горизонтальные линии
    for (let i = 0; i <= 4; i++) {
        const y = bottomY - (i / 4) * chartH;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', px);
        line.setAttribute('x2', w - px);
        line.setAttribute('y1', y);
        line.setAttribute('y2', y);
        line.setAttribute('stroke', '#222222');
        line.setAttribute('stroke-width', '1');
        svg.appendChild(line);
    }

    const step = Math.max(displayData.length - 1, 1);
    const getX = i => px + (i / step) * chartW;
    const getY = v => bottomY - (v / max) * chartH;

    // Слова — белая линия
    const wordPts = displayData.map((d, i) => `${getX(i)},${getY(d.words)}`).join(' ');
    const wordLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    wordLine.setAttribute('points', wordPts);
    wordLine.setAttribute('fill', 'none');
    wordLine.setAttribute('stroke', '#ffffff');
    wordLine.setAttribute('stroke-width', '3');
    svg.appendChild(wordLine);

    // Фразы — красная линия
    const phrPts = displayData.map((d, i) => `${getX(i)},${getY(d.phrases)}`).join(' ');
    const phrLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    phrLine.setAttribute('points', phrPts);
    phrLine.setAttribute('fill', 'none');
    phrLine.setAttribute('stroke', '#ef4444');
    phrLine.setAttribute('stroke-width', '3');
    svg.appendChild(phrLine);

    // Точки + подписи
    const labelStep = Math.ceil(displayData.length / 8); // максимум 8 подписей
    displayData.forEach((d, i) => {
        const x = getX(i);
        const cw = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        cw.setAttribute('cx', x); cw.setAttribute('cy', getY(d.words));
        cw.setAttribute('r', '3'); cw.setAttribute('fill', '#ffffff');
        svg.appendChild(cw);

        const cp = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        cp.setAttribute('cx', x); cp.setAttribute('cy', getY(d.phrases));
        cp.setAttribute('r', '3'); cp.setAttribute('fill', '#ef4444');
        svg.appendChild(cp);

        if (i % labelStep === 0 || i === displayData.length - 1) {
            const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            t.setAttribute('x', x); t.setAttribute('y', bottomY + 15);
            t.setAttribute('text-anchor', 'middle');
            t.setAttribute('font-size', '9');
            t.setAttribute('fill', '#666666');
            t.textContent = d.label;
            svg.appendChild(t);
        }
    });

    container.appendChild(svg);
}

// ===== 2. СОЗДАНО ПО ДАТАМ =====
function renderCreatedByDate(cards, phrases, filter = 'week') {
    const container = document.getElementById('createdByDate');
    if (!container) return;

    // Даты начала по фильтру
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let startDate = new Date(0);
    let endDate = new Date(today);
    endDate.setHours(23, 59, 59, 999);

    switch (filter) {
        case 'day':
            startDate = new Date(today);
            break;
        case 'week':
            startDate = new Date(today); startDate.setDate(startDate.getDate() - 6);
            break;
        case 'month':
            startDate = new Date(today); startDate.setDate(startDate.getDate() - 29);
            break;
        case '6months':
            startDate = new Date(today); startDate.setMonth(startDate.getMonth() - 6);
            break;
        case 'year':
            startDate = new Date(today); startDate.setFullYear(startDate.getFullYear() - 1);
            break;
        case 'all':
        default:
            startDate = new Date(0);
    }

    const inRange = d => d && d >= startDate && d <= endDate;

    const byDate = new Map();
    cards.forEach(c => {
        const d = toDate(c.createdAtRaw);
        if (!inRange(d)) return;
        const key = d.toISOString().slice(0, 10);
        if (!byDate.has(key)) byDate.set(key, { date: d, words: 0, phrases: 0 });
        byDate.get(key).words++;
    });
    phrases.forEach(p => {
        const d = toDate(p.createdAtRaw);
        if (!inRange(d)) return;
        const key = d.toISOString().slice(0, 10);
        if (!byDate.has(key)) byDate.set(key, { date: d, words: 0, phrases: 0 });
        byDate.get(key).phrases++;
    });

    if (byDate.size === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 text-sm py-4">No data for this period</div>';
        return;
    }

    const sorted = Array.from(byDate.values()).sort((a, b) => b.date - a.date);

    container.innerHTML = sorted.map(item => `
        <div class="flex items-center justify-between py-2 px-3 border-b border-[#222222] last:border-0">
            <div class="text-sm text-gray-300">📅 ${item.date.toLocaleDateString('en', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            <div class="flex gap-2">
                ${item.words > 0 ? `<span class="text-xs bg-white text-black font-bold px-2 py-0.5 rounded-full">📝 ${item.words}</span>` : ''}
                ${item.phrases > 0 ? `<span class="text-xs bg-red-500 text-white font-bold px-2 py-0.5 rounded-full">💬 ${item.phrases}</span>` : ''}
            </div>
        </div>
    `).join('');
}

// ===== 3. OVERVIEW: DICTIONARIES AND PHRASES =====
function renderDictionariesOverview(cards, phrases, filter = 'week') {
    const container = document.getElementById('dictionariesOverview');
    if (!container) return;

    // Даты начала по фильтру
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let startDate = new Date(0);
    let endDate = new Date(today);
    endDate.setHours(23, 59, 59, 999);

    switch (filter) {
        case 'day':
            startDate = new Date(today);
            break;
        case 'week':
            startDate = new Date(today); startDate.setDate(startDate.getDate() - 6);
            break;
        case 'month':
            startDate = new Date(today); startDate.setDate(startDate.getDate() - 29);
            break;
        case '6months':
            startDate = new Date(today); startDate.setMonth(startDate.getMonth() - 6);
            break;
        case 'year':
            startDate = new Date(today); startDate.setFullYear(startDate.getFullYear() - 1);
            break;
        case 'all':
        default:
            startDate = new Date(0);
    }

    const inRange = d => d && d >= startDate && d <= endDate;

    // Фильтруем данные
    const filteredCards = cards.filter(c => inRange(toDate(c.createdAtRaw)));
    const filteredPhrases = phrases.filter(p => inRange(toDate(p.createdAtRaw)));

    const dictMap = new Map();
    filteredCards.forEach(c => {
        const name = c.dictionaryName || 'No dictionary';
        if (!dictMap.has(name)) dictMap.set(name, { total: 0, learned: 0, active: 0 });
        const s = dictMap.get(name);
        s.total++;
        if (c.status === 'finished') s.learned++;
        else s.active++;
    });

    let html = '';

    // Dictionaries
    if (dictMap.size > 0) {
        html += '<div class="text-xs font-bold accent-green mb-2 uppercase tracking-wider">📘 Dictionaries</div>';
        for (const [name, s] of dictMap) {
            const pct = s.total > 0 ? Math.round((s.learned / s.total) * 100) : 0;
            html += `
                <div class="mb-2">
                    <div class="flex justify-between items-center text-xs mb-1">
                        <span class="text-white font-medium truncate">${esc(name)}</span>
                        <span class="text-gray-400">${s.learned}/${s.total} • ${pct}%</span>
                    </div>
                    <div class="w-full bg-[#111111] rounded-full h-1.5 overflow-hidden">
                        <div class="bg-white h-1.5 rounded-full" style="width: ${pct}%"></div>
                    </div>
                </div>`;
        }
    }

    // Phrases
    if (filteredPhrases.length > 0) {
        html += '<div class="text-xs font-bold accent-red mt-4 mb-2 uppercase tracking-wider">💬 Phrases</div>';
        const total = filteredPhrases.length;
        const active = filteredPhrases.filter(p => p.status === 'active').length;
        const learned = filteredPhrases.filter(p => p.status === 'finished').length;
        const pct = total > 0 ? Math.round((learned / total) * 100) : 0;
        html += `
            <div class="mb-2">
                <div class="flex justify-between items-center text-xs mb-1">
                    <span class="text-white font-medium">All phrases</span>
                    <span class="text-gray-400">${learned}/${total} • ${pct}%</span>
                </div>
                <div class="w-full bg-[#111111] rounded-full h-1.5 overflow-hidden">
                    <div class="bg-red-500 h-1.5 rounded-full" style="width: ${pct}%"></div>
                </div>
                <div class="flex justify-between text-[10px] text-gray-500 mt-1">
                    <span>⏳ Active: ${active}</span>
                    <span>✅ Learned: ${learned}</span>
                </div>
            </div>`;
    }

    if (!html) html = '<div class="text-center text-gray-500 text-sm py-4">No data for this period</div>';
    container.innerHTML = html;
}

// ===== 4. PROGRESS BY DICTIONARY =====
function renderDictStats(cards, filter = 'week') {
    const container = document.getElementById('dictStatsContainer');
    if (!container) return;

    // Даты начала по фильтру
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let startDate = new Date(0);
    let endDate = new Date(today);
    endDate.setHours(23, 59, 59, 999);

    switch (filter) {
        case 'day':
            startDate = new Date(today);
            break;
        case 'week':
            startDate = new Date(today); startDate.setDate(startDate.getDate() - 6);
            break;
        case 'month':
            startDate = new Date(today); startDate.setDate(startDate.getDate() - 29);
            break;
        case '6months':
            startDate = new Date(today); startDate.setMonth(startDate.getMonth() - 6);
            break;
        case 'year':
            startDate = new Date(today); startDate.setFullYear(startDate.getFullYear() - 1);
            break;
        case 'all':
        default:
            startDate = new Date(0);
    }

    const inRange = d => d && d >= startDate && d <= endDate;
    const filteredCards = cards.filter(c => inRange(toDate(c.createdAtRaw)));

    const dictMap = new Map();
    for (const card of filteredCards) {
        const name = card.dictionaryName || 'No dictionary';
        if (!dictMap.has(name)) dictMap.set(name, { total: 0, learned: 0 });
        const s = dictMap.get(name);
        s.total++;
        if (card.status === 'finished') s.learned++;
    }

    if (dictMap.size === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 text-xs py-3">No data for this period</div>';
        return;
    }

    container.innerHTML = '';
    for (const [name, stats] of dictMap) {
        const pct = stats.total > 0 ? Math.round((stats.learned / stats.total) * 100) : 0;
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between text-xs border-b border-[#222222] py-2 last:border-0';
        div.innerHTML = `
            <span class="font-medium text-gray-300 truncate max-w-[130px]" title="${esc(name)}">${esc(name)}</span>
            <div class="flex items-center gap-2 flex-1 ml-2">
                <div class="flex-1 bg-[#111111] rounded-full h-1.5 overflow-hidden">
                    <div class="bg-white h-1.5 rounded-full transition-all duration-500" style="width: ${pct}%"></div>
                </div>
                <span class="text-gray-400 min-w-[45px] text-right">${stats.learned}/${stats.total}</span>
            </div>
        `;
        container.appendChild(div);
    }
}

// ===== ОБНОВЛЕНИЕ ПРИ ПЕРЕХОДЕ В ANALYTICS =====
let currentExtraFilter = 'week';

async function refreshAnalyticsExtra() {
    try {
        const { cards, phrases } = await loadAll();
        drawChart(cards, phrases, currentExtraFilter);
        renderCreatedByDate(cards, phrases, currentExtraFilter);
        renderDictionariesOverview(cards, phrases, currentExtraFilter);
        renderDictStats(cards, currentExtraFilter);
    } catch (e) {
        console.error('analytics-extra error:', e);
    }
}

// 🚀 v3.5: рисуем ТОЛЬКО когда app.js закончил рендер Analytics (вход на экран или клик по фильтру).
// Раньше здесь была «первичная загрузка» через 1 сек после открытия страницы — она читала все
// cards + phrases при каждом запуске приложения, даже если ты открыл только Today.
window.addEventListener('analytics:rendered', (e) => {
    if (e.detail && e.detail.filter) currentExtraFilter = e.detail.filter;
    refreshAnalyticsExtra();
});

// Экспортируем для ручного обновления
window.refreshAnalyticsExtra = refreshAnalyticsExtra;