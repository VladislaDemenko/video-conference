class RoomManager {
    constructor() {
        this.stompClient = null;
        this.currentUser = {
            id: this.generateUserId(),
            username: 'User_' + Math.random().toString(36).substr(2, 5)
        };
        this.currentRoomId = this.getRoomIdFromUrl();
        this.participants = new Map();
        this.isConnected = false;
        this.localStream = null;
        this.remoteStreams = new Map();
        this.isVideoEnabled = true;
        this.isAudioEnabled = true;
        this.isScreenSharing = false;
        this.roomName = 'Комната видеоконференции';
        this.inviteCode = '';

        this.initializeEventListeners();
    }

    // Инициализация обработчиков событий
    initializeEventListeners() {
        // Кнопки управления
        document.getElementById('toggleVideo').addEventListener('click', () => this.toggleVideo());
        document.getElementById('toggleAudio').addEventListener('click', () => this.toggleAudio());
        document.getElementById('screenShare').addEventListener('click', () => this.toggleScreenShare());
        document.getElementById('settingsBtn').addEventListener('click', () => this.showSettings());
        document.getElementById('leaveBtn').addEventListener('click', () => this.leaveRoom());
        document.getElementById('inviteBtn').addEventListener('click', () => this.showInviteModal());

        // Чат
        document.getElementById('sendMessage').addEventListener('click', () => this.sendChatMessage());
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        });

        // Модальные окна
        document.getElementById('startMedia').addEventListener('click', () => this.startMedia());
        document.getElementById('cancelJoin').addEventListener('click', () => this.cancelJoin());
        document.getElementById('applySettings').addEventListener('click', () => this.applySettings());

        // Копирование ссылки и кода
        document.getElementById('copyLink').addEventListener('click', () => this.copyToClipboard('inviteLink'));
        document.getElementById('copyCode').addEventListener('click', () => this.copyToClipboard('inviteCodeDisplay'));

        // Закрытие модальных окон
        document.querySelectorAll('.close').forEach(closeBtn => {
            closeBtn.addEventListener('click', (e) => {
                e.target.closest('.modal').style.display = 'none';
            });
        });

        // Закрытие модальных окон по клику вне области
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.style.display = 'none';
            }
        });

        // Обработка закрытия страницы
        window.addEventListener('beforeunload', () => this.sendLeaveMessage());
        window.addEventListener('pagehide', () => this.sendLeaveMessage());
    }

    // Запуск медиа устройств
    async startMedia() {
        try {
            document.getElementById('permissionModal').style.display = 'none';
            await this.setupMediaDevices();
            this.connectWebSocket();
            this.loadRoomInfo();
        } catch (error) {
            console.error('Error starting media:', error);
            this.showError('Не удалось получить доступ к камере и микрофону');
            document.getElementById('permissionModal').style.display = 'block';
        }
    }

    // Отмена присоединения
    cancelJoin() {
        window.location.href = '/';
    }

    // Настройка медиа устройств
    async setupMediaDevices() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = this.localStream;

            // Обновляем доступные устройства
            await this.updateDeviceLists();

            this.showTempMessage('✅ Камера и микрофон подключены');
        } catch (error) {
            console.error('Error accessing media devices:', error);
            throw error;
        }
    }

    // Обновление списка устройств
    async updateDeviceLists() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();

            const videoSelect = document.getElementById('videoSource');
            const audioSelect = document.getElementById('audioSource');
            const audioOutputSelect = document.getElementById('audioOutput');

            // Очищаем списки
            videoSelect.innerHTML = '<option value="">📹 Выберите камеру</option>';
            audioSelect.innerHTML = '<option value="">🎤 Выберите микрофон</option>';
            audioOutputSelect.innerHTML = '<option value="">🔊 Выберите динамики</option>';

            devices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Unknown ${device.kind}`;

                if (device.kind === 'videoinput') {
                    videoSelect.appendChild(option);
                } else if (device.kind === 'audioinput') {
                    audioSelect.appendChild(option);
                } else if (device.kind === 'audiooutput') {
                    audioOutputSelect.appendChild(option);
                }
            });
        } catch (error) {
            console.error('Error enumerating devices:', error);
        }
    }

    // Подключение к WebSocket
    connectWebSocket() {
        const socket = new SockJS('/ws');
        this.stompClient = Stomp.over(socket);

        this.stompClient.connect({}, (frame) => {
            console.log('Connected: ' + frame);
            this.isConnected = true;

            // Подписываемся на топики
            this.subscribeToTopics();

            // Отправляем сообщение о присоединении
            this.sendJoinMessage();

            // Запрашиваем текущий статус комнаты
            this.requestRoomStatus();

        }, (error) => {
            console.error('WebSocket connection error:', error);
            this.showError('Ошибка подключения к комнате');
            setTimeout(() => this.connectWebSocket(), 5000);
        });
    }

    // Подписка на топики
    subscribeToTopics() {
        // Топик участников
        this.stompClient.subscribe('/topic/room/' + this.currentRoomId + '/participants',
            (message) => {
                console.log('Received participants message:', message);
                this.handleParticipantsMessage(JSON.parse(message.body));
            });

        // Топик чата
        this.stompClient.subscribe('/topic/room/' + this.currentRoomId + '/chat',
            (message) => {
                console.log('Received chat message:', message);
                this.handleChatMessage(JSON.parse(message.body));
            });

        // Персональная очередь для WebRTC
        this.stompClient.subscribe('/user/queue/webrtc',
            (message) => {
                console.log('Received WebRTC message:', message);
                this.handleWebRTCMessage(JSON.parse(message.body));
            });

        // Персональная очередь для статуса комнаты
        this.stompClient.subscribe('/user/queue/room-status',
            (message) => {
                console.log('Received room status:', message);
                this.handleRoomStatus(JSON.parse(message.body));
            });
    }

    // Обработка сообщений участников
    handleParticipantsMessage(message) {
        console.log('Participants message:', message);

        switch (message.type) {
            case 'USER_JOINED':
                // Добавляем участника (сервер уже отфильтровал текущего пользователя)
                this.addParticipant(message.userId, message.username);
                this.updateParticipantCount(message.participantCount);
                this.displaySystemMessage(message.username + ' присоединился к конференции');
                break;

            case 'USER_LEFT':
                // Удаляем участника (сервер уже отфильтровал текущего пользователя)
                this.removeParticipant(message.userId);
                this.updateParticipantCount(message.participantCount);
                if (message.username) {
                    this.displaySystemMessage(message.username + ' покинул конференцию');
                }
                break;

            case 'ROOM_STATUS':
                this.updateRoomStatus(message);
                break;
        }

        // Обновляем список участников если он есть в сообщении
        if (message.participants) {
            this.updateParticipantsList(message.participants);
        }
    }

    // Обработка сообщений чата
    handleChatMessage(message) {
        console.log('Chat message received:', message);
        this.displayChatMessage(message);
    }

    // Обработка WebRTC сообщений
    handleWebRTCMessage(message) {
        console.log('WebRTC message:', message);
        // Здесь будет логика обработки WebRTC сообщений
    }

    // Обработка статуса комнаты
    handleRoomStatus(message) {
        console.log('Room status:', message);
        this.updateRoomStatus(message);
    }

    // Добавление участника
    addParticipant(userId, username) {
        // Просто добавляем участника (сервер гарантирует что это не текущий пользователь)
        if (!this.participants.has(userId)) {
            this.participants.set(userId, {
                id: userId,
                username: username,
                joinedAt: new Date(),
                status: 'connected'
            });

            this.updateParticipantsList();
            this.createRemoteVideoElement(userId, username);
        }
    }

    // Удаление участника
    removeParticipant(userId) {
        if (this.participants.has(userId)) {
            this.participants.delete(userId);
            this.updateParticipantsList();
            this.removeRemoteVideoElement(userId);
        }
    }

    // Обновление счетчика участников
    updateParticipantCount(count) {
        const countElement = document.getElementById('participantsCount');
        const headerCountElement = document.getElementById('participantsCountHeader');

        if (countElement) countElement.textContent = count;
        if (headerCountElement) headerCountElement.textContent = count;

        // Обновляем заголовок комнаты
        const roomNameElement = document.getElementById('roomName');
        if (roomNameElement) {
            roomNameElement.textContent = `${this.roomName} (${count} участников)`;
        }
    }

    // Обновление списка участников в UI
    updateParticipantsList(participantsData = null) {
        const participantsList = document.getElementById('participantsList');
        if (!participantsList) return;

        participantsList.innerHTML = '';

        // Всегда добавляем текущего пользователя первым
        const currentUserElement = this.createParticipantElement(this.currentUser, true);
        participantsList.appendChild(currentUserElement);

        // Используем переданные данные или текущих участников
        const participantsToShow = participantsData || Array.from(this.participants.values());

        // Добавляем остальных участников
        participantsToShow.forEach(participant => {
            const participantElement = this.createParticipantElement(participant, false);
            participantsList.appendChild(participantElement);
        });
    }

    // Создание элемента участника
    createParticipantElement(participant, isCurrentUser) {
        const div = document.createElement('div');
        div.className = `participant ${isCurrentUser ? 'current-user' : ''}`;
        div.innerHTML = `
            <span class="username">${participant.username}${isCurrentUser ? ' (Вы)' : ''}</span>
            <span class="status ${participant.status}">
                ${participant.status === 'connected' ? '🟢' : '🔴'}
            </span>
        `;
        return div;
    }

    // Создание элемента удаленного видео
    createRemoteVideoElement(userId, username) {
        const videoGrid = document.getElementById('videoGrid');
        const placeholder = videoGrid.querySelector('.video-placeholder');

        if (placeholder) {
            placeholder.remove();
        }

        // Проверяем, нет ли уже такого видео элемента
        if (!document.getElementById(`remote-video-${userId}`)) {
            const videoContainer = document.createElement('div');
            videoContainer.className = 'remote-video';
            videoContainer.id = `remote-video-${userId}`;

            videoContainer.innerHTML = `
                <video id="video-${userId}" autoplay playsinline></video>
                <div class="participant-info">
                    ${username}
                </div>
            `;

            videoGrid.appendChild(videoContainer);
        }
    }

    // Удаление элемента удаленного видео
    removeRemoteVideoElement(userId) {
        const videoElement = document.getElementById(`remote-video-${userId}`);
        if (videoElement) {
            videoElement.remove();
        }

        // Показываем placeholder если не осталось участников
        const videoGrid = document.getElementById('videoGrid');
        if (videoGrid.children.length === 0) {
            videoGrid.innerHTML = `
                <div class="video-placeholder">
                    <div class="placeholder-icon">👥</div>
                    <div class="placeholder-text">Участники появятся здесь</div>
                </div>
            `;
        }
    }

    // Отправка сообщения о присоединении
    sendJoinMessage() {
        if (this.stompClient && this.isConnected) {
            const joinMessage = {
                roomId: this.currentRoomId,
                userId: this.currentUser.id,
                username: this.currentUser.username,
                timestamp: new Date().toISOString()
            };

            console.log('Sending join message:', joinMessage);
            this.stompClient.send("/app/room.join", {}, JSON.stringify(joinMessage));
        }
    }

    // Отправка сообщения о выходе
    sendLeaveMessage() {
        if (this.stompClient && this.isConnected) {
            const leaveMessage = {
                roomId: this.currentRoomId,
                userId: this.currentUser.id,
                username: this.currentUser.username,
                timestamp: new Date().toISOString()
            };

            console.log('Sending leave message:', leaveMessage);
            this.stompClient.send("/app/room.leave", {}, JSON.stringify(leaveMessage));
        }
    }

    // Запрос статуса комнаты
    requestRoomStatus() {
        if (this.stompClient && this.isConnected) {
            const statusMessage = {
                roomId: this.currentRoomId,
                userId: this.currentUser.id,
                timestamp: new Date().toISOString()
            };

            console.log('Requesting room status:', statusMessage);
            this.stompClient.send("/app/room.status", {}, JSON.stringify(statusMessage));
        }
    }

    // Обновление статуса комнаты
    updateRoomStatus(status) {
        this.updateParticipantCount(status.participantCount);
        if (status.participants) {
            this.updateParticipantsList(status.participants);
        }
    }

    // Отправка сообщения в чат
    sendChatMessage() {
        const messageInput = document.getElementById('messageInput');
        const content = messageInput.value.trim();

        if (!content) {
            this.showError('Введите сообщение');
            return;
        }

        if (!this.stompClient || !this.isConnected) {
            this.showError('Нет подключения к серверу');
            return;
        }

        const message = {
            type: 'CHAT',
            roomId: this.currentRoomId,
            userId: this.currentUser.id,
            username: this.currentUser.username,
            content: content,
            timestamp: new Date().toISOString()
        };

        console.log('Sending chat message:', message);

        // НЕМЕДЛЕННО отображаем сообщение локально
        this.displayChatMessage(message);

        // Затем отправляем на сервер
        this.stompClient.send("/app/chat.send", {}, JSON.stringify(message));
        messageInput.value = '';
    }

    // Отображение сообщения в чате
    displayChatMessage(message) {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;

        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${message.type === 'SYSTEM' ? 'system-message' : ''}`;

        if (message.type === 'SYSTEM') {
            messageElement.innerHTML = `
                <em>${message.content}</em>
                <small>${this.formatTime(message.timestamp)}</small>
            `;
        } else {
            // Проверяем, наше ли это сообщение
            const isMyMessage = message.userId === this.currentUser.id;
            if (isMyMessage) {
                messageElement.classList.add('my-message');
            }

            messageElement.innerHTML = `
                <strong>${message.username}:</strong> ${message.content}
                <small>${this.formatTime(message.timestamp)}</small>
            `;
        }

        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Отображение системного сообщения
    displaySystemMessage(message) {
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            const messageElement = document.createElement('div');
            messageElement.className = 'chat-message system-message';
            messageElement.innerHTML = `
                <em>${message}</em>
                <small>${this.formatTime(new Date().toISOString())}</small>
            `;
            chatMessages.appendChild(messageElement);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    // Управление видео
    toggleVideo() {
        if (!this.localStream) return;

        const videoTracks = this.localStream.getVideoTracks();
        if (videoTracks.length > 0) {
            this.isVideoEnabled = !this.isVideoEnabled;
            videoTracks.forEach(track => {
                track.enabled = this.isVideoEnabled;
            });

            const toggleBtn = document.getElementById('toggleVideo');
            const videoStatus = document.getElementById('videoStatus');

            if (this.isVideoEnabled) {
                toggleBtn.classList.add('video-active');
                videoStatus.textContent = '📹 Камера: Вкл';
                videoStatus.classList.remove('muted');
            } else {
                toggleBtn.classList.remove('video-active');
                videoStatus.textContent = '📹 Камера: Выкл';
                videoStatus.classList.add('muted');
            }
        }
    }

    // Управление аудио
    toggleAudio() {
        if (!this.localStream) return;

        const audioTracks = this.localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            this.isAudioEnabled = !this.isAudioEnabled;
            audioTracks.forEach(track => {
                track.enabled = this.isAudioEnabled;
            });

            const toggleBtn = document.getElementById('toggleAudio');
            const audioStatus = document.getElementById('audioStatus');

            if (this.isAudioEnabled) {
                toggleBtn.classList.add('audio-active');
                audioStatus.textContent = '🎤 Микрофон: Вкл';
                audioStatus.classList.remove('muted');
            } else {
                toggleBtn.classList.remove('audio-active');
                audioStatus.textContent = '🎤 Микрофон: Выкл';
                audioStatus.classList.add('muted');
            }
        }
    }

    // Демонстрация экрана
    async toggleScreenShare() {
        try {
            if (!this.isScreenSharing) {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true
                });

                const localVideo = document.getElementById('localVideo');
                localVideo.srcObject = screenStream;

                this.isScreenSharing = true;
                document.querySelector('.local-video-container').classList.add('screen-sharing');

                // Обработка завершения демонстрации экрана
                screenStream.getTracks().forEach(track => {
                    track.onended = () => {
                        this.stopScreenShare();
                    };
                });

            } else {
                this.stopScreenShare();
            }
        } catch (error) {
            console.error('Error sharing screen:', error);
            this.showError('Не удалось начать демонстрацию экрана');
        }
    }

    // Остановка демонстрации экрана
    stopScreenShare() {
        const localVideo = document.getElementById('localVideo');
        localVideo.srcObject = this.localStream;
        this.isScreenSharing = false;
        document.querySelector('.local-video-container').classList.remove('screen-sharing');
    }

    // Показать модальное окно приглашения
    async showInviteModal() {
        await this.loadRoomInfo();
        const modal = document.getElementById('inviteModal');
        modal.style.display = 'block';
    }

    // Загрузка информации о комнате
    async loadRoomInfo() {
        try {
            const response = await fetch(`/api/rooms/${this.currentRoomId}`);
            if (response.ok) {
                const roomInfo = await response.json();
                this.roomName = roomInfo.name;
                this.inviteCode = roomInfo.inviteCode;

                // Обновляем UI
                document.getElementById('roomName').textContent =
                    `${this.roomName} (${this.participants.size + 1} участников)`;
                document.getElementById('inviteLink').value =
                    `${window.location.origin}/room/${this.currentRoomId}`;
                document.getElementById('inviteCodeDisplay').textContent = this.inviteCode;
            }
        } catch (error) {
            console.error('Error loading room info:', error);
        }
    }

    // Показать настройки
    showSettings() {
        const modal = document.getElementById('settingsModal');
        modal.style.display = 'block';
    }

    // Применить настройки
    async applySettings() {
        const videoSource = document.getElementById('videoSource').value;
        const audioSource = document.getElementById('audioSource').value;

        try {
            const constraints = {
                video: videoSource ? { deviceId: { exact: videoSource } } : true,
                audio: audioSource ? { deviceId: { exact: audioSource } } : true
            };

            const newStream = await navigator.mediaDevices.getUserMedia(constraints);

            // Останавливаем старый поток
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }

            // Устанавливаем новый поток
            this.localStream = newStream;
            document.getElementById('localVideo').srcObject = newStream;

            document.getElementById('settingsModal').style.display = 'none';
            this.showTempMessage('✅ Настройки применены');

        } catch (error) {
            console.error('Error applying settings:', error);
            this.showError('Не удалось применить настройки');
        }
    }

    // Копирование в буфер обмена
    async copyToClipboard(elementId) {
        const element = document.getElementById(elementId);
        let text = '';

        if (elementId === 'inviteLink') {
            text = element.value;
        } else if (elementId === 'inviteCodeDisplay') {
            text = element.textContent;
        }

        try {
            await navigator.clipboard.writeText(text);
            this.showTempMessage('✅ Скопировано в буфер обмена');
        } catch (error) {
            console.error('Error copying to clipboard:', error);
            // Fallback для старых браузеров
            element.select();
            document.execCommand('copy');
            this.showTempMessage('✅ Скопировано в буфер обмена');
        }
    }

    // Выход из комнаты
    leaveRoom() {
        if (confirm('Вы уверены, что хотите покинуть комнату?')) {
            this.sendLeaveMessage();

            if (this.stompClient) {
                this.stompClient.disconnect();
            }

            this.stopAllMediaStreams();

            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        }
    }

    // Остановка всех медиа потоков
    stopAllMediaStreams() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
        this.remoteStreams.forEach(stream => {
            stream.getTracks().forEach(track => track.stop());
        });
    }

    // Вспомогательные методы
    generateUserId() {
        return 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }

    getRoomIdFromUrl() {
        const path = window.location.pathname;
        const match = path.match(/\/room\/([^\/]+)/);
        return match ? match[1] : null;
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    showTempMessage(message) {
        const tempMsg = document.createElement('div');
        tempMsg.className = 'temp-message';
        tempMsg.textContent = message;
        document.body.appendChild(tempMsg);

        setTimeout(() => {
            tempMsg.remove();
        }, 3000);
    }

    showError(message) {
        const errorMsg = document.createElement('div');
        errorMsg.className = 'error-message-global';
        errorMsg.textContent = message;
        document.body.appendChild(errorMsg);

        setTimeout(() => {
            errorMsg.remove();
        }, 5000);
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    window.roomManager = new RoomManager();

    // Обновляем имя пользователя в UI
    const usernameElement = document.querySelector('.participant.current-user .username');
    if (usernameElement) {
        usernameElement.textContent = `Вы (${window.roomManager.currentUser.username})`;
    }
});