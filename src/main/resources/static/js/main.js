document.addEventListener('DOMContentLoaded', function() {
    const createRoomForm = document.getElementById('createRoomForm');
    const joinRoomForm = document.getElementById('joinRoomForm');
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
                window.location.href = `/room/${data.roomId}`;
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

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        setTimeout(() => {
            errorMessage.style.display = 'none';
        }, 5000);
    }
});