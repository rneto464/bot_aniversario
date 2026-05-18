document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    let allColabs = [];

    // --- DOM Elements ---
    const searchInput = document.getElementById('search-input');
    const allList = document.getElementById('all-list');
    const upcomingList = document.getElementById('upcoming-list');
    const totalCount = document.getElementById('total-count');

    // Calendar Elements & State
    const now = new Date();
    let currentMonth = now.getMonth();
    let currentYear = now.getFullYear();
    const calendarGrid = document.getElementById('calendar-grid');
    const calendarMonthTitle = document.getElementById('calendar-month-title');
    const btnCalPrev = document.getElementById('cal-prev');
    const btnCalNext = document.getElementById('cal-next');

    // Modals
    const modalAdd = document.getElementById('modal-add');
    const modalConfig = document.getElementById('modal-config');
    const modalLogs = document.getElementById('modal-logs');

    // Buttons
    const btnAdd = document.getElementById('btn-add');
    const btnConfig = document.getElementById('btn-config');
    const btnLogs = document.getElementById('btn-logs');
    const btnForceRun = document.getElementById('btn-force-run');

    // Forms
    const formAdd = document.getElementById('form-add');
    const formConfig = document.getElementById('form-config');

    // Hidden Input
    const hiddenFileInput = document.getElementById('hidden-file-input');
    let currentUploadId = null;

    // --- Input Masks ---
    const inputTelefone = document.getElementById('add-telefone');
    if (inputTelefone) {
        inputTelefone.addEventListener('input', function (e) {
            let x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,5})(\d{0,4})/);
            e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
        });
    }

    // --- Fetch Data ---
    async function carregarColaboradores() {
        try {
            const res = await fetch('/api/colaboradores');
            allColabs = await res.json();
            renderLists();
        } catch (e) {
            console.error("Erro ao carregar colaboradores:", e);
        }
    }

    async function carregarConfiguracoes() {
        try {
            const res = await fetch('/api/configuracoes');
            const data = await res.json();
            document.getElementById('config-msg').value = data.mensagem_padrao || '';
            document.getElementById('config-zap').value = data.whatsapp_group_id || '';
            document.getElementById('config-smtp').value = data.smtp_server || '';
            document.getElementById('config-port').value = data.smtp_port || '';
            document.getElementById('config-user').value = data.email_user || '';
            document.getElementById('config-pass').value = data.email_pass || '';
        } catch (e) {
            console.error("Erro ao carregar configs:", e);
        }
    }

    // --- Render ---
    function isUpcoming(dateStr) {
        if(!dateStr) return false;
        const parts = dateStr.split('/');
        if(parts.length < 2) return false;
        
        const now = new Date();
        const bDay = parseInt(parts[0], 10);
        const bMonth = parseInt(parts[1], 10) - 1; // JS months are 0-11
        
        // Crie datas falsas no ano atual para comparar
        let nextBday = new Date(now.getFullYear(), bMonth, bDay);
        
        // Se já passou esse ano, olha pro ano que vem
        if (nextBday < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
            nextBday.setFullYear(now.getFullYear() + 1);
        }
        
        const diffTime = nextBday - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        return diffDays >= 0 && diffDays <= 30;
    }

    function renderColabItem(c) {
        const imageBadge = c.tem_imagem ? '<span class="has-image-badge"><i class="ph ph-image"></i> Tem foto</span>' : '';
        
        return `
            <div class="colab-item">
                <div class="colab-info">
                    <span class="colab-name">${c.nome} ${imageBadge}</span>
                    <span class="colab-details">
                        <span><i class="ph ph-calendar"></i> ${c.data_nascimento}</span>
                        ${c.email ? `<span><i class="ph ph-envelope-simple"></i> ${c.email}</span>` : ''}
                        ${c.telefone ? `<span><i class="ph ph-phone"></i> ${c.telefone}</span>` : ''}
                    </span>
                </div>
                <div class="colab-actions">
                    <button class="btn-icon image" title="Upload Imagem" onclick="triggerUpload(${c.id})"><i class="ph ph-image-square"></i></button>
                    <button class="btn-icon delete" title="Excluir" onclick="deleteColab(${c.id}, '${c.nome}')"><i class="ph ph-trash"></i></button>
                </div>
            </div>
        `;
    }

    function renderCalendar() {
        if (!calendarGrid) return;
        calendarGrid.innerHTML = '';
        
        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0);
        
        const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
        calendarMonthTitle.textContent = `${monthNames[currentMonth]} ${currentYear}`;
        
        const startingDay = firstDay.getDay(); 
        const totalDays = lastDay.getDate();
        
        for (let i = 0; i < startingDay; i++) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'cal-day empty';
            calendarGrid.appendChild(emptyDiv);
        }
        
        const isCurrentMonth = now.getMonth() === currentMonth && now.getFullYear() === currentYear;
        
        for (let day = 1; day <= totalDays; day++) {
            const dayDiv = document.createElement('div');
            dayDiv.className = 'cal-day';
            if (isCurrentMonth && day === now.getDate()) {
                dayDiv.classList.add('today');
            }
            
            const dateSpan = document.createElement('div');
            dateSpan.className = 'cal-date';
            dateSpan.textContent = day;
            dayDiv.appendChild(dateSpan);
            
            const eventsDiv = document.createElement('div');
            eventsDiv.className = 'cal-events';
            
            const dayStr = String(day).padStart(2, '0');
            const monthStr = String(currentMonth + 1).padStart(2, '0');
            
            const birthdays = allColabs.filter(c => {
                if(!c.data_nascimento) return false;
                const parts = c.data_nascimento.split('/');
                if(parts.length >= 2) {
                    return parts[0] === dayStr && parts[1] === monthStr;
                }
                return false;
            });
            
            birthdays.forEach(b => {
                const eventSpan = document.createElement('div');
                eventSpan.className = 'cal-event';
                eventSpan.textContent = b.nome.split(' ')[0];
                eventSpan.title = `${b.nome} (${b.data_nascimento})`;
                eventsDiv.appendChild(eventSpan);
            });
            
            dayDiv.appendChild(eventsDiv);
            calendarGrid.appendChild(dayDiv);
        }
    }

    if (btnCalPrev && btnCalNext) {
        btnCalPrev.addEventListener('click', () => {
            currentMonth--;
            if(currentMonth < 0) { currentMonth = 11; currentYear--; }
            renderCalendar();
        });
        btnCalNext.addEventListener('click', () => {
            currentMonth++;
            if(currentMonth > 11) { currentMonth = 0; currentYear++; }
            renderCalendar();
        });
    }

    function renderLists() {
        const searchTerm = searchInput.value.toLowerCase();
        const filtered = allColabs.filter(c => c.nome.toLowerCase().includes(searchTerm));
        
        renderCalendar();
        totalCount.textContent = filtered.length;

        const upcoming = filtered.filter(c => isUpcoming(c.data_nascimento));

        if (filtered.length === 0) {
            allList.innerHTML = '<div class="empty-state">Nenhum colaborador encontrado.</div>';
        } else {
            allList.innerHTML = filtered.map(renderColabItem).join('');
        }

        if (upcoming.length === 0) {
            upcomingList.innerHTML = '<div class="empty-state">Nenhum aniversário nos próximos 30 dias.</div>';
        } else {
            upcomingList.innerHTML = upcoming.map(renderColabItem).join('');
        }
    }

    searchInput.addEventListener('input', renderLists);

    // --- Modals ---
    function openModal(modal) {
        modal.classList.add('active');
    }

    function closeModal(modal) {
        modal.classList.remove('active');
    }

    document.querySelectorAll('.close-modal, .close-modal-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if(modal) closeModal(modal);
        });
    });

    btnAdd.addEventListener('click', () => openModal(modalAdd));
    
    btnConfig.addEventListener('click', () => {
        carregarConfiguracoes();
        openModal(modalConfig);
    });

    btnLogs.addEventListener('click', () => {
        openModal(modalLogs);
        fetchLogs();
    });

    // --- Actions ---
    formAdd.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        let rawDate = document.getElementById('add-data').value;
        let formattedDate = rawDate;
        if (rawDate && rawDate.includes('-')) {
            const parts = rawDate.split('-');
            if (parts.length === 3) {
                formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
            }
        }

        const data = {
            nome: document.getElementById('add-nome').value,
            data_nascimento: formattedDate,
            email: document.getElementById('add-email').value,
            telefone: document.getElementById('add-telefone').value
        };

        try {
            const res = await fetch('/api/colaboradores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            
            // Verifica se tem imagem para upar
            const fotoInput = document.getElementById('add-foto');
            if (fotoInput && fotoInput.files.length > 0 && result.id) {
                const formData = new FormData();
                formData.append('file', fotoInput.files[0]);
                await fetch(`/api/upload_imagem/${result.id}`, {
                    method: 'POST',
                    body: formData
                });
            }

            formAdd.reset();
            closeModal(modalAdd);
            carregarColaboradores();
        } catch (e) {
            alert('Erro ao adicionar');
        }
    });

    formConfig.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            mensagem_padrao: document.getElementById('config-msg').value,
            whatsapp_group_id: document.getElementById('config-zap').value,
            smtp_server: document.getElementById('config-smtp').value,
            smtp_port: document.getElementById('config-port').value,
            email_user: document.getElementById('config-user').value,
            email_pass: document.getElementById('config-pass').value
        };

        try {
            await fetch('/api/configuracoes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            closeModal(modalConfig);
            alert('Configurações salvas!');
        } catch (e) {
            alert('Erro ao salvar configurações');
        }
    });

    // Globals for inline onclick
    window.deleteColab = async (id, nome) => {
        if(confirm(`Tem certeza que deseja excluir ${nome}?`)) {
            await fetch(`/api/colaboradores/${id}`, { method: 'DELETE' });
            carregarColaboradores();
        }
    };

    window.triggerUpload = (id) => {
        currentUploadId = id;
        hiddenFileInput.click();
    };

    hiddenFileInput.addEventListener('change', async (e) => {
        if(e.target.files.length > 0 && currentUploadId) {
            const formData = new FormData();
            formData.append('file', e.target.files[0]);

            try {
                await fetch(`/api/upload_imagem/${currentUploadId}`, {
                    method: 'POST',
                    body: formData
                });
                alert('Imagem enviada com sucesso!');
                carregarColaboradores(); // Reload to update "tem_imagem" badge
            } catch (err) {
                alert('Erro no upload');
            }
            hiddenFileInput.value = ''; // Reset
        }
    });

    // --- Logs ---
    let logInterval;
    async function fetchLogs() {
        try {
            const res = await fetch('/api/logs');
            const data = await res.json();
            const container = document.getElementById('logs-output');
            container.textContent = data.logs.join('\n');
            container.scrollTop = container.scrollHeight;
        } catch(e) {}
    }

    // Auto-refresh logs when modal is open
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.target.classList.contains('active')) {
                logInterval = setInterval(fetchLogs, 2000);
            } else {
                clearInterval(logInterval);
            }
        });
    });
    observer.observe(modalLogs, { attributes: true, attributeFilter: ['class'] });

    btnForceRun.addEventListener('click', async () => {
        await fetch('/api/bot/rodar', { method: 'POST' });
        alert('Verificação iniciada! Acompanhe pelos logs.');
    });

    // --- Init ---
    carregarColaboradores();
});
