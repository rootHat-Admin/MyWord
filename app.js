// app.js - ПОЛНОСТЬЮ ОБНОВЛЁННЫЙ ФАЙЛ С РЕЖИМОМ ОБУЧЕНИЯ + FORECAST
import { 
    createDictionary, getTodayCards, deleteCardForever, postponeCard, 
    getAllDictionaries, updateCard, deleteCard, formatDate,
    getAnalyticsData,
    markCardLearned, getAllCards, getAllPhrases, deleteDocsBatch,
    parseCardText,
    updateCardsBatch
} from './db.js';
// DOM элементы
const screens = {
    create: document.getElementById('createScreen'),
    today: document.getElementById('todayScreen'),
    dictionaries: document.getElementById('librariesScreen'),
    analytics: document.getElementById('analyticsScreen')
};
const navBtns = document.querySelectorAll('[data-nav]');

// Переключение экранов
function showScreen(screenName) {
    Object.keys(screens).forEach(key => {
        screens[key].classList.add('hidden');
    });
    screens[screenName].classList.remove('hidden');
    navBtns.forEach(btn => {
        const isActive = btn.dataset.nav === screenName;
        btn.className = `nav-btn flex-1 py-3 rounded-xl font-semibold transition ${isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-[#2a2a4a] text-gray-300 hover:bg-[#3a3a5a]'}`;
    });
    if (screenName === 'today') loadToday();
    if (screenName === 'dictionaries') loadDictionaries();
    if (screenName === 'analytics') loadAnalytics();
}

function escapeHtml(str) { 
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function(m){
        if(m==='&') return '&amp;'; 
        if(m==='<') return '&lt;'; 
        if(m==='>') return '&gt;'; 
        return m;
    }); 
}

function esc(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
}

// ===== ФУНКЦИЯ КОПИРОВАНИЯ =====
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            document.body.removeChild(textarea);
            return true;
        } catch (e) {
            document.body.removeChild(textarea);
            return false;
        }
    }
}

function formatFutureDate(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
}

// ===== ФУНКЦИЯ: ОТМЕТИТЬ КАК ВЫУЧЕННОЕ =====
async function markCardAsLearned(cardId) {
    try {
        await markCardLearned(cardId);
        console.log(`✅ Card ${cardId} marked as learned`);
        return true;
    } catch (error) {
        console.error('❌ Error marking as learned:', error);
        throw error;
    }
}

// ===== МОДАЛЬНОЕ ОКНО =====
function showTextModal(title, text, icon = '📖') {
    const oldModal = document.getElementById('textModal');
    if (oldModal) oldModal.remove();
    
    const modal = document.createElement('div');
    modal.id = 'textModal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-[#1a1a2e] rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#2a2a4a]">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-bold text-indigo-400">${icon} ${escapeHtml(title)}</h3>
                <button class="close-modal text-gray-400 hover:text-gray-200 text-2xl leading-none transition">&times;</button>
            </div>
            <div class="bg-[#0f0f1a] rounded-xl p-5 border border-[#2a2a4a] max-h-96 overflow-y-auto">
                <p class="text-base text-gray-200 font-medium text-center break-words whitespace-pre-wrap">${escapeHtml(text)}</p>
            </div>
            <button class="close-modal w-full mt-4 bg-[#2a2a4a] hover:bg-[#3a3a5a] text-gray-300 font-bold py-2 rounded-lg transition border border-[#3a3a5a]">Close</button>
        </div>
    `;
    document.body.appendChild(modal);
    
    modal.addEventListener('click', function(e) {
        if (e.target === this) this.remove();
    });
    modal.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => modal.remove());
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const m = document.getElementById('textModal');
            if (m) m.remove();
        }
    });
}

// ===== МОДАЛЬНОЕ ОКНО ДЛЯ ССЫЛОК =====
function showLinksModal(links) {
    const oldModal = document.getElementById('linksPreviewModal');
    if (oldModal) oldModal.remove();
    
    const modal = document.createElement('div');
    modal.id = 'linksPreviewModal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm';
    
    let linksHtml = links.map((link, index) => `
        <div class="flex items-center gap-3 p-3 bg-[#0f0f1a] rounded-lg border border-[#2a2a4a] hover:border-indigo-500 transition">
            <span class="text-indigo-400 font-bold text-sm">#${index + 1}</span>
            <a href="${escapeHtml(link)}" target="_blank" class="text-indigo-400 hover:text-indigo-300 text-sm truncate flex-1">${escapeHtml(link)}</a>
            <button class="copy-link-btn text-gray-400 hover:text-white transition" data-link="${escapeHtml(link)}">📋</button>
        </div>
    `).join('');
    
    modal.innerHTML = `
        <div class="bg-[#1a1a2e] rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-[#2a2a4a]">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-bold text-indigo-400">🔗 Source Links (${links.length})</h3>
                <button class="close-modal text-gray-400 hover:text-gray-200 text-2xl leading-none transition">&times;</button>
            </div>
            <div class="space-y-2 max-h-80 overflow-y-auto">
                ${linksHtml}
            </div>
            <button class="close-modal w-full mt-4 bg-[#2a2a4a] hover:bg-[#3a3a5a] text-gray-300 font-bold py-2 rounded-lg transition border border-[#3a3a5a]">Close</button>
        </div>
    `;
    document.body.appendChild(modal);
    
    modal.addEventListener('click', function(e) {
        if (e.target === this) this.remove();
    });
    modal.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => modal.remove());
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const m = document.getElementById('linksPreviewModal');
            if (m) m.remove();
        }
    });
    
    modal.querySelectorAll('.copy-link-btn').forEach(btn => {
        btn.addEventListener('click', async function(e) {
            e.stopPropagation();
            const link = this.dataset.link;
            const success = await copyToClipboard(link);
            if (success) {
                const original = this.textContent;
                this.textContent = '✅';
                setTimeout(() => {
                    this.textContent = original;
                }, 1500);
            }
        });
    });
}

// ===== ДЛЯ СОЗДАНИЯ СЛОВАРЯ =====
function setCurrentDate() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${year}-${month}-${day}`;
}

document.getElementById('createDate').value = setCurrentDate();

// 📌 Автозаполнение имени словаря сегодняшней датой
(function autoFillDictName() {
    const nameInput = document.getElementById('dictName');
    if (nameInput && !nameInput.value.trim()) {
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        nameInput.value = `${day}.${month}.${year}`;
    }
})();

// Выбор источников
const selectedSources = new Set();

document.querySelectorAll('.source-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const source = this.dataset.source;
        if (selectedSources.has(source)) {
            selectedSources.delete(source);
            this.classList.remove('bg-indigo-500', 'text-white');
            this.classList.add('bg-[#2a2a4a]', 'text-gray-300');
        } else {
            selectedSources.add(source);
            this.classList.remove('bg-[#2a2a4a]', 'text-gray-300');
            this.classList.add('bg-indigo-500', 'text-white');
        }
        renderSelectedSources();
    });
});

function renderSelectedSources() {
    const container = document.getElementById('selectedSources');
    const labels = {
        'ai': '🤖 AI',
        'youtube': '▶️ YouTube',
        'website': '🌐 Website',
        'article': '📄 Article',
        'film': '🎬 Film',
        'game': '🎮 Game',
        'self': '✏️ Self',
        'practice': '🎯 In practice',
        'social': '📱 Social media',
        'book': '📖 Book',
        'other': '📌 Other'
    };
    container.innerHTML = Array.from(selectedSources).map(s => 
        `<span class="bg-indigo-600/30 text-indigo-300 px-2 py-0.5 rounded-full text-xs border border-indigo-500/30">${labels[s]}</span>`
    ).join('');
}

// Модальное окно для ссылок
let savedLinks = [];

document.getElementById('addLinksBtn').addEventListener('click', function() {
    document.getElementById('linksModal').classList.remove('hidden');
    const container = document.getElementById('linksContainer');
    container.innerHTML = '';
    if (savedLinks.length === 0) {
        addLinkField('');
    } else {
        savedLinks.forEach(link => addLinkField(link));
    }
});

document.getElementById('closeLinksModal').addEventListener('click', function() {
    document.getElementById('linksModal').classList.add('hidden');
});

document.getElementById('linksModal').addEventListener('click', function(e) {
    if (e.target === this) this.classList.add('hidden');
});

document.getElementById('addLinkBtn').addEventListener('click', function() {
    addLinkField('');
});

document.getElementById('saveLinksBtn').addEventListener('click', function() {
    const inputs = document.querySelectorAll('.link-input');
    savedLinks = [];
    inputs.forEach(inp => {
        const val = inp.value.trim();
        if (val) savedLinks.push(val);
    });
    document.getElementById('linksModal').classList.add('hidden');
    alert(`✅ Saved ${savedLinks.length} links`);
});

function addLinkField(value) {
    const container = document.getElementById('linksContainer');
    const div = document.createElement('div');
    div.className = 'flex gap-2';
    div.innerHTML = `
        <input type="url" class="link-input w-full border border-[#2a2a4a] rounded-lg p-2 text-sm bg-[#0f0f1a] text-gray-200 placeholder-gray-500 focus:border-indigo-500 transition" placeholder="https://..." value="${escapeHtml(value)}">
        <button class="remove-link-btn text-red-400 hover:text-red-300 text-xl leading-none transition">&times;</button>
    `;
    container.appendChild(div);
    
    div.querySelector('.remove-link-btn').addEventListener('click', function() {
        div.remove();
    });
}

// ===== 📋 PROMPT ДЛЯ ИИ =====
const AI_PROMPT = `You generate ready-to-paste lines for my SRS flashcard app.

STRICT OUTPUT FORMAT — one line per card, 4 parts separated by " — " (space, em dash, space):
English phrase — Russian translation of the phrase — English word — Russian translation of the word

Rules:
- English phrase: natural sentence containing the word.
- Russian translation: accurate translation of the phrase.
- English word: a single word (or very short collocation) from the phrase.
- Russian translation of the word: accurate.
- NO extra text, NO numbering, NO explanations, NO quotes, NO markdown.
- 1 line = 1 card.
- Keep the exact order: phrase EN, phrase RU, word EN, word RU.

My words / topics:
[ВСТАВЬ СЮДА СВОИ СЛОВА ИЛИ ТЕМЫ ЧЕРЕЗ ЗАПЯТУЮ]

Example of a correct line:
I need to book a table for two — Мне нужно забронировать столик на двоих — book — бронировать`;

document.addEventListener('DOMContentLoaded', () => {
    const copyPromptBtn = document.getElementById('copyPromptBtn');
    if (copyPromptBtn) {
        copyPromptBtn.addEventListener('click', async () => {
            const ok = await copyToClipboard(AI_PROMPT);
            if (ok) showToast('AI prompt copied — вставь в ChatGPT/Claude', 'success');
            else showToast('Failed to copy', 'error');
        });
    }
});

// ===== РЕЖИМ ОБУЧЕНИЯ "LEARN" =====
function startLearnMode(dictName, cards, allCardsPool) {
    const existingModal = document.getElementById('learnModal');
    if (existingModal) existingModal.remove();
    
    const modal = document.createElement('div');
    modal.id = 'learnModal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md';
    
    const state = {
        cards: cards.map(c => ({ ...c, correct: false })),
        currentIndex: 0,
        totalCards: cards.length,
        completed: 0,
        wrongAnswers: 0,
        currentMode: 'choice',
        isLocked: false,
        history: [],
        answered: false,
        isEnglishToRussian: true 
    };
    
    shuffleArray(state.cards);
    
    modal.innerHTML = `
        <div class="bg-[#1a1a2e] rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-[#2a2a4a] relative max-h-[90vh] overflow-y-auto">
            <button id="closeLearnModal" class="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl transition w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#2a2a4a]">✕</button>
            
            <div class="mb-4">
                <h3 class="text-xl font-bold text-indigo-400">🎮 Learning: ${escapeHtml(dictName)}</h3>
                <div class="flex justify-between items-center text-sm text-gray-400 mt-1">
                    <span>📝 <span id="progressText">0/${state.totalCards}</span></span>
                    <span>✅ Correct: <span id="correctCount">0</span></span>
                    <span>❌ Mistakes: <span id="wrongCount">0</span></span>
                </div>
                <div class="w-full bg-[#2a2a4a] rounded-full h-2 mt-2 overflow-hidden">
                    <div id="progressBarLearn" class="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
                </div>
            </div>
            
            <div id="cardContainer" class="bg-[#0f0f1a] rounded-xl p-6 border border-[#2a2a4a] min-h-[200px] flex flex-col items-center justify-center">
            </div>
            
            <div class="flex justify-between items-center mt-4 gap-3">
                <button id="backBtn" class="bg-[#2a2a4a] hover:bg-[#3a3a5a] text-gray-300 font-bold py-2 px-4 rounded-xl transition border border-[#3a3a5a] disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                    ⬅️ Back
                </button>
                <span id="modeIndicator" class="text-xs text-gray-500">🎯 Multiple Choice</span>
                <button id="nextBtn" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-xl transition shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                    Next ➡️
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById('closeLearnModal').addEventListener('click', function() {
        if (confirm('Are you sure you want to quit learning? Progress will be lost.')) {
            modal.remove();
        }
    });
    
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            if (confirm('Are you sure you want to quit learning? Progress will be lost.')) {
                modal.remove();
            }
        }
    });
    
    const escHandler = function(e) {
        if (e.key === 'Escape') {
            if (confirm('Are you sure you want to quit learning? Progress will be lost.')) {
                modal.remove();
                document.removeEventListener('keydown', escHandler);
            }
        }
    };
    document.addEventListener('keydown', escHandler);
    
    const backBtn = document.getElementById('backBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    function updateNavButtons() {
        backBtn.disabled = state.history.length === 0;
        nextBtn.disabled = !state.answered;
    }
    
    function goBack() {
        if (state.history.length === 0) return;
        const prevState = state.history.pop();
        
        const cardIndex = prevState.cardIndex;
        const wasCorrect = state.cards[cardIndex].correct;
        
        if (wasCorrect) {
            state.cards[cardIndex].correct = false;
        }
        
        state.currentIndex = cardIndex;
        state.answered = false;
        state.isLocked = false;
        
        updateProgress();
        renderCard();
        updateNavButtons();
    }
    
    function goNext() {
        if (!state.answered) return;
        
        state.history.push({
            cardIndex: state.currentIndex
        });
        
        let nextIndex = state.currentIndex + 1;
        while (nextIndex < state.cards.length && state.cards[nextIndex].correct) {
            nextIndex++;
        }
        if (nextIndex >= state.cards.length) {
            nextIndex = 0;
            while (nextIndex < state.cards.length && state.cards[nextIndex].correct) {
                nextIndex++;
            }
        }
        
        state.currentIndex = nextIndex;
        state.answered = false;
        state.isLocked = false;
        
        updateProgress();
        renderCard();
        updateNavButtons();
    }
    
    backBtn.addEventListener('click', goBack);
    nextBtn.addEventListener('click', goNext);
    
    function normalizeString(str) {
        if (!str) return '';
        return String(str)
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/[.,!?;:'"()\[\]{}]/g, '');
    }
    
    function isAnswerCorrect(userAnswer, correctAnswer) {
        const normalizedUser = normalizeString(userAnswer);
        const normalizedCorrect = normalizeString(correctAnswer);
        
        if (normalizedUser === normalizedCorrect) return true;
        
        const userWords = normalizedUser.split(/\s*[\/,;]\s*|\s+/);
        const correctWords = normalizedCorrect.split(/\s*[\/,;]\s*|\s+/);
        
        for (const correct of correctWords) {
            if (correct === normalizedUser) return true;
        }
        
        const userSet = new Set(userWords);
        const correctSet = new Set(correctWords);
        
        for (const word of correctSet) {
            if (word.length > 2 && userSet.has(word)) return true;
        }
        
        return false;
    }
    
    function updateProgress() {
        const completed = state.cards.filter(c => c.correct).length;
        const total = state.cards.length;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        document.getElementById('progressText').textContent = `${completed}/${total}`;
        document.getElementById('progressBarLearn').style.width = pct + '%';
        document.getElementById('correctCount').textContent = state.cards.filter(c => c.correct).length;
        document.getElementById('wrongCount').textContent = state.wrongAnswers;
    }
    
    function shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
    
    function getFakeAnswers(correctAnswer, count = 3, isEnglish) {
        let pool;
        if (isEnglish) {
            pool = allCardsPool.filter(w => w !== correctAnswer && w && w !== '—' && w !== 'undefined');
        } else {
            pool = allCardsPool.map(c => {
                const card = cards.find(cc => cc.word === c);
                return card ? card.translation : c;
            }).filter(w => w !== correctAnswer && w && w !== '—' && w !== 'undefined');
        }
        shuffleArray(pool);
        return pool.slice(0, count);
    }
    
    function checkCompletion() {
        const allCorrect = state.cards.every(c => c.correct);
        if (allCorrect && state.cards.length > 0) {
            showVictoryScreen();
            return true;
        }
        return false;
    }
    
    function showVictoryScreen() {
        const container = document.getElementById('cardContainer');
        container.innerHTML = `
            <div class="text-center py-8">
                <div class="text-6xl mb-4">🎉</div>
                <h2 class="text-2xl font-bold text-green-400 mb-2">Congratulations!</h2>
                <p class="text-gray-300 mb-1">You've learned all ${state.totalCards} words!</p>
                <p class="text-sm text-gray-400">Mistakes: ${state.wrongAnswers}</p>
                <button id="finishLearnBtn" class="mt-4 bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-xl transition shadow-lg shadow-green-500/20">
                    ✅ Finish
                </button>
            </div>
        `;
        document.getElementById('finishLearnBtn').addEventListener('click', function() {
            modal.remove();
        });
        document.getElementById('modeIndicator').textContent = '🏆 All done!';
        document.getElementById('backBtn').disabled = true;
        document.getElementById('nextBtn').disabled = true;
    }
    
    function renderCard() {
        if (checkCompletion()) return;
        
        const container = document.getElementById('cardContainer');
        const currentCard = state.cards[state.currentIndex];
        
        state.isEnglishToRussian = Math.random() > 0.5;
        state.currentMode = Math.random() > 0.5 ? 'choice' : 'typing';
        
        const modeText = state.currentMode === 'choice' ? '🎯 Multiple Choice' : '⌨️ Type the answer';
        const directionText = state.isEnglishToRussian ? ' 🇬🇧→🇷🇺' : ' 🇷🇺→🇬🇧';
        document.getElementById('modeIndicator').textContent = modeText + directionText;
        
        if (state.currentMode === 'choice') {
            renderChoiceMode(container, currentCard);
        } else {
            renderTypingMode(container, currentCard);
        }
        
        updateProgress();
        updateNavButtons();
    }
    
    function renderChoiceMode(container, card) {
        let correctDisplay, correctAnswer, options, questionText;
        
        if (state.isEnglishToRussian) {
            correctDisplay = card.word;
            correctAnswer = card.translation;
            questionText = 'Choose the correct translation:';
            const fakes = getFakeAnswers(correctAnswer, 3, false);
            options = [correctAnswer, ...fakes];
        } else {
            correctDisplay = card.translation;
            correctAnswer = card.word;
            questionText = 'Choose the correct English word:';
            const fakes = getFakeAnswers(correctAnswer, 3, true);
            options = [correctAnswer, ...fakes];
        }
        
        shuffleArray(options);
        
        container.innerHTML = `
            <div class="w-full text-center">
                <p class="text-sm text-gray-400 mb-1">${questionText}</p>
                <p class="text-2xl font-bold text-indigo-300 mb-4">${escapeHtml(correctDisplay || '—')}</p>
                <div class="grid grid-cols-2 gap-3 w-full max-w-md mx-auto">
                    ${options.map(opt => `
                        <button class="choice-btn bg-[#2a2a4a] hover:bg-indigo-600 text-gray-200 font-medium py-3 px-4 rounded-xl transition border border-[#3a3a5a] hover:border-indigo-400" data-answer="${escapeHtml(opt)}">
                            ${escapeHtml(opt || '—')}
                        </button>
                    `).join('')}
                </div>
                <div id="answerResult" class="mt-3 text-sm font-bold"></div>
                <p class="text-xs text-gray-500 mt-3">${card.phrase ? '📖 ' + escapeHtml(card.phrase) : ''}</p>
            </div>
        `;
        
        container.querySelectorAll('.choice-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                if (state.isLocked || state.answered) return;
                const selected = this.dataset.answer;
                const isCorrect = isAnswerCorrect(selected, correctAnswer);
                const resultDiv = document.getElementById('answerResult');
                
                state.isLocked = true;
                state.answered = true;
                
                container.querySelectorAll('.choice-btn').forEach(b => {
                    b.disabled = true;
                    if (isAnswerCorrect(b.dataset.answer, correctAnswer)) {
                        b.classList.remove('bg-[#2a2a4a]', 'hover:bg-indigo-600');
                        b.classList.add('bg-green-500', 'hover:bg-green-600');
                    } else if (b === this && !isCorrect) {
                        b.classList.remove('bg-[#2a2a4a]', 'hover:bg-indigo-600');
                        b.classList.add('bg-red-500', 'hover:bg-red-600');
                    }
                });
                
                if (isCorrect) {
                    card.correct = true;
                    resultDiv.innerHTML = '✅ Correct!';
                    resultDiv.className = 'mt-3 text-sm font-bold text-green-400';
                } else {
                    state.wrongAnswers++;
                    resultDiv.innerHTML = `❌ Wrong! Correct: "${escapeHtml(correctAnswer)}"`;
                    resultDiv.className = 'mt-3 text-sm font-bold text-red-400';
                    const wrongCard = state.cards.splice(state.currentIndex, 1)[0];
                    state.cards.push(wrongCard);
                    state.currentIndex = state.cards.length - 1;
                }
                
                updateProgress();
                updateNavButtons();
                state.isLocked = false;
            });
        });
    }
    
    function renderTypingMode(container, card) {
        let correctDisplay, correctAnswer, questionText, placeholder;
        
        if (state.isEnglishToRussian) {
            correctDisplay = card.word;
            correctAnswer = card.translation;
            questionText = 'Type the translation:';
            placeholder = 'Type in Russian...';
        } else {
            correctDisplay = card.translation;
            correctAnswer = card.word;
            questionText = 'Type the English word:';
            placeholder = 'Type in English...';
        }
        
        container.innerHTML = `
            <div class="w-full text-center">
                <p class="text-sm text-gray-400 mb-1">${questionText}</p>
                <p class="text-2xl font-bold text-indigo-300 mb-4">${escapeHtml(correctDisplay || '—')}</p>
                <div class="max-w-sm mx-auto">
                    <input type="text" id="typingInput" class="w-full bg-[#0f0f1a] border border-[#2a2a4a] rounded-xl p-3 text-center text-lg text-gray-200 focus:border-indigo-500 transition placeholder-gray-500" placeholder="${placeholder}" autofocus>
                    <button id="typingSubmit" class="mt-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-xl transition shadow-lg shadow-indigo-500/20">Check</button>
                </div>
                <p class="text-xs text-gray-500 mt-3">${card.phrase ? '📖 ' + escapeHtml(card.phrase) : ''}</p>
                <div id="typingResult" class="mt-3 text-sm font-bold"></div>
            </div>
        `;
        
        const input = document.getElementById('typingInput');
        const submitBtn = document.getElementById('typingSubmit');
        const resultDiv = document.getElementById('typingResult');
        
        function checkTyping() {
            if (state.isLocked || state.answered) return;
            const userAnswer = input.value.trim();
            
            state.isLocked = true;
            state.answered = true;
            
            const isCorrect = isAnswerCorrect(userAnswer, correctAnswer);
            
            if (isCorrect) {
                resultDiv.innerHTML = '✅ Correct!';
                resultDiv.className = 'mt-3 text-sm font-bold text-green-400';
                card.correct = true;
            } else {
                resultDiv.innerHTML = `❌ Wrong! Correct: "${escapeHtml(correctAnswer)}"`;
                resultDiv.className = 'mt-3 text-sm font-bold text-red-400';
                state.wrongAnswers++;
                const wrongCard = state.cards.splice(state.currentIndex, 1)[0];
                state.cards.push(wrongCard);
                state.currentIndex = state.cards.length - 1;
            }
            
            input.disabled = true;
            submitBtn.disabled = true;
            updateProgress();
            updateNavButtons();
            state.isLocked = false;
        }
        
        submitBtn.addEventListener('click', checkTyping);
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                checkTyping();
            }
        });
        
        setTimeout(() => input.focus(), 100);
    }
    
    renderCard();
}

// ===== 🔀 РЕЖИМ ОТОБРАЖЕНИЯ СЛОВ В "TODAY" =====
let todayViewMode = 'horizontal';
try {
    todayViewMode = localStorage.getItem('todayViewMode') || 'horizontal';
} catch (e) {}

// ===== ЗАГРУЗКА "СЕГОДНЯ" =====
async function loadToday() {
    console.log('🔄 loadToday called');
    const container = document.getElementById('todayCardsContainer');
    const countSpan = document.getElementById('todayCount');
    const cards = await getTodayCards();
    countSpan.textContent = cards.length;

    window.updateTodayCount = function(mode) {
        if (mode === 'words') {
            const el = document.getElementById('todayCount');
            if (el) el.textContent = cards.length;
        }
    };
    
    if (cards.length === 0) {
        container.innerHTML = '<div class="bg-[#0f0f1a] rounded-xl p-8 text-center text-gray-400 border border-[#2a2a4a]">🎉 No words for today! Rest or create a new dictionary.</div>';
        return;
    }
    
    const grouped = {};
    for (const card of cards) {
        const dictName = card.dictionaryName || 'No dictionary';
        if (!grouped[dictName]) grouped[dictName] = [];
        grouped[dictName].push(card);
    }
    
    container.innerHTML = '';
    let globalIndex = 1;
    
    for (const [dictName, dictCards] of Object.entries(grouped)) {
        const dictBlock = document.createElement('div');
        dictBlock.className = 'bg-[#1a1a2e] rounded-2xl shadow-xl border border-[#2a2a4a] overflow-hidden mb-6';
        dictBlock.dataset.dictName = dictName;
        
        const headerDiv = document.createElement('div');
        headerDiv.className = 'bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-4';
        
        const firstCard = dictCards[0];
        const sourcesDisplay = firstCard.sources?.length ? firstCard.sources.map(s => {
            const labels = {
                'ai': '🤖 AI',
                'youtube': '▶️ YouTube',
                'website': '🌐 Website',
                'article': '📄 Article',
                'film': '🎬 Film',
                'game': '🎮 Game',
                'self': '✏️ Self',
                'practice': '🎯 In practice',
                'social': '📱 Social media',
                'book': '📖 Book',
                'other': '📌 Other'
            };
            return labels[s] || s;
        }).join(' ') : '';
        
        const hasLinks = firstCard.links && firstCard.links.length > 0;
        const linksDisplay = hasLinks ? `🔗 ${firstCard.links.length} link${firstCard.links.length > 1 ? 's' : ''}` : '';
        
        const topRow = document.createElement('div');
        topRow.className = 'flex flex-wrap justify-between items-center gap-2 mb-2';
        topRow.innerHTML = `
            <div>
                <span class="text-white font-bold text-lg">📘 ${escapeHtml(dictName)}</span>
                <span class="text-white/70 text-sm ml-2">(${dictCards.length})</span>
                <span class="text-white/50 text-sm ml-2">✅ <span class="checked-count-${dictName.replace(/\s/g, '')}">0</span></span>
                ${sourcesDisplay || linksDisplay ? `<div class="text-white/50 text-[10px] mt-1 flex flex-wrap gap-1">${sourcesDisplay ? '📌 ' + sourcesDisplay : ''}${linksDisplay ? ' ' + linksDisplay : ''}</div>` : ''}
            </div>
            <div class="flex gap-2 flex-wrap">
                ${hasLinks ? `<button data-links='${JSON.stringify(firstCard.links)}' class="show-links-btn bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-1.5 px-3 rounded-lg transition text-sm shadow-lg shadow-cyan-500/20">🔗 Links</button>` : ''}
                <button data-dict="${escapeHtml(dictName)}" class="learn-btn bg-purple-500 hover:bg-purple-600 text-white font-bold py-1.5 px-3 rounded-lg transition text-sm shadow-lg shadow-purple-500/20">🎮 Learn</button>
                <button data-dict="${escapeHtml(dictName)}" class="copy-words-btn bg-blue-500 hover:bg-blue-600 text-white font-bold py-1.5 px-3 rounded-lg transition text-sm shadow-lg shadow-blue-500/20">📋 Copy Words</button>
                <button data-dict="${escapeHtml(dictName)}" class="close-dict-btn bg-green-500 hover:bg-green-600 text-white font-bold py-1.5 px-4 rounded-lg transition text-sm shadow-lg shadow-green-500/20">✅ Done</button>
            </div>
        `;
        headerDiv.appendChild(topRow);
        
        const bottomRow = document.createElement('div');
        bottomRow.className = 'flex items-center gap-1 flex-wrap bg-white/10 rounded-lg p-2';
        bottomRow.innerHTML = `
            <span class="text-white text-xs font-medium mr-1">📌</span>
            <button data-dict="${escapeHtml(dictName)}" data-interval="1" class="dict-interval-btn bg-white/20 hover:bg-white/40 text-white font-medium py-0.5 px-2 rounded text-xs transition">1d</button>
            <button data-dict="${escapeHtml(dictName)}" data-interval="3" class="dict-interval-btn bg-white/20 hover:bg-white/40 text-white font-medium py-0.5 px-2 rounded text-xs transition">3d</button>
            <button data-dict="${escapeHtml(dictName)}" data-interval="7" class="dict-interval-btn bg-white/20 hover:bg-white/40 text-white font-medium py-0.5 px-2 rounded text-xs transition">7d</button>
            <button data-dict="${escapeHtml(dictName)}" data-interval="14" class="dict-interval-btn bg-white/20 hover:bg-white/40 text-white font-medium py-0.5 px-2 rounded text-xs transition">14d</button>
            <button data-dict="${escapeHtml(dictName)}" data-interval="30" class="dict-interval-btn bg-white/20 hover:bg-white/40 text-white font-medium py-0.5 px-2 rounded text-xs transition">30d</button>
            <button data-dict="${escapeHtml(dictName)}" data-interval="60" class="dict-interval-btn bg-white/20 hover:bg-white/40 text-white font-medium py-0.5 px-2 rounded text-xs transition">60d</button>
            <div class="flex items-center gap-0.5 bg-white/10 rounded px-1.5 py-0.5">
                <span class="text-white/80 text-xs">⚡</span>
                <input type="number" id="custom-interval-dict-${dictName.replace(/\s/g, '')}" placeholder="days" class="w-10 bg-white/20 text-white placeholder-white/50 rounded px-1 py-0.5 text-xs text-center border-0 focus:outline-none" min="1" value="7">
                <button data-dict="${escapeHtml(dictName)}" class="dict-custom-btn bg-purple-500 hover:bg-purple-600 text-white font-bold py-0.5 px-2 rounded text-xs transition">OK</button>
            </div>
        `;
        headerDiv.appendChild(bottomRow);
        dictBlock.appendChild(headerDiv);
        
        if (todayViewMode === 'vertical') {
            const vHeader = document.createElement('div');
            vHeader.className = 'px-3 py-1.5 bg-[#0f0f1a] border-b border-[#2a2a4a] text-[10px] font-bold text-gray-400 uppercase tracking-wider';
            vHeader.textContent = '🗂️ Card view';
            dictBlock.appendChild(vHeader);
        } else {
            const tableHeaders = document.createElement('div');
            tableHeaders.className = 'grid grid-cols-12 gap-1 px-3 py-1.5 bg-[#0f0f1a] border-b border-[#2a2a4a] text-[10px] font-bold text-gray-400 uppercase tracking-wider';
            tableHeaders.innerHTML = `
                <div class="col-span-1 text-center">#</div>
                <div class="col-span-1 text-center">✅</div>
                <div class="col-span-3 text-left truncate">Phrase (EN)</div>
                <div class="col-span-3 text-left truncate">Phrase (RU)</div>
                <div class="col-span-2 text-left truncate">Word</div>
                <div class="col-span-2 text-left truncate">Translate</div>
            `;
            dictBlock.appendChild(tableHeaders);
        }
        
        const cardsContainer = document.createElement('div');
        cardsContainer.className = todayViewMode === 'vertical' ? 'p-2 space-y-2' : 'p-1 space-y-0.5';
        
        for (const card of dictCards) {
            const cardDiv = document.createElement('div');
            cardDiv.dataset.cardId = card.id;
            
            const checkId = `check-${card.id}`;
            const truncate = (str, max = 12) => {
                if (!str) return '—';
                return str.length > max ? str.slice(0, max) + '…' : str;
            };

            // 🔙 Обратная совместимость:
            // Новые: phraseEn / phraseRu / word / translation
            // Старые: phrase (=фраза-заглушка), word, translation
            const fullPhraseEn  = card.phraseEn  || card.phrase || '—';
            const fullPhraseRu  = card.phraseRu  || '—';
            const fullWord      = card.word      || '—';
            const fullTranslate = card.translation || '—';

            const shortPhraseEn  = truncate(fullPhraseEn, 14);
            const shortPhraseRu  = truncate(fullPhraseRu, 14);
            const shortWord      = truncate(fullWord, 12);
            const shortTranslate = truncate(fullTranslate, 12);
            const shortDate      = card.createdAt ? card.createdAt.slice(0, 8) : formatDate(new Date()).slice(0, 8);
            
            if (todayViewMode === 'vertical') {
                cardDiv.className = 'vertical-card-item rounded-lg border border-[#2a2a4a] bg-[#0f0f1a] p-3 hover:bg-[#15152a] transition';
                cardDiv.innerHTML = `
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center gap-2">
                            <span class="text-[11px] font-bold text-indigo-400">#${globalIndex}</span>
                            <label class="cursor-pointer">
                                <input type="checkbox" id="${checkId}" class="word-checkbox w-4 h-4 text-green-500 rounded border-[#3a3a5a] bg-[#0f0f1a] focus:ring-green-500" data-id="${card.id}">
                            </label>
                        </div>
                        <span class="text-[10px] text-gray-500" title="${escapeHtml(card.createdAt || '')}">${shortDate}</span>
                    </div>
                    <div class="text-white text-sm font-semibold break-words cursor-pointer hover:text-indigo-300 transition word-clickable" data-full="${escapeHtml(fullPhraseEn)}" title="Click to see full phrase">${escapeHtml(fullPhraseEn)}</div>
                    <div class="text-green-300 text-sm break-words cursor-pointer hover:text-green-200 transition translate-clickable mt-0.5" data-full="${escapeHtml(fullPhraseRu)}" title="Click to see full phrase translation">${escapeHtml(fullPhraseRu)}</div>
                    <div class="mt-2 pt-2 border-t border-[#2a2a4a]/60 flex flex-wrap items-baseline gap-2">
                        <span class="text-indigo-300 text-sm font-semibold break-words cursor-pointer hover:text-indigo-200 transition phrase-clickable" data-full="${escapeHtml(fullWord)}" title="Click to see full word">${escapeHtml(fullWord)}</span>
                        <span class="text-gray-500 text-xs">→</span>
                        <span class="text-green-300 text-xs break-words cursor-pointer hover:text-green-200 transition phrase-clickable" data-full="${escapeHtml(fullTranslate)}" title="Click to see full word translation">${escapeHtml(fullTranslate)}</span>
                    </div>
                `;
            } else {
                cardDiv.className = 'grid grid-cols-12 gap-1 items-center px-3 py-1.5 rounded hover:bg-[#0f0f1a] transition border-b border-[#2a2a4a] last:border-0';
                cardDiv.innerHTML = `
                    <div class="col-span-1 text-center text-[11px] font-bold text-indigo-400">${globalIndex}</div>
                    <div class="col-span-1 text-center">
                        <label class="cursor-pointer">
                            <input type="checkbox" id="${checkId}" class="word-checkbox w-4 h-4 text-green-500 rounded border-[#3a3a5a] bg-[#0f0f1a] focus:ring-green-500" data-id="${card.id}">
                        </label>
                    </div>
                    <div class="col-span-3 text-white text-sm truncate cursor-pointer hover:text-indigo-300 transition word-clickable" title="Click to see full phrase" data-full="${escapeHtml(fullPhraseEn)}">${escapeHtml(shortPhraseEn)}</div>
                    <div class="col-span-3 text-green-300 text-sm truncate cursor-pointer hover:text-green-200 transition translate-clickable" title="Click to see full phrase translation" data-full="${escapeHtml(fullPhraseRu)}">${escapeHtml(shortPhraseRu)}</div>
                    <div class="col-span-2 text-indigo-300 text-sm truncate cursor-pointer hover:text-indigo-200 transition phrase-clickable" title="Click to see full word" data-full="${escapeHtml(fullWord)}">${escapeHtml(shortWord)}</div>
                    <div class="col-span-2 text-green-300 text-sm truncate cursor-pointer hover:text-green-200 transition phrase-clickable" title="Click to see full word translation" data-full="${escapeHtml(fullTranslate)}">${escapeHtml(shortTranslate)}</div>
                `;
            }
            cardsContainer.appendChild(cardDiv);
            globalIndex++;
        }
        
        dictBlock.appendChild(cardsContainer);
        container.appendChild(dictBlock);
    }
    
    document.querySelectorAll('.learn-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const dictName = this.dataset.dict;
            const dictBlock = this.closest('.bg-\\[\\#1a1a2e\\].rounded-2xl');
            
            const cardElements = dictBlock.querySelectorAll('[data-card-id]');
            const cards = [];
            cardElements.forEach(el => {
                const cardId = el.dataset.cardId;
                const phraseEl = el.querySelector('.word-clickable');           // Phrase EN
                const phraseRuEl = el.querySelector('.translate-clickable');    // Phrase RU
                const wordEls = el.querySelectorAll('.phrase-clickable');       // [Word, Translate]
                const wordEl = wordEls[0];
                const wordTransEl = wordEls[1];

                cards.push({
                    id: cardId,
                    word: wordEl ? wordEl.dataset.full : '',
                    translation: wordTransEl ? wordTransEl.dataset.full : '',
                    phrase: phraseEl ? phraseEl.dataset.full : '',
                    phraseRu: phraseRuEl ? phraseRuEl.dataset.full : ''
                });
            });
            
            if (cards.length === 0) {
                alert('⚠️ No cards in this dictionary!');
                return;
            }
            
            const allCards = [];
            dictBlock.querySelectorAll('.phrase-clickable').forEach(el => {
                const w = el.dataset.full;
                if (w && w !== '—' && w !== 'undefined') {
                    allCards.push(w);
                }
            });
            
            startLearnMode(dictName, cards, allCards);
        });
    });
    
    document.querySelectorAll('.show-links-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            try {
                const linksData = this.dataset.links;
                const links = JSON.parse(linksData);
                if (links && links.length > 0) {
                    showLinksModal(links);
                } else {
                    alert('ℹ️ No links available');
                }
            } catch (error) {
                console.error('Error showing links:', error);
                alert('❌ Error showing links');
            }
        });
    });
    
    document.querySelectorAll('.copy-words-btn').forEach(btn => {
        btn.addEventListener('click', async function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const dictName = this.dataset.dict;
            const dictBlock = this.closest('.bg-\\[\\#1a1a2e\\].rounded-2xl');
            if (!dictBlock) {
                alert('❌ Error: Dictionary block not found!');
                return;
            }
            
            const wordElements = dictBlock.querySelectorAll('.phrase-clickable');
            const words = [];
            wordElements.forEach(el => {
                const fullWord = el.dataset.full;
                if (fullWord && fullWord !== '—' && fullWord !== 'undefined') {
                    words.push(fullWord);
                }
            });
            
            if (words.length === 0) {
                alert('⚠️ No words to copy!');
                return;
            }
            
            const textToCopy = words.join('\n');
            const success = await copyToClipboard(textToCopy);
            
            if (success) {
                showToast(`${words.length} word(s) copied to clipboard`, 'success');
                const originalText = btn.textContent;
                btn.textContent = '✅ Copied!';
                btn.classList.remove('bg-blue-500', 'hover:bg-blue-600');
                btn.classList.add('bg-green-500', 'hover:bg-green-600');
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.classList.remove('bg-green-500', 'hover:bg-green-600');
                    btn.classList.add('bg-blue-500', 'hover:bg-blue-600');
                }, 2000);
            } else {
                showToast('Failed to copy', 'error');
            }
        });
    });
    
    document.querySelectorAll('.word-clickable').forEach(el => {
        el.addEventListener('click', function() {
            const fullText = this.dataset.full;
            showTextModal('Phrase (EN)', fullText, '📝');
        });
    });
    
    document.querySelectorAll('.translate-clickable').forEach(el => {
        el.addEventListener('click', function() {
            const fullText = this.dataset.full;
            showTextModal('Phrase (RU)', fullText, '🌍');
        });
    });
    
    document.querySelectorAll('.phrase-clickable').forEach(el => {
        el.addEventListener('click', function() {
            const fullText = this.dataset.full;
            showTextModal('Word', fullText, '📖');
        });
    });
    
    document.querySelectorAll('.word-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const dictBlock = this.closest('.bg-\\[\\#1a1a2e\\].rounded-2xl');
            const checkedCount = dictBlock.querySelectorAll('.word-checkbox:checked').length;
            const countSpan = dictBlock.querySelector(`[class*="checked-count-"]`);
            if (countSpan) countSpan.textContent = checkedCount;
        });
    });
    
    document.querySelectorAll('.close-dict-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const dictName = this.dataset.dict;
            const dictBlock = this.closest('.bg-\\[\\#1a1a2e\\].rounded-2xl');
            const checkedBoxes = dictBlock.querySelectorAll('.word-checkbox:checked');
            const checkedCount = checkedBoxes.length;
            
            if (checkedCount === 0) {
                alert(`⚠️ No words checked in "${dictName}"`);
                return;
            }
            
            if (confirm(`✅ Mark ${checkedCount} words as learned from "${dictName}"?`)) {
                const promises = [];
                checkedBoxes.forEach(cb => {
                    const cardId = cb.dataset.id;
                    promises.push(markCardAsLearned(cardId));
                });
                Promise.all(promises).then(() => {
                    showToast(`Marked ${checkedCount} word(s) as learned`, 'success');
                    if (!screens.analytics.classList.contains('hidden')) {
                        loadAnalytics();
                    }
                    loadToday();
                });
            }
        });
    });
    
    document.querySelectorAll('.dict-interval-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const interval = parseInt(this.dataset.interval);
            const dictBlock = this.closest('.bg-\\[\\#1a1a2e\\].rounded-2xl');
            const promises = [];
            const count = dictBlock.querySelectorAll('.word-checkbox').length;
            dictBlock.querySelectorAll('.word-checkbox').forEach(cb => {
                promises.push(postponeCard(cb.dataset.id, interval));
            });
            Promise.all(promises).then(() => {
                showToast(`Postponed ${count} word(s) by ${interval} day(s) → ${formatFutureDate(interval)}`, 'success');
                loadToday();
            });
        });
    });
    
    document.querySelectorAll('.dict-custom-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const dictName = this.dataset.dict;
            const inputId = `custom-interval-dict-${dictName.replace(/\s/g, '')}`;
            const input = document.getElementById(inputId);
            const interval = parseInt(input.value);
            
            if (!interval || interval < 1) {
                alert('⚠️ Enter a number > 0');
                input.focus();
                return;
            }
            if (interval > 365) {
                alert('⚠️ Maximum 365 days');
                return;
            }
            
            const dictBlock = this.closest('.bg-\\[\\#1a1a2e\\].rounded-2xl');
            const promises = [];
            dictBlock.querySelectorAll('.word-checkbox').forEach(cb => {
                promises.push(postponeCard(cb.dataset.id, interval));
            });

            Promise.all(promises).then(() => {
                const count = dictBlock.querySelectorAll('.word-checkbox').length;
                showToast(`Postponed ${count} word(s) by ${interval} day(s) → ${formatFutureDate(interval)}`, 'success');
                loadToday();
            });
        });
    });
}

// ===== LOAD LIBRARY =====
async function loadDictionaries() {
    console.log('📚 loadDictionaries called');
    const dictMap = await getAllDictionaries();
    const container = document.getElementById('dictList');
    
    if (dictMap.size === 0) {
        container.innerHTML = '<div class="bg-[#0f0f1a] rounded-xl p-8 text-center text-gray-400 border border-[#2a2a4a]">📭 No dictionaries. Create your first!</div>';
        return;
    }
    
    const groupedByMonth = new Map();
    
    for (let [dictName, cards] of dictMap.entries()) {
        const firstCard = cards[0];
        let monthKey = 'Unknown';
        let monthDisplay = 'Unknown';
        
        if (firstCard && firstCard.createdAtRaw) {
            const date = firstCard.createdAtRaw.toDate ? firstCard.createdAtRaw.toDate() : new Date(firstCard.createdAtRaw);
            if (!isNaN(date.getTime())) {
                const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                                   'July', 'August', 'September', 'October', 'November', 'December'];
                const year = date.getFullYear();
                const month = date.getMonth();
                monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
                monthDisplay = `${monthNames[month]} ${year}`;
            }
        }
        
        if (!groupedByMonth.has(monthKey)) {
            groupedByMonth.set(monthKey, {
                display: monthDisplay,
                dictionaries: []
            });
        }
        
        groupedByMonth.get(monthKey).dictionaries.push({ dictName, cards });
    }
    
    const sortedMonths = Array.from(groupedByMonth.keys()).sort((a, b) => b.localeCompare(a));
    
    container.innerHTML = '';
    
    for (const monthKey of sortedMonths) {
        const monthData = groupedByMonth.get(monthKey);
        
        const monthBlock = document.createElement('div');
        monthBlock.className = 'mb-4';
        
        const monthHeader = document.createElement('div');
        monthHeader.className = 'bg-gradient-to-r from-indigo-600/20 to-purple-600/20 rounded-xl p-3 mb-2 border border-[#2a2a4a]';
        monthHeader.innerHTML = `
            <div class="flex justify-between items-center">
                <span class="text-lg font-bold text-indigo-400">📅 ${escapeHtml(monthData.display)}</span>
                <span class="text-sm text-gray-400">${monthData.dictionaries.length} dictionary${monthData.dictionaries.length > 1 ? 's' : ''}</span>
            </div>
        `;
        monthBlock.appendChild(monthHeader);
        
        for (const { dictName, cards } of monthData.dictionaries) {
            const dictBlock = document.createElement('div');
            dictBlock.className = 'border border-[#2a2a4a] rounded-xl overflow-hidden bg-[#1a1a2e] mb-2 ml-2';
            
            const firstCard = cards[0];
            let createdDate = 'Unknown date';
            if (firstCard && firstCard.createdAtRaw) {
                const date = firstCard.createdAtRaw.toDate ? firstCard.createdAtRaw.toDate() : new Date(firstCard.createdAtRaw);
                if (!isNaN(date.getTime())) {
                    createdDate = date.toLocaleDateString('en', { day: '2-digit', month: 'short', year: 'numeric' });
                }
            }
            
            dictBlock.innerHTML = `
                <div class="flex justify-between items-center p-4 bg-[#0f0f1a] hover:bg-[#1a1a2e] cursor-pointer transition">
                    <div class="flex items-center gap-3">
                        <span class="font-bold text-lg text-indigo-400">📘 ${escapeHtml(dictName)}</span>
                        <span class="text-xs text-gray-500">${escapeHtml(createdDate)}</span>
                        <span class="text-xs bg-indigo-600/30 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30">${cards.length} words</span>
                    </div>
                    <span class="toggle-icon text-gray-400">▼</span>
                </div>
                <div class="dict-content hidden p-3 border-t border-[#2a2a4a]">
                    <!-- SAVE ALL button (saves only changed cards in one batch) -->
                    <div class="flex items-center justify-between mb-2 gap-2">
                        <span class="text-xs text-gray-500">✏️ Edit fields and click Save All — only changed cards will be saved</span>
                        <button class="save-all-btn bg-green-500 hover:bg-green-600 text-black font-bold py-1.5 px-4 rounded-lg transition text-sm shadow-lg shadow-green-500/20 opacity-50 cursor-not-allowed">
                            💾 Save All (<span class="changed-count">0</span>)
                        </button>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead class="bg-[#0f0f1a]">
                                <tr>
                                    <th class="p-2 text-left text-gray-400">#</th>
                                    <th class="p-2 text-left text-gray-400">Word</th>
                                    <th class="p-2 text-left text-gray-400">Translation</th>
                                    <th class="p-2 text-left text-gray-400">Phrase</th>
                                    <th class="p-2 text-left text-gray-400">Phrase RU</th>
                                    <th class="p-2 text-left text-gray-400">Interval</th>
                                    <th class="p-2 text-left text-gray-400">Created</th>
                                    <th class="p-2 text-left text-gray-400">Actions</th>
                                </tr>
                            </thead>
                            <tbody></tbody>
                        </table>
                    </div>
                </div>
            `;
            monthBlock.appendChild(dictBlock);
            
            const tbody = dictBlock.querySelector('tbody');

            // Track original values and changed fields per card
            const originalValues = new Map();   // id -> { word, translation, phraseEn, phraseRu }
            const changedFields = new Map();    // id -> Set(fieldNames)

            let idx = 1;
            cards.forEach(card => {
                const row = tbody.insertRow();
                row.className = 'border-b border-[#2a2a4a] hover:bg-[#0f0f1a] transition';
                row.dataset.cardId = card.id;

                const initial = {
                    word: card.word || '',
                    translation: card.translation || '',
                    phraseEn: card.phraseEn || card.phrase || '',
                    phraseRu: card.phraseRu || ''
                };
                originalValues.set(card.id, { ...initial });

                row.insertCell(0).innerHTML = `<span class="text-xs text-gray-500">${idx}</span>`;
                row.insertCell(1).innerHTML = `<input class="edit-input w-full p-1 border border-[#2a2a4a] rounded text-sm bg-[#0f0f1a] text-gray-200 focus:border-indigo-500 transition" data-field="word" value="${escapeHtml(initial.word)}">`;
                row.insertCell(2).innerHTML = `<input class="edit-input w-full p-1 border border-[#2a2a4a] rounded text-sm bg-[#0f0f1a] text-gray-200 focus:border-indigo-500 transition" data-field="translation" value="${escapeHtml(initial.translation)}">`;
                row.insertCell(3).innerHTML = `<input class="edit-input w-full p-1 border border-[#2a2a4a] rounded text-sm bg-[#0f0f1a] text-gray-200 focus:border-indigo-500 transition" data-field="phraseEn" value="${escapeHtml(initial.phraseEn)}">`;
                row.insertCell(4).innerHTML = `<input class="edit-input w-full p-1 border border-[#2a2a4a] rounded text-sm bg-[#0f0f1a] text-gray-200 focus:border-indigo-500 transition" data-field="phraseRu" value="${escapeHtml(initial.phraseRu)}">`;
                row.insertCell(5).innerHTML = `<span class="text-xs bg-indigo-600/30 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30">${card.interval || 1} days</span>`;
                row.insertCell(6).innerHTML = `<span class="text-xs text-gray-400">${escapeHtml(card.createdAt || formatDate(new Date()))}</span>`;
                row.insertCell(7).innerHTML = `<button data-id="${card.id}" class="delete-card-btn text-red-400 hover:text-red-300 transition">🗑</button>`;

                // Track edits in this row
                row.querySelectorAll('.edit-input').forEach(inp => {
                    inp.addEventListener('input', () => {
                        const field = inp.dataset.field;
                        const orig = originalValues.get(card.id)?.[field] ?? '';
                        const id = card.id;
                        if (!changedFields.has(id)) changedFields.set(id, new Set());

                        if (inp.value !== orig) {
                            changedFields.get(id).add(field);
                            inp.classList.add('border-green-500');
                        } else {
                            changedFields.get(id).delete(field);
                            inp.classList.remove('border-green-500');
                        }

                        // Update Save All button counter and enabled state
                        const totalChanged = Array.from(changedFields.values()).filter(s => s.size > 0).length;
                        const saveAllBtn = dictBlock.querySelector('.save-all-btn');
                        if (saveAllBtn) {
                            const c = saveAllBtn.querySelector('.changed-count');
                            if (c) c.textContent = totalChanged;
                            saveAllBtn.classList.toggle('opacity-50', totalChanged === 0);
                            saveAllBtn.classList.toggle('cursor-not-allowed', totalChanged === 0);
                        }
                    });
                });

                idx++;
            });
            
            const headerDiv = dictBlock.querySelector('.flex.justify-between');
            headerDiv.addEventListener('click', function(e) {
                const content = this.nextElementSibling;
                content.classList.toggle('hidden');
                const icon = this.querySelector('.toggle-icon');
                icon.textContent = content.classList.contains('hidden') ? '▼' : '▲';
            });
            
            // Delete single card
            tbody.querySelectorAll('.delete-card-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    if (confirm('🗑️ Delete card permanently?')) {
                        await deleteCard(btn.dataset.id);
                        loadDictionaries();
                    }
                });
            });

            // Save All: send only changed cards in one batch
            const saveAllBtn = dictBlock.querySelector('.save-all-btn');
            if (saveAllBtn) {
                saveAllBtn.addEventListener('click', async () => {
                    const toUpdate = [];
                    changedFields.forEach((fields, id) => {
                        if (fields.size === 0) return;
                        const row = tbody.querySelector(`tr[data-card-id="${id}"]`);
                        if (!row) return;
                        const patch = {};
                        row.querySelectorAll('.edit-input').forEach(inp => {
                            if (fields.has(inp.dataset.field)) {
                                patch[inp.dataset.field] = inp.value;
                            }
                        });
                        if (Object.keys(patch).length > 0) {
                            toUpdate.push({ id, fields: patch });
                        }
                    });

                    if (toUpdate.length === 0) {
                        showToast('No changes to save', 'info');
                        return;
                    }

                    saveAllBtn.disabled = true;
                    const originalHTML = saveAllBtn.innerHTML;
                    saveAllBtn.innerHTML = '⏳ Saving...';

                    try {
                        const count = await updateCardsBatch(toUpdate);
                        showToast(`✅ Saved ${count} card(s)`, 'success');
                        changedFields.clear();
                        loadDictionaries();
                    } catch (err) {
                        console.error('Save All error:', err);
                        showToast('❌ Failed to save', 'error');
                    } finally {
                        saveAllBtn.disabled = false;
                        saveAllBtn.innerHTML = originalHTML;
                    }
                });
            }
        }
        
        container.appendChild(monthBlock);
    }
}

// ===== АНАЛИТИКА =====
let currentFilter = 'week';
let allCardsCache = [];
let allPhrasesCache = [];

async function loadAnalytics() {
    console.log('📊 loadAnalytics called');
    try {
        const [cardsData, phrasesData] = await Promise.all([
            getAllCardsForAnalytics(),
            getAllPhrases().catch(() => [])
        ]);
        allCardsCache = cardsData;
        allPhrasesCache = phrasesData;
    } catch (e) {
        console.error('Analytics load error:', e);
        allCardsCache = [];
        allPhrasesCache = [];
    }
    applyAnalyticsFilter();
}

function applyAnalyticsFilter() {
    const cards = filterCardsByDate(allCardsCache, currentFilter);
    
    const totalDicts = new Set(cards.map(c => c.dictionaryName)).size;
    const totalWords = cards.length;
    const learnedWords = cards.filter(c => c.status === 'finished').length;
    const remainingWords = cards.filter(c => c.status === 'active').length;
    
    document.getElementById('totalDicts').textContent = totalDicts;
    document.getElementById('totalWords').textContent = totalWords;
    document.getElementById('learnedWords').textContent = learnedWords;
    document.getElementById('remainingWords').textContent = remainingWords;
    
    const total = totalWords || 1;
    const learned = learnedWords || 0;
    const percent = Math.round((learned / total) * 100);
    document.getElementById('progressPercent').textContent = percent + '%';
    document.getElementById('progressBar').style.width = percent + '%';
    
    updateTrend(cards);
    renderSourcesText(cards);
    renderPieChart(cards);
    renderActivityChart(cards);
    renderDictStats(cards);
    renderExtraStats(cards);
    
    renderPhrasesCategoryStats(); 
    
    renderForecast(allCardsCache);

    window.dispatchEvent(new CustomEvent('analytics:rendered', { detail: { filter: currentFilter } }));
}

function filterCardsByDate(cards, filter) {
    const now = new Date();
    let filterDate = new Date();
    
    switch (filter) {
        case 'day': filterDate.setDate(now.getDate() - 1); break;
        case 'week': filterDate.setDate(now.getDate() - 7); break;
        case 'month': filterDate.setDate(now.getDate() - 30); break;
        case '6months': filterDate.setMonth(now.getMonth() - 6); break;
        case 'year': filterDate.setFullYear(now.getFullYear() - 1); break;
        case 'all': default: filterDate = new Date(0); break;
    }
    
    return cards.filter(c => {
        const created = c.createdAtRaw?.toDate ? c.createdAtRaw.toDate() : new Date(c.createdAtRaw);
        return created >= filterDate;
    });
}

function renderSourcesText(cards) {
    const container = document.getElementById('sourcesStats');
    if (!container) return;

    const sources = { ai: 0, youtube: 0, website: 0, article: 0, film: 0, game: 0, self: 0, practice: 0, social: 0, book: 0, other: 0 };
    cards.forEach(c => {
        if (c.sources) {
            c.sources.forEach(s => {
                if (sources[s] !== undefined) sources[s]++;
            });
        }
    });
    
    const labels = {
        'ai': '🤖 AI', 'youtube': '▶️ YouTube', 'website': '🌐 Website', 'article': '📄 Article',
        'film': '🎬 Film', 'game': '🎮 Game', 'practice': '🎯 In practice', 'social': '📱 Social media',
        'book': '📖 Book', 'other': '📌 Other'
    };
    
    container.innerHTML = Object.entries(sources)
        .filter(([key, count]) => count > 0)
        .map(([key, count]) => 
            `<span class="bg-[#2a2a4a] px-3 py-1 rounded-full text-xs text-gray-300 border border-[#3a3a5a]">${labels[key] || key}: ${count}</span>`
        ).join('');
}

function renderPieChart(cards) {
    const container = document.getElementById('pieChartContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    const sources = { ai: 0, youtube: 0, website: 0, article: 0, film: 0, game: 0, other: 0 };
    cards.forEach(c => {
        if (c.sources) {
            c.sources.forEach(s => {
                if (sources[s] !== undefined) sources[s]++;
            });
        }
    });
    
    const total = Object.values(sources).reduce((a, b) => a + b, 0);
    if (total === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 text-sm py-4">No source data available</div>';
        return;
    }
    
    const colors = ['#4f46e5', '#ef4444', '#06b6d4', '#f59e0b', '#ec4899', '#8b5cf6', '#6b7280'];
    const labels = ['AI', 'YouTube', 'Website', 'Article', 'Film', 'Game', 'Other'];
    const keys = ['ai', 'youtube', 'website', 'article', 'film', 'game', 'other'];
    
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '200');
    svg.setAttribute('viewBox', '0 0 400 200');
    svg.style.background = '#0f0f1a';
    svg.style.borderRadius = '12px';
    
    const cx = 100, cy = 100, radius = 70;
    let startAngle = -90;
    
    keys.forEach((key, index) => {
        const count = sources[key] || 0;
        if (count === 0) return;
        
        const angle = (count / total) * 360;
        const endAngle = startAngle + angle;
        
        const startRad = (startAngle * Math.PI) / 180;
        const endRad = (endAngle * Math.PI) / 180;
        
        const x1 = cx + radius * Math.cos(startRad);
        const y1 = cy + radius * Math.sin(startRad);
        const x2 = cx + radius * Math.cos(endRad);
        const y2 = cy + radius * Math.sin(endRad);
        
        const largeArc = angle > 180 ? 1 : 0;
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`);
        path.setAttribute('fill', colors[index % colors.length]);
        path.setAttribute('stroke', '#1a1a2e');
        path.setAttribute('stroke-width', '2');
        svg.appendChild(path);
        
        startAngle = endAngle;
    });
    
    let legendY = 30;
    keys.forEach((key, index) => {
        const count = sources[key] || 0;
        if (count === 0) return;
        
        const pct = Math.round((count / total) * 100);
        
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', '210');
        rect.setAttribute('y', legendY);
        rect.setAttribute('width', '12');
        rect.setAttribute('height', '12');
        rect.setAttribute('fill', colors[index % colors.length]);
        rect.setAttribute('rx', '2');
        svg.appendChild(rect);
        
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', '228');
        text.setAttribute('y', legendY + 10);
        text.setAttribute('font-size', '11');
        text.setAttribute('fill', '#e5e7eb');
        text.textContent = `${labels[index]}: ${count} (${pct}%)`;
        svg.appendChild(text);
        
        legendY += 22;
    });
    
    container.appendChild(svg);
}

function renderActivityChart(cards, filterDays = 14) {
    const chartContainer = document.getElementById('chartContainer');
    if (!chartContainer) return;
    chartContainer.innerHTML = '';
    
    let daysToShow = 14;
    switch (currentFilter) {
        case 'day': daysToShow = 1; break;
        case 'week': daysToShow = 7; break;
        case 'month': daysToShow = 30; break;
        case '6months': daysToShow = 180; break;
        case 'year': daysToShow = 365; break;
        case 'all': default: daysToShow = 14; break;
    }
    
    const today = new Date();
    const chartData = [];
    
    if (daysToShow <= 30) {
        for (let i = daysToShow - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toLocaleDateString('en', { day: '2-digit', month: 'short' });
            const count = cards.filter(c => {
                const created = c.createdAtRaw?.toDate ? c.createdAtRaw.toDate() : new Date(c.createdAtRaw);
                return created.toDateString() === date.toDateString();
            }).length;
            chartData.push({ label: dateStr, count });
        }
    } else {
        const weeksToShow = Math.ceil(daysToShow / 7);
        for (let i = weeksToShow - 1; i >= 0; i--) {
            const startDate = new Date(today);
            startDate.setDate(startDate.getDate() - (i * 7 + 6));
            const endDate = new Date(today);
            endDate.setDate(endDate.getDate() - (i * 7));
            
            const weekLabel = `${startDate.toLocaleDateString('en', { day: '2-digit', month: 'short' })} - ${endDate.toLocaleDateString('en', { day: '2-digit', month: 'short' })}`;
            
            const count = cards.filter(c => {
                const created = c.createdAtRaw?.toDate ? c.createdAtRaw.toDate() : new Date(c.createdAtRaw);
                return created >= startDate && created <= endDate;
            }).length;
            
            chartData.push({ label: weekLabel, count });
        }
    }
    
    const max = Math.max(...chartData.map(d => d.count), 1);
    
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '160');
    
    const totalPoints = chartData.length;
    const viewBoxWidth = Math.max(totalPoints * 40, 400);
    svg.setAttribute('viewBox', `0 0 ${viewBoxWidth} 160`);
    svg.style.background = '#0f0f1a';
    svg.style.borderRadius = '12px';
    svg.style.width = '100%';
    
    const paddingX = 20;
    const chartWidth = viewBoxWidth - paddingX * 2;
    const chartHeight = 120;
    const bottomY = 140;
    
    const points = chartData.map((item, index) => {
        const x = paddingX + (index / Math.max(totalPoints - 1, 1)) * chartWidth;
        const y = bottomY - (item.count / max) * chartHeight;
        return `${x},${y}`;
    }).join(' ');
    
    const areaPoints = chartData.map((item, index) => {
        const x = paddingX + (index / Math.max(totalPoints - 1, 1)) * chartWidth;
        const y = bottomY - (item.count / max) * chartHeight;
        return `${x},${y}`;
    }).join(' ');
    
    const polygonPoints = `${paddingX},${bottomY} ${areaPoints} ${viewBoxWidth - paddingX},${bottomY}`;
    
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', polygonPoints);
    polygon.setAttribute('fill', 'rgba(79, 70, 229, 0.2)');
    svg.appendChild(polygon);
    
    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', points);
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', '#4f46e5');
    polyline.setAttribute('stroke-width', '3');
    polyline.setAttribute('stroke-linecap', 'round');
    polyline.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(polyline);
    
    chartData.forEach((item, index) => {
        const x = paddingX + (index / Math.max(totalPoints - 1, 1)) * chartWidth;
        const y = bottomY - (item.count / max) * chartHeight;
        
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', '4');
        circle.setAttribute('fill', '#4f46e5');
        circle.setAttribute('stroke', '#1a1a2e');
        circle.setAttribute('stroke-width', '2');
        svg.appendChild(circle);
        
        if (totalPoints <= 30) {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', x);
            text.setAttribute('y', bottomY + 15);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('font-size', '8');
            text.setAttribute('fill', '#6b7280');
            text.setAttribute('transform', totalPoints > 14 ? `rotate(-45, ${x}, ${bottomY + 15})` : '');
            text.textContent = item.label;
            svg.appendChild(text);
        }
        
        if (item.count > 0) {
            const valueText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            valueText.setAttribute('x', x);
            valueText.setAttribute('y', y - 8);
            valueText.setAttribute('text-anchor', 'middle');
            valueText.setAttribute('font-size', '9');
            valueText.setAttribute('fill', '#818cf8');
            valueText.setAttribute('font-weight', 'bold');
            valueText.textContent = item.count;
            svg.appendChild(valueText);
        }
    });
    
    chartContainer.appendChild(svg);
}

function renderExtraStats(cards) {
    const totalCards = cards.length;
    const avgWordsPerDay = totalCards > 0 ? Math.round(totalCards / 30) : 0;
    const completionRate = totalCards > 0 ? Math.round((cards.filter(c => c.status === 'finished').length / totalCards) * 100) : 0;
    const activeDictionaries = new Set(cards.map(c => c.dictionaryName)).size;

    let container = document.getElementById('extraStats');
    if (!container) {
        const anchor = document.getElementById('totalDicts')?.closest('.grid');
        if (!anchor) return;
        container = document.createElement('div');
        container.id = 'extraStats';
        container.className = 'grid grid-cols-2 gap-3 mb-4';
        anchor.after(container);
    }

    container.innerHTML = `
        <div class="bg-black rounded-xl p-3 text-center border border-[#222222]">
            <div class="text-2xl font-bold text-white">${avgWordsPerDay}</div>
            <div class="text-xs text-gray-400">📊 Avg words/day</div>
        </div>
        <div class="bg-black rounded-xl p-3 text-center border border-[#222222]">
            <div class="text-2xl font-bold text-white">${completionRate}%</div>
            <div class="text-xs text-gray-400">🎯 Completion rate</div>
        </div>
        <div class="bg-black rounded-xl p-3 text-center border border-[#222222]">
            <div class="text-2xl font-bold text-white">${activeDictionaries}</div>
            <div class="text-xs text-gray-400">📚 Active dictionaries</div>
        </div>
        <div class="bg-black rounded-xl p-3 text-center border border-[#222222]">
            <div class="text-2xl font-bold text-white">${totalCards}</div>
            <div class="text-xs text-gray-400">📝 Total cards</div>
        </div>
    `;
}

// ===== FORECAST: даты → словари → слова =====
function renderForecast(cards) {
    const container = document.getElementById('forecastContainer');
    const warningEl = document.getElementById('forecastWarning');
    if (!container) return;
    
    container.innerHTML = '';
    if (warningEl) warningEl.innerHTML = '';
    
    const activeCards = cards.filter(c => c.status === 'active');
    
    if (activeCards.length === 0 && !(allPhrasesCache || []).some(p => p.status === 'active')) {
        container.innerHTML = '<div class="bg-[#0f0f1a] rounded-xl p-4 text-center text-gray-400 text-sm border border-[#2a2a4a]">No active cards to forecast</div>';
        return;
    }
    
    const byDate = new Map();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    activeCards.forEach(card => {
        const nextDate = card.nextReviewDate?.toDate ? card.nextReviewDate.toDate() : new Date(card.nextReviewDate);
        if (isNaN(nextDate.getTime())) return;
        nextDate.setHours(0, 0, 0, 0);
        const dateKey = nextDate.toISOString().slice(0, 10);
        
        if (!byDate.has(dateKey)) {
            byDate.set(dateKey, { date: nextDate, totalCount: 0, blocks: new Map(), phrases: [] });
        }
        
        const entry = byDate.get(dateKey);
        entry.totalCount++;
        
        const blockName = card.dictionaryName || 'No dictionary';
        if (!entry.blocks.has(blockName)) entry.blocks.set(blockName, []);
        entry.blocks.get(blockName).push(card);
    });
    
    (allPhrasesCache || []).filter(p => p.status === 'active').forEach(p => {
        const d = p.nextReviewDate?.toDate ? p.nextReviewDate.toDate() : new Date(p.nextReviewDate);
        if (isNaN(d.getTime())) return;
        d.setHours(0, 0, 0, 0);
        const key = d.toISOString().slice(0, 10);
        if (!byDate.has(key)) byDate.set(key, { date: d, totalCount: 0, blocks: new Map(), phrases: [] });
        byDate.get(key).phrases.push(p);
    });

    const sorted = Array.from(byDate.values())
        .filter(d => d.totalCount > 0 || d.phrases.length > 0)
        .sort((a, b) => a.date - b.date);
    
    if (sorted.length === 0) {
        container.innerHTML = '<div class="bg-[#0f0f1a] rounded-xl p-4 text-center text-gray-400 text-sm border border-[#2a2a4a]">No scheduled reviews</div>';
        return;
    }
    
    const OVERLOAD_THRESHOLD = 50;
    const BLOCK_OVERLOAD_THRESHOLD = 5;
    const overloadDays = sorted.filter(d => d.totalCount >= OVERLOAD_THRESHOLD);
    
    sorted.forEach(entry => {
        for (const [, blockCards] of entry.blocks) {
            blockCards.sort((a, b) => (a.word || '').localeCompare(b.word || ''));
        }
    });
    
    sorted.forEach((entry, idx) => {
        const diffDays = Math.round((entry.date - today) / (1000 * 60 * 60 * 24));
        const blockCount = entry.blocks.size;
        
        const dateFull = entry.date.toLocaleDateString('en', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
        
        let badge = '';
        let headerColor = 'from-indigo-600 to-purple-600';
        if (diffDays === 0) { badge = '🔥 TODAY'; headerColor = 'from-red-600 to-red-700'; }
        else if (diffDays === 1) { badge = '📅 TOMORROW'; headerColor = 'from-amber-600 to-orange-600'; }
        else if (diffDays === 2) { badge = '📅 DAY AFTER TOMORROW'; headerColor = 'from-yellow-600 to-amber-600'; }
        else if (diffDays < 0) { badge = '⚠️ OVERDUE'; headerColor = 'from-red-700 to-red-900'; }
        else if (entry.totalCount >= OVERLOAD_THRESHOLD || blockCount >= BLOCK_OVERLOAD_THRESHOLD) {
            badge = '⚠️ HEAVY DAY'; headerColor = 'from-orange-600 to-red-600';
        }
        
        let loadColor = 'text-green-400';
        let loadLabel = '✅ OK';
        if (entry.totalCount > 30 || blockCount >= 3) { loadColor = 'text-yellow-400'; loadLabel = '⚡ Medium'; }
        if (entry.totalCount > 60 || blockCount >= 5) { loadColor = 'text-orange-400'; loadLabel = '⚠️ High'; }
        if (entry.totalCount > 100 || blockCount >= 8) { loadColor = 'text-red-400'; loadLabel = '🔥 Very high'; }
        
        const blockId = `forecast-block-${idx}`;
        const blockEntries = Array.from(entry.blocks.entries());
        let blocksHtml = '';
        
        blockEntries.forEach(([blockName, blockCards]) => {
            const wordsRows = blockCards.map((c, i) => {
                const safeWord = escapeHtml(c.word || '—');
                const safeTrans = escapeHtml(c.translation || '—');
                const safePhraseEn = escapeHtml(c.phraseEn || c.phrase || '');
                const safePhraseRu = escapeHtml(c.phraseRu || '');
                return `
                    <div class="flex items-start gap-2 py-1.5 px-3 border-b border-[#2a2a4a]/30 last:border-0">
                        <span class="text-[10px] text-gray-500 w-6 shrink-0 text-right mt-1">${i + 1}.</span>
                        <div class="flex-1 min-w-0">
                            <div class="flex flex-wrap items-baseline gap-2">
                                <span class="text-indigo-300 text-sm font-semibold">${safeWord}</span>
                                <span class="text-gray-500 text-xs">→</span>
                                <span class="text-green-300 text-sm">${safeTrans}</span>
                            </div>
                            ${safePhraseEn ? `<div class="text-white/80 text-xs mt-0.5">📖 ${safePhraseEn}</div>` : ''}
                            ${safePhraseRu ? `<div class="text-green-300/60 text-xs mt-0.5">→ ${safePhraseRu}</div>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
            
            blocksHtml += `
                <div class="mb-2 last:mb-0 bg-[#0f0f1a] rounded-lg border border-[#2a2a4a] overflow-hidden">
                    <div class="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-indigo-900/40 to-purple-900/40 border-b border-[#2a2a4a]">
                        <span class="text-indigo-300 text-sm font-bold truncate">📘 ${escapeHtml(blockName)}</span>
                        <span class="text-[10px] bg-indigo-600/30 text-indigo-300 px-2 py-0.5 rounded-full font-bold border border-indigo-500/30 shrink-0 ml-2">
                            ${blockCards.length} ${blockCards.length === 1 ? 'word' : 'words'}
                        </span>
                    </div>
                    <div>${wordsRows}</div>
                </div>
            `;
        });
        
        const phrasesHtml = entry.phrases.length ? `
            <div class="mb-2 bg-[#0f0f1a] rounded-lg border border-[#2a2a4a] p-2">
                <div class="text-sm font-bold text-white px-1 pb-1">💬 Phrases (${entry.phrases.length})</div>
                ${entry.phrases.map((p, i) => `
                    <div class="text-sm px-1 py-0.5">
                        <span class="text-gray-500">${i + 1}.</span>
                        <span class="text-white">${escapeHtml(p.english || '')}</span>
                        <span class="text-gray-500">→</span>
                        <span class="text-green-400">${escapeHtml(p.russian || '')}</span>
                    </div>`).join('')}
            </div>` : '';

        const block = document.createElement('div');
        block.className = 'bg-[#1a1a2e] rounded-xl border border-[#2a2a4a] overflow-hidden';
        block.innerHTML = `
            <div class="forecast-header bg-gradient-to-r ${headerColor} px-4 py-3 cursor-pointer select-none hover:opacity-90 transition" data-target="${blockId}">
                <div class="flex justify-between items-center gap-2">
                    <div class="flex items-center gap-2 flex-wrap">
                        ${badge ? `<span class="text-[10px] font-bold bg-white/25 px-2 py-0.5 rounded-full text-white">${badge}</span>` : ''}
                        <span class="font-bold text-white text-sm">${dateFull}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="bg-white/25 px-2.5 py-0.5 rounded-full text-xs font-bold text-white whitespace-nowrap">
                            ${blockCount} ${blockCount === 1 ? 'block' : 'blocks'} • 📝 ${entry.totalCount} • 💬 ${entry.phrases.length}
                        </span>
                        <span class="toggle-icon text-white text-xs">▼</span>
                    </div>
                </div>
            </div>
            <div id="${blockId}" class="forecast-content hidden p-2">
                ${blocksHtml}${phrasesHtml}
                <div class="mt-2 px-3 py-2 bg-[#0f0f1a] rounded-lg border border-[#2a2a4a] flex justify-between items-center text-[10px]">
                    <span class="text-gray-500">💡 ${blockCount} block(s) • ${entry.totalCount} words total on this day</span>
                    <span class="${loadColor} font-bold">${loadLabel}</span>
                </div>
            </div>
        `;
        container.appendChild(block);
    });
    
    const totalScheduled = sorted.reduce((sum, d) => sum + d.totalCount, 0);
    const avgPerDay = Math.round(totalScheduled / sorted.length);
    const busiestDay = sorted.reduce((max, d) => d.totalCount > max.totalCount ? d : max, sorted[0]);
    
    const summary = document.createElement('div');
    summary.className = 'bg-[#0f0f1a] rounded-xl p-3 border border-[#2a2a4a] grid grid-cols-4 gap-2 text-center text-xs mt-3';
    summary.innerHTML = `
        <div>
            <div class="text-indigo-400 font-bold text-lg">${sorted.length}</div>
            <div class="text-gray-500">📅 Days</div>
        </div>
        <div>
            <div class="text-green-400 font-bold text-lg">${totalScheduled}</div>
            <div class="text-gray-500">📝 Words</div>
        </div>
        <div>
            <div class="text-amber-400 font-bold text-lg">${avgPerDay}</div>
            <div class="text-gray-500">📊 Avg</div>
        </div>
        <div>
            <div class="text-red-400 font-bold text-lg">${busiestDay.totalCount}</div>
            <div class="text-gray-500">🔥 Max</div>
        </div>
    `;
    container.appendChild(summary);
    
    container.querySelectorAll('.forecast-header').forEach(header => {
        header.addEventListener('click', function() {
            const targetId = this.dataset.target;
            const content = document.getElementById(targetId);
            const icon = this.querySelector('.toggle-icon');
            
            if (content.classList.contains('hidden')) {
                content.classList.remove('hidden');
                icon.textContent = '▲';
            } else {
                content.classList.add('hidden');
                icon.textContent = '▼';
            }
        });
    });
    
    const firstContent = document.getElementById('forecast-block-0');
    const firstHeader = container.querySelector('.forecast-header');
    if (firstContent && firstHeader) {
        firstContent.classList.remove('hidden');
        const icon = firstHeader.querySelector('.toggle-icon');
        if (icon) icon.textContent = '▲';
    }
    
    if (warningEl) {
        if (overloadDays.length > 0) {
            const worst = overloadDays.reduce((max, d) => d.totalCount > max.totalCount ? d : max, overloadDays[0]);
            const worstDate = worst.date.toLocaleDateString('en', { day: '2-digit', month: 'short', year: 'numeric' });
            warningEl.innerHTML = `
                <div class="bg-red-600/10 border border-red-500/30 rounded-xl p-3 text-xs">
                    <div class="flex items-start gap-2">
                        <span class="text-xl">⚠️</span>
                        <div>
                            <div class="font-bold text-red-400 mb-1">Overload warning!</div>
                            <div class="text-gray-300">
                                <b>${overloadDays.length}</b> day(s) with ≥${OVERLOAD_THRESHOLD} words.
                                Worst: <b>${worstDate}</b> — <b>${worst.totalCount}</b> words.
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            warningEl.innerHTML = `
                <div class="bg-green-600/10 border border-green-500/30 rounded-xl p-2 text-xs text-green-400 text-center">
                    ✅ No overload detected — schedule looks balanced
                </div>
            `;
        }
    }
}

function updateTrend(cards) {
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 7);
    
    const learnedThisWeek = cards.filter(c => {
        const created = c.createdAtRaw?.toDate ? c.createdAtRaw.toDate() : new Date(c.createdAtRaw);
        return c.status === 'finished' && created >= sevenDaysAgo;
    }).length;
    
    const learnedLastWeek = cards.filter(c => {
        const created = c.createdAtRaw?.toDate ? c.createdAtRaw.toDate() : new Date(c.createdAtRaw);
        const lastWeekStart = new Date(sevenDaysAgo);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        return c.status === 'finished' && created >= lastWeekStart && created < sevenDaysAgo;
    }).length;
    
    const trendIcon = document.getElementById('trendIcon');
    const trendText = document.getElementById('trendText');
    const trendDetail = document.getElementById('trendDetail');
    
    if (!trendIcon || !trendText || !trendDetail) return;
    
    if (learnedThisWeek > learnedLastWeek) {
        trendIcon.textContent = '📈';
        trendText.textContent = '🚀 Getting faster!';
        trendText.className = 'text-sm font-bold text-green-400';
        trendDetail.textContent = `${learnedThisWeek} words learned this week (↑ ${learnedThisWeek - learnedLastWeek} more than last week)`;
    } else if (learnedThisWeek < learnedLastWeek) {
        trendIcon.textContent = '📉';
        trendText.textContent = '🐢 Slowing down';
        trendText.className = 'text-sm font-bold text-red-400';
        trendDetail.textContent = `${learnedThisWeek} words learned this week (↓ ${learnedLastWeek - learnedThisWeek} less than last week)`;
    } else {
        trendIcon.textContent = '➡️';
        trendText.textContent = '⚖️ Steady pace';
        trendText.className = 'text-sm font-bold text-gray-400';
        trendDetail.textContent = `${learnedThisWeek} words learned this week (same as last week)`;
    }
}

async function renderDictStats(cards) {
    const container = document.getElementById('dictStatsContainer');
    if (!container) return;
    const dictMap = new Map();
    
    for (const card of cards) {
        const name = card.dictionaryName || 'No dictionary';
        if (!dictMap.has(name)) dictMap.set(name, { total: 0, learned: 0 });
        const stats = dictMap.get(name);
        stats.total++;
        if (card.status === 'finished') stats.learned++;
    }
    
    container.innerHTML = '';
    for (const [name, stats] of dictMap) {
        const pct = stats.total > 0 ? Math.round((stats.learned / stats.total) * 100) : 0;
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between text-xs border-b border-[#2a2a4a] py-1.5';
        div.innerHTML = `
            <span class="font-medium text-gray-300 truncate max-w-[120px]" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
            <div class="flex items-center gap-2 flex-1 ml-2">
                <div class="flex-1 bg-[#2a2a4a] rounded-full h-1.5">
                    <div class="bg-indigo-500 h-1.5 rounded-full transition-all duration-500" style="width: ${pct}%"></div>
                </div>
                <span class="text-gray-400 min-w-[40px] text-right">${stats.learned}/${stats.total}</span>
            </div>
        `;
        container.appendChild(div);
    }
    
    if (dictMap.size === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 text-xs py-2">No dictionaries yet</div>';
    }
}

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.filter-btn').forEach(b => {
            b.classList.remove('bg-indigo-500', 'text-white');
            b.classList.add('bg-[#2a2a4a]', 'text-gray-300');
        });
        this.classList.remove('bg-[#2a2a4a]', 'text-gray-300');
        this.classList.add('bg-indigo-500', 'text-white');
        
        currentFilter = this.dataset.filter;
        applyAnalyticsFilter();
    });
});

async function getAllCardsForAnalytics() {
    return await getAllCards();
}

document.getElementById('exportPdfBtn').addEventListener('click', function() {
    const totalDicts = document.getElementById('totalDicts').textContent;
    const totalWords = document.getElementById('totalWords').textContent;
    const learnedWords = document.getElementById('learnedWords').textContent;
    const remainingWords = document.getElementById('remainingWords').textContent;
    const progress = document.getElementById('progressPercent').textContent;
    const trendText = document.getElementById('trendText').textContent;
    const trendDetail = document.getElementById('trendDetail').textContent;
    
    const sourcesEl = document.getElementById('sourcesStats');
    const sourcesText = sourcesEl ? sourcesEl.textContent : 'No sources';
    
    const report = `
========================================
        SRS TRAINER REPORT
========================================
Date: ${new Date().toLocaleString()}
Filter: ${currentFilter}

---------- STATISTICS ----------
📚 Dictionaries:      ${totalDicts}
📝 Total Words:       ${totalWords}
✅ Learned:           ${learnedWords}
⏳ Remaining:         ${remainingWords}
📊 Progress:          ${progress}

---------- TREND ----------
${trendText}
${trendDetail}

---------- SOURCES ----------
${sourcesText}

========================================
    SRS Trainer — Smart Learning
========================================
    `;
    
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `SRS_Report_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
});

// ===== СОХРАНЕНИЕ СЛОВАРЯ (валидация + таблица дублей) =====
document.getElementById('saveDictBtn').addEventListener('click', async function() {
    if (this.disabled) return;

    const name = document.getElementById('dictName').value.trim();
    const text = document.getElementById('wordsInput').value;
    const interval = parseInt(document.getElementById('intervalSelect').value);
    const sources = Array.from(selectedSources);
    const links = savedLinks;
    const createDate = document.getElementById('createDate').value;

    if (!name) { alert('Enter dictionary name'); return; }
    if (!text.trim()) { alert('Enter words'); return; }

    const parsed = parseCardText(text);
    if (parsed.invalid.length > 0) {
        const list = parsed.invalid
            .slice(0, 8)
            .map(e => `• Строка ${e.lineNum}: ${e.error}`)
            .join('\n');
        alert(`❌ Ошибки в формате (${parsed.invalid.length}):\n\n${list}${parsed.invalid.length > 8 ? '\n…' : ''}`);
        return;
    }
    if (parsed.valid.length === 0) {
        alert('⚠️ Нет валидных строк для добавления');
        return;
    }

    const existing = await getAllDictionaries();
    const existingCards = existing.get(name) || [];
    const existingWords = new Set(existingCards.map(c => (c.word || '').toLowerCase()));

    const duplicates = parsed.valid.filter(v => existingWords.has(v.word.toLowerCase()));
    const unique = parsed.valid.filter(v => !existingWords.has(v.word.toLowerCase()));

    if (duplicates.length > 0) {
        const decision = await showDuplicatesTable(duplicates);
        const toAdd = unique.concat(duplicates.filter(d => decision.addSet.has(d.lineNum)));
        if (toAdd.length === 0) {
            showToast('Все строки отклонены — ничего не добавлено', 'warning');
            return;
        }
        const rebuiltText = toAdd.map(v =>
            `${v.phraseEn} — ${v.phraseRu} — ${v.word} — ${v.translation}`
        ).join('\n');
        return doSave(rebuiltText);
    }

    return doSave(text);

    async function doSave(finalText) {
        const btn = document.getElementById('saveDictBtn');
        if (btn.disabled) return;
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = '⏳ Saving...';
        try {
            const res = await createDictionary(name, finalText, interval, sources, links, createDate);
            const count = (typeof res === 'number') ? res : res.created;
            let msg = `✅ ${count} добавлено в «${name}»`;
            if (typeof res === 'object' && res.skipped > 0) msg += `, ${res.skipped} дублей пропущено`;
            showToast(msg, 'success');

            document.getElementById('dictName').value = '';
            document.getElementById('wordsInput').value = '';
            document.getElementById('createDate').value = setCurrentDate();
            selectedSources.clear();
            savedLinks = [];
            renderSelectedSources();
            document.querySelectorAll('.source-btn').forEach(b => {
                b.classList.remove('bg-indigo-500', 'text-white');
                b.classList.add('bg-[#2a2a4a]', 'text-gray-300');
            });
            showScreen('today');
        } catch (e) {
            console.error('Save error:', e);
            alert('❌ ' + (e.message || 'Failed to save'));
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
});

// ===== 📊 ТАБЛИЦА ДУБЛЕЙ =====
function showDuplicatesTable(duplicates) {
    return new Promise(resolve => {
        const old = document.getElementById('duplicatesModal');
        if (old) old.remove();

        const modal = document.createElement('div');
        modal.id = 'duplicatesModal';
        modal.className = 'fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm';

        const rows = duplicates.map((d, i) => `
            <tr class="border-b border-[#2a2a4a] hover:bg-[#0f0f1a]">
                <td class="p-2 text-xs text-gray-500">${i + 1}</td>
                <td class="p-2">
                    <select class="dup-decision w-full bg-[#0f0f1a] text-gray-200 text-xs rounded p-1 border border-[#2a2a4a]" data-line="${d.lineNum}">
                        <option value="add">➕ Добавить</option>
                        <option value="reject">🚫 Отклонить</option>
                    </select>
                </td>
                <td class="p-2 text-indigo-300 text-xs">${escapeHtml(d.phraseEn)}</td>
                <td class="p-2 text-green-300 text-xs">${escapeHtml(d.phraseRu)}</td>
                <td class="p-2 text-indigo-300 text-xs">${escapeHtml(d.word)}</td>
                <td class="p-2 text-green-300 text-xs">${escapeHtml(d.translation)}</td>
            </tr>
        `).join('');

        modal.innerHTML = `
            <div class="bg-[#1a1a2e] rounded-2xl max-w-3xl w-full p-5 border border-[#2a2a4a] shadow-2xl">
                <div class="flex justify-between items-center mb-3">
                    <h3 class="text-lg font-bold text-yellow-400">⚠️ Найдены дубли (${duplicates.length})</h3>
                    <button id="dupCancelBtn" class="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </div>
                <p class="text-xs text-gray-400 mb-3">Эти слова уже есть в словаре. Выберите: добавить повторно или отклонить.</p>
                <div class="overflow-x-auto max-h-80 overflow-y-auto rounded-lg border border-[#2a2a4a]">
                    <table class="w-full text-xs">
                        <thead class="bg-[#0f0f1a] sticky top-0">
                            <tr>
                                <th class="p-2 text-left text-gray-400">#</th>
                                <th class="p-2 text-left text-gray-400">Решение</th>
                                <th class="p-2 text-left text-gray-400">Phrase EN</th>
                                <th class="p-2 text-left text-gray-400">Phrase RU</th>
                                <th class="p-2 text-left text-gray-400">Word</th>
                                <th class="p-2 text-left text-gray-400">Translate</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <div class="flex gap-2 mt-4">
                    <button id="dupAllAddBtn" class="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded-lg text-sm">➕ Добавить все</button>
                    <button id="dupAllRejectBtn" class="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg text-sm">🚫 Отклонить все</button>
                    <button id="dupApplyBtn" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-lg text-sm">✅ Применить</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const addSet = new Set();
        const rejectSet = new Set();

        const apply = () => {
            modal.querySelectorAll('.dup-decision').forEach(sel => {
                const lineNum = parseInt(sel.dataset.line);
                if (sel.value === 'add') addSet.add(lineNum);
                else rejectSet.add(lineNum);
            });
        };

        const close = (result) => {
            modal.remove();
            resolve(result);
        };

        document.getElementById('dupCancelBtn').addEventListener('click', () => close({ addSet: new Set(), rejectSet: new Set() }));
        document.getElementById('dupAllAddBtn').addEventListener('click', () => {
            modal.querySelectorAll('.dup-decision').forEach(s => s.value = 'add');
        });
        document.getElementById('dupAllRejectBtn').addEventListener('click', () => {
            modal.querySelectorAll('.dup-decision').forEach(s => s.value = 'reject');
        });
        document.getElementById('dupApplyBtn').addEventListener('click', () => {
            apply();
            close({ addSet, rejectSet });
        });
    });
}

// ===== TOAST =====
function showToast(message, type = 'success') {
    const old = document.getElementById('appToast');
    if (old) old.remove();

    const colors = {
        success: 'bg-green-500 text-black',
        error: 'bg-red-500 text-white',
        info: 'bg-white text-black',
        warning: 'bg-yellow-500 text-black'
    };
    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️',
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

// ==================== 🔍 DUPLICATE ANALYZER ====================
function normalizeWord(str) {
    if (!str) return '';
    return String(str).toLowerCase().trim().replace(/\s+/g, ' ').replace(/[.,!?;:'"()\[\]{}]/g, '');
}

function wordsAreSimilar(a, b) {
    const na = normalizeWord(a);
    const nb = normalizeWord(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    if (na.length < 3 || nb.length < 3) return false;
    const prefix = Math.min(4, na.length, nb.length);
    if (na.slice(0, prefix) === nb.slice(0, prefix)) return true;
    return false;
}

function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i-1] === b[j-1]
                ? dp[i-1][j-1]
                : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
        }
    }
    return dp[m][n];
}

function isNearDuplicate(a, b) {
    const na = normalizeWord(a);
    const nb = normalizeWord(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    if (Math.abs(na.length - nb.length) > 3) return false;
    const dist = levenshtein(na, nb);
    const maxLen = Math.max(na.length, nb.length);
    if (maxLen === 0) return false;
    const similarity = 1 - dist / maxLen;
    return similarity >= 0.75;
}

async function runDuplicateAnalyzer() {
    const btn = document.getElementById('duplicateAnalyzerBtn');
    const modal = document.getElementById('analyzerModal');
    const content = document.getElementById('analyzerContent');

    btn.disabled = true;
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<div class="analyzer-spinner"></div> <span class="ml-3">Analyzing...</span>';

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    content.innerHTML = `
        <div class="flex flex-col items-center justify-center py-16">
            <div class="analyzer-spinner"></div>
            <p class="mt-4 text-gray-400">Scanning all dictionaries...</p>
        </div>
    `;

    try {
        const [cards, phrases] = await Promise.all([getAllCards(), getAllPhrases()]);

        const exactDuplicates = [];
        const nearDuplicates = [];

        for (let i = 0; i < cards.length; i++) {
            for (let j = i + 1; j < cards.length; j++) {
                const a = cards[i];
                const b = cards[j];
                const aWord = normalizeWord(a.word);
                const bWord = normalizeWord(b.word);
                const aTrans = normalizeWord(a.translation);
                const bTrans = normalizeWord(b.translation);

                if ((aWord && aWord === bWord) || (aTrans && aTrans === bTrans && aWord === bWord)) {
                    exactDuplicates.push({ word: a.word, translation: a.translation, items: [a, b] });
                } else if (isNearDuplicate(a.word, b.word)) {
                    nearDuplicates.push({ word: a.word, translation: a.translation, items: [a, b] });
                }
            }
        }

        for (let i = 0; i < phrases.length; i++) {
            for (let j = i + 1; j < phrases.length; j++) {
                const a = phrases[i];
                const b = phrases[j];
                const aEn = normalizeWord(a.english);
                const bEn = normalizeWord(b.english);
                const aRu = normalizeWord(a.russian);
                const bRu = normalizeWord(b.russian);

                if ((aEn && aEn === bEn) || (aRu && aRu === bRu)) {
                    exactDuplicates.push({ word: a.english, translation: a.russian, items: [a, b], type: 'phrase' });
                } else if (isNearDuplicate(a.english, b.english)) {
                    nearDuplicates.push({ word: a.english, translation: a.russian, items: [a, b], type: 'phrase' });
                }
            }
        }

        renderAnalyzerResult(exactDuplicates, nearDuplicates);

    } catch (e) {
        console.error('Analyzer error:', e);
        content.innerHTML = `<div class="text-red-400 text-center py-8">❌ Error: ${e.message}</div>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
    }
}

function renderAnalyzerResult(exact, near) {
    const content = document.getElementById('analyzerContent');

    if (exact.length === 0 && near.length === 0) {
        content.innerHTML = `
            <div class="text-center py-12">
                <div class="text-5xl mb-3">✅</div>
                <p class="text-green-400 font-bold text-lg">No duplicates found!</p>
                <p class="text-gray-500 text-sm mt-2">Your database is clean.</p>
            </div>
        `;
        return;
    }

    let html = '';

    if (exact.length > 0) {
        html += `
            <div class="mb-6">
                <h4 class="text-red-400 font-bold mb-3 flex items-center gap-2">
                    <span>🚫</span> Exact Duplicates (${exact.length})
                </h4>
                <div class="space-y-3">`;

        exact.forEach((group, gi) => {
            html += `
                <div class="bg-[#0a0a0a] border border-red-500/30 rounded-xl p-3">
                    <div class="text-xs text-red-400 mb-2">Group #${gi + 1} — Word: "${esc(group.word)}"</div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-xs">
                            <thead class="bg-[#0f0f1a]">
                                <tr>
                                    <th class="p-2 text-left text-gray-400">☑</th>
                                    <th class="p-2 text-left text-gray-400">Word</th>
                                    <th class="p-2 text-left text-gray-400">Translation</th>
                                    <th class="p-2 text-left text-gray-400">Dictionary</th>
                                    <th class="p-2 text-left text-gray-400">Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${group.items.map(item => `
                                    <tr class="border-b border-[#2a2a4a]/50 hover:bg-[#0f0f1a]">
                                        <td class="p-2"><input type="checkbox" class="dup-checkbox w-4 h-4 accent-red-500" data-id="${item.id}" data-type="${group.type || 'word'}"></td>
                                        <td class="p-2 text-indigo-300">${esc(item.word || item.english || '—')}</td>
                                        <td class="p-2 text-green-300">${esc(item.translation || item.russian || '—')}</td>
                                        <td class="p-2 text-gray-400 text-[11px]">${esc(item.dictionaryName || 'Phrases')}</td>
                                        <td class="p-2 text-gray-500 text-[11px]">${esc(item.createdAt || '—')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>`;
        });

        html += `</div></div>`;
    }

    if (near.length > 0) {
        html += `
            <div class="mb-6">
                <h4 class="text-yellow-400 font-bold mb-3 flex items-center gap-2">
                    <span>⚠️</span> Similar Words (${near.length})
                </h4>
                <div class="space-y-3">`;

        near.slice(0, 20).forEach((group, gi) => {
            html += `
                <div class="bg-[#0a0a0a] border border-yellow-500/30 rounded-xl p-3">
                    <div class="text-xs text-yellow-400 mb-2">⚠️ May be duplicates — "${esc(group.word)}"</div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-xs">
                            <tbody>
                                ${group.items.map(item => `
                                    <tr class="border-b border-[#2a2a4a]/50 hover:bg-[#0f0f1a]">
                                        <td class="p-2"><input type="checkbox" class="dup-checkbox w-4 h-4 accent-yellow-500" data-id="${item.id}" data-type="${group.type || 'word'}"></td>
                                        <td class="p-2 text-indigo-300">${esc(item.word || item.english || '—')}</td>
                                        <td class="p-2 text-green-300">${esc(item.translation || item.russian || '—')}</td>
                                        <td class="p-2 text-gray-400 text-[11px]">${esc(item.dictionaryName || 'Phrases')}</td>
                                        <td class="p-2 text-gray-500 text-[11px]">${esc(item.createdAt || '—')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>`;
        });

        html += `</div></div>`;
    }

    html += `
        <div class="flex gap-2 mt-6 pt-4 border-t border-[#2a2a4a]">
            <button id="deleteSelectedBtn" class="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-red-500/20">
                🗑 Delete Selected
            </button>
            <button id="closeAnalyzerBtn" class="flex-1 btn-ghost py-3 rounded-xl font-bold">
                Close
            </button>
        </div>
    `;

    content.innerHTML = html;

    document.getElementById('closeAnalyzerBtn').addEventListener('click', closeAnalyzerModal);

    document.getElementById('deleteSelectedBtn').addEventListener('click', async () => {
        const checked = content.querySelectorAll('.dup-checkbox:checked');
        if (checked.length === 0) {
            showToast('Nothing selected', 'warning');
            return;
        }
        if (!confirm(`Delete ${checked.length} item(s)? This cannot be undone.`)) return;

        try {
            const items = [];
            checked.forEach(cb => {
                items.push({
                    coll: cb.dataset.type === 'phrase' ? 'phrases' : 'cards',
                    id: cb.dataset.id
                });
            });
            await deleteDocsBatch(items);
            showToast(`Deleted ${checked.length} item(s)`, 'success');
            closeAnalyzerModal();
            if (typeof loadDictionaries === 'function') loadDictionaries();
        } catch (e) {
            console.error(e);
            showToast('Failed to delete', 'error');
        }
    });
}

function closeAnalyzerModal() {
    const modal = document.getElementById('analyzerModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// ===== 🔀 ПЕРЕКЛЮЧАТЕЛЬ РЕЖИМА ВИДА =====
function updateViewModeButtons() {
    const hBtn = document.getElementById('viewModeHorizontal');
    const vBtn = document.getElementById('viewModeVertical');
    if (hBtn) hBtn.classList.toggle('view-mode-active', todayViewMode === 'horizontal');
    if (vBtn) vBtn.classList.toggle('view-mode-active', todayViewMode === 'vertical');
}

function setTodayViewMode(mode) {
    if (mode !== 'horizontal' && mode !== 'vertical') return;
    if (todayViewMode === mode) return;

    const container = document.getElementById('todayCardsContainer');
    if (container) container.classList.add('view-transition', 'view-transition-out');

    setTimeout(() => {
        todayViewMode = mode;
        try { localStorage.setItem('todayViewMode', mode); } catch (e) {}
        updateViewModeButtons();

        Promise.resolve(loadToday()).then(() => {
            const freshContainer = document.getElementById('todayCardsContainer');
            if (freshContainer) {
                freshContainer.classList.add('view-transition', 'view-transition-out');
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        freshContainer.classList.remove('view-transition-out');
                    });
                });
            }
        });
    }, 180);
}

document.addEventListener('DOMContentLoaded', () => {
    updateViewModeButtons();

    const hBtn = document.getElementById('viewModeHorizontal');
    const vBtn = document.getElementById('viewModeVertical');
    if (hBtn) hBtn.addEventListener('click', () => setTodayViewMode('horizontal'));
    if (vBtn) vBtn.addEventListener('click', () => setTodayViewMode('vertical'));

    const viewToggle = document.getElementById('todayViewToggle');
    const tabWords = document.getElementById('tabTodayWords');
    const tabPhrases = document.getElementById('tabTodayPhrases');
    if (viewToggle && tabWords && tabPhrases) {
        tabWords.addEventListener('click', () => viewToggle.classList.remove('hidden'));
        tabPhrases.addEventListener('click', () => viewToggle.classList.add('hidden'));
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('duplicateAnalyzerBtn');
    if (btn) btn.addEventListener('click', runDuplicateAnalyzer);
    const closeBtn = document.getElementById('closeAnalyzerModal');
    if (closeBtn) closeBtn.addEventListener('click', closeAnalyzerModal);
    const modal = document.getElementById('analyzerModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeAnalyzerModal();
        });
    }
});

navBtns.forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.nav));
});


// ===== СТАТИСТИКА ФРАЗ ПО КАТЕГОРИЯМ (ТЕГАМ) =====
function renderPhrasesCategoryStats() {
    const container = document.getElementById('phrasesCategoryStats');
    if (!container) return;

    // Берем все фразы из кэша (он заполняется в loadAnalytics)
    const phrases = allPhrasesCache || [];

    const categories = {
        'everyday': { label: '💬 Everyday English', count: 0, color: 'text-green-400' },
        'university': { label: '🎓 University', count: 0, color: 'text-blue-400' },
        'discussion': { label: '🗣️ Discussions', count: 0, color: 'text-yellow-400' },
        'it': { label: '💻 IT & Programming', count: 0, color: 'text-indigo-400' },
        'ai-cyber': { label: '🤖 AI & Cyber', count: 0, color: 'text-red-400' },
        'academic': { label: '📚 Academic', count: 0, color: 'text-purple-400' }
    };

    // Считаем фразы по тегам
    phrases.forEach(p => {
        if (p.sources && p.sources.length > 0) {
            p.sources.forEach(src => {
                if (categories[src]) categories[src].count++;
            });
        }
    });

    // Сортируем от большего к меньшему
    const sorted = Object.entries(categories).sort((a, b) => b[1].count - a[1].count);

    container.innerHTML = sorted.map(([key, data]) => `
        <div class="bg-[#0f0f0f] border border-[#222222] rounded-lg p-3 flex flex-col items-center justify-center text-center">
            <div class="text-xl font-bold ${data.color}">${data.count}</div>
            <div class="text-[11px] text-gray-400 mt-1 leading-tight">${data.label}</div>
        </div>
    `).join('');
}

showScreen('create');