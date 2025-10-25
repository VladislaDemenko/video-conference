class VideoConference {
    constructor() {
        this.roomId = window.location.pathname.split('/').pop();
        this.userId = this.generateUserId();
        this.username = `User${Math.random().toString(36).substr(2, 5)}`;
        this.localStream = null;
        this.screenStream = null;
        this.peerConnections = {};
        this.stompClient = null;
        this.participants = [];
        this.mediaDevices = [];
        this.currentVideoDevice = null;
        this.currentAudioDevice = null;
        this.audioContext = null;
        this.analyser = null;
        this.isInitialized = false;
        this.isScreenSharing = false;

        this.initialize();
    }

    async initialize() {
        await this.setupEventListeners();
        await this.initializeWebSocket();
        this.showPermissionModal();
    }

    showPermissionModal() {
        const modal = document.getElementById('permissionModal');
        modal.style.display = 'block';

        document.getElementById('startMedia').addEventListener('click', async () => {
            modal.style.display = 'none';
            await this.initializeMedia();
        });
    }

    async initializeMedia() {
        try {
            await this.requestPermissions();
            await this.getMediaDevices();
            await this.startCameraAndMicrophone();

            this.isInitialized = true;
            this.updateRoomInfo();

        } catch (error) {
            console.error('Error initializing media:', error);
            this.showMediaError('Не удалось инициализировать медиа устройства: ' + error.message);
        }
    }

    async requestPermissions() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            stream.getTracks().forEach(track => track.stop());
        } catch (error) {
            if (error.name === 'NotAllowedError') {
                throw new Error('Доступ к камере или микрофону запрещен. Пожалуйста, разрешите доступ и обновите страницу.');
            } else if (error.name === 'NotFoundError') {
                throw new Error('Камера или микрофон не найдены. Проверьте подключение устройств.');
            } else if (error.name === 'NotReadableError') {
                throw new Error('Не удалось получить доступ к камере или микрофону. Возможно, они используются другим приложением.');
            } else {
                throw error;
            }
        }
    }

    async getMediaDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.mediaDevices = devices;
            this.populateDeviceSelectors();
        } catch (error) {
            console.error('Error enumerating devices:', error);
        }
    }

    populateDeviceSelectors() {
        const videoSelect = document.getElementById('videoSource');
        const audioSelect = document.getElementById('audioSource');
        const outputSelect = document.getElementById('audioOutput');

        videoSelect.innerHTML = '<option value="">Выберите камеру</option>';
        audioSelect.innerHTML = '<option value="">Выберите микрофон</option>';
        outputSelect.innerHTML = '<option value="">Выберите динамики</option>';

        this.mediaDevices
            .filter(device => device.kind === 'videoinput')
            .forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Камера ${videoSelect.options.length}`;
                videoSelect.appendChild(option);
            });

        this.mediaDevices
            .filter(device => device.kind === 'audioinput')
            .forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Микрофон ${audioSelect.options.length}`;
                audioSelect.appendChild(option);
            });

        this.mediaDevices
            .filter(device => device.kind === 'audiooutput')
            .forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Динамики ${outputSelect.options.length}`;
                outputSelect.appendChild(option);
            });
    }

    async startCameraAndMicrophone(constraints = null) {
        try {
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }

            const defaultConstraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 },
                    facingMode: 'user'
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1,
                    sampleRate: 44100,
                    sampleSize: 16
                }
            };

            const finalConstraints = constraints || defaultConstraints;

            this.localStream = await navigator.mediaDevices.getUserMedia(finalConstraints);

            const videoTrack = this.localStream.getVideoTracks()[0];
            const audioTrack = this.localStream.getAudioTracks()[0];

            if (videoTrack) {
                this.currentVideoDevice = videoTrack.getSettings().deviceId;
                document.getElementById('videoSource').value = this.currentVideoDevice;
            }

            if (audioTrack) {
                this.currentAudioDevice = audioTrack.getSettings().deviceId;
                document.getElementById('audioSource').value = this.currentAudioDevice;
            }

            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = this.localStream;

            this.startAudioMonitoring();
            this.updateMediaStatus();

            console.log('Camera and microphone started successfully');

        } catch (error) {
            console.error('Error starting camera and microphone:', error);
            this.showMediaError('Ошибка при запуске камеры или микрофона: ' + error.message);
            this.createLocalVideoPlaceholder();
        }
    }

    startAudioMonitoring() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (this.analyser) {
            this.analyser.disconnect();
        }

        const source = this.audioContext.createMediaStreamSource(this.localStream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        source.connect(this.analyser);

        this.updateVolumeMeter();
    }

    updateVolumeMeter() {
        if (!this.analyser) return;

        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const volume = Math.min(average / 128, 1);

        const volumeLevel = document.querySelector('.volume-level');
        if (volumeLevel) {
            volumeLevel.style.width = (volume * 100) + '%';
        }

        requestAnimationFrame(() => this.updateVolumeMeter());
    }

    updateMediaStatus() {
        const videoStatus = document.getElementById('videoStatus');
        const audioStatus = document.getElementById('audioStatus');

        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            const audioTrack = this.localStream.getAudioTracks()[0];

            if (videoTrack) {
                const statusText = this.isScreenSharing ? 'Демонстрация экрана' : (videoTrack.enabled ? 'Камера: Вкл' : 'Камера: Выкл');
                videoStatus.textContent = statusText;
                videoStatus.className = videoTrack.enabled ? '' : 'muted';
            }

            if (audioTrack) {
                audioStatus.textContent = audioTrack.enabled ? 'Микрофон: Вкл' : 'Микрофон: Выкл';
                audioStatus.className = audioTrack.enabled ? '' : 'muted';
            }
        }
    }

    async setupEventListeners() {
        // Управление медиа
        document.getElementById('toggleVideo').addEventListener('click', () => this.toggleVideo());
        document.getElementById('toggleAudio').addEventListener('click', () => this.toggleAudio());
        document.getElementById('screenShare').addEventListener('click', () => this.toggleScreenShare());
        document.getElementById('settingsBtn').addEventListener('click', () => this.showSettingsModal());

        // Чат
        document.getElementById('sendMessage').addEventListener('click', () => this.sendMessage());
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        // Управление комнатой
        document.getElementById('leaveBtn').addEventListener('click', () => this.leaveRoom());
        document.getElementById('inviteBtn').addEventListener('click', () => this.showInviteModal());
        document.getElementById('copyLink').addEventListener('click', () => this.copyInviteLink());

        // Настройки
        document.getElementById('applySettings').addEventListener('click', () => this.applySettings());

        // Модальные окна
        this.setupModalListeners();

        // Обработка закрытия страницы
        window.addEventListener('beforeunload', () => this.leaveRoom());

        // Обновление списка устройств
        navigator.mediaDevices.addEventListener('devicechange', () => {
            this.getMediaDevices();
        });
    }

    setupModalListeners() {
        const modals = document.querySelectorAll('.modal');

        modals.forEach(modal => {
            const closeBtn = modal.querySelector('.close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    modal.style.display = 'none';
                });
            }
        });

        window.addEventListener('click', (e) => {
            modals.forEach(modal => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            });
        });
    }

    initializeWebSocket() {
        const socket = new SockJS('/ws');
        this.stompClient = Stomp.over(socket);

        this.stompClient.connect({}, (frame) => {
            console.log('Connected: ' + frame);

            this.stompClient.subscribe(`/user/queue/webrtc`, (message) => {
                this.handleWebRTCMessage(JSON.parse(message.body));
            });

            this.stompClient.subscribe(`/topic/room/${this.roomId}/chat`, (message) => {
                this.handleChatMessage(JSON.parse(message.body));
            });

            this.stompClient.subscribe(`/topic/room/${this.roomId}/participants`, (message) => {
                this.handleParticipantsUpdate(JSON.parse(message.body));
            });

            if (this.isInitialized) {
                this.joinRoom();
            }

        }, (error) => {
            console.error('WebSocket connection error:', error);
            this.showError('Ошибка подключения к серверу');
        });
    }

    // ДЕМОНСТРАЦИЯ ЭКРАНА
    async toggleScreenShare() {
        try {
            if (!this.isScreenSharing) {
                // Начинаем демонстрацию экрана
                this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        cursor: 'always',
                        displaySurface: 'monitor'
                    },
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        sampleRate: 44100
                    }
                });

                // Останавливаем камеру
                if (this.localStream) {
                    const videoTrack = this.localStream.getVideoTracks()[0];
                    if (videoTrack) {
                        videoTrack.stop();
                    }
                }

                // Заменяем видео на демонстрацию экрана
                const localVideo = document.getElementById('localVideo');
                localVideo.srcObject = this.screenStream;

                this.isScreenSharing = true;

                // Обновляем UI
                document.getElementById('screenShare').textContent = '🖥️🔴';
                document.getElementById('screenShare').style.background = 'var(--error)';
                document.getElementById('toggleVideo').style.display = 'none'; // Скрываем кнопку камеры при демонстрации

                this.addSystemMessage(`${this.username} начал(а) демонстрацию экрана`);
                this.updateMediaStatus();

                // Обработка остановки демонстрации
                this.screenStream.getTracks().forEach(track => {
                    track.onended = () => {
                        this.stopScreenShare();
                    };
                });

            } else {
                this.stopScreenShare();
            }
        } catch (error) {
            console.error('Error sharing screen:', error);
            if (error.name !== 'NotAllowedError') {
                this.showError('Ошибка при демонстрации экрана: ' + error.message);
            }
        }
    }

    stopScreenShare() {
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }

        this.isScreenSharing = false;

        // Восстанавливаем камеру
        if (this.localStream) {
            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = this.localStream;

            // Включаем видео если оно было включено до демонстрации
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = true;
            }
        }

        // Обновляем UI
        document.getElementById('screenShare').textContent = '🖥️';
        document.getElementById('screenShare').style.background = '';
        document.getElementById('toggleVideo').style.display = 'flex'; // Показываем кнопку камеры

        this.addSystemMessage(`${this.username} остановил(а) демонстрацию экрана`);
        this.updateMediaStatus();
    }

    // УПРАВЛЕНИЕ КАМЕРОЙ
    toggleVideo() {
        if (this.isScreenSharing) {
            this.showError('Невозможно управлять камерой во время демонстрации экрана');
            return;
        }

        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                const btn = document.getElementById('toggleVideo');
                btn.classList.toggle('video-active', videoTrack.enabled);
                btn.textContent = videoTrack.enabled ? '🎥' : '🎥❌';
                this.updateMediaStatus();

                if (!videoTrack.enabled) {
                    this.addSystemMessage(`${this.username} выключил(а) видео`);
                } else {
                    this.addSystemMessage(`${this.username} включил(а) видео`);
                }
            }
        }
    }

    // УПРАВЛЕНИЕ МИКРОФОНОМ
    toggleAudio() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                const btn = document.getElementById('toggleAudio');
                btn.classList.toggle('audio-active', audioTrack.enabled);
                btn.textContent = audioTrack.enabled ? '🎤' : '🎤❌';
                this.updateMediaStatus();

                if (!audioTrack.enabled) {
                    this.addSystemMessage(`${this.username} выключил(а) микрофон`);
                } else {
                    this.addSystemMessage(`${this.username} включил(а) микрофон`);
                }
            }
        }
    }

    showSettingsModal() {
        const modal = document.getElementById('settingsModal');
        modal.style.display = 'block';
    }

    async applySettings() {
        if (this.isScreenSharing) {
            this.showError('Невозможно изменить настройки во время демонстрации экрана');
            return;
        }

        const videoSource = document.getElementById('videoSource').value;
        const audioSource = document.getElementById('audioSource').value;

        const constraints = {
            video: videoSource ? { deviceId: { exact: videoSource } } : true,
            audio: audioSource ? { deviceId: { exact: audioSource } } : true
        };

        try {
            await this.startCameraAndMicrophone(constraints);
            document.getElementById('settingsModal').style.display = 'none';
            this.showTempMessage('Настройки применены');
        } catch (error) {
            this.showError('Ошибка при применении настроек: ' + error.message);
        }
    }

    createLocalVideoPlaceholder() {
        const localVideoContainer = document.querySelector('.local-video-container');
        const videoElement = document.getElementById('localVideo');

        if (videoElement) {
            videoElement.style.display = 'none';
        }

        const existingPlaceholder = localVideoContainer.querySelector('.video-placeholder');
        if (existingPlaceholder) {
            existingPlaceholder.remove();
        }

        const placeholder = document.createElement('div');
        placeholder.className = 'video-placeholder';
        placeholder.innerHTML = `
            <div class="placeholder-icon">🎥</div>
            <div class="placeholder-text">Камера не доступна</div>
            <button onclick="location.reload()" style="margin-top: 10px; padding: 8px 16px; background: var(--primary); color: white; border: none; border-radius: var(--border-radius); cursor: pointer; font-size: 0.875rem;">
                Попробовать снова
            </button>
        `;
        localVideoContainer.appendChild(placeholder);
    }

    showMediaError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'media-error';
        errorDiv.innerHTML = `
            <strong>Ошибка медиа устройства:</strong>
            <p>${message}</p>
            <div class="permission-guide">
                <h4>Как разрешить доступ:</h4>
                <ol>
                    <li>Нажмите на значок 🔒 в адресной строке</li>
                    <li>Найдите пункты "Камера" и "Микрофон"</li>
                    <li>Установите переключатель в положение "Разрешить"</li>
                    <li>Обновите страницу</li>
                </ol>
            </div>
        `;

        const container = document.querySelector('.video-section');
        container.insertBefore(errorDiv, container.firstChild);
    }

    joinRoom() {
        if (this.stompClient && this.stompClient.connected) {
            this.stompClient.send(`/app/room/${this.roomId}/join`, {}, 
                JSON.stringify({ 
                    userId: this.userId, 
                    username: this.username,
                    action: 'join',
                    timestamp: new Date().toISOString(),
                    roomId: this.roomId
                })
            );
            
            this.addSystemMessage(`${this.username} присоединился к комнате`);
        }
    }

    leaveRoom() {
        // Останавливаем все медиа потоки
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
        
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
        }
        
        if (this.audioContext) {
            this.audioContext.close();
        }
        
        // Закрываем все peer соединения
        Object.values(this.peerConnections).forEach(pc => {
            if (pc && pc.close) pc.close();
        });
        
        // Отправляем сообщение о выходе
        if (this.stompClient && this.stompClient.connected) {
            this.stompClient.send(`/app/room/${this.roomId}/leave`, {}, 
                JSON.stringify({ 
                    userId: this.userId,
                    username: this.username,
                    action: 'leave',
                    timestamp: new Date().toISOString(),
                    roomId: this.roomId
                })
            );
            
            this.stompClient.disconnect();
        }
        
        // Перенаправляем на главную страницу
        setTimeout(() => {
            window.location.href = '/';
        }, 100);
    }

    sendMessage() {
        const input = document.getElementById('messageInput');
        const content = input.value.trim();
        
        if (content && this.stompClient && this.stompClient.connected) {
            this.stompClient.send(`/app/room/${this.roomId}/chat`, {}, 
                JSON.stringify({
                    userId: this.userId,
                    username: this.username,
                    content: content,
                    timestamp: new Date().toISOString(),
                    type: 'TEXT',
                    roomId: this.roomId
                })
            );
            input.value = '';
        }
    }

    handleChatMessage(message) {
        const chatMessages = document.getElementById('chatMessages');
        const messageElement = document.createElement('div');
        
        if (message.type === 'SYSTEM') {
            messageElement.className = 'chat-message system-message';
            messageElement.innerHTML = `
                <em>${message.content}</em>
                <small>${new Date(message.timestamp).toLocaleTimeString()}</small>
            `;
        } else {
            messageElement.className = 'chat-message';
            messageElement.innerHTML = `
                <strong>${message.username}:</strong>
                <span>${message.content}</span>
                <small>${new Date(message.timestamp).toLocaleTimeString()}</small>
            `;
        }
        
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    addSystemMessage(content) {
        const chatMessages = document.getElementById('chatMessages');
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message system-message';
        messageElement.innerHTML = `
            <em>${content}</em>
            <small>${new Date().toLocaleTimeString()}</small>
        `;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    handleParticipantsUpdate(message) {
        if (message.action === 'join') {
            const existingIndex = this.participants.findIndex(p => p.userId === message.userId);
            if (existingIndex === -1) {
                this.participants.push({
                    userId: message.userId,
                    username: message.username,
                    connected: true,
                    joinedAt: message.timestamp
                });
                if (message.userId !== this.userId) {
                    this.addSystemMessage(`${message.username} присоединился к комнате`);
                }
            }
        } else if (message.action === 'leave') {
            const participantIndex = this.participants.findIndex(p => p.userId === message.userId);
            if (participantIndex !== -1) {
                const leftParticipant = this.participants[participantIndex];
                this.participants.splice(participantIndex, 1);
                if (leftParticipant.userId !== this.userId) {
                    this.addSystemMessage(`${leftParticipant.username} покинул комнату`);
                }
            }
        }
        
        this.updateParticipantsUI();
    }

    updateParticipantsUI() {
        const participantsList = document.getElementById('participantsList');
        const participantsCount = document.getElementById('participantsCount');
        
        participantsList.innerHTML = '';
        
        const currentUserElement = document.createElement('div');
        currentUserElement.className = 'participant current-user';
        currentUserElement.innerHTML = `
            <span class="username">${this.username} (Вы)</span>
            <span class="status connected">🟢</span>
        `;
        participantsList.appendChild(currentUserElement);
        
        this.participants.forEach(participant => {
            const participantElement = document.createElement('div');
            participantElement.className = 'participant';
            participantElement.innerHTML = `
                <span class="username">${participant.username}</span>
                <span class="status connected">🟢</span>
            `;
            participantsList.appendChild(participantElement);
        });
        
        participantsCount.textContent = this.participants.length + 1;
    }

    handleWebRTCMessage(message) {
        console.log('WebRTC message received:', message);
    }

    async updateRoomInfo() {
        try {
            const response = await fetch(`/api/rooms/${this.roomId}`);
            if (response.ok) {
                const room = await response.json();
                document.getElementById('roomName').textContent = room.name || 'Комната ' + this.roomId;
            } else {
                document.getElementById('roomName').textContent = 'Комната ' + this.roomId;
            }
        } catch (error) {
            console.error('Error fetching room info:', error);
            document.getElementById('roomName').textContent = 'Комната ' + this.roomId;
        }
    }

    generateUserId() {
        return 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }

    showInviteModal() {
        document.getElementById('inviteModal').style.display = 'block';
        document.getElementById('inviteLink').value = window.location.href;
    }

    copyInviteLink() {
        const linkInput = document.getElementById('inviteLink');
        linkInput.select();
        linkInput.setSelectionRange(0, 99999);
        
        try {
            const successful = document.execCommand('copy');
            if (successful) {
                this.showTempMessage('Ссылка скопирована в буфер обмена');
            }
        } catch (err) {
            console.error('Failed to copy: ', err);
        }
    }

    showTempMessage(message) {
        const tempMsg = document.createElement('div');
        tempMsg.className = 'temp-message';
        tempMsg.textContent = message;
        document.body.appendChild(tempMsg);
        
        setTimeout(() => {
            document.body.removeChild(tempMsg);
        }, 3000);
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message-global';
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            document.body.removeChild(errorDiv);
        }, 5000);
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    new VideoConference();
});