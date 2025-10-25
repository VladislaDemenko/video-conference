class VideoConference {
    constructor() {
        this.roomId = window.location.pathname.split('/').pop();
        this.userId = this.generateUserId();
        this.username = `User${Math.random().toString(36).substr(2, 5)}`;
        this.localStream = null;
        this.peerConnections = {};
        this.stompClient = null;
        this.participants = [];

        this.initialize();
    }

    initialize() {
        this.initializeWebSocket();
        this.initializeMedia();
        this.setupEventListeners();
        this.updateRoomInfo();
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

            this.joinRoom();
        }, (error) => {
            console.error('WebSocket connection error:', error);
            this.showError('Ошибка подключения к серверу');
        });
    }

    async initializeMedia() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });

            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = this.localStream;

        } catch (error) {
            console.error('Error accessing media devices:', error);
            this.showError('Не удалось получить доступ к камере/микрофону. Проверьте разрешения.');
            this.createLocalVideoPlaceholder();
        }
    }

    createLocalVideoPlaceholder() {
        const localVideoContainer = document.querySelector('.local-video-container');
        const videoElement = document.getElementById('localVideo');

        if (videoElement) {
            videoElement.style.display = 'none';
        }

        const placeholder = document.createElement('div');
        placeholder.className = 'video-placeholder';
        placeholder.innerHTML = `
            <div class="placeholder-icon">🎥</div>
            <div class="placeholder-text">Камера не доступна</div>
        `;
        localVideoContainer.appendChild(placeholder);
    }

    setupEventListeners() {
        document.getElementById('toggleVideo').addEventListener('click', () => this.toggleVideo());
        document.getElementById('toggleAudio').addEventListener('click', () => this.toggleAudio());
        document.getElementById('screenShare').addEventListener('click', () => this.toggleScreenShare());

        document.getElementById('sendMessage').addEventListener('click', () => this.sendMessage());
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        document.getElementById('leaveBtn').addEventListener('click', () => this.leaveRoom());
        document.getElementById('inviteBtn').addEventListener('click', () => this.showInviteModal());
        document.getElementById('copyLink').addEventListener('click', () => this.copyInviteLink());

        const modal = document.getElementById('inviteModal');
        document.querySelector('.close').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });

        window.addEventListener('beforeunload', () => {
            this.leaveRoom();
        });
    }

    joinRoom() {
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

    leaveRoom() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }

        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
        }

        Object.values(this.peerConnections).forEach(pc => {
            if (pc && pc.close) pc.close();
        });

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

        setTimeout(() => {
            window.location.href = '/';
        }, 100);
    }

    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                const btn = document.getElementById('toggleVideo');
                btn.classList.toggle('video-active', videoTrack.enabled);
                btn.textContent = videoTrack.enabled ? '🎥' : '❌';
            }
        }
    }

    toggleAudio() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                const btn = document.getElementById('toggleAudio');
                btn.classList.toggle('audio-active', audioTrack.enabled);
                btn.textContent = audioTrack.enabled ? '🎤' : '🎤❌';
            }
        }
    }

    async toggleScreenShare() {
        try {
            if (!this.screenStream) {
                this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        cursor: 'always'
                    },
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        sampleRate: 44100
                    }
                });

                document.getElementById('localVideo').srcObject = this.screenStream;

                this.screenStream.getTracks().forEach(track => {
                    track.onended = () => {
                        this.screenStream = null;
                        document.getElementById('localVideo').srcObject = this.localStream;
                        document.getElementById('screenShare').textContent = '🖥️';
                    };
                });

                document.getElementById('screenShare').textContent = '🖥️🔴';
                this.addSystemMessage(`${this.username} начал демонстрацию экрана`);

            } else {
                this.screenStream.getTracks().forEach(track => track.stop());
                this.screenStream = null;
                document.getElementById('localVideo').srcObject = this.localStream;
                document.getElementById('screenShare').textContent = '🖥️';
                this.addSystemMessage(`${this.username} остановил демонстрацию экрана`);
            }
        } catch (error) {
            console.error('Error sharing screen:', error);
            this.showError('Ошибка при демонстрации экрана');
        }
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

document.addEventListener('DOMContentLoaded', () => {
    new VideoConference();
});