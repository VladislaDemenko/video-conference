document.addEventListener('DOMContentLoaded', function() {
    const createRoomForm = document.getElementById('createRoomForm');
    const joinRoomForm = document.getElementById('joinRoomForm');
    const joinByCodeForm = document.getElementById('joinByCodeForm');
    const errorMessage = document.getElementById('errorMessage');

    createRoomForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const roomName = document.getElementById('roomName').value.trim();

        if (!roomName) {
            showError('Введите название комнаты');
            return;
        }

        try {
            const response = await fetch('/api/rooms/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: roomName })
            });

            const data = await response.json();

            if (response.ok) {
                // Показываем модальное окно с ссылкой и кодом
                showInviteDetails(data);
            } else {
                showError(data.error || 'Ошибка при создании комнаты');
            }
        } catch (error) {
            showError('Ошибка сети: ' + error.message);
        }
    });

    joinRoomForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const roomId = document.getElementById('roomId').value.trim();

        if (!roomId) {
            showError('Введите ID комнаты');
            return;
        }

        try {
            const response = await fetch(`/api/rooms/${roomId}/exists`);
            const data = await response.json();

            if (data.exists) {
                window.location.href = `/room/${roomId}`;
            } else {
                showError('Комната не найдена');
            }
        } catch (error) {
            showError('Ошибка сети: ' + error.message);
        }
    });

    joinByCodeForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const inviteCode = document.getElementById('inviteCode').value.trim();

        if (!inviteCode || !/^\d{6}$/.test(inviteCode)) {
            showError('Введите корректный 6-значный код');
            return;
        }

        try {
            const response = await fetch(`/api/rooms/invite/${inviteCode}/exists`);
            const existsData = await response.json();

            if (existsData.exists) {
                // Получаем информацию о комнате по коду
                const roomResponse = await fetch(`/api/rooms/invite/${inviteCode}`);
                const roomData = await roomResponse.json();

                if (roomResponse.ok) {
                    window.location.href = `/room/${roomData.roomId}`;
                } else {
                    showError('Комната не найдена');
                }
            } else {
                showError('Код приглашения не найден');
            }
        } catch (error) {
            showError('Ошибка сети: ' + error.message);
        }
    });

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        setTimeout(() => {
            errorMessage.style.display = 'none';
        }, 5000);
    }

    function showInviteDetails(roomData) {
        // Создаем модальное окно с деталями приглашения
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>🎉 Комната создана!</h3>
                    <span class="close">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="invite-section">
                        <h4>🔗 Ссылка для приглашения:</h4>
                        <div class="invite-field">
                            <input type="text" id="inviteLink" value="${roomData.inviteLink}" readonly>
                            <button onclick="copyToClipboard('inviteLink')">📋</button>
                        </div>
                    </div>

                    <div class="invite-section">
                        <h4>🔢 Код для подключения:</h4>
                        <div class="code-display">
                            <span class="invite-code">${roomData.inviteCode}</span>
                            <button onclick="copyToClipboard('inviteCode')">📋</button>
                        </div>
                        <p class="code-hint">Сообщите этот код участникам для быстрого подключения</p>
                    </div>

                    <div class="action-buttons">
                        <button onclick="window.location.href='/room/${roomData.roomId}'" class="btn-primary">
                            🚀 Перейти в комнату
                        </button>
                        <button onclick="closeModal()" class="btn-secondary">
                            Остаться на странице
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Обработчики для модального окна
        modal.querySelector('.close').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }
});

// Глобальные функции для копирования
function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        const text = element.value || element.textContent;
        navigator.clipboard.writeText(text).then(() => {
            showTempMessage('Скопировано в буфер обмена');
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    }
}

function closeModal() {
    const modal = document.querySelector('.modal');
    if (modal) {
        document.body.removeChild(modal);
    }
}

function showTempMessage(message) {
    const tempMsg = document.createElement('div');
    tempMsg.className = 'temp-message';
    tempMsg.textContent = message;
    document.body.appendChild(tempMsg);

    setTimeout(() => {
        document.body.removeChild(tempMsg);
    }, 3000);
}