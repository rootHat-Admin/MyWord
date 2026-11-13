// db.js — v3.1 (оптимизация чтений Firestore)
// Что изменилось по сравнению с v3.0:
//  1) Все чтения коллекций идут через кэш (память + localStorage) с TTL
//  2) «Сегодня» — query с where() вместо чтения всей коллекции
//  3) Лимит фраз в день — getCountFromServer вместо getDocs
//  4) Любая запись (add/update/delete) сразу патчит кэш — повторное чтение не нужно
import { initializeApp } from 'firebase/app';
import {
    getFirestore, collection, query, where, getDocs, getCountFromServer,
    updateDoc, deleteDoc, doc, writeBatch
} from 'firebase/firestore';

const app = initializeApp(window.firebaseConfig);
export const db = getFirestore(app); // 👈 экспортируем, чтобы другие файлы не создавали своё подключение

// ==================== КЭШ ====================
const LS_PREFIX = 'myword_cache_v1:';
export const TODAY_TTL_MS = 10 * 60 * 1000;   // список «на сегодня» (дешёвый запрос) — 10 минут
export const FULL_TTL_MS  = 60 * 60 * 1000;   // полные коллекции cards/phrases — 60 минут
                                              // (записи патчат кэш сами, TTL нужен только против правок с другого устройства)
const DUE_KEY = 'cards_due';                  // отдельный кэш: только карточки, которым пора повторяться

const memCache = new Map();   // name -> { ts, docs, day? }
const inflight = new Map();   // name -> Promise (чтобы два вызова одновременно не читали дважды)
const dirty = new Set();      // какие ключи надо сбросить в localStorage
let persistTimer = null;

// --- Firestore Timestamp / Date -> ISO-строка (иначе JSON.stringify ломает Timestamp) ---
function normalizeValue(v) {
    if (v && typeof v.toDate === 'function') v = v.toDate();
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString();
    return v;
}
function normalizeFields(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = normalizeValue(v);
    return out;
}
function normalizeDoc(id, data) { return { id, ...normalizeFields(data) }; }

function toJsDate(v) { return v && v.toDate ? v.toDate() : new Date(v); }

function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}
function dayKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// --- localStorage ---
function readLS(name) {
    try {
        const raw = localStorage.getItem(LS_PREFIX + name);
        if (!raw) return null;
        const e = JSON.parse(raw);
        return e && Array.isArray(e.docs) && typeof e.ts === 'number' ? e : null;
    } catch { return null; }
}
function flushPersist() {
    clearTimeout(persistTimer);
    persistTimer = null;
    for (const name of dirty) {
        const e = memCache.get(name);
        try {
            if (e) localStorage.setItem(LS_PREFIX + name, JSON.stringify(e));
        } catch (err) {
            console.warn('⚠️ localStorage переполнен, кэш хранится только в памяти', err);
        }
    }
    dirty.clear();
}
function schedulePersist(name) {
    dirty.add(name);
    clearTimeout(persistTimer);
    persistTimer = setTimeout(flushPersist, 200); // дебаунс: 50 правок подряд = 1 запись в localStorage
}
// Не теряем несохранённые правки кэша при закрытии вкладки
if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('pagehide', flushPersist);
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') flushPersist();
        });
    }
}

function getEntry(name) {
    let e = memCache.get(name);
    if (!e) {
        e = readLS(name);
        if (e) memCache.set(name, e);
    }
    return e || null;
}
// Запись кэша, если она моложе ttl
function freshEntry(name, ttl) {
    const e = getEntry(name);
    if (!e) return null;
    const age = Date.now() - e.ts;
    return (age >= 0 && age < ttl) ? e : null;
}
function saveEntry(name, entry) {
    memCache.set(name, entry);
    schedulePersist(name);
}
function dropEntry(name) {
    memCache.delete(name);
    dirty.delete(name);
    try { localStorage.removeItem(LS_PREFIX + name); } catch {}
}

// Ручное обновление кэша после записи (без повторного чтения из Firestore)
function mutate(name, fn) {
    const e = getEntry(name);
    if (!e) return; // кэша нет — нечего патчить, следующее чтение подтянет с сервера
    e.docs = fn(e.docs);
    schedulePersist(name); // ts не трогаем: возраст данных остаётся прежним
}
function patchEntries(names, id, updates) {
    const fields = normalizeFields(updates);
    names.forEach(n => mutate(n, docs => docs.map(d => d.id === id ? { ...d, ...fields } : d)));
}
function removeFromEntries(names, ids) {
    const set = new Set(ids);
    names.forEach(n => mutate(n, docs => docs.filter(d => !set.has(d.id))));
}
function appendToEntry(name, newDocs) {
    mutate(name, docs => docs.concat(newDocs));
}

// 🔥 Главная функция: вся коллекция из кэша, максимум 1 getDocs за TTL
export async function getCollectionCached(name, { force = false, ttl = FULL_TTL_MS } = {}) {
    if (!force) {
        const fresh = freshEntry(name, ttl);
        if (fresh) return fresh.docs.slice();
    }
    if (inflight.has(name)) return (await inflight.get(name)).slice(); // уже читается — ждём тот же запрос

    const stale = getEntry(name); // устаревший кэш пригодится как запасной вариант
    const p = (async () => {
        try {
            const snap = await getDocs(collection(db, name));
            const docs = [];
            snap.forEach(d => docs.push(normalizeDoc(d.id, d.data())));

            // 🛡 Квота исчерпана → Firestore отдаёт 0 документов. Не затираем нормальный кэш пустотой.
            if (docs.length === 0 && stale && stale.docs.length > 0) {
                console.warn(`⚠️ ${name}: сервер вернул 0 документов, оставляю старый кэш`);
                return stale.docs;
            }
            // Пустой результат считаем «свежим» только 1 минуту (чтобы быстро перечитать, если это сбой)
            const ts = docs.length === 0 ? Date.now() - ttl + 60 * 1000 : Date.now();
            saveEntry(name, { ts, docs });
            return docs;
        } catch (err) {
            console.error(`❌ Ошибка чтения ${name}:`, err);
            if (stale) return stale.docs; // при ошибке (квота и т.п.) показываем старые данные
            throw err;
        }
    })().finally(() => inflight.delete(name));

    inflight.set(name, p);
    return (await p).slice();
}

export const getAllCards = (opts) => getCollectionCached('cards', opts);

// Принудительно перечитать всё (например, если правил данные с другого устройства)
export async function forceRefresh() {
    dropEntry(DUE_KEY);
    await Promise.all([
        getCollectionCached('cards', { force: true }),
        getCollectionCached('phrases', { force: true })
    ]);
}
// Полностью очистить кэш (можно вызвать из консоли: clearMyWordCache())
export function clearCache() {
    memCache.clear();
    dirty.clear();
    try {
        Object.keys(localStorage)
            .filter(k => k.startsWith(LS_PREFIX))
            .forEach(k => localStorage.removeItem(k));
    } catch {}
}
if (typeof window !== 'undefined') {
    window.clearMyWordCache = clearCache;
    window.refreshMyWordData = forceRefresh;
}

// ===== ДАТА =====
export function formatDate(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${day}.${month}.${year}:${hours}.${minutes}.${seconds}`;
}

// ==================== СЛОВА ====================
// 🔤 Парсер новой строки: "English phrase — Русская фраза — english word — перевод слова"
// Возвращает { ok:true, data } или { ok:false, error, line, lineNum }
export function parseCardLine(line, lineNum) {
    const raw = String(line || '').trim();
    if (!raw) return { ok: false, error: 'Пустая строка', line: raw, lineNum };

    // Разделитель — длинное тире или дефис с пробелами (чтобы не ломать слова с дефисом)
    const parts = raw.includes('—')
        ? raw.split('—').map(p => p.trim())
        : raw.split(/\s+-\s+/).map(p => p.trim());

    if (parts.length < 4) {
        return {
            ok: false,
            error: `Нужно 4 части (фраза EN — фраза RU — слово EN — перевод RU), найдено ${parts.length}`,
            line: raw,
            lineNum
        };
    }

    const [phraseEn, phraseRu, word, translation] = parts;

    if (!phraseEn) return { ok: false, error: 'Пустая английская фраза', line: raw, lineNum };
    if (!phraseRu) return { ok: false, error: 'Пустой перевод фразы', line: raw, lineNum };
    if (!word) return { ok: false, error: 'Пустое английское слово', line: raw, lineNum };
    if (!translation) return { ok: false, error: 'Пустой перевод слова', line: raw, lineNum };

    // Мягкая валидация: фраза EN должна содержать латиницу, фраза RU — кириллицу
    if (!/[a-zA-Z]/.test(phraseEn)) {
        return { ok: false, error: 'Английская фраза должна содержать латинские буквы', line: raw, lineNum };
    }
    if (!/[а-яА-ЯёЁ]/.test(phraseRu)) {
        return { ok: false, error: 'Перевод фразы должен содержать кириллицу', line: raw, lineNum };
    }
    if (!/[a-zA-Z]/.test(word)) {
        return { ok: false, error: 'Английское слово должно содержать латинские буквы', line: raw, lineNum };
    }
    if (!/[а-яА-ЯёЁ]/.test(translation)) {
        return { ok: false, error: 'Перевод слова должен содержать кириллицу', line: raw, lineNum };
    }

    return { ok: true, data: { phraseEn, phraseRu, word, translation } };
}

// 🔍 Разбор всего текста: возвращает { valid: [...], invalid: [...] }
export function parseCardText(rawText) {
    const lines = String(rawText || '').split(/\r?\n/);
    const valid = [];
    const invalid = [];
    lines.forEach((line, i) => {
        if (!line.trim()) return;
        const res = parseCardLine(line, i + 1);
        if (res.ok) valid.push({ ...res.data, lineNum: res.lineNum, raw: line });
        else invalid.push(res);
    });
    return { valid, invalid };
}

export async function createDictionary(name, rawText, intervalDays, sources, links, customDate, options = {}) {
    const { skipDuplicates = true } = options;

    const { valid, invalid } = parseCardText(rawText);
    if (invalid.length > 0) {
        const msg = invalid.map(e => `Строка ${e.lineNum}: ${e.error}`).join('\n');
        throw new Error('Ошибки в формате:\n' + msg);
    }
    if (valid.length === 0) {
        throw new Error('Нет валидных строк для добавления');
    }

    // 🔍 Проверка дублей — из кэша (0 чтений, если кэш свежий)
    const existingCards = await getCollectionCached('cards');
    const existingKeys = new Set();
    existingCards.forEach(d => {
        existingKeys.add(`${d.dictionaryName}||${(d.word || '').toLowerCase()}`);
    });

    const now = new Date();
    let baseDate = now;
    if (customDate) {
        const parts = customDate.split('-');
        if (parts.length === 3) {
            baseDate = new Date(`${parts[0]}-${parts[1]}-${parts[2]}T00:00:00`);
        }
    }
    const nextDate = new Date(baseDate);
    nextDate.setDate(nextDate.getDate() + intervalDays);
    nextDate.setHours(0, 0, 0, 0);

    const cards = [];
    const skipped = [];

    for (const v of valid) {
        const wordKey = `${name}||${v.word.toLowerCase()}`;
        if (skipDuplicates && existingKeys.has(wordKey)) {
            skipped.push({ ...v, reason: 'Дубль' });
            continue;
        }
        if (skipDuplicates) existingKeys.add(wordKey);

        cards.push({
            // 🆕 новые поля
            phraseEn: v.phraseEn,
            phraseRu: v.phraseRu,
            word: v.word,
            translation: v.translation,
            // 🔙 обратная совместимость: старое поле phrase = English phrase
            phrase: v.phraseEn,
            // служебные
            createdAt: formatDate(baseDate),
            nextReviewDate: nextDate,
            interval: intervalDays,
            status: 'active',
            dictionaryName: name,
            createdAtRaw: baseDate,
            sources: sources || [],
            links: links || []
        });
    }

    if (cards.length === 0) {
        return { created: 0, skipped: skipped.length, invalid: 0, skippedItems: skipped };
    }

    const batch = writeBatch(db);
    const refs = cards.map(card => {
        const ref = doc(collection(db, 'cards'));
        batch.set(ref, card);
        return ref;
    });
    await batch.commit();

    appendToEntry('cards', cards.map((c, i) => normalizeDoc(refs[i].id, c)));
    dropEntry(DUE_KEY);

    return {
        created: cards.length,
        skipped: skipped.length,
        invalid: 0,
        skippedItems: skipped
    };
}

export async function getTodayCards() {
    const today = startOfToday();
    // Готовим карточки: nextReviewDate снова превращаем в Date (как было в v3.0) и фильтруем «пора повторять»
    const toDue = docs => docs
        .map(d => ({ ...d, nextReviewDate: toJsDate(d.nextReviewDate) }))
        .filter(d => d.status === 'active' && d.nextReviewDate <= today);

    // 1) Полный кэш свежий → фильтруем локально, 0 чтений
    const full = freshEntry('cards', FULL_TTL_MS);
    if (full) return toDue(full.docs);

    // 2) Кэш «на сегодня» свежий и это тот же день → отдаём его, 0 чтений
    const due = freshEntry(DUE_KEY, TODAY_TTL_MS);
    if (due && due.day === dayKey(today)) return toDue(due.docs);

    // 3) Иначе ОДИН запрос с фильтром на сервере: читаем только карточки, которым пора повторяться
    //    ⚠️ Нужен составной индекс cards: status (Asc) + nextReviewDate (Asc) — ссылка на его создание появится в консоли
    try {
        const q = query(
            collection(db, 'cards'),
            where('status', '==', 'active'),
            where('nextReviewDate', '<=', today)
        );
        const snap = await getDocs(q);
        const docs = [];
        snap.forEach(d => docs.push(normalizeDoc(d.id, d.data())));
        // Пустой результат не кэшируем (при исчерпанной квоте он тоже пустой — не хотим застрять на «нет слов»)
        if (docs.length > 0) saveEntry(DUE_KEY, { ts: Date.now(), day: dayKey(today), docs });
        return toDue(docs);
    } catch (err) {
        console.warn('⚠️ Запрос «на сегодня» не удался (нет индекса или квота) — читаю через полный кэш', err);
        return toDue(await getCollectionCached('cards'));
    }
}

export async function deleteCardForever(cardId) {
    await deleteDoc(doc(db, 'cards', cardId));
    removeFromEntries(['cards', DUE_KEY], [cardId]);
}

export async function postponeCard(cardId, currentIntervalDays) {
    const newDate = new Date();
    newDate.setDate(newDate.getDate() + currentIntervalDays);
    newDate.setHours(0, 0, 0, 0);
    await updateDoc(doc(db, 'cards', cardId), { nextReviewDate: newDate });
    // ✍️ Кэш: новая дата в полном списке; из списка «на сегодня» карточка уходит
    patchEntries(['cards'], cardId, { nextReviewDate: newDate });
    removeFromEntries([DUE_KEY], [cardId]);
}

// 🆕 Отметить как выученное (раньше это делал app.js напрямую через updateDoc)
export async function markCardLearned(cardId) {
    const learnedAt = new Date();
    await updateDoc(doc(db, 'cards', cardId), { status: 'finished', learnedAt });
    patchEntries(['cards'], cardId, { status: 'finished', learnedAt });
    removeFromEntries([DUE_KEY], [cardId]);
}

export async function getAllDictionaries() {
    const cards = await getCollectionCached('cards'); // из кэша
    const dictMap = new Map();
    cards.forEach(data => {
        const name = data.dictionaryName;
        if (!dictMap.has(name)) dictMap.set(name, []);
        dictMap.get(name).push(data);
    });
    return dictMap;
}

export async function updateCard(cardId, updates) {
    await updateDoc(doc(db, 'cards', cardId), updates);
    patchEntries(['cards', DUE_KEY], cardId, updates);
}

export async function deleteCard(cardId) {
    await deleteDoc(doc(db, 'cards', cardId));
    removeFromEntries(['cards', DUE_KEY], [cardId]);
}

// 🆕 Массовое обновление карточек (Library «Save All»): один batch + одно обновление кэша
export async function updateCardsBatch(updates) {
    // updates: [{ id, fields: { word, translation, phraseEn, phraseRu, ... } }]
    if (!updates || updates.length === 0) return 0;

    for (let i = 0; i < updates.length; i += 500) {
        const batch = writeBatch(db);
        updates.slice(i, i + 500).forEach(({ id, fields }) => {
            batch.update(doc(db, 'cards', id), fields);
        });
        await batch.commit();
    }

    // ✍️ Одно обновление кэша на всю пачку
    updates.forEach(({ id, fields }) => {
        patchEntries(['cards', DUE_KEY], id, fields);
    });

    return updates.length;
}

// 🆕 Массовое удаление (для Duplicate Analyzer): один batch + одно обновление кэша
export async function deleteDocsBatch(items) { // items: [{ coll: 'cards' | 'phrases', id }]
    for (let i = 0; i < items.length; i += 500) { // лимит batch — 500 операций
        const batch = writeBatch(db);
        items.slice(i, i + 500).forEach(({ coll, id }) => batch.delete(doc(db, coll, id)));
        await batch.commit();
    }
    const cardIds = items.filter(x => x.coll === 'cards').map(x => x.id);
    const phraseIds = items.filter(x => x.coll === 'phrases').map(x => x.id);
    if (cardIds.length) removeFromEntries(['cards', DUE_KEY], cardIds);
    if (phraseIds.length) removeFromEntries(['phrases'], phraseIds);
}

// ==================== ФРАЗЫ (v3.0) ====================
// Сколько фраз создано сегодня. Раньше читались ВСЕ фразы, теперь — getCountFromServer (≈1 чтение)
export async function getTodayPhrasesCount() {
    const today = startOfToday();
    try {
        const q = query(collection(db, 'phrases'), where('createdAtRaw', '>=', today));
        const snap = await getCountFromServer(q);
        return snap.data().count;
    } catch (err) {
        console.warn('⚠️ count-запрос не удался, считаю по кэшу', err);
        const all = await getCollectionCached('phrases');
        return all.filter(p => toJsDate(p.createdAtRaw) >= today).length;
    }
}

export async function createPhrases(rawText, intervalDays, sources, links, customDate) {
    // 🚀 v3.7: дневной лимит в 3 фразы убран — создаём все валидные строки без ограничения

    // 🔍 Проверяем дубли — из кэша
    const existingPhrases = await getCollectionCached('phrases');
    const existingKeys = new Set();
    existingPhrases.forEach(d => {
        existingKeys.add(`${(d.english || '').toLowerCase()}||${(d.russian || '').toLowerCase()}`);
    });

    const lines = rawText.split(/\r?\n/).filter(l => l.trim() && (l.includes('—') || l.includes('-')));
    const phrases = [];
    const now = new Date();

    // Кастомная дата
    let baseDate = now;
    if (customDate) {
        const parts = customDate.split('-');
        if (parts.length === 3) {
            baseDate = new Date(`${parts[0]}-${parts[1]}-${parts[2]}T00:00:00`);
        }
    }

    const nextDate = new Date(baseDate);
    nextDate.setDate(nextDate.getDate() + intervalDays);
    nextDate.setHours(0, 0, 0, 0);

    for (let line of lines) {
        const parts = line.includes('—') ? line.split('—').map(p => p.trim()) : line.split('-').map(p => p.trim());
        if (parts.length >= 2) {
            const key = `${parts[0].toLowerCase()}||${parts[1].toLowerCase()}`;
            // 🚫 Пропускаем дубли
            if (existingKeys.has(key)) continue;
            existingKeys.add(key);

            phrases.push({
                english: parts[0],
                russian: parts[1],
                createdAt: formatDate(baseDate),
                nextReviewDate: nextDate,
                interval: intervalDays,
                status: 'active',
                createdAtRaw: baseDate,
                sources: sources || [],
                links: links || []
            });
        }
    }

    if (phrases.length > 0) {
        const batch = writeBatch(db);
        const refs = phrases.map(phrase => {
            const ref = doc(collection(db, 'phrases'));
            batch.set(ref, phrase);
            return ref;
        });
        await batch.commit();
        // ✍️ Обновляем кэш вручную
        appendToEntry('phrases', phrases.map((p, i) => normalizeDoc(refs[i].id, p)));
    }
    return {
        created: phrases.length,
        skipped: lines.length - phrases.length
    };
}

export async function getTodayPhrases() {
    const today = startOfToday();
    // Фраз мало (≤3 в день) — фильтруем локально по общему кэшу фраз
    const all = await getCollectionCached('phrases');
    return all
        .map(d => ({ ...d, nextReviewDate: toJsDate(d.nextReviewDate) }))
        .filter(d => d.status === 'active' && d.nextReviewDate <= today);
}

export async function getAllPhrases() {
    return getCollectionCached('phrases');
}

export async function updatePhrase(phraseId, updates) {
    await updateDoc(doc(db, 'phrases', phraseId), updates);
    patchEntries(['phrases'], phraseId, updates);
}

export async function deletePhrase(phraseId) {
    await deleteDoc(doc(db, 'phrases', phraseId));
    removeFromEntries(['phrases'], [phraseId]);
}

export async function markPhraseAsLearned(phraseId) {
    await deletePhrase(phraseId);
}

export async function postponePhrase(phraseId, days) {
    const newDate = new Date();
    newDate.setDate(newDate.getDate() + days);
    newDate.setHours(0, 0, 0, 0);
    await updateDoc(doc(db, 'phrases', phraseId), { nextReviewDate: newDate });
    patchEntries(['phrases'], phraseId, { nextReviewDate: newDate });
}

// ==================== АНАЛИТИКА ====================
// Числовые метрики. Кэш есть → считаем локально (0 чтений). Кэша нет → 3 count-запроса (~3 чтения вместо N).
// totalDicts посчитать count-запросом нельзя (нужны уникальные имена), поэтому берём из кэша или null.
export async function getAnalyticsData() {
    const cached = freshEntry('cards', FULL_TTL_MS) || getEntry('cards');
    const totalDicts = cached ? new Set(cached.docs.map(c => c.dictionaryName)).size : null;

    const fresh = freshEntry('cards', FULL_TTL_MS);
    if (fresh) {
        const allCards = fresh.docs;
        return {
            totalDicts,
            totalWords: allCards.length,
            learnedWords: allCards.filter(c => c.status === 'finished').length,
            remainingWords: allCards.filter(c => c.status === 'active').length
        };
    }

    const col = collection(db, 'cards');
    const [total, finished, active] = await Promise.all([
        getCountFromServer(col),
        getCountFromServer(query(col, where('status', '==', 'finished'))),
        getCountFromServer(query(col, where('status', '==', 'active')))
    ]);
    return {
        totalDicts,
        totalWords: total.data().count,
        learnedWords: finished.data().count,
        remainingWords: active.data().count
    };
}