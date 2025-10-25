document.addEventListener('DOMContentLoaded', function() {
    const createRoomForm = document.getElementById('createRoomForm');
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
            // Показываем индикатор загрузки
            const submitBtn = createRoomForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Создание...';
            submitBtn.disabled = true;

            const response = await fetch('/api/rooms/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: roomName })
            });

            const data = await response.json();

            if (response.ok) {
                // Немедленно переходим в комнату
                window.location.href = `/room/${data.roomId}`;
            } else {
                showError(data.error || 'Ошибка при создании комнаты');
                // Восстанавливаем кнопку
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        } catch (error) {
            showError('Ошибка сети: ' + error.message);
            // Восстанавливаем кнопку
            const submitBtn = createRoomForm.querySelector('button[type="submit"]');
            submitBtn.textContent = 'Создать';
            submitBtn.disabled = false;
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
});