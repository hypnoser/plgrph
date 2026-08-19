/**
 * Модуль оцінювання R&I за системою FROSS
 */
class RIModule {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) throw new Error("RI Container not found");

        this.selectCount = document.getElementById('ri-presentations-count');
        this.conclusionBox = document.getElementById('ri-conclusion-box');
        
        // Початковий стан
        this.state = {
            presentations: 3,
            scores: this._initEmptyScores(5) // Максимум 5 пред'явлень у пам'яті
        };

        this.channels = ['P', 'E', 'C'];
        this.questionsCount = 5;

        this._bindEvents();
        this.render();
    }

    // Створює порожній двовимірний масив для збереження балів
    _initEmptyScores(maxPresentations) {
        let scores = [];
        for (let i = 0; i < maxPresentations; i++) {
            scores.push({
                P: [null, null, null, null, null],
                E: [null, null, null, null, null],
                C: [null, null, null, null, null]
            });
        }
        return scores;
    }

    _bindEvents() {
        this.selectCount.addEventListener('change', (e) => {
            this.state.presentations = parseInt(e.target.value, 10);
            this.render();
            this._triggerSave();
        });

        // Делегування подій для динамічних select у таблицях
        this.container.addEventListener('change', (e) => {
            if (e.target.classList.contains('ri-select')) {
                const pIndex = parseInt(e.target.dataset.presentation, 10);
                const channel = e.target.dataset.channel;
                const qIndex = parseInt(e.target.dataset.question, 10);
                const val = e.target.value === "" ? null : parseInt(e.target.value, 10);
                
                this.state.scores[pIndex][channel][qIndex] = val;
                
                this.calculateAndHighlight();
                this._triggerSave();
            }
        });
    }

    // Генерація DOM-структури таблиць
    render() {
        this.container.innerHTML = '';
        
        for (let p = 0; p < this.state.presentations; p++) {
            const table = document.createElement('table');
            table.className = 'ri-table';
            table.setAttribute('data-presentation-index', p);
            
            // Заголовок
            let thead = `<tr><th>Пред'явлення №${p + 1}</th>`;
            for (let q = 0; q < this.questionsCount; q++) {
                thead += `<th data-col="${q}">R${q + 1}</th>`;
            }
            thead += `</tr>`;
            
            // Тіло таблиці (канали)
            let tbody = '';
            this.channels.forEach(channel => {
                tbody += `<tr><td><strong>${channel}</strong></td>`;
                for (let q = 0; q < this.questionsCount; q++) {
                    const val = this.state.scores[p][channel][q];
                    const selected = (v) => val === v ? 'selected' : '';
                    
                    tbody += `<td data-col="${q}">
                        <select class="ri-select" data-presentation="${p}" data-channel="${channel}" data-question="${q}">
                            <option value="" ${selected(null)}>-</option>
                            <option value="3" ${selected(3)}>3</option>
                            <option value="2" ${selected(2)}>2</option>
                            <option value="1" ${selected(1)}>1</option>
                        </select>
                    </td>`;
                }
                tbody += `</tr>`;
            });

            // Рядок SUBTOTAL
            let subtotalRow = `<tr class="ri-subtotal-row"><td>SUBTOTAL</td>`;
            for (let q = 0; q < this.questionsCount; q++) {
                subtotalRow += `<td data-col="${q}" id="subtotal-p${p}-q${q}">0</td>`;
            }
            subtotalRow += `</tr>`;

            table.innerHTML = `<thead>${thead}</thead><tbody>${tbody}${subtotalRow}</tbody>`;
            this.container.appendChild(table);
        }

        // Рядок загального рангу (рендериться завжди як окрема таблиця для фіналізації)
        if (this.state.presentations > 1) {
            const totalTable = document.createElement('table');
            totalTable.className = 'ri-table';
            totalTable.id = 'ri-total-table';
            let tTotal = `<tr class="ri-total-row"><td>ЗАГАЛЬНИЙ РАНГ</td>`;
            for (let q = 0; q < this.questionsCount; q++) {
                tTotal += `<td data-col="${q}" id="total-q${q}">0</td>`;
            }
            tTotal += `</tr>`;
            totalTable.innerHTML = `<tbody>${tTotal}</tbody>`;
            this.container.appendChild(totalTable);
        }

        // Перерахунок після рендеру
        this.calculateAndHighlight();
    }

    calculateAndHighlight() {
        let globalTotals = [0, 0, 0, 0, 0];

        // 1. Обчислення SUBTOTALS
        for (let p = 0; p < this.state.presentations; p++) {
            for (let q = 0; q < this.questionsCount; q++) {
                let sub = 0;
                this.channels.forEach(ch => {
                    sub += this.state.scores[p][ch][q] || 0;
                });
                
                const subCell = document.getElementById(`subtotal-p${p}-q${q}`);
                if (subCell) subCell.textContent = sub;
                
                globalTotals[q] += sub;
            }
        }

        // 2. Оновлення Загального рангу
        for (let q = 0; q < this.questionsCount; q++) {
            const totalCell = document.getElementById(`total-q${q}`);
            if (totalCell) totalCell.textContent = globalTotals[q];
        }

        // 3. Визначення максимуму FROSS
        const maxScore = Math.max(...globalTotals);
        
        // Очищення попередніх підсвічувань
        document.querySelectorAll('.ri-highlight').forEach(el => el.classList.remove('ri-highlight'));
        
        let winningQuestions = [];

        // Підсвічуємо лише якщо є хоч якісь бали
        if (maxScore > 0) {
            globalTotals.forEach((score, index) => {
                if (score === maxScore) {
                    winningQuestions.push(`R${index + 1}`);
                    // Підсвічуємо всі комірки відповідної колонки (data-col)
                    document.querySelectorAll(`[data-col="${index}"]`).forEach(td => {
                        td.classList.add('ri-highlight');
                    });
                }
            });
        }

        // 4. Генерація висновку
        this._generateConclusion(winningQuestions, maxScore);
    }

    _generateConclusion(winners, maxScore) {
        if (maxScore === 0) {
            this.conclusionBox.innerHTML = "Недостатньо даних для формування висновку.";
            this.conclusionBox.style.display = "none";
            return;
        }

        this.conclusionBox.style.display = "block";
        const qStr = winners.join(', ');
        
        // Суворе дотримання правила: жодних вердиктів (SR/NSR), лише констатація FROSS.
        this.conclusionBox.innerHTML = `Найвищий сумарний ранг (${maxScore} балів) має питання <strong>${qStr}</strong>. 
        <br><em>Рекомендується зосередити подальше дослідження за тематичним напрямком цього (цих) запитань (breakdown test).</em>`;
    }

    // Метод для виклику загального збереження даних в app.js
    _triggerSave() {
        // Якщо у вашому проєкті є глобальна функція автозбереження:
        if (typeof window.autoSave === 'function') {
            window.autoSave();
        }
    }

    // Публічний API для імпорту/експорту стану (localStorage)
    exportState() {
        return this.state;
    }

    importState(savedState) {
        if (savedState && savedState.presentations) {
            this.state = savedState;
            this.selectCount.value = this.state.presentations;
            this.render();
        }
    }
}

// Ініціалізація модуля при завантаженні DOM
document.addEventListener('DOMContentLoaded', () => {
    // Вказуємо ID контейнера, де генеруватимуться таблиці (всередині вкладки)
    window.riModule = new RIModule('ri-tables-container');
});