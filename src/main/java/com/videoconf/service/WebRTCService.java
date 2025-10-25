package com.videoconf.service;

import org.springframework.stereotype.Service;
import org.springframework.web.socket.WebSocketSession;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class WebRTCService {
    private final ConcurrentHashMap<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

    public void handleWebRTCMessage(String roomId, String userId, String message) {
        // Обработка WebRTC сообщений
    }

    public void addSession(String userId, WebSocketSession session) {
        sessions.put(userId, session);
    }

    public void removeSession(String userId) {
        sessions.remove(userId);
    }
}