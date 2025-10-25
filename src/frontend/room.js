class VideoConference {
    constructor() {
        this.roomId = window.location.pathname.split('/').pop();
        this.userId = this.generateUserId();
        this.username = `User${Math.random().toString(36).substr(2, 5)}`;
        this.localStream = null;
        this.peerConnections = {};
        this.stompClient = null;

        this.initialize();
    }

    initialize() {
        this.initializeWebSocket();
        this.initializeMedia();
        this.setupEventListeners();
        this.joinRoom();
    }

    initializeWebSocket() {
        const socket = new SockJS('/ws');
        this.stompClient = Stomp.over(socket);

        this.stompClient.connect({}, (frame) => {
            console.log('Connected: ' + frame);

            // Подписка на WebRTC сообщения
            this.stompClient.subscribe(`/user/queue/webrtc`, (message) => {
                this.handleWebRTCMessage(JSON.parse(message.body));
            });

            // Подписка на сообщения чата
            this.stompClient.subscribe(`/topic/room/${this.roomId}/chat`, (message) => {
                this.handleChatMessage(JSON.parse(message.body));
            });

            // Подписка на обновления участников
            this.stompClient.subscribe(`/topic/room/${this.roomId}/participants`, (message) => {
                this.handleParticipantsUpdate(JSON.parse(message.body));
            });
        });
    }

    async initializeMedia() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = this.localStream;

        } catch (error) {
            console.error('Error accessing media devices:', error);
            this.showError('Не удалось получить доступ к камере/микрофону');
        }
    }

    setupEventListeners() {
        // Управление медиа
        document.getElementById('toggleVideo').addEventListener('click', () => this.toggleVideo());
        document.getElementById('toggleAudio').addEventListener('click', () => this.toggleAudio());
        document.getElementById('screenShare').addEventListener('click', () => this.toggleScreenShare());

        // Чат
        document.getElementById('sendMessage').addEventListener('click', () => this.sendMessage());
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        // Управление комнатой
        document.getElementById('leaveBtn').addEventListener('click', () => this.leaveRoom());
        document.getElementById('inviteBtn').addEventListener('click', () => this.showInviteModal());
        document.getElementById('copyLink').addEventListener('click', () => this.copyInviteLink());
    }

    joinRoom() {
        this.stompClient.send(`/app/room/${this.roomId}/join`, {},
            JSON.stringify({ userId: this.userId, username: this.username })
        );
    }

    leaveRoom() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }

        Object.values(this.peerConnections).forEach(pc => pc.close());

        if (this.stompClient) {
            this.stompClient.send(`/app/room/${this.roomId}/leave`, {},
                JSON.stringify({ userId: this.userId })
            );
            this.stompClient.disconnect();
        }

        window.location.href = '/';
    }

    toggleVideo() {
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            const btn = document.getElementById('toggleVideo');
            btn.classList.toggle('video-active', videoTrack.enabled);
        }
    }

    toggleAudio() {
        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const btn = document.getElementById('toggleAudio');
            btn.classList.toggle('audio-active', audioTrack.enabled);
        }
    }

    async toggleScreenShare() {
        try {
            if (!this.screenStream) {
                this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true
                });
                document.getElementById('localVideo').srcObject = this.screenStream;
            } else {
                this.screenStream.getTracks().forEach(track => track.stop());
                this.screenStream = null;
                document.getElementById('localVideo').srcObject = this.localStream;
            }
        } catch (error) {
            console.error('Error sharing screen:', error);
        }
    }

    sendMessage() {
        const input = document.getElementById('messageInput');
        const content = input.value.trim();

        if (content) {
            this.stompClient.send(`/app/room/${this.roomId}/chat`, {},
                JSON.stringify({
                    userId: this.userId,
                    username: this.username,
                    content: content,
                    timestamp: new Date().toISOString()
                })
            );
            input.value = '';
        }
    }

    handleChatMessage(message) {
        const chatMessages = document.getElementById('chatMessages');
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message';
        messageElement.innerHTML = `
            <strong>${message.username}:</strong>
            <span>${message.content}</span>
            <small>${new Date(message.timestamp).toLocaleTimeString()}</small>
        `;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    handleParticipantsUpdate(participants) {
        const participantsList = document.getElementById('participantsList');
        const participantsCount = document.getElementById('participantsCount');

        participantsList.innerHTML = '';
        participantsCount.textContent = participants.length;

        participants.forEach(participant => {
            const participantElement = document.createElement('div');
            participantElement.className = 'participant';
            participantElement.innerHTML = `
                <span class="username">${participant.username}</span>
                <span class="status ${participant.connected ? 'connected' : 'disconnected'}">
                    ${participant.connected ? '🟢' : '🔴'}
                </span>
            `;
            participantsList.appendChild(participantElement);
        });
    }

    handleWebRTCMessage(message) {
        // Обработка WebRTC сообщений (offer, answer, ice candidate)
        const { type, sender, data } = message;

        switch (type) {
            case 'offer':
                this.handleOffer(sender, data);
                break;
            case 'answer':
                this.handleAnswer(sender, data);
                break;
            case 'ice-candidate':
                this.handleIceCandidate(sender, data);
                break;
        }
    }

    generateUserId() {
        return 'user_' + Math.random().toString(36).substr(2, 9);
    }

    showInviteModal() {
        document.getElementById('inviteModal').style.display = 'block';
        document.getElementById('inviteLink').value = window.location.href;
    }

    copyInviteLink() {
        const linkInput = document.getElementById('inviteLink');
        linkInput.select();
        document.execCommand('copy');
        alert('Ссылка скопирована в буфер обмена');
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 5000);
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    new VideoConference();
});