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
        this.peerConnections = new Map();
        this.isVideoEnabled = true;
        this.isAudioEnabled = true;
        this.isScreenSharing = false;
        this.autoScrollChat = true;
        this.scrollToBottomButton = null;

        // WebRTC configuration
        this.rtcConfiguration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10
        };

        console.log('🚀 RoomManager initialized');
        console.log('User:', this.currentUser);
        console.log('Room:', this.currentRoomId);

        this.initializeEventListeners();
        this.setupReconnectionHandling();
    }

    initializeEventListeners() {
        // Control buttons
        document.getElementById('toggleVideo').addEventListener('click', () => this.toggleVideo());
        document.getElementById('toggleAudio').addEventListener('click', () => this.toggleAudio());
        document.getElementById('screenShare').addEventListener('click', () => this.toggleScreenShare());
        document.getElementById('leaveBtn').addEventListener('click', () => this.leaveRoom());
        document.getElementById('inviteBtn').addEventListener('click', () => this.showInviteModal());

        // Chat
        document.getElementById('sendMessage').addEventListener('click', () => this.sendChatMessage());
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        });

        // Modal windows
        document.getElementById('startMedia').addEventListener('click', () => this.startMedia());
        document.getElementById('cancelJoin').addEventListener('click', () => this.cancelJoin());

        // Close modals
        document.querySelectorAll('.close').forEach(closeBtn => {
            closeBtn.addEventListener('click', (e) => {
                e.target.closest('.modal').style.display = 'none';
            });
        });

        // Copy buttons
        document.getElementById('copyLink').addEventListener('click', () => this.copyToClipboard('inviteLink'));
        document.getElementById('copyCode').addEventListener('click', () => this.copyToClipboard('inviteCodeDisplay'));

        // Window events
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.style.display = 'none';
            }
        });

        window.addEventListener('beforeunload', () => this.cleanup());

        // Scroll management
        this.setupAutoScroll();
        this.setupScrollToBottom();
    }

    setupReconnectionHandling() {
        window.addEventListener('online', () => {
            console.log('🌐 Connection restored');
            if (!this.isConnected) {
                this.connectWebSocket();
            }
        });

        setInterval(() => {
            if (this.isConnected && (!this.stompClient || !this.stompClient.connected)) {
                console.log('🔌 Connection lost, reconnecting...');
                this.isConnected = false;
                this.connectWebSocket();
            }
        }, 10000);
    }

    setupAutoScroll() {
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.addEventListener('scroll', () => {
                const isAtBottom = chatMessages.scrollHeight - chatMessages.clientHeight <= chatMessages.scrollTop + 50;
                this.autoScrollChat = isAtBottom;
                this.updateScrollButton();
            });
        }
    }

    setupScrollToBottom() {
        const scrollButton = document.createElement('button');
        scrollButton.className = 'scroll-to-bottom';
        scrollButton.innerHTML = '⬇️';
        scrollButton.title = 'Прокрутить вниз';

        scrollButton.addEventListener('click', () => {
            this.scrollChatToBottom();
        });

        const chatSection = document.querySelector('.chat-section');
        if (chatSection) {
            chatSection.style.position = 'relative';
            chatSection.appendChild(scrollButton);
            this.scrollToBottomButton = scrollButton;
        }
    }

    updateScrollButton() {
        const chatMessages = document.getElementById('chatMessages');
        const scrollButton = this.scrollToBottomButton;

        if (!chatMessages || !scrollButton) return;

        const isAtBottom = chatMessages.scrollHeight - chatMessages.clientHeight <= chatMessages.scrollTop + 100;

        if (isAtBottom) {
            scrollButton.classList.remove('visible');
        } else {
            scrollButton.classList.add('visible');
        }
    }

    scrollChatToBottom() {
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.scrollTo({
                top: chatMessages.scrollHeight,
                behavior: 'smooth'
            });
            this.autoScrollChat = true;
            this.updateScrollButton();
        }
    }

    async startMedia() {
        try {
            document.getElementById('permissionModal').style.display = 'none';
            await this.setupMediaDevices();
            this.connectWebSocket();
        } catch (error) {
            console.error('Error starting media:', error);
            this.showError('Не удалось получить доступ к камере и микрофону');
            // Все равно подключаем WebSocket для чата
            this.connectWebSocket();
        }
    }

    cancelJoin() {
        window.location.href = '/';
    }

    async setupMediaDevices() {
        try {
            console.log('🎥 Requesting media devices...');
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = this.localStream;

            console.log('✅ Media devices acquired');
            this.showTempMessage('✅ Камера и микрофон подключены');
            this.updateMediaStatus();

        } catch (error) {
            console.error('❌ Error accessing media devices:', error);
            throw error;
        }
    }

    updateMediaStatus() {
        const videoStatus = document.getElementById('videoStatus');
        const audioStatus = document.getElementById('audioStatus');

        if (videoStatus) {
            videoStatus.textContent = this.isVideoEnabled ? '📹 Камера: Вкл' : '📹 Камера: Выкл';
        }
        if (audioStatus) {
            audioStatus.textContent = this.isAudioEnabled ? '🎤 Микрофон: Вкл' : '🎤 Микрофон: Выкл';
        }
    }

    connectWebSocket() {
        console.log('🔌 Connecting WebSocket...');
        const socket = new SockJS('/ws');
        this.stompClient = Stomp.over(socket);

        this.stompClient.debug = null;

        this.stompClient.connect({}, (frame) => {
            console.log('✅ WebSocket connected:', frame);
            this.isConnected = true;
            this.showTempMessage('✅ Подключено к серверу');

            this.subscribeToTopics();
            this.sendJoinMessage();

            setTimeout(() => this.requestRoomStatus(), 1000);

        }, (error) => {
            console.error('❌ WebSocket connection error:', error);
            this.showError('Ошибка подключения');
            setTimeout(() => this.connectWebSocket(), 3000);
        });
    }

    subscribeToTopics() {
        // Participants
        this.stompClient.subscribe('/topic/room/' + this.currentRoomId + '/participants',
            (message) => {
                const data = JSON.parse(message.body);
                console.log('👥 Participants message:', data);
                this.handleParticipantsMessage(data);
            });

        // Chat
        this.stompClient.subscribe('/topic/room/' + this.currentRoomId + '/chat',
            (message) => {
                const data = JSON.parse(message.body);
                console.log('💬 Chat message:', data);
                this.handleChatMessage(data);
            });

        // WebRTC
        this.stompClient.subscribe('/user/queue/webrtc',
            (message) => {
                const data = JSON.parse(message.body);
                console.log('📨 WebRTC message:', data);
                this.handleWebRTCMessage(data);
            });

        // Room status
        this.stompClient.subscribe('/user/queue/room-status',
            (message) => {
                const data = JSON.parse(message.body);
                console.log('📊 Room status:', data);
                this.handleRoomStatus(data);
            });
    }

    handleParticipantsMessage(message) {
        switch (message.type) {
            case 'USER_JOINED':
                console.log('🟢 User joined:', message.userId);
                this.addParticipant(message.userId, message.username);
                this.updateParticipantCount(message.participantCount);
                this.displaySystemMessage(message.username + ' присоединился к конференции');
                break;

            case 'USER_LEFT':
                console.log('🔴 User left:', message.userId);
                this.removeParticipant(message.userId);
                this.updateParticipantCount(message.participantCount);
                if (message.username) {
                    this.displaySystemMessage(message.username + ' покинул конференцию');
                }
                break;
        }

        if (message.participants) {
            this.updateParticipantsList(message.participants);
        }
    }

    handleChatMessage(message) {
        this.displayChatMessage(message);
    }

    handleWebRTCMessage(message) {
        const fromUserId = message.fromUserId || message.userId;
        console.log('🔄 Processing WebRTC message from:', fromUserId, 'type:', message.type);

        switch (message.type) {
            case 'offer':
                this.handleIncomingOffer(fromUserId, message.offer);
                break;
            case 'answer':
                this.handleIncomingAnswer(fromUserId, message.answer);
                break;
            case 'ice-candidate':
                this.handleIceCandidate(fromUserId, message.candidate);
                break;
            case 'NEW_USER_JOINED':
                console.log('🎯 New user notification for WebRTC:', fromUserId);
                setTimeout(() => {
                    this.setupWebRTCWithUser(fromUserId);
                }, 1000);
                break;
        }
    }

    handleRoomStatus(message) {
        console.log('🔄 Updating room status with participants:', message.participants);
        this.updateParticipantCount(message.participantCount);
        if (message.participants) {
            this.updateParticipantsList(message.participants);

            setTimeout(() => {
                message.participants.forEach(participant => {
                    if (participant.userId !== this.currentUser.id) {
                        console.log('🎯 Setting up WebRTC with existing participant:', participant.userId);
                        if (!this.peerConnections.has(participant.userId)) {
                            this.setupWebRTCWithUser(participant.userId);
                        }
                    }
                });
            }, 2000);
        }
    }

    async initializeWebRTCForUser(targetUserId) {
        if (this.peerConnections.has(targetUserId)) {
            console.log('ℹ️ WebRTC connection already exists for:', targetUserId);
            return this.peerConnections.get(targetUserId);
        }

        try {
            console.log('🔄 Initializing WebRTC for:', targetUserId);

            const peerConnection = new RTCPeerConnection(this.rtcConfiguration);

            // Add local tracks
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, this.localStream);
                });
                console.log('✅ Local tracks added to peer connection');
            }

            // Handle incoming stream
            peerConnection.ontrack = (event) => {
                console.log('🎬 Received remote stream from:', targetUserId);
                const [remoteStream] = event.streams;
                this.remoteStreams.set(targetUserId, remoteStream);
                this.updateRemoteVideo(targetUserId, remoteStream);
                this.showTempMessage('✅ Видеосвязь установлена');
            };

            // ICE candidates
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log('🧊 Sending ICE candidate to:', targetUserId);
                    this.sendWebRTCMessage({
                        type: 'ice-candidate',
                        targetUserId: targetUserId,
                        candidate: event.candidate,
                        userId: this.currentUser.id
                    });
                }
            };

            // Connection state
            peerConnection.oniceconnectionstatechange = () => {
                console.log(`🔗 Connection state with ${targetUserId}: ${peerConnection.iceConnectionState}`);
            };

            this.peerConnections.set(targetUserId, peerConnection);
            return peerConnection;

        } catch (error) {
            console.error('❌ Error initializing WebRTC:', error);
            this.showError('Ошибка инициализации видеосвязи');
        }
    }

    async createAndSendOffer(targetUserId) {
        try {
            const peerConnection = await this.initializeWebRTCForUser(targetUserId);
            if (!peerConnection) return;

            console.log('📤 Creating OFFER for:', targetUserId);

            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            this.sendWebRTCMessage({
                type: 'offer',
                targetUserId: targetUserId,
                offer: offer,
                userId: this.currentUser.id
            });

            console.log('✅ OFFER sent to:', targetUserId);

        } catch (error) {
            console.error('❌ Error creating offer:', error);
        }
    }

    async handleIncomingOffer(fromUserId, offer) {
        try {
            console.log('📥 Handling OFFER from:', fromUserId);

            const peerConnection = await this.initializeWebRTCForUser(fromUserId);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            this.sendWebRTCMessage({
                type: 'answer',
                targetUserId: fromUserId,
                answer: answer,
                userId: this.currentUser.id
            });

            console.log('✅ ANSWER sent to:', fromUserId);

        } catch (error) {
            console.error('❌ Error handling offer:', error);
        }
    }

    async handleIncomingAnswer(fromUserId, answer) {
        try {
            console.log('📥 Handling ANSWER from:', fromUserId);

            const peerConnection = this.peerConnections.get(fromUserId);
            if (peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                console.log('✅ Remote description set for:', fromUserId);
            }
        } catch (error) {
            console.error('❌ Error handling answer:', error);
        }
    }

    async handleIceCandidate(fromUserId, candidate) {
        try {
            console.log('🧊 Handling ICE candidate from:', fromUserId);

            const peerConnection = this.peerConnections.get(fromUserId);
            if (peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('✅ ICE candidate added for:', fromUserId);
            }
        } catch (error) {
            console.error('❌ Error handling ICE candidate:', error);
        }
    }

    sendWebRTCMessage(message) {
        if (this.stompClient && this.isConnected) {
            message.roomId = this.currentRoomId;

            const routingKey = `/app/webrtc.${message.type}`;
            console.log('📨 Sending WebRTC message via:', routingKey);
            this.stompClient.send(routingKey, {}, JSON.stringify(message));
        } else {
            console.error('❌ Cannot send WebRTC message: not connected');
        }
    }

    async setupWebRTCWithUser(targetUserId) {
        if (targetUserId === this.currentUser.id) {
            console.log('⚠️ Skipping WebRTC with self');
            return;
        }

        console.log('🎯 Setting up WebRTC with:', targetUserId);
        await this.createAndSendOffer(targetUserId);
    }

    addParticipant(userId, username) {
        if (!this.participants.has(userId) && userId !== this.currentUser.id) {
            console.log('➕ Adding participant:', userId, username);
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

    removeParticipant(userId) {
        if (this.participants.has(userId)) {
            console.log('➖ Removing participant:', userId);

            const peerConnection = this.peerConnections.get(userId);
            if (peerConnection) {
                peerConnection.close();
                this.peerConnections.delete(userId);
            }

            this.remoteStreams.delete(userId);
            this.participants.delete(userId);
            this.updateParticipantsList();
            this.removeRemoteVideoElement(userId);
        }
    }

    updateParticipantCount(count) {
        const countElement = document.getElementById('participantsCount');
        const headerCountElement = document.getElementById('participantsCountHeader');

        if (countElement) countElement.textContent = count;
        if (headerCountElement) headerCountElement.textContent = count;

        console.log('👥 Participant count updated:', count);
    }

    updateParticipantsList(participantsData = null) {
        const participantsList = document.getElementById('participantsList');
        if (!participantsList) return;

        participantsList.innerHTML = '';

        // Add current user
        const currentUserElement = this.createParticipantElement(this.currentUser, true);
        participantsList.appendChild(currentUserElement);

        // Add other participants
        const participantsToShow = participantsData || Array.from(this.participants.values());
        participantsToShow.forEach(participant => {
            if (participant.userId !== this.currentUser.id) {
                const participantElement = this.createParticipantElement(participant, false);
                participantsList.appendChild(participantElement);
            }
        });

        // Show scroll indicator if many participants
        if (participantsToShow.length > 5) {
            participantsList.classList.add('scrollable');
        } else {
            participantsList.classList.remove('scrollable');
        }
    }

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

    createRemoteVideoElement(userId, username) {
        const videoGrid = document.getElementById('videoGrid');
        const placeholder = videoGrid.querySelector('.video-placeholder');

        if (placeholder) {
            placeholder.remove();
        }

        if (!document.getElementById(`remote-video-${userId}`)) {
            const videoContainer = document.createElement('div');
            videoContainer.className = 'remote-video';
            videoContainer.id = `remote-video-${userId}`;

            videoContainer.innerHTML = `
                <video id="video-${userId}" autoplay playsinline></video>
                <div class="participant-info">
                    ${username}
                </div>
                <div class="connection-status">Подключение...</div>
            `;

            videoGrid.appendChild(videoContainer);
            console.log('🎬 Created remote video element for:', userId);
        }
    }

    updateRemoteVideo(userId, stream) {
        const videoElement = document.getElementById(`video-${userId}`);
        if (videoElement) {
            videoElement.srcObject = stream;
            console.log('✅ Remote video stream set for:', userId);

            // Update connection status
            const videoContainer = document.getElementById(`remote-video-${userId}`);
            const statusElement = videoContainer.querySelector('.connection-status');
            if (statusElement) {
                statusElement.textContent = 'Подключено';
                statusElement.className = 'connection-status connected';
            }
        }
    }

    removeRemoteVideoElement(userId) {
        const videoElement = document.getElementById(`remote-video-${userId}`);
        if (videoElement) {
            videoElement.remove();
        }

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

    sendJoinMessage() {
        if (this.stompClient && this.isConnected) {
            const joinMessage = {
                roomId: this.currentRoomId,
                userId: this.currentUser.id,
                username: this.currentUser.username,
                timestamp: new Date().toISOString()
            };

            console.log('📤 Sending join message:', joinMessage);
            this.stompClient.send("/app/room.join", {}, JSON.stringify(joinMessage));
        }
    }

    sendLeaveMessage() {
        if (this.stompClient && this.isConnected) {
            const leaveMessage = {
                roomId: this.currentRoomId,
                userId: this.currentUser.id,
                username: this.currentUser.username,
                timestamp: new Date().toISOString()
            };

            console.log('📤 Sending leave message');
            this.stompClient.send("/app/room.leave", {}, JSON.stringify(leaveMessage));
        }
    }

    requestRoomStatus() {
        if (this.stompClient && this.isConnected) {
            const statusMessage = {
                roomId: this.currentRoomId,
                userId: this.currentUser.id,
                timestamp: new Date().toISOString()
            };

            console.log('📤 Requesting room status');
            this.stompClient.send("/app/room.status", {}, JSON.stringify(statusMessage));
        }
    }

    sendChatMessage() {
        const messageInput = document.getElementById('messageInput');
        const content = messageInput.value.trim();

        if (!content || !this.stompClient || !this.isConnected) return;

        const message = {
            type: 'CHAT',
            roomId: this.currentRoomId,
            userId: this.currentUser.id,
            username: this.currentUser.username,
            content: content,
            timestamp: new Date().toISOString()
        };

        this.stompClient.send("/app/chat.send", {}, JSON.stringify(message));
        messageInput.value = '';
    }

    displayChatMessage(message) {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;

        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${message.type === 'SYSTEM' ? 'system-message' : ''}`;

        if (message.type === 'SYSTEM') {
            messageElement.innerHTML = `<em>${message.content}</em>`;
        } else {
            const isMyMessage = message.userId === this.currentUser.id;
            messageElement.className += isMyMessage ? ' my-message' : '';
            messageElement.innerHTML = `<strong>${message.username}:</strong> ${message.content}`;

            // Add animation for new messages
            messageElement.classList.add('new-message');
        }

        chatMessages.appendChild(messageElement);

        // Auto-scroll to new message
        if (this.autoScrollChat) {
            this.scrollChatToBottom();
        } else {
            this.updateScrollButton();
        }
    }

    displaySystemMessage(message) {
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            const messageElement = document.createElement('div');
            messageElement.className = 'chat-message system-message';
            messageElement.innerHTML = `<em>${message}</em>`;
            chatMessages.appendChild(messageElement);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    toggleVideo() {
        if (!this.localStream) return;
        const videoTracks = this.localStream.getVideoTracks();
        if (videoTracks.length > 0) {
            this.isVideoEnabled = !this.isVideoEnabled;
            videoTracks.forEach(track => track.enabled = this.isVideoEnabled);

            const toggleBtn = document.getElementById('toggleVideo');
            const videoStatus = document.getElementById('videoStatus');

            if (this.isVideoEnabled) {
                toggleBtn.classList.add('video-active');
                videoStatus.textContent = '📹 Камера: Вкл';
            } else {
                toggleBtn.classList.remove('video-active');
                videoStatus.textContent = '📹 Камера: Выкл';
            }
        }
    }

    toggleAudio() {
        if (!this.localStream) return;
        const audioTracks = this.localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            this.isAudioEnabled = !this.isAudioEnabled;
            audioTracks.forEach(track => track.enabled = this.isAudioEnabled);

            const toggleBtn = document.getElementById('toggleAudio');
            const audioStatus = document.getElementById('audioStatus');

            if (this.isAudioEnabled) {
                toggleBtn.classList.add('audio-active');
                audioStatus.textContent = '🎤 Микрофон: Вкл';
            } else {
                toggleBtn.classList.remove('audio-active');
                audioStatus.textContent = '🎤 Микрофон: Выкл';
            }
        }
    }

    async toggleScreenShare() {
        try {
            if (!this.isScreenSharing) {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true
                });
                document.getElementById('localVideo').srcObject = screenStream;
                this.isScreenSharing = true;
                document.querySelector('.local-video-container').classList.add('screen-sharing');

                screenStream.getTracks().forEach(track => {
                    track.onended = () => this.stopScreenShare();
                });
            } else {
                this.stopScreenShare();
            }
        } catch (error) {
            console.error('Error sharing screen:', error);
        }
    }

    stopScreenShare() {
        document.getElementById('localVideo').srcObject = this.localStream;
        this.isScreenSharing = false;
        document.querySelector('.local-video-container').classList.remove('screen-sharing');
    }

    async showInviteModal() {
        try {
            const response = await fetch(`/api/rooms/${this.currentRoomId}`);
            if (response.ok) {
                const roomInfo = await response.json();
                document.getElementById('inviteLink').value = `${window.location.origin}/room/${this.currentRoomId}`;
                document.getElementById('inviteCodeDisplay').textContent = roomInfo.inviteCode;
            }
        } catch (error) {
            console.error('Error loading room info:', error);
        }
        document.getElementById('inviteModal').style.display = 'block';
    }

    copyToClipboard(elementId) {
        const element = document.getElementById(elementId);
        let text = '';

        if (elementId === 'inviteLink') {
            text = element.value;
        } else {
            text = element.textContent;
        }

        navigator.clipboard.writeText(text).then(() => {
            this.showTempMessage('✅ Скопировано в буфер обмена');
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    }

    leaveRoom() {
        if (confirm('Вы уверены, что хотите покинуть комнату?')) {
            this.cleanup();
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        }
    }

    cleanup() {
        console.log('🧹 Cleaning up resources...');

        this.sendLeaveMessage();

        if (this.stompClient) {
            this.stompClient.disconnect();
            console.log('✅ WebSocket disconnected');
        }

        this.peerConnections.forEach((connection, userId) => {
            console.log('🔌 Closing connection with:', userId);
            connection.close();
        });
        this.peerConnections.clear();

        this.remoteStreams.clear();
        this.participants.clear();

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                track.stop();
                console.log('✅ Track stopped:', track.kind);
            });
        }

        console.log('✅ Cleanup completed');
    }

    generateUserId() {
        return 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }

    getRoomIdFromUrl() {
        const path = window.location.pathname;
        const match = path.match(/\/room\/([^\/]+)/);
        return match ? match[1] : null;
    }

    showTempMessage(message) {
        const tempMsg = document.createElement('div');
        tempMsg.className = 'temp-message';
        tempMsg.textContent = message;
        document.body.appendChild(tempMsg);
        setTimeout(() => tempMsg.remove(), 3000);
    }

    showError(message) {
        const errorMsg = document.createElement('div');
        errorMsg.className = 'error-message-global';
        errorMsg.textContent = message;
        document.body.appendChild(errorMsg);
        setTimeout(() => errorMsg.remove(), 5000);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Initializing RoomManager...');
    window.roomManager = new RoomManager();
});